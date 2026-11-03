# Vraies photos pour la démo

Déposez ici des photos JPEG de vrais chantiers (les vôtres, ou celles d'un artisan d'accord pour qu'on les montre).
`npm run seed` les utilise à la place des maisons dessinées, et `npm run screenshots` refait alors les captures de l'application.

Nommez chaque fichier `<type>-<niveau>-<numéro>.jpg` :
- type : `ext` pour la construction (maison au pays), `int` pour la rénovation intérieure ;
- niveau, de l'avancement le plus faible au plus fort :
  - construction : `0` terrain et implantation, `1` fouilles et fondations, `2` soubassement, `3` élévation des murs, `4` dalle et chaînage, `5` toiture, `6` enduits et finitions ;
  - rénovation : `0` démolition, `1` plomberie, `2` électricité, `3` plâtrerie, `4` carrelage, `5` peinture ;
- numéro : 1, 2, 3… pour avoir plusieurs photos d'un même niveau.

Exemples : `ext-1-1.jpg`, `ext-3-1.jpg`, `ext-3-2.jpg`, `int-2-1.jpg`. Format paysage de préférence, 1600 px de large suffisent.

Utilisez uniquement des photos dont vous avez les droits : les vôtres, celles d'un artisan qui l'accepte par écrit, ou des photos sous licence libre (Unsplash, Pexels) en respectant leur licence.
