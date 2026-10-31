#!/bin/sh
# Remet la version d'avant la dernière mise à jour (si la nouvelle pose problème). Les données sont gardées :
# la base ne fait qu'ajouter des colonnes d'une version à l'autre, l'ancienne version les ignore.
set -e
cd "$(dirname "$0")/.."
[ -f .version-precedente ] || { echo "Aucune version précédente enregistrée."; exit 1; }
git reset --hard "$(cat .version-precedente)"
docker compose up -d --build
echo "Revenu à la version $(git rev-parse --short HEAD). La prochaine mise à jour reprendra la dernière version de GitHub."
