# Tester Archfield sur votre PC, comme sur un vrai serveur

Votre ordinateur Windows fait tourner une **machine virtuelle Ubuntu** : un petit serveur Linux, isolé de Windows, exactement comme celui qu'on louera plus tard. Archfield y tourne avec Docker, et un **tunnel Cloudflare** lui donne une adresse publique en HTTPS (`https://quelque-chose.trycloudflare.com`). Vos testeurs l'ouvrent depuis leur téléphone, à Cotonou comme à Paris.

Le HTTPS n'est pas un détail : sans lui, le téléphone refuse la localisation (photos vérifiées), le micro (messages vocaux) et l'installation de l'application.

Pendant le test, rien de payant ni de réel ne part :
- **les codes de confirmation** (WhatsApp ou SMS) s'affichent à l'écran au lieu d'être envoyés ;
- **les paiements** passent par une page de test, sans carte ;
- **les e-mails** sont écrits dans le journal du serveur.

Chaque point peut être branché pour de vrai plus tard (voir la fin de ce guide).

Il n'y a aucun compte fictif : vous créez de vrais comptes, de vrais chantiers, avec vos photos.

---

## 1. Installer VirtualBox (une fois)

1. Téléchargez **VirtualBox** pour Windows sur <https://www.virtualbox.org/wiki/Downloads> (« Windows hosts ») et installez-le, en acceptant tout.
2. Téléchargez **Ubuntu Server 24.04 LTS** sur <https://ubuntu.com/download/server>. Vous obtenez un fichier `.iso` d'environ 2,5 Go.

> Si VirtualBox affiche une erreur « VT-x » ou « virtualisation », il faut activer la virtualisation dans le BIOS du PC : redémarrez, appuyez sur F2 ou Suppr au démarrage, et activez « Intel VT-x » ou « AMD-V / SVM ».

## 2. Créer la machine virtuelle

Dans VirtualBox, cliquez sur **Nouvelle** :

| Réglage | Valeur |
|---|---|
| Nom | `archfield-test` |
| Image ISO | le fichier Ubuntu Server téléchargé |
| Cochez | « Skip Unattended Installation » (installation guidée) |
| Mémoire | **4096 Mo** (2048 au minimum) |
| Processeurs | **2** |
| Disque | **25 Go** |

Avant de la démarrer : sélectionnez-la, puis **Configuration** › **Réseau** › Carte 1 › « Mode d'accès réseau » : **Accès par pont** (*Bridged Adapter*). La machine aura sa propre adresse sur votre box, comme un vrai serveur.

## 3. Installer Ubuntu dans la machine

Cliquez sur **Démarrer** et suivez l'installation (Entrée pour valider, flèches pour choisir) :

- langue **English** ou **Français**, clavier **French** ;
- type d'installation : **Ubuntu Server** ;
- réseau, proxy et miroir : laissez tels quels ;
- disque : **Use an entire disk**, puis **Done** et **Continue** ;
- nom : `archfield`, nom du serveur : `archfield-test`, utilisateur : `sidney`, et un mot de passe à retenir ;
- **cochez « Install OpenSSH server »** (barre d'espace) ;
- ne cochez aucun logiciel supplémentaire.

À la fin, choisissez **Reboot Now**. Si la machine demande de retirer le disque d'installation, appuyez sur Entrée.

Connectez-vous avec `sidney` et votre mot de passe, puis notez l'adresse de la machine :

```bash
hostname -I
```

Vous obtenez par exemple `192.168.1.42`.

## 4. Se connecter depuis Windows (plus confortable)

Ouvrez **Terminal** (ou PowerShell) sur Windows :

```powershell
ssh sidney@192.168.1.42
```

Répondez `yes` la première fois, puis tapez le mot de passe. Vous pouvez maintenant copier-coller les commandes.

## 5. Récupérer Archfield dans la machine

Le dépôt GitHub est privé : la machine doit prouver que c'est vous.

1. Sur GitHub, ouvrez **Settings** › **Developer settings** › **Personal access tokens** › **Fine-grained tokens** › **Generate new token** :
   - accès au dépôt `Arcfield` seulement ;
   - permission **Contents : Read-only**.

   Copiez le jeton.
2. Dans la machine, lancez :

```bash
git clone -b claude/artifact-session-g0q340 https://github.com/Sidney123-SAY/Archfield.git
```

À « Username », tapez votre nom GitHub ; à « Password », collez le jeton (rien ne s'affiche, c'est normal).

> Autre solution, sans GitHub : depuis Windows, `scp -r C:\Users\Sidney\Arcfield sidney@192.168.1.42:~/`, puis supprimez le dossier `node_modules` copié dans la machine.

## 6. Lancer le test

```bash
cd Arcfield
bash deploy/test-local.sh
```

La première fois, le script :
1. installe Docker ;
2. construit l'application (quelques minutes) ;
3. ouvre le tunnel ;
4. affiche l'adresse publique.

Si un message parle de permission Docker, déconnectez-vous (`exit`), reconnectez-vous (`ssh …`) et relancez la commande.

Vous voyez :

```
 Adresse à envoyer aux testeurs (téléphone, n'importe où) :
     https://exemple-mots-au-hasard.trycloudflare.com
```

## 7. Premier compte et administration

1. Ouvrez l'adresse, puis créez votre compte, par numéro de téléphone ou par e-mail. Le code de confirmation s'affiche à l'écran en vert : c'est le mode test.
2. Donnez-vous l'accès à l'administration (remplacez par votre e-mail ou votre numéro au format `+229…`) :

```bash
sudo docker compose -f compose.test.yaml exec app node --no-warnings server/activate.js --admin vous@exemple.com
```

3. Ouvrez `…/admin`. Vous y trouvez les comptes, les offres à activer à la main, les demandes de visite et les **Images du site**. C'est là que vous ajoutez de **vraies photos de chantier** pour la page d'accueil, et que vous remplacez les captures de l'application.

## 8. Faire tester

Envoyez l'adresse par WhatsApp. Un bon scénario de test, à deux ou trois personnes :

1. **Le dirigeant** crée un compte « entreprise », puis un chantier, et invite son chef de chantier depuis l'onglet **Équipe** (lien WhatsApp).
2. **Le chef de chantier** ouvre le lien sur son téléphone, crée son compte avec son numéro, puis fait le **rapport du jour** :
   - message vocal ;
   - ouvriers présents ;
   - livraisons ;
   - photos.

   Il déclare aussi une **dépense** et signale un **problème**.
3. **Le dirigeant** :
   - vérifie le rapport ;
   - approuve la dépense ;
   - montre ou non le problème au client ;
   - ouvre le **PDF de la semaine**.
4. **Le client** ouvre le lien privé du chantier (onglet « Lien et rapports »), ou crée son espace client avec le numéro de suivi.
5. **Le paiement** : dans « Compte » (entreprise) ou « Mon offre » (client), choisissez une offre. La page de test confirme le paiement sans carte.

Pour tester **sans réseau** : sur le téléphone du chef, passez en mode avion, faites un rapport (il reste « Sur ce téléphone »), puis revenez au réseau : il part tout seul.

## 9. Au quotidien

| Pour… | Commande (dans `~/Arcfield`) |
|---|---|
| Revoir l'adresse publique | `bash deploy/test-local.sh adresse` |
| Tout arrêter | `bash deploy/test-local.sh arreter` |
| Relancer (après un redémarrage du PC) | `bash deploy/test-local.sh` |
| Prendre la dernière version | `git pull` puis `bash deploy/test-local.sh` |
| Voir ce qui se passe (codes, e-mails) | `sudo docker compose -f compose.test.yaml logs -f app` |
| Repartir de zéro (efface tout le test) | `bash deploy/test-local.sh arreter`, puis `sudo rm -rf data-test` |

**L'adresse change** à chaque redémarrage du tunnel : renvoyez-la aux testeurs.

Pour une adresse fixe (par exemple `test.archfield.app`), il faut un nom de domaine géré par Cloudflare et un « tunnel nommé ». Ce sera l'étape de la mise en ligne.

Le PC doit rester allumé pendant le test. La machine virtuelle peut tourner en arrière-plan : dans VirtualBox, faites un clic droit › Démarrer › **Démarrage sans affichage**.

## 10. Brancher le réel, plus tard

Ajoutez les lignes dans `~/Arcfield/.env.test`, puis relancez `bash deploy/test-local.sh` :

- **Vrais SMS et WhatsApp** : voir `deploy/TELEPHONE.md` (Twilio Verify).
- **Vrais paiements Stripe** (d'abord en mode test, avec les cartes de test de Stripe) : voir `deploy/PAIEMENT.md`.
- **Vrais e-mails** : `SMTP_URL=smtps://identifiant:motdepasse@smtp-relay.brevo.com:465` (Brevo est gratuit jusqu'à 300 e-mails par jour).

## Sans machine virtuelle (plus simple, moins proche d'un serveur)

Sur Windows directement :
1. Installez Node.js 22 depuis <https://nodejs.org>.
2. Dans le dossier du projet, lancez `npm install` puis `npm start`.
3. Installez `cloudflared` (<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>), puis, dans un second terminal : `cloudflared tunnel --url http://localhost:3000`.

L'adresse `https://….trycloudflare.com` affichée marche de la même façon.
