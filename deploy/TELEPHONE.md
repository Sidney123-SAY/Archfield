# Connexion par téléphone : codes WhatsApp et SMS

On se connecte à Archfield avec un numéro de téléphone ou une adresse e-mail, dans le même champ. Un numéro est confirmé par un **code à 6 chiffres**, envoyé :
- par **WhatsApp**, recommandé : ça marche avec le wifi et coûte moins cher ;
- ou par **SMS**, en secours.

Le même code sert pour « Mot de passe oublié ».

## Sans service d'envoi (tests)

Si `SMS_PROVIDER` est vide, aucun message ne part :
- le code est écrit dans le journal du serveur ;
- avec `SHOW_TEST_CODES=on` (par défaut hors production), il s'affiche aussi à l'écran, dans un bandeau vert.

**En production, laissez `SHOW_TEST_CODES` vide.**

## Avec Twilio Verify

Twilio Verify envoie le code par SMS ou WhatsApp et le vérifie lui-même. Pas de modèle WhatsApp à faire valider.

1. Créez un compte sur <https://www.twilio.com>.
2. Dans la console : **Verify › Services › Create**. Nommez le service « Archfield » et activez les canaux **SMS** et **WhatsApp**.

   Pour WhatsApp, Twilio demande de relier un numéro WhatsApp Business : suivez leur assistant.
3. Dans `.env` :

   ```
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=AC…
   TWILIO_AUTH_TOKEN=…
   TWILIO_VERIFY_SID=VA…
   SMS_CHANNELS=sms
   ```

   L'**Account SID** et l'**Auth Token** sont sur la page d'accueil de la console. Le **Verify SID** (`VA…`) est sur la page du service créé à l'étape 2.

   `SMS_CHANNELS=sms` : seul le SMS est proposé. Une fois WhatsApp relié chez Twilio, mettez `SMS_CHANNELS=whatsapp,sms` (WhatsApp d'abord, SMS en secours).
4. Vérifiez avec votre propre numéro : `npm run test-envoi -- +33612345678`. Le code doit arriver dans la minute. En cas d'échec, le message de Twilio s'affiche, avec son numéro d'erreur.
5. Redémarrez : `bash deploy/mettre-a-jour.sh`, ou `bash deploy/test-local.sh` en test.

### Compte d'essai Twilio

Le compte d'essai donne un petit crédit gratuit, mais **n'envoie qu'aux numéros que vous avez vérifiés** dans la console (**Phone Numbers › Manage › Verified Caller IDs**). Pour tester avec votre numéro, c'est suffisant. Pour vos utilisateurs, passez le compte en payant (**Upgrade**).

Si un pays est refusé (erreur sur un numéro sénégalais ou béninois par exemple), autorisez-le dans les **autorisations géographiques** (*Geo permissions*) de la console.

**Coût** : chaque vérification réussie est facturée. Voyez les tarifs par pays sur twilio.com : un SMS vers le Bénin coûte bien plus cher qu'un message WhatsApp.

**Limites intégrées** :
- 45 secondes entre deux codes ;
- 6 codes par heure et par numéro ;
- 5 essais par code ;
- code valable 10 minutes.

## Format des numéros

Le champ accepte le numéro tel qu'on l'écrit dans son pays : la liste à côté donne l'indicatif.

- Au Bénin, `01 97 00 00 00` devient `+229 01 97 00 00 00` : le 0 fait partie du numéro, comme en Côte d'Ivoire.
- En France, `06 12 34 56 78` devient `+33 6 12 34 56 78`.

Le format international (`+229…`, `00229…`) marche partout. La liste des pays est dans `server/phone.js`.
