"""Bande son de la pub 9:16 : voix (Speko · ElevenLabs), vocal du chef filtré comme un téléphone, bruitages et fond musical discret.
Usage : npm run pub:son (HOOK=a ou HOOK=b pour les accroches de test)   →   video/out/pub-mix-c.wav (et pub-mix-c-sans-musique.wav).
Les voix sont dans tools/video/pub-voix/. Le calendrier ci-dessous suit les scènes de tools/video/pub.html."""
import os, wave, sys, subprocess, numpy as np
from pathlib import Path
SR = 48000
V = Path(__file__).resolve().parent / "pub-voix"
O = Path(__file__).resolve().parents[2] / "video" / "out"
O.mkdir(parents=True, exist_ok=True)
HOOK = os.environ.get("HOOK", "c").lower()  # C : accroche principale
def dur(f): w = wave.open(str(V / f)); return w.getnframes() / w.getframerate()
# Début des scènes pour l'accroche A ; les accroches B et C décalent tout ce qui suit le plan 1.
SCENES = [0, 4.6, 9.2, 13.2, 17.1, 20.9]
END = 29.6
SHIFT = dur(f"hook-{HOOK}.wav") - dur("hook-a.wav")
S = [SCENES[0]] + [x + SHIFT for x in SCENES[1:]]
DUR = END + SHIFT
rng = np.random.default_rng(7)

def load(name):
    w = wave.open(str(V / name)); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    assert w.getframerate() == SR; return a

def tel(a):  # vocal de téléphone : bande 320–3400 Hz
    f = np.fft.rfft(a); fr = np.fft.rfftfreq(len(a), 1 / SR)
    f *= 1 / np.sqrt(1 + (320 / np.maximum(fr, 1)) ** 4) / np.sqrt(1 + (fr / 3400) ** 8)
    b = np.fft.irfft(f, len(a)); return np.tanh(b * 2.2) / 2.2 * 1.2

def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / r)

def tone(f, d, r=0.15, a=0.004):
    n = int(d * SR); t = np.arange(n) / SR; return np.sin(2 * np.pi * f * t) * env(n, a, r)

def mixl(*xs):
    m = max(len(x) for x in xs); o = np.zeros(m)
    for x in xs: o[:len(x)] += x
    return o

def noise(d): return rng.standard_normal(int(d * SR)).astype(np.float32)

def lowpass(x, fc):
    f = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR); f /= np.sqrt(1 + (fr / fc) ** 4); return np.fft.irfft(f, len(x))

def bandsweep(d, f0, f1):  # souffle filtré qui glisse (whoosh)
    x = noise(d); n = len(x); out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):
        p = i / n; fc = f0 + (f1 - f0) * p
        out[i:i + seg] = lowpass(x[i:i + seg], fc)
    t = np.linspace(0, 1, n); return out * np.sin(np.pi * t) ** 2

pop = mixl(tone(880, .35, .06), 0.7 * np.concatenate([np.zeros(int(.07 * SR)), tone(1320, .28, .06)]))[: int(.35 * SR)] * .35
click = mixl(tone(2200, .05, .008, .0005) * .25, lowpass(noise(.05), 3000) * env(int(.05 * SR), .0005, .006) * .2)
tap = tone(600, .12, .03) * .3
whoosh = bandsweep(.5, 400, 2600) * .10
tear = lowpass(noise(.75), 5000) * (np.abs(np.sin(np.linspace(0, 40, int(.75 * SR)))) ** .3) * np.linspace(1, .2, int(.75 * SR)) * .22
thump = mixl(tone(70, .45, .12, .002) * .9, lowpass(noise(.12), 900) * env(int(.12 * SR), .001, .03) * .5) * .55
chime = sum(tone(f, 1.0, .35) * g for f, g in [(1046.5, .2), (1318.5, .16), (1568, .14)])
def arp(notes, step=.11, r=.5): 
    out = np.zeros(int((len(notes) * step + 1.2) * SR))
    for i, f in enumerate(notes): s = tone(f, 1.2, r); k = int(i * step * SR); out[k:k + len(s)] += s * .12
    return out
rise = arp([523.3, 659.3, 784, 1046.5, 1318.5, 1568], .2, .6)
paper = bandsweep(.4, 1500, 6000) * .08

def bed():  # fond musical : nappes douces Do – Sol – La m – Fa, pulsation légère, 96 bpm
    n = int(DUR * SR); t = np.arange(n) / SR; out = np.zeros(n)
    chords = [[261.6, 329.6, 392.0], [196.0, 246.9, 293.7], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6]]
    bar = 60 / 96 * 4
    for k in range(int(DUR / bar) + 1):
        c = chords[k % 4]; a = int(k * bar * SR); b = min(n, int((k + 1) * bar * SR + .4 * SR))
        tt = t[a:b] - k * bar; e = np.minimum(1, tt / .6) * np.exp(-np.maximum(0, tt - bar) / .3)
        for f in c + [c[0] / 2]:
            out[a:b] += (np.sin(2 * np.pi * f * tt) + .3 * np.sin(4 * np.pi * f * tt)) * e * .022
        for q in range(4):  # pulsation (grosse caisse feutrée)
            s = int((k * bar + q * bar / 4) * SR)
            if s < n: kk = tone(55, .3, .08, .002) * .16; out[s:s + len(kk)] += kk[: n - s]
    lead = np.minimum(1, t / 1.5) * np.minimum(1, (DUR - t) / 1.5)
    return out * lead

voice = {f"hook-{HOOK}.wav": S[0] + .25, "v2.wav": S[1] + .15, "v3.wav": S[2] + .15, "v4.wav": S[3] + .15, "v5.wav": S[4] + .2, "v6.wav": S[5] + .2}
fx = [(pop, S[0] + .1)] + [(whoosh, t - .2) for t in S[1:]] + \
     [(click, S[1] + .3), (click, S[1] + 1.9), (paper, S[1] + 2.55), (thump, S[1] + 2.75)] + \
     [(tear, S[2] + .4), (thump, S[2] + 1.6)] + \
     [(click, S[3] + 1.0), (click, S[3] + 1.5), (tap, S[3] + 2.4), (chime, S[3] + 3.3)] + \
     [(tap, S[4] + 1.05), (chime, S[4] + 1.15), (click, S[4] + 1.75), (tap, S[4] + 2.75)] + \
     [(click, S[5] + 4.35 + k * .09) for k in range(8)] + [(paper, S[5] + 5.85), (pop, S[5] + 7.0), (chime, S[5] + 7.9)]

def place(dst, a, at, g=1.0):
    s = int(at * SR); e = min(len(dst), s + len(a)); dst[s:e] += a[: e - s] * g

n = int(DUR * SR)
vox = np.zeros(n); sfx = np.zeros(n)
for f, at in voice.items(): place(vox, load(f), at)
for a, at in fx: place(sfx, a, at)
# La musique baisse quand quelqu'un parle (ducking).
level = np.convolve(np.abs(vox), np.ones(4800) / 4800, mode="same"); duck = 1 - 0.55 * np.minimum(1, level / .03)
music = bed() * duck
def write(name, x):
    x = x / max(1e-9, np.max(np.abs(x))) * .89
    w = wave.open(str(O / name), "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()
write("pub-mix-brut.wav", vox + sfx + music); write("pub-mix-sans-musique-brut.wav", vox + sfx)
for a, b in (("pub-mix-brut.wav", f"pub-mix-{HOOK}.wav"), ("pub-mix-sans-musique-brut.wav", f"pub-mix-{HOOK}-sans-musique.wav")):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(O / a), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), str(O / b)], check=True)
    (O / a).unlink()
print("ok", O / f"pub-mix-{HOOK}.wav")

# Sous-titres (fichier .srt à importer dans le gestionnaire de publicités), calés sur la voix.
HOOK_TXT = {"a": "Encore quinze mille euros pour le ciment et le fer…\nMais ce ciment, vous l'avez vu ?",
            "b": "« Les murs avancent bien. »…\nVraiment ?",
            "c": "Votre maison au pays…\nvous la voyez comment ?"}
LINES = [(f"hook-{HOOK}.wav", 0, None, HOOK_TXT[HOOK]),
         ("v2.wav", 0, None, "Quand on construit au pays depuis l'Europe,\non paie… et on croit sur parole."),
         ("v3.wav", 0, None, "Avec Archfield, chaque photo de votre chantier\nest datée et localisée."),
         ("v4.wav", 0, None, "Votre chef de chantier envoie son rapport\nchaque jour, même sans réseau."),
         ("v5.wav", 0, None, "Vous validez l'étape…\npuis vous payez. Pas avant."),
         ("v6.wav", 0, 3.3, "Archfield.\nVotre chantier, comme si vous y étiez."),
         ("v6.wav", 3.85, None, "Commentez « chantier » : on vous envoie\nnotre guide, et deux mois offerts.")]
def ts(x): ms = int(round(x * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
srt = []
for i, (f, a, b, txt) in enumerate(LINES, 1):
    at = voice[f]; end = at + (b if b is not None else dur(f) - 0.1)
    srt.append(f"{i}\n{ts(at + a)} --> {ts(end)}\n{txt}\n")
out = Path(__file__).resolve().parents[2] / "marketing" / "pub" / f"archfield-pub-9x16-{HOOK}.fr.srt"
out.write_text("\n".join(srt), encoding="utf-8")
print("sous-titres", out)
