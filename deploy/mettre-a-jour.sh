#!/bin/sh
# Met le site à jour avec la dernière version sur GitHub (quelques secondes de coupure).
# Sauvegarde d'abord la base et les photos ; en cas de problème : ./deploy/revenir-en-arriere.sh
set -e
cd "$(dirname "$0")/.."
./deploy/sauvegarde.sh
git rev-parse HEAD > .version-precedente
# Suit la branche main (les installations faites avant son renommage suivaient une autre branche).
git fetch origin main
git checkout -q -B main origin/main
docker compose up -d --build
docker image prune -f >/dev/null
echo "Archfield est à jour (version $(git rev-parse --short HEAD)). Pour revenir à la précédente : ./deploy/revenir-en-arriere.sh"
