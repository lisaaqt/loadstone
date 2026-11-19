#!/bin/sh
#
# Loadstone: build and (re)start everything on this server.
#
# Run it from the uploaded bundle folder after every upload:
#   sh update.sh            (or ./update.sh after: chmod +x update.sh)
#
# Never touched: .env.docker, Docker volumes (database, Redis), ./backups, /var/lib/loadstone (server files).
# See DEPLOY.md for details.

set -e
cd "$(dirname "$0")"

ENV_FILE=.env.docker
# Folders that contain only bundled code. Files in them that are not listed in .bundle-files are stale.
CODE_DIRS="apps packages"
# Paths removed from the app that must go even if .bundle-files is missing (space separated).
KNOWN_REMOVED="SERVER_UPLOAD/update.sh SERVER_UPLOAD/README.md"

say()  { printf '\n\033[1;35m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

env_get() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

require_var() { # NAME MIN_LENGTH
  value="$(env_get "$1")"
  if [ "${#value}" -lt "$2" ]; then
    die "$1 in $ENV_FILE must be at least $2 characters. Generate one with: openssl rand -hex 32"
  fi
}

dc() { docker compose --env-file "$ENV_FILE" "$@"; }

# ---------------------------------------------------------------- 1. configuration
say "Checking configuration"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f SERVER_UPLOAD/.env ]; then
    info "Found the settings of a previous install in SERVER_UPLOAD/.env. To reuse its secrets and data:"
    info "  cp SERVER_UPLOAD/.env $ENV_FILE   then rename PANEL_PORT to APP_PORT and add COMPOSE_PROFILES=agent"
  fi
  die "Missing $ENV_FILE. Create it with: cp .env.docker.example $ENV_FILE, fill in the required values, then run this script again."
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

require_var APP_SECRET 32
require_var POSTGRES_PASSWORD 8
case "$(env_get APP_URL)" in
  ""|*your-server-ip*) die "Set APP_URL in $ENV_FILE to the address you open the panel with, e.g. http://203.0.113.10:3000" ;;
esac

PROFILES="$(env_get COMPOSE_PROFILES | tr -d ' ')"
export COMPOSE_PROFILES="$PROFILES"
has_profile() {
  case ",$PROFILES," in
    *",$1,"*) return 0 ;;
  esac
  return 1
}

if has_profile agent; then
  require_var LOADSTONE_AGENT_TOKEN 32
  case "$(env_get NODE_PUBLIC_HOST)" in
    ""|your-server-ip) die "Set NODE_PUBLIC_HOST in $ENV_FILE to the IP or domain players connect to." ;;
  esac
fi
if has_profile s3; then
  require_var MINIO_ROOT_PASSWORD 8
fi
ok "$ENV_FILE looks complete (profiles: ${PROFILES:-none})"

command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install it with: curl -fsSL https://get.docker.com | sh"
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing. Install it with: apt-get install docker-compose-plugin"
docker info >/dev/null 2>&1 || die "Cannot talk to Docker. Is it running, and are you root or in the docker group? Try: sudo sh update.sh"

# ---------------------------------------------------------------- 2. stale files
say "Removing files that are no longer part of the app"
removed=0
for path in $KNOWN_REMOVED; do
  if [ -e "$path" ]; then
    rm -rf -- "$path"
    info "removed $path"
    removed=$((removed + 1))
  fi
done
rmdir SERVER_UPLOAD 2>/dev/null || true

if [ -f .bundle-files ]; then
  scan="$(mktemp)"
  trap 'rm -f "$scan"' EXIT
  for dir in $CODE_DIRS; do
    if [ -d "$dir" ]; then
      find "$dir" -name node_modules -prune -o -type f -print
    fi
  done >"$scan"
  while IFS= read -r file; do
    case "$file" in
      */.data/*|*/public/uploads/*) continue ;;
    esac
    case "${file##*/}" in
      .env|.env.*) continue ;;
    esac
    if ! grep -Fxq -- "$file" .bundle-files; then
      rm -f -- "$file"
      info "removed $file"
      removed=$((removed + 1))
    fi
  done <"$scan"
  for dir in $CODE_DIRS; do
    if [ -d "$dir" ]; then
      find "$dir" -mindepth 1 -type d -empty ! -path '*/node_modules*' ! -path '*/.data*' ! -path '*/public/uploads*' -delete 2>/dev/null || true
    fi
  done
  ok "$removed stale file(s) removed"
else
  warn "################################################################################"
  warn ".bundle-files is MISSING, so files deleted from the app cannot be cleaned up and"
  warn "may break the build. Your upload tool probably skipped hidden files (names that"
  warn "start with a dot). FileZilla: Server > Force showing hidden files. WinSCP:"
  warn "Preferences > Panels > Show hidden files. Then upload the whole bundle again."
  warn "################################################################################"
fi

# ---------------------------------------------------------------- 3. build and start
say "Pulling the latest base images"
pull_services="postgres redis"
if has_profile s3; then pull_services="$pull_services minio"; fi
# shellcheck disable=SC2086
dc pull $pull_services || warn "Could not pull some images, continuing with the local copies"

say "Building images (the first build takes a few minutes)"
dc build --pull

say "Starting containers"
dc up -d --remove-orphans

# ---------------------------------------------------------------- 4. outdated containers
for id in $(dc ps -q); do
  image="$(docker inspect -f '{{.Image}}' "$id")"
  if [ "$(docker image inspect -f '{{len .RepoTags}}' "$image" 2>/dev/null || echo 0)" = "0" ]; then
    service="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
    info "Recreating $service (it was still running an outdated image)"
    dc up -d --force-recreate --no-deps "$service"
  fi
done

say "Waiting for the panel to become healthy (database migrations run on start)"
tries=0
while :; do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q panel)" 2>/dev/null || echo starting)"
  if [ "$status" = "healthy" ]; then break; fi
  tries=$((tries + 1))
  if [ "$tries" -ge 80 ]; then
    dc logs --tail 80 panel
    die "The panel did not become healthy. See the logs above."
  fi
  sleep 3
done
ok "Panel is healthy"

# ---------------------------------------------------------------- node agent
NODE_OFFLINE=0
if has_profile agent; then
  say "Registering this server as a node"
  node_name="$(env_get NODE_NAME)"
  if [ -z "$node_name" ]; then node_name="$( (hostname -s 2>/dev/null || echo local) | cut -c1-48)"; fi
  mem_total_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  if [ "$mem_total_mb" -gt 3072 ]; then node_mem_mb=$((mem_total_mb - 1536)); else node_mem_mb=$((mem_total_mb * 2 / 3)); fi
  disk_free_mb="$(df -Pm /var/lib/loadstone 2>/dev/null | awk 'NR==2 {print $4}')"
  node_disk_mb=$(( ${disk_free_mb:-10240} * 9 / 10 ))
  port_start="$(env_get NODE_PORT_START)"
  port_end="$(env_get NODE_PORT_END)"
  dc exec -T \
    -e NODE_NAME="$node_name" \
    -e NODE_HOST=agent \
    -e NODE_PORT=8080 \
    -e NODE_PUBLIC_HOST="$(env_get NODE_PUBLIC_HOST)" \
    -e NODE_TOKEN="$(env_get LOADSTONE_AGENT_TOKEN)" \
    -e NODE_MEMORY_MB="$node_mem_mb" \
    -e NODE_DISK_MB="$node_disk_mb" \
    -e NODE_PORT_START="${port_start:-25565}" \
    -e NODE_PORT_END="${port_end:-25665}" \
    panel node dist/cli.js ensure-node || die "Could not register the node (see the error above)."
  info "New nodes get ${node_mem_mb} MB RAM and ${node_disk_mb} MB disk; existing nodes keep their allocations."
  if dc exec -T -e NODE_NAME="$node_name" panel node dist/cli.js probe-node; then
    ok "Node \"$node_name\" is online"
  else
    NODE_OFFLINE=1
    dc logs --tail 40 agent || true
    warn "The panel cannot reach the agent (agent logs above). The panel works; fix the agent and run update.sh again."
  fi
fi

# ---------------------------------------------------------------- 5. clean up and summary
say "Cleaning up old images"
docker image prune -f >/dev/null
ok "Done"

say "Status"
dc ps

app_port="$(env_get APP_PORT)"
printf '\n'
if [ "$NODE_OFFLINE" -eq 1 ]; then
  printf '\033[1;33mLoadstone is up, but this server'"'"'s node is offline (see above).\033[0m\n'
else
  printf '\033[1;32mLoadstone is up.\033[0m\n'
fi
cat <<EOF

  Panel      $(env_get APP_URL)   (published on port ${app_port:-3000})
  First run  open $(env_get APP_URL)/setup to create the administrator account
  Logs       docker compose --env-file $ENV_FILE logs -f panel worker
  Health     curl -fsS http://127.0.0.1:${app_port:-3000}/api/health
EOF
