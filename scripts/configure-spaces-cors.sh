#!/usr/bin/env bash
# Configure DigitalOcean Spaces CORS for browser direct uploads.
#
# Usage:
#   scripts/configure-spaces-cors.sh
#
# Optional env:
#   SPACES_BUCKET=topicforum
#   SPACES_REGION=lon1
#   SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
#   SPACES_KEY=...
#   SPACES_SECRET=...
#   CORS_ORIGINS=https://topic.forum,https://dev.timetable.love

set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 not found. Install: $2"
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "$value"
}

prompt_if_missing() {
  local var_name="$1"
  local prompt="$2"
  local secret="${3:-false}"
  local current="${!var_name:-}"

  if [[ -n "$current" ]]; then
    return
  fi

  printf '%s' "$prompt"
  if [[ "$secret" == "true" ]]; then
    local saved_stty
    saved_stty="$(stty -g)"
    stty -echo
    IFS= read -r "$var_name" || {
      stty "$saved_stty"
      return 1
    }
    stty "$saved_stty"
    printf '\n'
  else
    IFS= read -r "$var_name"
  fi
  export "$var_name"
}

need s3cmd "brew install s3cmd"

bucket="${SPACES_BUCKET:-topicforum}"
region="${SPACES_REGION:-lon1}"
endpoint="${SPACES_ENDPOINT:-https://${region}.digitaloceanspaces.com}"
host_base="${endpoint#http://}"
host_base="${host_base#https://}"
host_base="${host_base%/}"

spaces_key="${SPACES_KEY:-${AWS_ACCESS_KEY_ID:-}}"
spaces_secret="${SPACES_SECRET:-${AWS_SECRET_ACCESS_KEY:-}}"

if [[ -z "$spaces_key" ]]; then
  prompt_if_missing spaces_key "Spaces access key ID: "
fi
if [[ -z "$spaces_secret" ]]; then
  prompt_if_missing spaces_secret "Spaces secret key: " true
fi

[[ -n "$spaces_key" ]] || die "missing Spaces access key"
[[ -n "$spaces_secret" ]] || die "missing Spaces secret key"

origins_csv="${CORS_ORIGINS:-https://topic.forum,https://www.topic.forum,https://timetable.love,https://dev.timetable.love,http://localhost:3000,http://127.0.0.1:3000}"
IFS=, read -r -a origins <<< "$origins_csv"
[[ "${#origins[@]}" -gt 0 ]] || die "no CORS origins configured"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

cors_xml="${tmpdir}/cors.xml"
s3cfg="${tmpdir}/s3cfg"

{
  printf '%s\n' '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
  printf '%s\n' '  <CORSRule>'
  for origin in "${origins[@]}"; do
    origin="${origin#"${origin%%[![:space:]]*}"}"
    origin="${origin%"${origin##*[![:space:]]}"}"
    [[ -n "$origin" ]] || continue
    printf '    <AllowedOrigin>%s</AllowedOrigin>\n' "$(xml_escape "$origin")"
  done
  printf '%s\n' '    <AllowedMethod>PUT</AllowedMethod>'
  printf '%s\n' '    <AllowedMethod>HEAD</AllowedMethod>'
  printf '%s\n' '    <AllowedHeader>Content-Type</AllowedHeader>'
  printf '%s\n' '    <AllowedHeader>x-amz-acl</AllowedHeader>'
  printf '%s\n' '    <ExposeHeader>ETag</ExposeHeader>'
  printf '%s\n' '    <MaxAgeSeconds>5</MaxAgeSeconds>'
  printf '%s\n' '  </CORSRule>'
  printf '%s\n' '</CORSConfiguration>'
} > "$cors_xml"

# Create before chmod — chmod on a missing file aborts under set -e.
touch "$s3cfg"
chmod 600 "$s3cfg"
{
  printf '%s\n' '[default]'
  printf 'access_key = %s\n' "$spaces_key"
  printf 'secret_key = %s\n' "$spaces_secret"
  printf '%s\n' "host_base = ${host_base}"
  printf '%s\n' "host_bucket = %(bucket)s.${host_base}"
  printf '%s\n' 'use_https = True'
  printf '%s\n' 'check_ssl_certificate = True'
  printf '%s\n' 'check_ssl_hostname = True'
  printf '%s\n' 'signature_v2 = False'
} > "$s3cfg"

echo "Checking access to s3://${bucket} via ${host_base}..."
s3cmd -c "$s3cfg" ls "s3://${bucket}" >/dev/null

echo "Applying CORS to s3://${bucket}..."
s3cmd -c "$s3cfg" setcors "$cors_xml" "s3://${bucket}"

echo "Done. CORS now allows direct browser PUT uploads for:"
for origin in "${origins[@]}"; do
  [[ -n "$origin" ]] && echo "  - $origin"
done
