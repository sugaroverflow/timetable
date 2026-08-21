#!/usr/bin/env bash
# Off-site logical backup of the Topic database (docs/OPERATIONS.md R8).
#
# DigitalOcean's managed Postgres already takes daily backups. This exists for
# the failure that those do NOT cover: a destructive migration or a mistaken
# script going unnoticed for longer than the managed retention window, by
# which time every daily snapshot has rolled past the good state.
#
# Writes a pg_dump custom-format archive to a PRIVATE S3-compatible bucket.
# It must be private and separate from the uploads bucket: the dump contains
# every user's email address and every comment.
#
# Usage:
#   DATABASE_URL=postgres://... \
#   BACKUP_SPACES_BUCKET=topic-backups \
#   BACKUP_SPACES_KEY=... BACKUP_SPACES_SECRET=... \
#   scripts/backup-db.sh
#
# Optional env:
#   BACKUP_SPACES_REGION=lon1
#   BACKUP_SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
#   BACKUP_PREFIX=db                 # key namespace inside the bucket
#   BACKUP_RETENTION_DAYS=90         # 0 disables pruning
#
# Restore (rehearse this BEFORE you need it — task 4):
#   s3cmd get s3://<bucket>/db/<file>.dump
#   pg_restore --clean --if-exists --no-owner --dbname "$SCRATCH_DATABASE_URL" <file>.dump

set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 not found. Install: $2"
}

need pg_dump "postgresql-client-16"
need s3cmd "brew install s3cmd (or: pipx install s3cmd)"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_SPACES_BUCKET:?BACKUP_SPACES_BUCKET is required}"
: "${BACKUP_SPACES_KEY:?BACKUP_SPACES_KEY is required}"
: "${BACKUP_SPACES_SECRET:?BACKUP_SPACES_SECRET is required}"

region="${BACKUP_SPACES_REGION:-lon1}"
endpoint="${BACKUP_SPACES_ENDPOINT:-https://${region}.digitaloceanspaces.com}"
prefix="${BACKUP_PREFIX:-db}"
retention_days="${BACKUP_RETENTION_DAYS:-90}"

host_base="${endpoint#http://}"
host_base="${host_base#https://}"
host_base="${host_base%/}"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
filename="topic-db-${stamp}.dump"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

dump_path="${tmpdir}/${filename}"
s3cfg="${tmpdir}/s3cfg"

touch "$s3cfg"
chmod 600 "$s3cfg"
{
  printf '%s\n' '[default]'
  printf 'access_key = %s\n' "$BACKUP_SPACES_KEY"
  printf 'secret_key = %s\n' "$BACKUP_SPACES_SECRET"
  printf '%s\n' "host_base = ${host_base}"
  printf '%s\n' "host_bucket = %(bucket)s.${host_base}"
  printf '%s\n' 'use_https = True'
  printf '%s\n' 'check_ssl_certificate = True'
  printf '%s\n' 'check_ssl_hostname = True'
  printf '%s\n' 'signature_v2 = False'
} > "$s3cfg"

echo "Dumping database to ${filename}..."
# -Fc: custom format, compressed and selectively restorable.
# --no-owner: restores cleanly into a scratch database owned by anyone, which
# is the whole point of a rehearsal (task 4).
pg_dump --format=custom --no-owner --no-privileges \
  --file="$dump_path" "$DATABASE_URL"

size_bytes="$(wc -c < "$dump_path" | tr -d '[:space:]')"
[[ "$size_bytes" -gt 1024 ]] || die "dump is suspiciously small (${size_bytes} bytes) — refusing to upload"
echo "Dump complete: ${size_bytes} bytes"

# A dump that cannot be read back is not a backup. This catches truncation and
# corruption at the point it happens, not at 09:00 on a teaching day.
echo "Verifying archive integrity..."
pg_restore --list "$dump_path" > /dev/null || die "pg_restore could not read the archive"

echo "Uploading to s3://${BACKUP_SPACES_BUCKET}/${prefix}/${filename}..."
s3cmd -c "$s3cfg" put "$dump_path" \
  "s3://${BACKUP_SPACES_BUCKET}/${prefix}/${filename}" >/dev/null

if [[ "$retention_days" -gt 0 ]]; then
  echo "Pruning backups older than ${retention_days} days..."
  cutoff="$(date -u -d "${retention_days} days ago" +%Y-%m-%d 2>/dev/null \
    || date -u -v-"${retention_days}"d +%Y-%m-%d)"

  # Prune by the timestamp in the KEY, not by s3cmd's listing format, so this
  # never depends on locale or column layout.
  s3cmd -c "$s3cfg" ls "s3://${BACKUP_SPACES_BUCKET}/${prefix}/" \
    | awk '{print $NF}' \
    | grep -E 'topic-db-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.dump$' \
    | while read -r key; do
        key_date="$(echo "$key" | sed -E 's/.*topic-db-([0-9]{4}-[0-9]{2}-[0-9]{2})T.*/\1/')"
        if [[ "$key_date" < "$cutoff" ]]; then
          echo "  removing $key"
          s3cmd -c "$s3cfg" del "$key" >/dev/null
        fi
      done
fi

echo "Done. Backup stored as ${prefix}/${filename}"
