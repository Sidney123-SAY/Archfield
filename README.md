# Archfield

Archfield permet à n'importe quel client de suivre son chantier à distance, en toute transparence, et transforme chaque chantier en données utiles.

## Le problème

Quand on fait construire ou rénover, on est rarement sur place : on travaille la journée, on rénove dans une autre ville, ou on construit au pays depuis l'Europe. On ne sait pas où en est le chantier, on appelle l'artisan sans arrêt, et on a peur de payer des travaux qui n'avancent pas.

## Comment ça marche

L'artisan (ou l'entreprise du BTP) publie l'avancement depuis son téléphone en 30 secondes : quelques photos datées et une phrase. Son client reçoit un lien privé, sans compte, où il retrouve :

- le journal du chantier avec les photos ;
- la liste des étapes (fondations, murs, toiture…), qu'il valide une à une ;
- les devis et les factures ;
- un rapport envoyé automatiquement chaque lundi.

## La data

Chaque photo garde sa date et son lieu de prise de vue, et chaque franc versé est comparé à l'avancement réel : le client sait s'il paie plus vite que les travaux n'avancent. Les retards d'étape déclenchent aussi une alerte.

## Modèle économique

Celui qui fait construire paie l'offre Plus (9,99 € ou 5 000 FCFA par mois, 2 mois offerts) ; les entreprises et les proches qui publient ne paient pas.

## Marchés

- La diaspora qui construit au pays (Sénégal, Côte d'Ivoire, Cameroun, Mali…) depuis l'Europe ou l'Amérique.
- En Afrique de l'Ouest et centrale : salariés, cadres et chefs d'entreprise sans temps pour aller sur le chantier, ou dont le terrain est loin de la ville.
- Les entreprises du BTP qui veulent rassurer leurs clients (gratuit pour elles). L'Europe (rénovation) reste possible mais n'est pas la cible du test.

## Lancer l'application (MVP)

Il faut Node.js 22.13 ou plus récent (la base SQLite est intégrée à Node, aucun service externe).

```bash
npm install
npm run seed     # crée deux comptes de démo avec chantiers, photos, devis et rapports (développement uniquement)
npm start        # http://localhost:3000
```

Comptes de démo (mot de passe `archfield-demo`) :

| Compte | Marché | Lien client de démo |
| --- | --- | --- |
| `demo@archfield.app` | Atelier Rhône Rénovation, Lyon (€) | `/c/demo-lyon-claire` |
| `demo-afrique@archfield.app` | Sarr Construction, Saly (FCFA) | `/c/demo-saly-awa` |

`npm test` lance le parcours complet de l'API sur une base temporaire.

### Ouvrir le site sur son téléphone

Au démarrage (`npm start`), le terminal affiche l'adresse à ouvrir sur un téléphone connecté **au même Wi-Fi**, par exemple `http://192.168.1.20:3000`, et un QR code à scanner avec l'appareil photo.

- Sous Windows, la première fois, autorisez Node.js dans le pare-feu pour les **réseaux privés**. Si la fenêtre n'est pas apparue : Paramètres → Confidentialité et sécurité → Sécurité Windows → Pare-feu → Autoriser une application → cochez Node.js (Privé).
- Le Wi-Fi de l'ordinateur doit être en profil « Privé » (Paramètres → Réseau et Internet → Wi-Fi → propriétés du réseau).
- Le téléphone ne doit pas être sur la 4G ni sur un Wi-Fi invité.

### Application mobile

Archfield s'installe sur le téléphone comme une application (icône sur l'écran d'accueil, plein écran), sans store : sur Android, bouton « Installer l'application » (page Compte) ; sur iPhone, Safari → Partager → « Sur l'écran d'accueil ». Les écrans déjà ouverts restent consultables sans réseau, et l'application se met à jour seule à chaque changement du site.

L'installation demande le HTTPS : elle marche une fois le site en ligne (ou sur `http://localhost`), pas sur l'adresse Wi-Fi `http://192.168…`. Fichiers : `public/manifest.webmanifest`, `public/sw.js` (le serveur y met un numéro de version), `public/icons/` (refaits avec `npm run icons`).

### Recette automatique

`npm run qa` démarre un serveur sur une base de démo jetable, ouvre chaque écran avec chaque compte de démo (ordinateur et téléphone, français et anglais), clique sur chaque bouton sans danger et liste : erreurs JavaScript, requêtes en échec, liens cassés, boutons sans effet, pages plus larges que l'écran, textes restés en français dans la version anglaise. Compter une vingtaine de minutes.

`npm run parcours` joue 29 parcours complets comme un vrai utilisateur, en remplissant chaque formulaire : inscriptions (entreprise avec SIRET, client, proche invité), chantier, publication avec photo vérifiée, publication sans réseau, étapes, argent (dépenses avec reçu, versements, annulation), devis et factures, validation par le client, visite de contrôle, numéro de suivi, invitation, cookies, langue, compte et suppression. Environ une minute.

### Vraies photos

Les maisons dessinées de la démo et l'emplacement photo de la page d'accueil se remplacent par de vraies photos : voir [demo/photos/LISEZMOI.md](demo/photos/LISEZMOI.md). Puis `npm run seed` et `npm run screenshots`.

### Captures de la page d'accueil

Les images de `public/img` sont de vraies captures de l'application (français et anglais, clair et sombre). Après un changement d'interface : `npm run seed`, `npm start`, puis dans un autre terminal `npm run screenshots` (Playwright est installé par `npm ci` ; la première fois, téléchargez le navigateur avec `npx playwright install chromium`).

### Ce que fait le MVP

- **Qui paie** : celui qui fait construire, avec l'offre **Plus** (9,99 € ou 5 000 FCFA par mois, 2 mois offerts). Les entreprises du BTP et les proches qui publient utilisent Archfield **gratuitement**.
- **Publier (entreprise ou proche)** : chantiers avec étapes et durées prévues (modèles construction ou rénovation), photos prises sur place ou choisies dans la galerie, allégées dans le navigateur avant l'envoi, et une phrase. Étapes à démarrer, terminer ou rouvrir, lien privé à envoyer par WhatsApp, accusé « Vu par … », chantier livré.
- **Photos vérifiées** : la date de prise de vue et la position GPS de chaque photo sont lues dans le téléphone avant l'envoi, et la position du téléphone est demandée au moment de publier. La première publication géolocalisée enregistre la position du chantier ; chaque publication est ensuite marquée « Vérifiée », « Vérification partielle » ou « À vérifier » (photo de plus de 3 jours, ou prise à plus de 500 m du chantier, précision du GPS en plus). Voir `server/verify.js`. Ce n'est pas infalsifiable (un fraudeur équipé peut tricher), mais une vieille photo ou une photo prise ailleurs se voit.
- **Argent** : budget (devis signés), versements du propriétaire (Wave, Orange Money, MTN MoMo, virement, espèces), dépenses du gestionnaire avec photo du reçu, versement prévu par étape (échéancier). Archfield compare le versé à l'avancement et alerte quand le propriétaire a versé plus de 15 points de plus que les travaux réalisés. Une ligne ne s'efface jamais : son auteur peut l'annuler, et l'annulation reste visible avec la date et le motif. Monnaie propre à chaque chantier (euro, franc CFA de l'Ouest ou du Centre).
- **Sans réseau** : sur un chantier sans couverture, la publication (texte, photos, position) est gardée sur le téléphone et part toute seule dès que le réseau revient.
- **Visite de contrôle** : depuis son espace, le client demande qu'une personne de confiance passe sur le chantier. La demande est enregistrée et envoyée par e-mail à `CONTACT_EMAIL`, qui rappelle le client avec un prix.
- **Client sans compte** : lien privé avec le journal photo, les preuves, la validation des étapes (l'étape suivante démarre alors toute seule), l'onglet Argent en lecture et les rapports du lundi.
- **Rapport du lundi** : généré chaque lundi à 7 h UTC pour chaque chantier actif, envoyé par e-mail si `SMTP_URL` est configuré, toujours visible sur le lien du client.
- **Client prévenu** : e-mail à chaque mise à jour (au plus un toutes les 3 heures) si son e-mail est renseigné, et bouton « Prévenir sur WhatsApp » après chaque publication.
- **Compte** : mot de passe oublié (lien valable une heure), changement de mot de passe, « Déconnecter mes autres appareils », export de toutes les données (JSON), suppression du chantier ou du compte avec effacement des photos et des reçus.
- **Retirés de l'écran pour le test** (le code reste dans `server/analytics.js`) : graphique des durées par type d'étape, indice de fiabilité, export CSV. Ils reviendront quand il y aura assez de chantiers.
- **Sécurité** : voir [deploy/SECURITE.md](deploy/SECURITE.md).

### Espace client, numéro de suivi et proches

- **Trois types de compte** : entreprise ou artisan (publie, gratuit), client (suit ses chantiers et son argent, offre Gratuit ou Plus) et proche (particulier invité par un client, publie et note les dépenses gratuitement).
- **Numéro de suivi** : chaque chantier a un numéro du type `ARC-7K3Q-9XW2`. Le client l'ajoute dans son espace (« Ajouter avec un numéro de suivi ») et retrouve tous ses chantiers au même endroit, quel que soit l'artisan.
- **Confier un chantier** : le client crée son chantier, puis génère une invitation (lien `/invitation/INV-…` ou code) pour une entreprise ou pour un proche sur place.
- **Offres client** : Gratuit (journal, photos vérifiées, étapes, devis, rapports) et Plus (suivi de l'argent, jusqu'à 5 proches, visites de contrôle), avec 2 mois d'essai Plus. Sans Plus, le proche ne peut plus publier et le propriétaire ne note plus ses versements. Activation manuelle en attendant le paiement en ligne : `npm run activate -- client@example.com 1` (1 mois).
- L'entreprise ou le proche ne peut pas supprimer un chantier qui appartient à un client : il peut seulement le lui rendre. Le client peut reprendre la main à tout moment, et lui seul peut effacer la position enregistrée de son chantier.
- Démo : `demo-client@archfield.app` (Awa, à Paris, 3 chantiers, dont la Villa Ndiaye avec l'alerte « versé plus que construit ») et `demo-proche@archfield.app` (Ousmane, son frère à Thiès, qui note les dépenses avec reçus), mot de passe `archfield-demo`.

### Inscription, langues, thème et cookies

- **Inscription** : pays de l'entreprise obligatoire. En France, le SIRET est exigé, sa clé est vérifiée et il est contrôlé dans l'annuaire public des entreprises (nom et ville remplis tout seuls). Belgique : numéro BCE, Suisse : IDE, Luxembourg : RCS. En Afrique de l'Ouest (Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Bénin, Togo, Niger, Guinée-Bissau, en francs CFA XOF) et en Afrique centrale (Cameroun, Gabon, Congo, Tchad, Centrafrique, Guinée équatoriale, en francs CFA XAF), le numéro (NINEA, RCCM…) est facultatif. Le pays fixe la devise et le tarif.
- **Connexion avec Google** : bouton « Continuer avec Google » sur la connexion et l'inscription, dès que `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont renseignés.
- **Connexion avec Apple** : bouton « Continuer avec Apple », dès que `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` et `APPLE_PRIVATE_KEY` sont renseignés. Il faut un compte Apple Developer (99 $ par an) : créer un « Services ID » avec « Sign in with Apple », déclarer le domaine et l'adresse de retour `https://votre-domaine/auth/apple/callback`, puis créer une clé « Sign in with Apple » (fichier `.p8`, à coller dans `APPLE_PRIVATE_KEY` avec `\n` à la place des retours à la ligne). Apple ne fonctionne qu'en HTTPS sur un vrai domaine.
- **Activer Google et Apple** : guide pas à pas dans [deploy/CONNEXION-GOOGLE-APPLE.md](deploy/CONNEXION-GOOGLE-APPLE.md). En local, les identifiants se mettent dans un fichier `.env` à la racine, lu automatiquement par `npm start`.
- **Boutons Google et Apple en démo** : quand `DEMO` est actif, les deux boutons s'affichent même sans configuration, pour voir la page ; un clic explique qu'ils ne sont pas encore activés. En production (`DEMO=off`), un bouton n'apparaît que s'il est configuré.
  1. Sur https://console.cloud.google.com, créez un projet, puis **API et services → Identifiants → Créer des identifiants → ID client OAuth** (type « Application Web »).
  2. URI de redirection autorisée : `<BASE_URL>/auth/google/callback`, par exemple `http://localhost:3000/auth/google/callback` en local.
  3. Copiez l'ID client et le code secret dans `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
- **Langues** : français et anglais, au choix en haut de chaque page (le navigateur décide la première fois). Les textes anglais sont dans `public/js/i18n-en.js` ; `npm test` signale toute phrase sans traduction. Les e-mails partent encore en français.
- **Thème** : soleil (clair), lune (sombre), écran (suit le système, par défaut).
- **Cookies** : bandeau au premier passage (tout refuser, paramètres, tout accepter), redemandé tous les 6 mois comme le recommande la CNIL, et lien « Gérer les cookies » en bas de chaque page. Aujourd'hui seul le cookie de connexion est utilisé ; un outil de mesure d'audience ne devra se charger que si `AF.consent().analytics` vaut `true`.
- **Démo** : hors production, boutons « Démo Lyon » et « Démo Saly » sur la page de connexion (après `npm run seed`).

### Organisation du code

| Dossier | Rôle |
| --- | --- |
| `server/server.js` | API Express, sessions, envoi des photos, pages |
| `server/db.js` | Schéma SQLite |
| `server/analytics.js` | Avancement, dérive, durées par étape, indice de fiabilité |
| `server/reports.js` | Rapport hebdomadaire et e-mail |
| `server/mail.js` | Envoi des e-mails (SMTP) |
| `server/company.js` | Pays, SIRET et autres numéros d'entreprise |
| `server/space.js` | Espace client : numéro de suivi, invitations, offres client |
| `server/seed.js` | Données de démo |
| `server/activate.js` | Activation manuelle d'un abonnement |
| `public/` | Pages : accueil, connexion, app artisan (`/app`), page client (`/c/<lien>`), à propos, mentions légales, confidentialité |
| `public/js/i18n-en.js` | Traduction anglaise |
| `tools/i18n-keys.js` | Liste des phrases à traduire (utilisé par les tests) |
| `tools/qa.js` | Recette automatique de tous les écrans et boutons |
| `tools/parcours.js` | Parcours complets dans le navigateur (formulaires et actions) |
| `prototype/` | Première maquette cliquable, sans serveur |

### Mettre en ligne

Guide pas à pas (serveur gratuit Oracle Cloud ou petit serveur payant, adresse gratuite DuckDNS, HTTPS automatique, sauvegardes, mises à jour) : **[deploy/HEBERGEMENT.md](deploy/HEBERGEMENT.md)**. En résumé, sur le serveur : `cp .env.example .env`, renseigner `DOMAIN` et `BASE_URL`, puis `docker compose up -d --build`.

L'application tient dans un seul conteneur. Le dossier `DATA_DIR` contient la base et les photos : il doit être sur un disque persistant.

```bash
docker build -t archfield .
docker run -p 3000:3000 -v archfield-data:/data -e BASE_URL=https://votre-domaine archfield
```

Render, Railway, Fly.io ou une machine virtuelle gratuite (Oracle Cloud « Always Free ») conviennent : un service web à partir du `Dockerfile`, plus un volume monté sur `/data`. Voir `.env.example` pour les variables.

### Avant d'ouvrir au public

- Compléter et faire relire `public/confidentialite.html` et `public/mentions-legales.html` (éléments entre crochets), et ajouter des CGV.
- Configurer `SMTP_URL` (Brevo, Resend ou Postmark) : sans lui, ni le mot de passe oublié ni les e-mails aux clients ne partent.
- Mettre `DEMO=off` et ne pas lancer `npm run seed` en production.
- Sauvegarder chaque jour le dossier `DATA_DIR` (base et photos).

### Pas encore fait

- Paiement de l'abonnement (Stripe en Europe, Orange Money, MTN MoMo et Wave en Afrique de l'Ouest et centrale).
- Notifications WhatsApp automatiques (l'artisan envoie le message lui-même en un clic).
- Plusieurs comptes par entreprise (offre Équipe) et publication hors connexion (envoi quand le réseau revient).

## Prototype

`prototype/index.html` est une maquette cliquable en un seul fichier, avec des données d'exemple et sans backend. Ouvrez-la dans un navigateur.

Identité : logo en arche, couleurs encre `#14263D`, orange `#C2410C`, béton `#F1F3F5`, vert `#26774B`, ambre `#D99A2B` ; titres en Archivo, interface en Inter.

- **Vue Artisan sur ordinateur** : barre latérale (tableau de bord, chantiers, journal, clients, abonnement), indicateurs, alertes de dérive, durée prévue et réelle par type d'étape, indice de fiabilité, tableau des chantiers en cours, export CSV.
- **Vue Artisan sur téléphone** : carte du chantier, bouton « Nouvelle mise à jour », journal avec accusé « Vu par … », onglets Chantiers / Journal / Photos / Compte.
- **Vue Client** : lien privé avec journal photo, étapes à valider, devis et factures, rapport du lundi.
- Le sélecteur « Marché » bascule entre un artisan à Lyon (€) et une entreprise à Saly au Sénégal (FCFA).

Les publications et validations restent en mémoire dans la page : elles disparaissent au rechargement.
