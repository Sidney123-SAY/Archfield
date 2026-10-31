# Activer « Continuer avec Google » et « Continuer avec Apple »

Quand on clique sur l'un de ces boutons, c'est Google ou Apple qui affiche sa propre fenêtre (choix du compte, Face ID…), puis renvoie la personne sur Archfield, connectée. Pour cela, Archfield doit être déclaré chez eux : c'est ce que donnent les identifiants ci-dessous.

## Google (gratuit, environ 10 minutes, marche aussi sur votre ordinateur)

1. Allez sur **console.cloud.google.com** avec votre compte Google, et créez un projet nommé « Archfield ».
2. Ouvrez **Google Auth Platform** (ou « API et services → Écran de consentement OAuth » selon l'affichage) :
   - nom de l'application : **Archfield**, e-mail d'assistance : le vôtre ;
   - public : **Externe** ;
   - tant que l'application est « En test », ajoutez dans **Utilisateurs test** les adresses Gmail qui pourront se connecter (la vôtre, celles de vos testeurs).
3. Dans **Clients**, créez un client de type **Application Web**. Dans **URI de redirection autorisés**, ajoutez :
   - `http://localhost:3000/auth/google/callback` (pour votre ordinateur) ;
   - plus tard, `https://archfield.duckdns.org/auth/google/callback` (votre adresse en ligne).
4. Google affiche un **ID client** et un **code secret**. Gardez le code secret pour vous : ne le mettez jamais sur GitHub.

### Sur votre ordinateur

Dans le dossier du projet (`C:\Users\Sidney\Arcfield`), créez un fichier nommé `.env` (dans VS Code : Nouveau fichier), avec seulement ces lignes :

```
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-votre-code-secret
BASE_URL=http://localhost:3000
```

Puis relancez `npm start` et ouvrez `http://localhost:3000/connexion` : « Continuer avec Google » ouvre la fenêtre de Google.

Ne copiez pas tout `.env.example` sur votre ordinateur : sa ligne `NODE_ENV=production` exige le HTTPS et empêcherait la connexion sur `http://localhost`. Le fichier `.env` est ignoré par Git : il ne part jamais sur GitHub.

Sur le téléphone en Wi-Fi (`http://192.168…`), Google refuse ces adresses : la connexion Google y marchera une fois le site en ligne.

### En ligne

Ajoutez les deux mêmes lignes `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans le `.env` du serveur, puis `docker compose up -d`.

Avant d'ouvrir à tout le monde, passez l'application de « En test » à « En production » dans Google Auth Platform (Google peut demander les liens vers la page d'accueil et la politique de confidentialité : `https://votre-domaine/` et `https://votre-domaine/confidentialite`).

## Apple (compte Apple Developer, 99 $ par an, site en ligne obligatoire)

Apple n'accepte que des adresses en HTTPS sur un vrai domaine : à faire après l'hébergement.

1. Inscrivez-vous à l'**Apple Developer Program** (developer.apple.com, 99 $ par an).
2. Dans **Certificates, Identifiers & Profiles** :
   - **Identifiers → App IDs** : créez un identifiant (ex. `app.archfield`) avec la case **Sign in with Apple** ;
   - **Identifiers → Services IDs** : créez un Services ID (ex. `app.archfield.web`), cochez **Sign in with Apple**, puis **Configure** : domaine `archfield.duckdns.org`, adresse de retour `https://archfield.duckdns.org/auth/apple/callback` ;
   - **Keys** : créez une clé avec **Sign in with Apple**, téléchargez le fichier `.p8` (une seule fois possible) et notez le **Key ID**.
3. Votre **Team ID** est en haut à droite du site Apple Developer.
4. Dans le `.env` du serveur :

```
APPLE_CLIENT_ID=app.archfield.web
APPLE_TEAM_ID=ABCDE12345
APPLE_KEY_ID=XYZ987WVU6
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----
```

Pour `APPLE_PRIVATE_KEY`, ouvrez le fichier `.p8`, et mettez tout son contenu sur une seule ligne en remplaçant chaque retour à la ligne par `\n`. Puis `docker compose up -d`.
