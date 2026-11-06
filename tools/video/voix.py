# Voix off de la vidéo : synthèse vocale française en local (modèle Kokoro-82M, voix « ff_siwis », licence Apache 2.0).
# Lit tools/video/voix.json, écrit video/voix/<scène>.wav et video/voix/durees.json, que tools/video.js utilise.
# Préparation (une fois) : voir marketing/video/LISEZMOI.md (modèle et voix dans video/modele/).
import json, sys, pathlib
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOD = ROOT / "video" / "modele"
OUT = ROOT / "video" / "voix"
OUT.mkdir(parents=True, exist_ok=True)
SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 1.05

voice = np.fromfile(MOD / "ff_siwis.bin", dtype=np.float32).reshape(-1, 1, 256)
np.savez(MOD / "voix.npz", ff_siwis=voice)
tts = Kokoro(str(MOD / "kokoro-q8.onnx"), str(MOD / "voix.npz"))
texts = json.loads((ROOT / "tools" / "video" / "voix.json").read_text(encoding="utf-8"))
durations = {}
for scene, text in texts.items():
    if scene.startswith("_"):
        continue
    samples, sr = tts.create(text, voice="ff_siwis", speed=SPEED, lang="fr-fr")
    sf.write(OUT / f"{scene}.wav", samples, sr)
    durations[scene] = round(len(samples) / sr, 3)
    print(f"{scene} : {durations[scene]} s")
(OUT / "durees.json").write_text(json.dumps(durations, indent=1), encoding="utf-8")
