# Paiement des abonnements

## Les prix

Tous les prix sont dans `server/plans.js`. Pour en changer un, modifiez ce fichier et redémarrez.

| Offre | Pour | Europe (€, TVA comprise) | Afrique et ailleurs ($) |
|---|---|---|---|
| Plus | client | 9,99 € | 9,99 $ |
| Démarrage | entreprise | 15 € | 17 $ |
| PME | entreprise | 39 € | 45 $ |
| Pro | entreprise | 79 € | 89 $ |

**Pourquoi des dollars en Afrique ?** C'est l'usage des abonnements en ligne : la carte Visa ou Mastercard d'une banque africaine est débitée en dollars, et la banque convertit. Le franc CFA n'est d'ailleurs pas une monnaie de règlement chez Stripe pour ce genre d'abonnement.

Le site affiche à côté une indication en FCFA, calculée avec `USD_XOF`, qui vaut 600 par défaut.

**Où passe la frontière** : un client paie en euros si le pays de son compte est en Europe (Union européenne, Suisse, Royaume-Uni, Norvège…), et en dollars sinon.

- En **euros**, le prix affiché comprend la TVA (obligatoire pour les particuliers en Europe).
- En **dollars**, le prix est hors taxes : des taxes locales peuvent s'ajouter si Stripe Tax est activé et que vous êtes enregistré dans le pays.

**Essai** : 2 mois offerts, sans carte. Un client qui paie pendant son essai ne perd pas les jours restants : le premier prélèvement a lieu à la fin de l'essai.

## Sans Stripe : paiement simulé

Si `STRIPE_SECRET_KEY` est vide, le bouton « Choisir » ouvre une **page de test** : un clic active l'offre pour 30 jours, sans carte et sans argent. C'est le mode du test local. En production, cette page est refusée, sauf avec `BILLING_TEST=on`.

En attendant le paiement en ligne, l'administration (`/admin` › Comptes) active une offre à la main, par exemple après un paiement par Wave ou Orange Money.

## Avec Stripe

1. **Créer un compte Stripe** sur <https://dashboard.stripe.com/register>.

   Il faut une structure qui peut encaisser : micro-entreprise ou société, en France par exemple. Stripe ne s'ouvre pas aux sociétés du Bénin ou du Sénégal, mais un compte français encaisse des cartes du monde entier.

2. **Clés de test** : dans le tableau de bord Stripe, en « Mode test », allez dans **Développeurs › Clés API** et copiez la clé secrète `sk_test_…`. Dans `.env` (ou `.env.test`) :

   ```
   STRIPE_SECRET_KEY=sk_test_…
   ```

3. **Webhook** (Stripe prévient Archfield quand un paiement passe) : dans **Développeurs › Webhooks › Ajouter un endpoint**, indiquez l'URL :

   ```
   https://votre-adresse/api/stripe/webhook
   ```

   Choisissez ces événements :
   - `checkout.session.completed` ;
   - `invoice.paid` ;
   - `invoice.payment_failed` ;
   - `customer.subscription.updated` ;
   - `customer.subscription.deleted`.

   Copiez le secret de signature `whsec_…` :

   ```
   STRIPE_WEBHOOK_SECRET=whsec_…
   ```

   En test local, l'adresse du tunnel change à chaque redémarrage. Plus simple : installez la [Stripe CLI](https://docs.stripe.com/stripe-cli) dans la machine, puis lancez :

   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   La commande affiche le `whsec_…` à mettre dans `.env.test`.

4. **Portail client** (changer de carte, voir ses factures, arrêter l'abonnement) : dans **Paramètres › Facturation › Portail client**, cliquez une fois sur « Enregistrer ».

5. **Taxes** (facultatif) : activez **Stripe Tax**, déclarez vos enregistrements (TVA française, guichet unique OSS pour l'Union européenne), puis :

   ```
   STRIPE_TAX=on
   ```

   Stripe calcule alors la TVA de chaque pays. Le prix en euros reste « TVA comprise ».

6. **Essayer** : carte de test `4242 4242 4242 4242`, n'importe quelle date future, n'importe quel code.

   Pour passer au réel, remplacez par la clé `sk_live_…` et le webhook du mode réel.

## Mobile money (Wave, Orange Money, MTN MoMo)

Pas encore branché. Les options sont :
- au Bénin, **FedaPay** ou **KkiaPay** ;
- pour toute l'Afrique de l'Ouest et centrale, **CinetPay** ou **PayDunya**.

Ce sont des paiements ponctuels (un mois, ou douze mois avec deux mois offerts), pas des prélèvements automatiques. D'ici là, l'administration active l'offre à la réception du paiement.
