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

## 3. Se connecter au serveur

Depuis Windows, ouvrez PowerShell (remplacez le chemin de la clé et l'adresse IP) :

```powershell
ssh -i C:\Users\Sidney\Downloads\ssh-key.key ubuntu@123.45.67.89
```

La première fois, répondez `yes` à la question sur l'empreinte du serveur. Si Windows refuse la clé (« permissions too open »), faites un clic droit sur le fichier de la clé → Propriétés → Sécurité, et ne laissez que votre compte Windows.

## 4. Installer Archfield (une commande)

Sur le serveur :

```bash
git clone -b claude/artifact-session-g0q340 https://github.com/Sidney123-SAY/Arcfield.git
bash Arcfield/deploy/installer.sh
```

Si le dépôt est privé, Git demande un identifiant et un mot de passe : donnez votre nom GitHub et, comme mot de passe, un jeton créé sur GitHub (Settings → Developer settings → Personal access tokens → Fine-grained token, accès en lecture seule au dépôt Arcfield).

Le script demande l'adresse du site (ex. `archfield.duckdns.org`) et votre e-mail, puis fait tout seul :
- les mises à jour de sécurité automatiques d'Ubuntu et le blocage des attaques SSH (fail2ban) ;
- l'installation de Docker ;
- l'ouverture des ports 80 et 443 sur les serveurs Oracle ;
- le fichier `.env` (production, démo désactivée), lisible par vous seul ;
- la construction et le démarrage du site, avec le HTTPS ;
- la sauvegarde chaque nuit à 3 h 30.

On peut le relancer sans risque. Pour modifier la configuration plus tard : `nano ~/Arcfield/.env` (Ctrl+O pour enregistrer, Ctrl+X pour quitter), puis `cd ~/Arcfield && docker compose up -d`.

Après une à deux minutes, ouvrez `https://archfield.duckdns.org` : le site est en ligne, avec le cadenas HTTPS. Sur votre téléphone, la page Compte propose « Installer l'application ».

Pour montrer la démo aux testeurs (comptes de démo et boutons « Démo » sur la page de connexion) : mettez `DEMO=on` dans `.env`, puis :

```bash
docker compose up -d
docker compose exec app node --no-warnings server/seed.js
```

Le chargement de la démo ne touche qu'aux comptes de démo, jamais aux vrais comptes.

## 5. Sauvegardes chaque nuit

Le script d'installation les a programmées : une archive par nuit dans `~/Arcfield/backups` (14 jours gardés), plus une avant chaque mise à jour. De temps en temps, rapatriez-en une sur votre ordinateur, depuis PowerShell :

```powershell
scp -i C:\Users\Sidney\Downloads\ssh-key.key ubuntu@123.45.67.89:Arcfield/backups/archfield-2026-11-01.tar.gz .
```

## 6. Faire des modifications après la mise en ligne

Le site en ligne ne change jamais tout seul : il suit le code sur GitHub, et vous décidez quand il se met à jour.

1. **Modifier** : on travaille comme aujourd'hui, sur votre ordinateur (VS Code, `npm start`) ou en me demandant les changements. Rien ne touche le site en ligne.
2. **Vérifier** sur votre ordinateur : `npm test`, et un tour sur `http://localhost:3000`.
3. **Envoyer sur GitHub** : vos commits ou les miens, sur la branche suivie par le serveur.
4. **Mettre en ligne**, sur le serveur :

```bash
cd ~/Arcfield && ./deploy/mettre-a-jour.sh
```

Le script sauvegarde d'abord la base et les photos, récupère la nouvelle version, reconstruit et redémarre : quelques secondes de coupure. Les comptes, chantiers, photos et montants restent. Si la base a besoin de nouvelles colonnes, elles sont ajoutées toutes seules au démarrage.

5. **En cas de problème** avec la nouvelle version :

```bash
cd ~/Arcfield && ./deploy/revenir-en-arriere.sh
```

On revient à la version d'avant, sans perdre de données.

Les téléphones qui ont installé l'application la mettent à jour d'eux-mêmes à la prochaine ouverture : rien à faire de leur côté.

Plus tard, quand il y aura de vrais utilisateurs : une branche `main` pour la version en ligne (on n'y met que ce qui est vérifié) et une branche de travail pour le reste, et éventuellement une mise à jour automatique à chaque envoi sur `main`.

## 7. Ensuite

- **E-mails** (mot de passe oublié, rapports du lundi) : créez un compte gratuit chez Brevo, récupérez les identifiants SMTP, enlevez le `#` devant les lignes `SMTP_URL` et `MAIL_FROM` de `.env` et remplissez-les : `SMTP_URL=smtp://identifiant:clé@smtp-relay.brevo.com:587` et `MAIL_FROM=Archfield <votre-adresse>`, puis `docker compose up -d`.
- **Connexion avec Google** : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `.env` (voir le README), avec l'adresse de retour `https://votre-domaine/auth/google/callback`.
- **Être prévenu si le site tombe** : UptimeRobot (gratuit) sur `https://votre-domaine/healthz`.

## Sécurité

Ce qui protège le site, ses limites et la liste à suivre sur le serveur : [SECURITE.md](SECURITE.md).

## En cas de souci

- Voir ce qui se passe : `docker compose logs -f app` (Ctrl+C pour sortir) ou `docker compose logs caddy`.
- Le site ne répond pas : vérifiez les ports 80 et 443 (étapes 1 et 3) et que DuckDNS pointe vers la bonne adresse IP.
- Pas de cadenas HTTPS : Caddy n'obtient le certificat que si le domaine pointe déjà vers le serveur et que le port 80 est ouvert. Corrigez, puis `docker compose restart caddy`.
