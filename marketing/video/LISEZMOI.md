# Vidéo de présentation

`archfield-presentation.mp4` : 1 min 17 s, 1920 × 1080, 30 images par seconde, **avec voix off en français**. Elle est prête pour LinkedIn, YouTube, une présentation ou WhatsApp.

Les 9 scènes :
1. le nom ;
2. le problème (construire de loin, par messages) ;
3. la promesse, avec le plan de façade qui se construit ;
4. le rapport du jour du chef de chantier ;
5. les photos vérifiées ;
6. l'argent ;
7. le tableau du dirigeant ;
8. les trois espaces ;
9. la fin, avec « Deux mois offerts ».

Chaque scène dure le temps de sa phrase.

Les `image-*.jpg` sont une image fixe par scène, pour les publications.

## La voix

C'est une voix de synthèse française (modèle Kokoro-82M, voix « siwis », licence Apache 2.0), générée sur l'ordinateur, sans service en ligne. Son volume est réglé pour les réseaux sociaux (-16 LUFS).

- **Pour une voix humaine**, enregistrez le texte de `tools/video/voix.json` : vous, ou un comédien voix sur Fiverr ou Malt. Remplacez ensuite les fichiers de `video/voix/` par vos enregistrements (un fichier WAV par scène, mêmes noms), et lancez `npm run video`.
- **Pour une musique de fond**, ajoutez-la dans CapCut ou YouTube Studio, bas sous la voix (-20 à -25 dB).

## Refaire la vidéo

Il faut ffmpeg, Python 3 et Node.

1. **Texte** : modifiez `tools/video/voix.json`. « Artchfild » est l'orthographe phonétique d'Archfield pour la voix.
2. **Voix** (une fois) : installez le moteur et récupérez le modèle.

   ```bash
   python3 -m venv .venv-voix && .venv-voix/bin/pip install kokoro-onnx soundfile
   mkdir -p video/modele && cd video/modele
   npm pack kokoro-q8-shards kokoro-js
   tar xzf kokoro-q8-shards-1.0.0.tgz && cat package/kokoro-q8.part*.bin > kokoro-q8.onnx
   tar xzf kokoro-js-*.tgz package/voices/ff_siwis.bin && mv package/voices/ff_siwis.bin .
   cd ../..
   ```

   L'empreinte SHA-256 de `kokoro-q8.onnx` doit être `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`.

3. **Générer** : `.venv-voix/bin/python tools/video/voix.py` (les phrases arrivent dans `video/voix/`), puis `npm run video`. La vidéo arrive dans `video/out/`.

Les animations sont dans `tools/video/video.html`.
