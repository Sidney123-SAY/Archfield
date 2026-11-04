#!/bin/bash
# Installe Archfield sur un serveur Ubuntu neuf (Oracle Cloud, Hetzner, OVH…), en une commande :
#   git clone -b main https://github.com/Sidney123-SAY/Arcfield.git
#   bash Arcfield/deploy/installer.sh
# Le script demande l'adresse du site et un e-mail, puis fait tout le reste. On peut le relancer sans risque.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
echo
echo "== Installation d'Archfield dans $DIR =="
echo

# 1. Questions (seulement si la configuration n'existe pas encore)
if [ ! -f .env ]; then
  read -rp "Adresse du site, sans https (ex. archfield.duckdns.org) : " DOMAIN
  read -rp "Votre e-mail (reçoit les demandes de visite de contrôle) : " CONTACT
  DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
  [ -n "$DOMAIN" ] || { echo "Il faut une adresse de site."; exit 1; }
fi

# 2. Mises à jour de sécurité automatiques, blocage des attaques SSH, outils
echo "-- Mises à jour de sécurité et outils…"
sudo apt-get update -y -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades fail2ban git curl >/dev/null

# Petit serveur (1 Go de mémoire, ex. Oracle E2.1.Micro) : 2 Go de mémoire de secours sur le disque (swap),
# pour que la construction et la conversion des photos d'iPhone ne manquent pas de mémoire.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q .; then
  echo "-- Petit serveur : ajout de 2 Go de mémoire de secours (swap)…"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

# 3. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "-- Installation de Docker…"
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi
sudo usermod -aG docker "$USER" || true

# 4. Pare-feu : les images Ubuntu d'Oracle Cloud bloquent les ports 80 et 443 en plus du pare-feu d'Oracle.
if sudo iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
  echo "-- Ouverture des ports 80 et 443…"
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  sudo netfilter-persistent save >/dev/null 2>&1 || true
fi

# 5. Configuration (.env), lisible par vous seul
if [ ! -f .env ]; then
  cat > .env <<EOF
DOMAIN=$DOMAIN
BASE_URL=https://$DOMAIN
NODE_ENV=production
DEMO=off
REPORTS=on
TRUST_PROXY=1
CONTACT_EMAIL=$CONTACT
# E-mails (Brevo…) : voir deploy/HEBERGEMENT.md, étape 7
# SMTP_URL=
# MAIL_FROM=Archfield <$CONTACT>
# Connexion avec Google et Apple : voir deploy/CONNEXION-GOOGLE-APPLE.md
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
EOF
  chmod 600 .env
  echo "-- Configuration enregistrée dans .env"
fi

# 6. Lancement (sudo : le droit d'utiliser Docker sans sudo ne vaut qu'à la prochaine connexion)
echo "-- Construction et démarrage (1 à 3 minutes)…"
sudo docker compose up -d --build

# 7. Sauvegarde chaque nuit à 3 h 30
( crontab -l 2>/dev/null | grep -v "deploy/sauvegarde.sh" || true; echo "30 3 * * * $DIR/deploy/sauvegarde.sh >> $HOME/sauvegarde.log 2>&1" ) | crontab -

DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2)"
echo
echo "== Terminé =="
echo "Le site : https://$DOMAIN"
echo "Le certificat HTTPS arrive dans la minute si l'adresse pointe bien vers ce serveur."
echo "Vérifier : curl -s https://$DOMAIN/healthz   (doit répondre « ok »)"
echo "Mettre à jour plus tard : ./deploy/mettre-a-jour.sh"
echo "Déconnectez-vous puis reconnectez-vous une fois pour utiliser « docker » sans « sudo »."
