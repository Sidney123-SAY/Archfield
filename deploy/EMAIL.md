# E-mails : code de confirmation, mot de passe oublié, rapports

Archfield envoie des e-mails pour :
- **confirmer l'adresse** à l'inscription (code à 6 chiffres) ;
- **retrouver son mot de passe** (lien valable une heure) ;
- **le rapport du lundi** et les nouvelles du chantier aux clients.

Sans `SMTP_URL`, rien ne part : le message est écrit dans le journal du serveur et, hors production, le code de confirmation s'affiche à l'écran. En production sans `SMTP_URL`, l'adresse n'est pas demandée en confirmation, pour ne bloquer personne.

## Avec Brevo (gratuit jusqu'à 300 e-mails par jour)

1. Créez un compte sur <https://www.brevo.com>.
2. **Validez l'expéditeur** : menu **Expéditeurs, domaines et IP dédiées › Expéditeurs › Ajouter un expéditeur**. Brevo envoie un e-mail de confirmation à cette adresse. Sans cette étape, Brevo refuse les envois.
3. **Récupérez les identifiants SMTP** : menu **SMTP et API › SMTP**. Notez l'**identifiant** (du type `8a1b2c001@smtp-brevo.com`) et créez une **clé SMTP**.
4. Dans `.env` :

   ```
   SMTP_URL=smtp://8a1b2c001%40smtp-brevo.com:VOTRE_CLE_SMTP@smtp-relay.brevo.com:587
   MAIL_FROM=Archfield <votre-adresse-validee@exemple.com>
   ```

   Dans l'identifiant, le `@` s'écrit **`%40`**, sinon l'adresse est mal lue. `MAIL_FROM` doit être l'expéditeur validé à l'étape 2.
5. Vérifiez : `npm run test-envoi -- vous@exemple.com`. Regardez aussi dans les courriers indésirables.
6. Redémarrez : `bash deploy/mettre-a-jour.sh`, ou `bash deploy/test-local.sh` en test.

**Arriver dans la boîte de réception, pas dans les indésirables** : avec une adresse Gmail ou Outlook comme expéditeur, les e-mails ont plus de chances d'être classés en indésirables. Avec votre propre nom de domaine, ajoutez-le chez Brevo (**Domaines**) et suivez leurs consignes (enregistrements DKIM et DMARC).
