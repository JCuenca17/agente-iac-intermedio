#!/usr/bin/env bash
# Inicia Floci (emulador de AWS) en Docker, en la versión fijada de versiones.json.
set -euo pipefail
cd "$(dirname "$0")/.."
FLOCI=$(node -p "require('./versiones.json').emuladores.floci")
if docker ps -a --format '{{.Names}}' | grep -qx floci; then
  docker start floci >/dev/null
else
  docker run -d --name floci -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock "floci/floci:${FLOCI}" >/dev/null
fi
for i in $(seq 1 30); do
  curl -s -o /dev/null http://localhost:4566/ && { echo "Floci ${FLOCI} listo en http://localhost:4566"; exit 0; }
  sleep 1
done
echo "Floci no respondió; revisa con: docker logs floci" >&2
exit 1
