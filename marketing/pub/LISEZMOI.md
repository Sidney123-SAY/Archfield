# Publicité Meta 9:16 · « Votre chantier, comme si vous y étiez »

Cible : la diaspora en Europe qui fait construire au pays et paie sans voir le chantier.
Durée ≈ 29 s · 1080 × 1920 · une seule voix : Michael (ElevenLabs via Speko).
Personnages : une femme à Paris (la cliente) et un homme, chef de chantier, qui lui envoie son rapport.

| Fichier | Usage |
|---|---|
| `archfield-pub-9x16-c.mp4` | **Version principale** (accroche C) : voix, bruitages, fond musical discret |
| `archfield-pub-9x16-c-sans-musique.mp4` | Même vidéo sans musique, pour ajouter un son de la bibliothèque Meta / Instagram |
| `archfield-pub-9x16-a.mp4`, `archfield-pub-9x16-b.mp4` | Accroches A et B, pour les tests |
| `archfield-pub-9x16-*.fr.srt` | Sous-titres de chaque version, à importer dans le gestionnaire de publicités |
| `couverture-reel.jpg` | Image de couverture du Reel |
| `storyboard/` | Les 7 images clés de la version principale |

Guide offert : `public/guide/7-verifications-chantier.pdf`, servi par le site à l'adresse `https://VOTRE-DOMAINE/guide/7-verifications-chantier.pdf`.
Pour y mettre l'adresse du site : `BASE_URL=https://votre-domaine npm run guide`.

## Le script

| # | Animation | Texte à l'écran | Voix |
|---|---|---|---|
| 1 | Headline : les mots arrivent un à un, un trait orange souligne la question. La femme reçoit « Il faut encore 15 000 € pour le ciment et le fer. » | Votre maison au pays, vous la voyez comment ? | « Votre maison au pays… vous la voyez comment ? » |
| 2 | Map-route Paris → Cotonou, puis la photo floue « date inconnue » | 4 700 km. Zéro preuve. | « Quand on construit au pays depuis l'Europe, on paie… et on croit sur parole. » |
| 3 | Teardown : la photo floue se déchire, la photo vérifiée apparaît | Datée. Localisée. | « Avec Archfield, chaque photo de votre chantier est datée et localisée. » |
| 4 | Le chef enregistre son rapport, envoyé à la cliente (son portrait) ; « Pas de réseau » devient « Envoyé » | Un rapport par jour | « Votre chef de chantier envoie son rapport chaque jour, même sans réseau. » |
| 5 | Stat-chart Réalisé / Versé : les murs atteignent 100 %, on valide, le versement suivant se débloque | Validez, puis payez. | « Vous validez l'étape… puis vous payez. Pas avant. » |
| 6 | Paper-desk : le guide sur le bureau, « + 2 mois offerts », puis « CHANTIER » tapé en commentaire | Commentez « CHANTIER » | « Archfield. Votre chantier, comme si vous y étiez. Commentez “chantier” : on vous envoie notre guide, et deux mois offerts. » |

Accroches de test (le plan 1 change, la suite est identique) :
- **A** : « 15 000 €… pour quoi ? » / « Encore quinze mille euros pour le ciment et le fer… Mais ce ciment, vous l'avez vu ? »
- **B** : « “Les murs avancent bien.” Vraiment ? »

## Publier

1. Publiez la version C comme un **Reel normal** sur la page Facebook et le compte Instagram (texte ci-dessous).
2. Dans le gestionnaire de publicités, sponsorisez-la avec **« Utiliser une publication existante »** : tous les commentaires « CHANTIER » restent au même endroit (preuve sociale) et l'automatisation n'a qu'une publication à surveiller.
3. Pour tester les accroches, publiez aussi A et B et sponsorisez les trois avec le même budget ; après 3 à 5 jours, gardez celle qui coûte le moins cher par commentaire.
4. Audience : France, Belgique, Suisse, Luxembourg, Canada · 25–55 ans · centres d'intérêt liés au Bénin, à la Côte d'Ivoire, au Sénégal, au Togo, au Cameroun et à la construction / l'immobilier. Si Meta range la pub en « catégorie spéciale : logement », le ciblage par âge disparaît : ce n'est pas grave.
5. Budget de test : 10 à 15 € par jour et par version.

Texte de la publication :

> Vous faites construire au pays depuis l'Europe ? 🏗️
> Photos datées et localisées, rapport du chef de chantier chaque jour, et vous payez seulement l'étape validée.
> 👉 Commentez CHANTIER : on vous envoie notre guide « Les 7 vérifications avant d'envoyer de l'argent pour votre chantier » + 2 mois offerts.

## L'automatisation « CHANTIER » (ManyChat, Instagram + Facebook)

Déclencheur : commentaire contenant « chantier » (majuscules ou non) sur la publication.

Réponse publique sous le commentaire :

> C'est envoyé en message privé 📩

Message privé :

> Bonjour {prénom} 👋 Merci pour votre commentaire !
> Voici votre guide « Les 7 vérifications avant d'envoyer de l'argent pour votre chantier » : https://VOTRE-DOMAINE/guide/7-verifications-chantier.pdf
> Et vos 2 mois offerts pour suivre votre chantier sur Archfield : https://VOTRE-DOMAINE/auth.html
> Une question sur votre chantier ? Répondez ici, on vous répond.

TikTok n'envoie pas de message automatique aux commentaires : épinglez un commentaire « Le guide est dans le lien de la bio » et mettez le lien du PDF dans la bio.

## Refaire la vidéo

```
npm run pub:son          # bande son + sous-titres (HOOK=a ou HOOK=b pour les tests)
npm run pub:storyboard   # images clés → marketing/pub/storyboard/
npm run pub              # vidéo       → video/out/archfield-pub-9x16-c.mp4
```
Scènes et animations : `tools/video/pub.html` · sons et sous-titres : `tools/video/pub-son.py` · voix : `tools/video/pub-voix/`.
