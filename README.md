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

L'artisan s'abonne, pas le client : 2 mois gratuits, puis 19 €/mois en Europe ou 9 900 FCFA/mois en Afrique de l'Ouest.

## Marchés

- Europe : artisans et clients pressés ou à distance.
- Afrique de l'Ouest : entreprises du BTP qui construisent pour des clients de la diaspora.

## Lancer l'application (MVP)

Il faut Node.js 22.13 ou plus récent (la base SQLite est intégrée à Node, aucun service externe).

```bash
npm install
npm run seed     # crée deux comptes de démo avec chantiers, photos, devis et rapports
npm start        # http://localhost:3000
```

Comptes de démo (mot de passe `archfield-demo`) :

| Compte | Marché | Lien client de démo |
| --- | --- | --- |
| `demo@archfield.app` | Atelier Rhône Rénovation, Lyon (€) | `/c/demo-lyon-claire` |
| `demo-afrique@archfield.app` | Sarr Construction, Saly (FCFA) | `/c/demo-saly-awa` |

`npm test` lance le parcours complet de l'API sur une base temporaire.

### Ce que fait le MVP

- **Artisan** : inscription avec 2 mois d'essai, création de chantiers avec étapes et durées prévues (modèles construction ou rénovation), publication de photos datées et d'une phrase depuis le téléphone (photos allégées dans le navigateur avant l'envoi), étapes à démarrer, terminer ou rouvrir, devis et factures, lien privé à copier ou envoyer par WhatsApp, accusé « Vu par … », chantier livré.
- **Client** : lien privé sans compte, journal photo, validation des étapes (l'étape suivante démarre alors toute seule), devis et factures, rapports du lundi.
- **Données** : alertes quand l'étape en cours dépasse de plus de 20 % sa durée prévue, durée prévue et réelle par type d'étape sur 12 mois, indice de fiabilité calculé sur les chantiers livrés (étape dans les délais à 10 % près), taux de lecture des rapports, export CSV.
- **Rapport du lundi** : généré chaque lundi à 7 h UTC pour chaque chantier actif, envoyé par e-mail si `SMTP_URL` est configuré, toujours visible sur le lien du client.

### Organisation du code

| Dossier | Rôle |
| --- | --- |
| `server/server.js` | API Express, sessions, envoi des photos, pages |
| `server/db.js` | Schéma SQLite |
| `server/analytics.js` | Avancement, dérive, durées par étape, indice de fiabilité |
| `server/reports.js` | Rapport hebdomadaire et e-mail |
| `server/seed.js` | Données de démo |
| `public/` | Pages : accueil, connexion, app artisan (`/app`), page client (`/c/<lien>`) |
| `prototype/` | Première maquette cliquable, sans serveur |

### Mettre en ligne

L'application tient dans un seul conteneur. Le dossier `DATA_DIR` contient la base et les photos : il doit être sur un disque persistant.

```bash
docker build -t archfield .
docker run -p 3000:3000 -v archfield-data:/data -e BASE_URL=https://votre-domaine archfield
```

Render, Railway ou Fly.io conviennent : un service web à partir du `Dockerfile`, plus un volume monté sur `/data`. Voir `.env.example` pour les variables.

### Pas encore dans le MVP

- Paiement de l'abonnement (Stripe en Europe, Orange Money et Wave en Afrique de l'Ouest).
- Notifications WhatsApp ou SMS au client à chaque mise à jour.
- Photos servies par adresse non devinable mais sans contrôle d'accès : à passer derrière le lien du client avant d'ouvrir au public.
- Plusieurs comptes par entreprise (offre Équipe).

## Prototype

`prototype/index.html` est une maquette cliquable en un seul fichier, avec des données d'exemple et sans backend. Ouvrez-la dans un navigateur.

Identité : logo en arche, couleurs encre `#14263D`, orange `#C2410C`, béton `#F1F3F5`, vert `#26774B`, ambre `#D99A2B` ; titres en Archivo, interface en Inter.

- **Vue Artisan sur ordinateur** : barre latérale (tableau de bord, chantiers, journal, clients, abonnement), indicateurs, alertes de dérive, durée prévue et réelle par type d'étape, indice de fiabilité, tableau des chantiers en cours, export CSV.
- **Vue Artisan sur téléphone** : carte du chantier, bouton « Nouvelle mise à jour », journal avec accusé « Vu par … », onglets Chantiers / Journal / Photos / Compte.
- **Vue Client** : lien privé avec journal photo, étapes à valider, devis et factures, rapport du lundi.
- Le sélecteur « Marché » bascule entre un artisan à Lyon (€) et une entreprise à Saly au Sénégal (FCFA).

Les publications et validations restent en mémoire dans la page : elles disparaissent au rechargement.
