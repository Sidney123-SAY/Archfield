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

Chaque photo, étape et date devient une donnée. L'artisan voit quelles étapes prennent plus de temps que prévu, reçoit une alerte quand un chantier dérape, et obtient un indice de fiabilité basé sur ses chantiers réellement livrés.

## Modèle économique

L'artisan s'abonne, pas le client : 2 mois gratuits, puis 19 €/mois en Europe ou 9 900 FCFA/mois en Afrique de l'Ouest et centrale.

## Marchés

- Europe : artisans et clients pressés ou à distance.
- Afrique de l'Ouest et centrale : entreprises du BTP qui construisent pour des clients de la diaspora.

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

`npm run parcours` joue 25 parcours complets comme un vrai utilisateur, en remplissant chaque formulaire : inscriptions (entreprise avec SIRET, client, proche invité), chantier, publication avec photo, étapes, devis et factures, validation par le client, numéro de suivi, invitation, cookies, langue, compte et suppression. Environ une minute.

### Captures de la page d'accueil

Les images de `public/img` sont de vraies captures de l'application (français et anglais, clair et sombre). Après un changement d'interface : `npm run seed`, `npm start`, puis dans un autre terminal `npm run screenshots` (Playwright est installé par `npm ci` ; la première fois, téléchargez le navigateur avec `npx playwright install chromium`).

### Ce que fait le MVP

- **Artisan** : inscription avec 2 mois d'essai, création de chantiers avec étapes et durées prévues (modèles construction ou rénovation), publication de photos datées et d'une phrase depuis le téléphone (photos allégées dans le navigateur avant l'envoi), étapes à démarrer, terminer ou rouvrir, devis et factures, lien privé à copier ou envoyer par WhatsApp, accusé « Vu par … », chantier livré.
- **Client** : lien privé sans compte, journal photo, validation des étapes (l'étape suivante démarre alors toute seule), devis et factures, rapports du lundi.
- **Données** : alertes quand l'étape en cours dépasse de plus de 20 % sa durée prévue, durée prévue et réelle par type d'étape sur 12 mois, indice de fiabilité calculé sur les chantiers livrés (étape dans les délais à 10 % près), taux de lecture des rapports, export CSV.
- **Rapport du lundi** : généré chaque lundi à 7 h UTC pour chaque chantier actif, envoyé par e-mail si `SMTP_URL` est configuré, toujours visible sur le lien du client.
- **Client prévenu** : e-mail à chaque mise à jour (au plus un toutes les 3 heures) si son e-mail est renseigné, et bouton « Prévenir sur WhatsApp » après chaque publication.
- **Compte** : mot de passe oublié (lien valable une heure), changement de mot de passe, export de toutes les données (JSON), suppression du chantier ou du compte avec effacement des photos.
- **Abonnement** : à la fin des 2 mois d'essai, l'artisan peut encore consulter ses chantiers mais plus publier ; ses clients gardent l'accès. En attendant le paiement en ligne, un abonnement s'active à la main : `npm run activate -- artisan@example.com 1` (1 mois).
- **Sécurité** : photos visibles seulement par l'artisan du chantier et par le lien du client, photos d'iPhone (HEIC) converties en JPEG, en-têtes de sécurité (CSP, anti-iframe), limites de requêtes, refus des requêtes venant d'autres sites.
- **Thème** : clair, sombre, ou celui du système (par défaut), au choix dans « Abonnement et compte » et en bas de chaque page.

### Espace client, numéro de suivi et proches

- **Trois types de compte** : entreprise ou artisan (publie, paie 19 € ou 9 900 FCFA par mois), client (suit ses chantiers, gratuit) et proche (particulier invité par un client, publie gratuitement).
- **Numéro de suivi** : chaque chantier a un numéro du type `ARC-7K3Q-9XW2`. Le client l'ajoute dans son espace (« Ajouter avec un numéro de suivi ») et retrouve tous ses chantiers au même endroit, quel que soit l'artisan.
- **Confier un chantier** : le client crée son chantier, puis génère une invitation (lien `/invitation/INV-…` ou code) pour une entreprise (gratuit pour lui) ou pour un proche sur place.
- **Offres client** : Gratuit (suivre), Basic 4,99 € ou 2 500 FCFA (1 proche), Premium 9,99 € ou 5 000 FCFA (jusqu'à 5 proches), avec 2 mois d'essai Premium. Sans offre active, le proche ne peut plus publier. Activation manuelle en attendant le paiement : `npm run activate -- client@example.com 1 premium`.
- L'entreprise ou le proche ne peut pas supprimer un chantier qui appartient à un client : il peut seulement le lui rendre. Le client peut reprendre la main à tout moment.
- Démo : `demo-client@archfield.app` (Awa, à Paris, 3 chantiers) et `demo-proche@archfield.app` (Ousmane, son frère à Thiès), mot de passe `archfield-demo`.

### Inscription, langues, thème et cookies

- **Inscription** : pays de l'entreprise obligatoire. En France, le SIRET est exigé, sa clé est vérifiée et il est contrôlé dans l'annuaire public des entreprises (nom et ville remplis tout seuls). Belgique : numéro BCE, Suisse : IDE, Luxembourg : RCS. En Afrique de l'Ouest (Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Bénin, Togo, Niger, Guinée-Bissau, en francs CFA XOF) et en Afrique centrale (Cameroun, Gabon, Congo, Tchad, Centrafrique, Guinée équatoriale, en francs CFA XAF), le numéro (NINEA, RCCM…) est facultatif. Le pays fixe la devise et le tarif.
- **Connexion avec Google** : bouton « Continuer avec Google » sur la connexion et l'inscription, dès que `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont renseignés.
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
