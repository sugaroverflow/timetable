#!/usr/bin/env bash
# Manual deploy fallback for DigitalOcean App Platform.
#
# Primary deploy: GitHub Actions — see .github/workflows/deploy-dev.yml and
# deploy-production.yml (see README § Environments).
#
# This script is for local doctl use when you need to create/update outside CI.
#
# Prerequisites:
#   - doctl installed and authenticated (`doctl auth init`)
#   - Clerk keys (test keys are fine for user testing)
#   - Code on the branch referenced in .do/app.yaml pushed to GitHub
#
# Usage:
#   ./scripts/deploy-do.sh              # create app (first time)
#   ./scripts/deploy-do.sh --update     # update existing app spec
#   ./scripts/deploy-do.sh --status     # show app URL and health
#
# Optional: export DIGITALOCEAN_ACCESS_TOKEN instead of `doctl auth init`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="${ROOT}/.do/app.yaml"
APP_NAME="timetable"

cd "$ROOT"

die() {
  echo "error: $*" >&2
  exit 1
}

require_doctl() {
  command -v doctl >/dev/null 2>&1 || die "doctl not found. Install: brew install doctl"
  if ! doctl account get >/dev/null 2>&1; then
    die "doctl is not authenticated. Run: doctl auth init"
  fi
}

validate_spec() {
  [[ -f "$SPEC" ]] || die "missing $SPEC"
  doctl apps spec validate "$SPEC" --schema-only >/dev/null
  echo "✓ app spec schema valid"
}

find_app_id() {
  doctl apps list --format ID,Spec.Name --no-header 2>/dev/null \
    | awk -v name="$APP_NAME" '$2 == name { print $1; exit }'
}

load_env_value() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 1
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/'
}

prompt_secrets_if_missing() {
  # Used when creating a new app — DO prompts for SECRET-type vars without values.
  local clerk_pk clerk_sk cron
  clerk_pk="$(load_env_value NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "${ROOT}/apps/web/.env.local" || true)"
  clerk_sk="$(load_env_value CLERK_SECRET_KEY "${ROOT}/.env" || true)"
  cron="$(load_env_value CRON_SECRET "${ROOT}/.env" || true)"

  echo
  echo "Secrets required on first deploy (press Enter to use local .env value if shown):"
  [[ -n "$clerk_pk" ]] && echo "  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from .env.local: ${clerk_pk:0:12}…"
  [[ -n "$clerk_sk" ]] && echo "  CLERK_SECRET_KEY from .env: ${clerk_sk:0:8}…"
  [[ -n "$cron" ]] && echo "  CRON_SECRET from .env: (set)"
  echo
  echo "If DO prompts during 'apps create', paste these values."
  echo "Test Clerk keys (pk_test_/sk_test_) are fine for user testing."
}

create_app() {
  validate_spec
  prompt_secrets_if_missing
  echo "Creating DigitalOcean app from $SPEC …"
  doctl apps create --spec "$SPEC" --format ID,DefaultIngress --no-header
}

update_app() {
  local app_id
  app_id="$(find_app_id)"
  [[ -n "$app_id" ]] || die "no app named '$APP_NAME' found. Run without --update first."
  validate_spec
  echo "Updating app $app_id …"
  doctl apps update "$app_id" --spec "$SPEC"
  echo "$app_id"
}

show_status() {
  local app_id
  app_id="$(find_app_id)"
  [[ -n "$app_id" ]] || die "no app named '$APP_NAME' found."

  local url
  url="$(doctl apps get "$app_id" --format DefaultIngress --no-header)"
  echo "App ID:  $app_id"
  echo "URL:     https://${url}"
  echo
  echo "Health check:"
  curl -fsS "https://${url}/health" && echo || echo "  /health not reachable yet"
  echo
  echo "Clerk checklist (test keys — usually no dashboard step):"
  echo "  Try sign-in at: https://${url}/sign-in"
  echo "  If using live keys + custom domain: Configure → Domains in Clerk"
}

case "${1:-}" in
  --update)
    require_doctl
    update_app
    ;;
  --status)
    require_doctl
    show_status
    ;;
  --help|-h)
    sed -n '2,20p' "$0" | sed 's/^# \?//'
    ;;
  "")
    require_doctl
    if app_id="$(find_app_id)"; then
      [[ -n "$app_id" ]] && die "app '$APP_NAME' already exists (id: $app_id). Use --update or --status."
    fi
    create_app
    echo
    echo "Next steps:"
    echo "  1. Wait for the deploy to finish in the DO console."
    echo "  2. Run: ./scripts/deploy-do.sh --status"
    echo "  3. Try sign-in at the app URL (test keys need no Clerk dashboard URL step)."
    echo "  4. Smoke test: sign in, create a timetable, publish a topic."
    ;;
  *)
    die "unknown option: $1 (try --help)"
    ;;
esac
