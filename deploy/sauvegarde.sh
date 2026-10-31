#!/bin/sh
# Sauvegarde de la base et des photos dans backups/, une archive par jour, 14 jours gardés.
# À lancer chaque nuit (voir deploy/HEBERGEMENT.md) ; copiez aussi les archives ailleurs de temps en temps.
set -e
cd "$(dirname "$0")/.."
DAY=$(date +%Y-%m-%d)
mkdir -p backups
rm -f data/backup.db
# Copie cohérente de la base, même pendant que l'application tourne.
docker compose exec -T app node --no-warnings -e "new (require('node:sqlite').DatabaseSync)('/data/archfield.db').exec(\"VACUUM INTO '/data/backup.db'\")"
tar -czf "backups/archfield-$DAY.tar.gz" -C data backup.db uploads
rm -f data/backup.db
find backups -name 'archfield-*.tar.gz' -mtime +14 -delete
echo "Sauvegarde : backups/archfield-$DAY.tar.gz"
