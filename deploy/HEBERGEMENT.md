# Mettre Archfield en ligne

Ce guide met le site en ligne sur un serveur Linux, avec une adresse en HTTPS (obligatoire pour installer l'application sur un téléphone), des sauvegardes chaque nuit et une mise à jour en une commande. Compter une heure la première fois.

Ce qui tourne sur le serveur (`compose.yaml` à la racine du projet) :
- **l'application** Archfield ; la base et les photos sont dans le dossier `data/` du serveur ;
- **Caddy**, devant l'application : il obtient le certificat HTTPS gratuit (Let's Encrypt) et le renouvelle seul.

## 1. Le serveur

**Gratuit : Oracle Cloud « Always Free ».** Une vraie machine avec un disque qui ne s'efface pas, gratuite sans limite de durée.
1. Créez un compte sur cloud.oracle.com/free. Choisissez une région proche de vos utilisateurs (France ou Europe). Oracle demande une carte bancaire pour vérifier votre identité, sans débit sur l'offre gratuite.
2. Créez une instance (Compute → Instances → Create instance) :
   - Image : **Ubuntu 24.04**.
   - Forme : **VM.Standard.A1.Flex** (processeur Ampere, 1 cœur et 6 Go de mémoire suffisent ; gratuit). Si Oracle répond « Out of capacity », réessayez plus tard ou prenez **VM.Standard.E2.1.Micro** (gratuit aussi, plus petit).
   - Clé SSH : **téléchargez la clé privée** et gardez-la précieusement (sans elle, plus d'accès au serveur).
3. Notez l'**adresse IP publique** de l'instance.
4. Ouvrez les ports du site : dans la page de l'instance, cliquez sur le réseau (Virtual Cloud Network) → Security Lists → Default → **Add Ingress Rules** : source `0.0.0.0/0`, protocole TCP, ports **80** puis **443**.

**Autre solution, plus simple : un petit serveur payant** (Hetzner, OVH, Scaleway…), environ 4 à 6 € par mois, avec Ubuntu 24.04. Passez alors directement à l'étape 2.

## 2. L'adresse du site

**Gratuit : DuckDNS.** Sur duckdns.org, connectez-vous (avec Google ou GitHub), créez un sous-domaine, par exemple `archfield`, et indiquez l'adresse IP du serveur. Le site sera à l'adresse `https://archfield.duckdns.org`.

Plus tard, un vrai nom de domaine (`archfield.app`, `archfield.fr`, environ 10 à 20 € par an) fera plus sérieux : il suffira de le faire pointer vers la même adresse IP et de changer `DOMAIN` et `BASE_URL` (étape 4).

## 3. Se connecter au serveur et installer Docker

Depuis Windows, ouvrez PowerShell (remplacez le chemin de la clé et l'adresse IP) :

```powershell
ssh -i C:\Users\Sidney\Downloads\ssh-key.key ubuntu@123.45.67.89
```

Puis, sur le serveur :

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# Oracle uniquement : le pare-feu d'Ubuntu bloque aussi les ports du site
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
exit
```

Reconnectez-vous avec la même commande `ssh` (pour que Docker soit utilisable sans `sudo`).

## 4. Installer Archfield

```bash
git clone -b claude/artifact-session-g0q340 https://github.com/Sidney123-SAY/Arcfield.git
cd Arcfield
cp .env.example .env
nano .env
```

Si le dépôt est privé, Git demande un identifiant et un mot de passe : donnez votre nom GitHub et, comme mot de passe, un jeton créé sur GitHub (Settings → Developer settings → Personal access tokens → Fine-grained token, accès en lecture au dépôt Arcfield).

Dans `.env`, changez au minimum (Ctrl+O pour enregistrer, Ctrl+X pour quitter) :

```
DOMAIN=archfield.duckdns.org
BASE_URL=https://archfield.duckdns.org
DEMO=off
```

Lancez :

```bash
docker compose up -d --build
```

Après une à deux minutes, ouvrez `https://archfield.duckdns.org` : le site est en ligne, avec le cadenas HTTPS. Sur votre téléphone, la page Compte propose « Installer l'application ».

Pour montrer la démo aux testeurs (comptes de démo et boutons « Démo » sur la page de connexion) : mettez `DEMO=on` dans `.env`, puis :

```bash
docker compose up -d
docker compose exec app node --no-warnings server/seed.js
```

Le chargement de la démo ne touche qu'aux comptes de démo, jamais aux vrais comptes.

## 5. Sauvegardes chaque nuit

```bash
crontab -e
```

Ajoutez cette ligne à la fin (sauvegarde à 3 h 30 chaque nuit) :

```
30 3 * * * /home/ubuntu/Arcfield/deploy/sauvegarde.sh >> /home/ubuntu/sauvegarde.log 2>&1
```

Les archives sont dans `~/Arcfield/backups` (14 jours gardés). De temps en temps, rapatriez-en une sur votre ordinateur, depuis PowerShell :

```powershell
scp -i C:\Users\Sidney\Downloads\ssh-key.key ubuntu@123.45.67.89:Arcfield/backups/archfield-2026-11-01.tar.gz .
```

## 6. Mettre à jour le site

Après chaque nouvelle version sur GitHub :

```bash
cd ~/Arcfield && ./deploy/mettre-a-jour.sh
```

L'application redémarre en quelques secondes ; les données et les comptes restent.

## 7. Ensuite

- **E-mails** (mot de passe oublié, rapports du lundi) : créez un compte gratuit chez Brevo, récupérez les identifiants SMTP, enlevez le `#` devant les lignes `SMTP_URL` et `MAIL_FROM` de `.env` et remplissez-les : `SMTP_URL=smtp://identifiant:clé@smtp-relay.brevo.com:587` et `MAIL_FROM=Archfield <votre-adresse>`, puis `docker compose up -d`.
- **Connexion avec Google** : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `.env` (voir le README), avec l'adresse de retour `https://votre-domaine/auth/google/callback`.
- **Être prévenu si le site tombe** : UptimeRobot (gratuit) sur `https://votre-domaine/healthz`.

## En cas de souci

- Voir ce qui se passe : `docker compose logs -f app` (Ctrl+C pour sortir) ou `docker compose logs caddy`.
- Le site ne répond pas : vérifiez les ports 80 et 443 (étapes 1 et 3) et que DuckDNS pointe vers la bonne adresse IP.
- Pas de cadenas HTTPS : Caddy n'obtient le certificat que si le domaine pointe déjà vers le serveur et que le port 80 est ouvert. Corrigez, puis `docker compose restart caddy`.
