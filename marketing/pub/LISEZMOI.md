# Publicité Meta 9:16 · « Osez construire au pays »

Cible : jeunes de la diaspora (25–40 ans) en Europe qui veulent construire au pays mais ont peur de se faire avoir.
Durée 31 s · 1080 × 1920 · voix off Michael (ElevenLabs via Speko), vocal du chef de chantier : Richie.

| Fichier | Usage |
|---|---|
| `archfield-pub-9x16.mp4` | Vidéo finale : voix, bruitages et fond musical discret |
| `archfield-pub-9x16-sans-musique.mp4` | Même vidéo sans musique, pour ajouter un son de la bibliothèque Meta / Instagram |
| `archfield-pub-9x16.fr.srt` | Sous-titres à importer dans le gestionnaire de publicités |
| `couverture-reel.jpg` | Image de couverture du Reel |
| `storyboard/` | Les 8 images clés |

Guide offert : `public/guide/premier-chantier-au-pays.pdf`, servi par le site à l'adresse `https://VOTRE-DOMAINE/guide/premier-chantier-au-pays.pdf`.
Pour y mettre l'adresse du site : `BASE_URL=https://votre-domaine npm run guide`.

## Le script

| # | Temps | Texte à l'écran | Voix |
|---|---|---|---|
| 1 | 0–3,4 s | Et si cette année… vous construisiez au pays ? | « Et si cette année… vous construisiez au pays ? » |
| 2 | 3,4–6,6 s | La peur de se faire avoir ? | « Si c'est la peur de vous faire avoir qui vous retient… » |
| 3 | 6,6–10,8 s | Datée. Localisée. | « …avec Archfield, chaque photo de votre chantier est datée et localisée. » |
| 4 | 10,8–17 s | Un rapport chaque jour | Vocal du chef : « Bonjour madame ! Douze ouvriers aujourd'hui, et les cinquante sacs sont arrivés. » |
| 5 | 17–20,9 s | Validez, puis payez. | « Vous validez l'étape, puis vous payez. Pas avant. » |
| 6 | 20,9–24,2 s | Votre premier chantier, c'est maintenant. | « Alors n'attendez plus. Votre premier chantier, c'est maintenant. » |
| 7 | 24,2–31 s | Commentez « CHANTIER » | « Archfield. Osez construire au pays. Commentez “chantier” : on vous envoie notre guide, et deux mois offerts. » |

## Publier

1. Publiez la vidéo comme un **Reel normal** sur la page Facebook et le compte Instagram (texte ci-dessous).
2. Dans le gestionnaire de publicités, créez la campagne avec **« Utiliser une publication existante »** : tous les commentaires « CHANTIER » restent sur la même publication (preuve sociale) et l'automatisation n'en surveille qu'une.
3. Objectif : **Interactions** (commentaires) pour démarrer, puis **Prospects** quand la réponse automatique fonctionne.
4. Audience : France, Belgique, Suisse, Luxembourg, Canada · 25–40 ans · centres d'intérêt liés au Bénin, à la Côte d'Ivoire, au Sénégal, au Togo, au Cameroun et à l'immobilier / la construction. Si Meta range la pub en « catégorie spéciale : logement », le ciblage par âge disparaît : la vidéo parle d'elle-même aux jeunes.
5. Budget de test : 10 à 15 € par jour pendant 5 jours, puis on garde ce qui coûte le moins cher par commentaire.

Texte de la publication :

> Construire au pays depuis l'Europe, sans se faire avoir 🏗️
> Photos datées et localisées, rapport du chef de chantier chaque jour, et vous payez seulement l'étape validée.
> 👉 Commentez CHANTIER : on vous envoie notre guide « Premier chantier au pays » + 2 mois offerts.

## L'automatisation « CHANTIER » (ManyChat, Instagram + Facebook)

Déclencheur : commentaire contenant « chantier » (majuscules ou non) sur la publication.

Réponse publique sous le commentaire :

> C'est envoyé en message privé 📩

Message privé :

> Bonjour {prénom} 👋 Merci pour votre commentaire !
> Voici votre guide « Premier chantier au pays » : https://VOTRE-DOMAINE/guide/premier-chantier-au-pays.pdf
> Et vos 2 mois offerts pour suivre votre chantier sur Archfield : https://VOTRE-DOMAINE/auth.html
> Une question sur votre projet ? Répondez ici, on vous répond.

TikTok n'envoie pas de message automatique aux commentaires : épinglez un commentaire « Le guide est dans le lien de la bio » et mettez le lien du PDF dans la bio.

## Refaire la vidéo

```
npm run pub:son          # bande son  → video/out/pub-mix.wav
npm run pub:storyboard   # images clés → marketing/pub/storyboard/
npm run pub              # vidéo       → video/out/archfield-pub-9x16.mp4
```
Scènes et animations : `tools/video/pub.html` · sons : `tools/video/pub-son.py` · voix : `tools/video/pub-voix/`.
