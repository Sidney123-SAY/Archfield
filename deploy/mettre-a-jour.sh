#!/bin/sh
# Récupère la dernière version sur GitHub et redémarre l'application (quelques secondes de coupure).
set -e
cd "$(dirname "$0")/.."
git pull
docker compose up -d --build
docker image prune -f >/dev/null
echo "Archfield est à jour."
