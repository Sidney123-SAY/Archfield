# Sécurité d'Archfield

Archfield garde des photos de maisons, des montants d'argent et la position de chantiers : ce sont des données sensibles. Voici ce qui protège le site aujourd'hui, ce qui reste à faire, et la liste à suivre sur le serveur.

## Ce qui est en place

**Comptes**
- Mots de passe chiffrés (bcrypt), 8 caractères au minimum, mots de passe trop courants refusés (`12345678`, `motdepasse`, `azertyuiop`…).
- Après 8 essais ratés, la connexion à ce compte est bloquée 10 minutes depuis la même adresse.
- Session dans un cookie `HttpOnly` (invisible pour les scripts), `SameSite=Lax`, `Secure` en production, valable 30 jours.
- « Déconnecter mes autres appareils » dans la page Compte ; changer son mot de passe déconnecte aussi les autres appareils.
- Lien « mot de passe oublié » valable une heure, utilisable une seule fois, gardé haché en base. La réponse est la même que le compte existe ou non.
- Connexion avec Google (si activée) : protocole OpenID Connect avec contrôle `state`, e-mail Google vérifié exigé.

**Requêtes**
- Toute modification doit venir du site lui-même (contrôle de l'origine) : un autre site ne peut pas agir à votre place.
- Limites de requêtes par adresse et par compte (inscription, connexion, envoi de photos, argent, visites…).
- Requêtes SQL paramétrées (pas d'injection SQL), textes échappés à l'affichage (pas d'injection de script).

**En-têtes du navigateur**
- Politique de contenu stricte (CSP) : aucun script venu d'ailleurs ni écrit dans la page.
- Pas d'affichage dans une iframe (anti-clic piégé), `nosniff`, `Referrer-Policy`, isolement de la fenêtre et des ressources (COOP, CORP).
- Localisation et appareil photo autorisés pour le site seulement ; micro et paiement bloqués.
- HSTS en production : le navigateur n'utilise plus que le HTTPS.

**Photos et reçus**
- Seulement JPEG, PNG, WebP et HEIC, 15 Mo au plus, 10 par envoi. Le contenu réel du fichier est vérifié : un fichier déguisé en photo est refusé et effacé.
- Noms de fichiers aléatoires ; photos et reçus visibles seulement par le gestionnaire du chantier, son propriétaire et le lien privé du client. Jamais publics.

**Données du chantier**
- Lien privé du client : 128 bits aléatoires, impossible à deviner, changeable à tout moment.
- Les coordonnées exactes du chantier ne sont jamais envoyées sur le lien privé.
- Argent : une ligne (versement, dépense) ne s'efface jamais. Seul son auteur peut l'annuler ; l'annulation reste visible, avec la date, l'auteur et le motif.
- Export de toutes ses données et suppression du compte (RGPD).

**Dépendances**
- Versions figées dans `package-lock.json`. `npm audit` : aucune vulnérabilité connue au 31 octobre 2026. Relancez `npm audit --omit=dev` chaque mois et après chaque mise à jour.

## Limites connues, à traiter ensuite

1. **Preuve photo** : la date et la position viennent du téléphone. Un fraudeur équipé (application de fausse position, photo retouchée) peut tromper le système. Les visites de contrôle restent la vraie garantie ; une future application native pourra signer les photos au moment de la prise de vue.
2. **Double authentification** (code par SMS ou application) : pas encore en place. À ajouter en priorité pour les comptes qui suivent beaucoup d'argent.
3. **Limites de requêtes en mémoire** : remises à zéro au redémarrage, valables pour un seul serveur. Suffisant pour le test.
4. **Sauvegardes** non chiffrées sur le serveur : copiez-les ailleurs régulièrement (voir `HEBERGEMENT.md`), et chiffrez-les si elles quittent votre ordinateur.
5. **Pages légales** à compléter avant l'ouverture au public (mentions légales, confidentialité : durées de conservation, sous-traitants, contact).

## Liste à suivre sur le serveur

- Connexion SSH **par clé uniquement** (c'est le cas par défaut chez Oracle Cloud et Hetzner) ; ne partagez jamais la clé privée.
- Mises à jour de sécurité automatiques d'Ubuntu et blocage des attaques SSH : `sudo apt install -y unattended-upgrades fail2ban`.
- Seuls les ports 22 (SSH), 80 et 443 ouverts.
- Fichier `.env` lisible par vous seul : `chmod 600 .env`. Il ne va jamais sur GitHub (il est dans `.gitignore`).
- `DEMO=off` pour un site ouvert au public : sinon n'importe qui peut entrer dans les comptes de démo.
- Mettez à jour le site régulièrement (`./deploy/mettre-a-jour.sh`) et relancez `npm audit`.
- Surveillance gratuite (UptimeRobot) sur `https://votre-domaine/healthz`.

## En cas de problème

- **Compte piraté** : changez le mot de passe (cela déconnecte les autres appareils), puis « Déconnecter mes autres appareils ».
- **Lien privé partagé par erreur** : « Changer de lien » dans l'onglet Lien et rapports ; l'ancien cesse de marcher.
- **Serveur compromis** : coupez-le (`docker compose down`), changez les secrets du `.env` (Google, SMTP), réinstallez un serveur propre et restaurez la dernière sauvegarde saine.
