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

## Prototype

`prototype/index.html` est une maquette cliquable en un seul fichier, avec des données d'exemple et sans backend. Ouvrez-la dans un navigateur.

Identité : logo en arche, couleurs encre `#14263D`, orange `#C2410C`, béton `#F1F3F5`, vert `#26774B`, ambre `#D99A2B` ; titres en Archivo, interface en Inter.

- **Vue Artisan sur ordinateur** : barre latérale (tableau de bord, chantiers, journal, clients, abonnement), indicateurs, alertes de dérive, durée prévue et réelle par type d'étape, indice de fiabilité, tableau des chantiers en cours, export CSV.
- **Vue Artisan sur téléphone** : carte du chantier, bouton « Nouvelle mise à jour », journal avec accusé « Vu par … », onglets Chantiers / Journal / Photos / Compte.
- **Vue Client** : lien privé avec journal photo, étapes à valider, devis et factures, rapport du lundi.
- Le sélecteur « Marché » bascule entre un artisan à Lyon (€) et une entreprise à Saly au Sénégal (FCFA).

Les publications et validations restent en mémoire dans la page : elles disparaissent au rechargement.
