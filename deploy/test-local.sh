#!/bin/bash
# Lance Archfield en mode test sur cette machine (Ubuntu, dans une machine virtuelle sur votre PC), avec une adresse
# publique en HTTPS pour les testeurs. On peut le relancer sans risque : les comptes et les photos sont gardés.
#   bash deploy/test-local.sh            démarrer ou redémarrer
#   bash deploy/test-local.sh arreter    tout arrêter (les données restent dans data-test/)
#   bash deploy/test-local.sh adresse    réafficher l'adresse publique
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Docker : installé s'il manque ; « sudo » tant que l'utilisateur n'est pas dans le groupe docker.
if ! command -v docker >/dev/null 2>&1; then
  echo "-- Installation de Docker (quelques minutes)…"
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
  sudo usermod -aG docker "$USER" || true
fi
SUDO=""; docker info >/dev/null 2>&1 || SUDO="sudo"
DC="$SUDO docker compose -f compose.test.yaml"

url() { $DC logs tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1; }

case "${1:-}" in
  arreter) $DC down; echo "Arrêté. Les données du test sont gardées dans $DIR/data-test."; exit 0 ;;
  adresse) U="$(url)"; if [ -n "$U" ]; then echo "$U"; else echo "Pas encore d'adresse : relancez bash deploy/test-local.sh"; fi; exit 0 ;;
esac

# Réglages du test : paiement simulé, codes SMS affichés à l'écran, pas de comptes de démonstration.
if [ ! -f .env.test ]; then
  cat > .env.test <<CONF
# Mode test (pas « production ») : cookies valables aussi sur le Wi-Fi en http, codes et paiements simulés.
NODE_ENV=development
DEMO=off
SHOW_TEST_CODES=on
BILLING_TEST=on
REPORTS=on
# Pour de vrais SMS / WhatsApp : SMS_PROVIDER=twilio et les clés Twilio (deploy/TELEPHONE.md).
# Pour de vrais paiements de test Stripe : STRIPE_SECRET_KEY=sk_test_… (deploy/PAIEMENT.md).
# Pour de vrais e-mails : SMTP_URL=smtps://utilisateur:motdepasse@smtp-relay.brevo.com:465
CONF
  echo "-- Réglages du test écrits dans .env.test"
fi
mkdir -p data-test

echo "-- Construction et démarrage (la première fois : quelques minutes)…"
$DC up -d --build

echo "-- Attente de l'adresse publique…"
URL=""
for _ in $(seq 1 45); do URL="$(url)"; [ -n "$URL" ] && break; sleep 2; done
if [ -z "$URL" ]; then
  echo "Le tunnel n'a pas donné d'adresse. Vérifiez la connexion internet de la machine, puis : $DC logs tunnel"
  exit 1
fi
# L'adresse sert dans les e-mails, les liens d'invitation et le retour après paiement : l'application la reçoit.
if ! grep -q "^BASE_URL=$URL$" .env.test; then
  sed -i '/^BASE_URL=/d' .env.test
  echo "BASE_URL=$URL" >> .env.test
  $DC up -d app >/dev/null
fi

LAN="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "================================================================"
echo " Archfield est en ligne pour le test"
echo
echo "  Adresse à envoyer aux testeurs (téléphone, n'importe où) :"
echo "     $URL"
echo
echo "  Sur le Wi-Fi de la maison (ordinateur) : http://$LAN:3000"
echo "================================================================"
echo
echo "Ensuite :"
echo "  1. Créez votre compte sur $URL/inscription"
echo "  2. Donnez-vous l'accès administration :"
echo "       $DC exec app node --no-warnings server/activate.js --admin <votre e-mail ou +229…>"
echo "     puis ouvrez $URL/admin (photos de chantier, offres, comptes)."
echo
echo "Attention : l'adresse change à chaque redémarrage de la machine ou du tunnel."
echo "Pour la réafficher : bash deploy/test-local.sh adresse"
if command -v qrencode >/dev/null 2>&1; then qrencode -t ANSIUTF8 "$URL"; fi
