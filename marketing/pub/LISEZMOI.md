# Publicité Meta 9:16 · « Votre chantier, comme si vous y étiez »

Cible : toute la diaspora africaine, en Europe, en Amérique du Nord ou ailleurs, qui fait construire au pays (Afrique de l'Ouest, centrale ou autre) et paie sans voir le chantier.
Durée ≈ 29 s · 1080 × 1920 · une seule voix : Michael (ElevenLabs via Speko).
Personnages : une femme, chez elle à l'étranger (la cliente), et un homme, chef de chantier, qui lui envoie son rapport. Aucune ville n'est mise en avant : la carte relie Montréal, Londres, Bruxelles, Paris et Genève à Dakar, Abidjan, Lomé, Cotonou et Douala.

| Fichier | Usage |
|---|---|
| `archfield-pub-9x16-c.mp4` | **La vidéo** (accroche C) : voix, bruitages, fond musical discret |
| `archfield-pub-9x16-c-sans-musique.mp4` | Même vidéo sans musique, pour ajouter un son de la bibliothèque Meta / Instagram |
| `archfield-pub-9x16-c.fr.srt` | Sous-titres, à importer dans le gestionnaire de publicités |
| `couverture-reel.jpg` | Image de couverture du Reel |
| `storyboard/` | Les images clés |

Guide offert : la page `https://VOTRE-DOMAINE/guide` (public/guide.html, en français et en anglais) et sa version PDF `https://VOTRE-DOMAINE/guide/7-verifications-chantier.pdf`.
Pour y mettre l'adresse du site : `BASE_URL=https://votre-domaine npm run guide`.

## Le script

| # | Animation | Texte à l'écran | Voix |
|---|---|---|---|
| 1 | Headline : les mots arrivent un à un, un trait orange souligne la question. Chez elle, le soir, la femme reçoit « Il faut encore 15 000 € pour le ciment et le fer. » | Votre maison au pays, vous la voyez comment ? | « Votre maison au pays… vous la voyez comment ? » |
| 2 | Map-route : cinq villes de la diaspora reliées à cinq villes d'Afrique, puis la photo floue « date inconnue » | Des milliers de km. Zéro preuve. | « Quand on construit au pays depuis l'étranger, on paie… et on croit sur parole. » |
| 3 | Teardown : la photo floue se déchire, la photo vérifiée apparaît (« Position du chantier vérifiée ») | Datée. Localisée. | « Avec Archfield, chaque photo de votre chantier est datée et localisée. » |
| 4 | Le chef enregistre son rapport, envoyé à la cliente (son portrait) ; « Pas de réseau » devient « Envoyé » | Un rapport par jour | « Votre chef de chantier envoie son rapport chaque jour, même sans réseau. » |
| 5 | Stat-chart Réalisé / Versé : les murs atteignent 100 %, on valide, le versement suivant se débloque | Validez, puis payez. | « Vous validez l'étape… puis vous payez. Pas avant. » |
| 6 | Paper-desk : le guide sur le bureau, « + 2 mois offerts », puis « CHANTIER » tapé en commentaire | Commentez « CHANTIER » | « Archfield. Votre chantier, comme si vous y étiez. Commentez “chantier” : on vous envoie notre guide, et deux mois offerts. » |

## Publier

1. Publiez la vidéo comme un **Reel normal** sur la page Facebook et le compte Instagram (texte ci-dessous).
2. Dans le gestionnaire de publicités, sponsorisez-la avec **« Utiliser une publication existante »** : tous les commentaires « CHANTIER » restent au même endroit (preuve sociale) et l'automatisation n'a qu'une publication à surveiller.
3. Audience large, toute la diaspora : France, Belgique, Suisse, Luxembourg, Royaume-Uni, Allemagne, Italie, Espagne, Canada, États-Unis… · 25–55 ans · centres d'intérêt liés aux pays d'Afrique (Afrique de l'Ouest, centrale, de l'Est…) et à la construction / l'immobilier. Si Meta range la pub en « catégorie spéciale : logement », le ciblage par âge disparaît : ce n'est pas grave.
4. Budget de départ : 10 à 15 € par jour ; après 5 jours, augmentez sur les pays qui donnent les commentaires les moins chers.

Texte de la publication :

> Vous faites construire au pays depuis l'étranger ? 🏗️
> Photos datées et localisées, rapport du chef de chantier chaque jour, et vous payez seulement l'étape validée.
> 👉 Commentez CHANTIER : on vous envoie notre guide « Les 7 vérifications avant d'envoyer de l'argent pour votre chantier » + 2 mois offerts.

## L'automatisation « CHANTIER » (ManyChat, Instagram + Facebook)

Déclencheur : commentaire contenant « chantier » (majuscules ou non) sur la publication.

Réponse publique sous le commentaire :

> C'est envoyé en message privé 📩

Message privé :

> Bonjour {prénom} 👋 Merci pour votre commentaire !
> Voici votre guide « Les 7 vérifications avant d'envoyer de l'argent pour votre chantier » : https://VOTRE-DOMAINE/guide
> Et vos 2 mois offerts pour suivre votre chantier sur Archfield : https://VOTRE-DOMAINE/auth.html
> Une question sur votre chantier ? Répondez ici, on vous répond.

TikTok n'envoie pas de message automatique aux commentaires : épinglez un commentaire « Le guide est dans le lien de la bio » et mettez le lien du PDF dans la bio.

## Refaire la vidéo

```
npm run pub:son          # bande son + sous-titres
npm run pub:storyboard   # images clés → marketing/pub/storyboard/
npm run pub              # vidéo       → video/out/archfield-pub-9x16-c.mp4
```
Scènes et animations : `tools/video/pub.html` · sons et sous-titres : `tools/video/pub-son.py` · voix : `tools/video/pub-voix/`.
