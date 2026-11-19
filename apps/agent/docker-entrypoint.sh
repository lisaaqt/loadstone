#!/bin/sh
# Starts as root only to prepare the data folder and the Docker socket group, then drops to an unprivileged user
# (UID/GID 1000, the same user the Minecraft containers run as) with no Linux capabilities.
set -e

RUN_UID="${LOADSTONE_UID:-1000}"
RUN_GID="${LOADSTONE_GID:-1000}"
DATA_DIR="${LOADSTONE_DATA_DIR:-/var/lib/loadstone}"
SOCKET="${DOCKER_SOCKET:-/var/run/docker.sock}"

if [ "$(id -u)" != "0" ] || [ "$RUN_UID" = "0" ]; then
  exec "$@"
fi

mkdir -p "$DATA_DIR"
# Repair files written by older (root) agent versions; only touches entries that aren't owned by the server user.
find "$DATA_DIR" \( ! -user "$RUN_UID" -o ! -group "$RUN_GID" \) -exec chown -h "$RUN_UID:$RUN_GID" {} +

GROUPS_ARG="--clear-groups"
if [ -S "$SOCKET" ]; then
  # Docker Engine on Linux: socket is 0660 root:docker, so the docker group is enough. Some setups (e.g. Docker
  # Desktop) only allow root on the socket; then keep running as root rather than breaking the agent.
  if [ $(( (0$(stat -c %a "$SOCKET") >> 3) & 6 )) -ne 6 ]; then
    echo "[entrypoint] warning: $SOCKET is not group read/writable; running the agent as root" >&2
    exec "$@"
  fi
  GROUPS_ARG="--groups=$(stat -c %g "$SOCKET")"
else
  echo "[entrypoint] warning: $SOCKET is not mounted; the agent cannot manage servers" >&2
fi

# As a non-root user the process has no effective capabilities; no-new-privileges keeps it from regaining any.
exec setpriv --reuid="$RUN_UID" --regid="$RUN_GID" "$GROUPS_ARG" --inh-caps=-all "$@"
