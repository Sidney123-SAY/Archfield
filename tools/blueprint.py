"""Plan d'architecte lumineux tiré d'une photo : les contours de la maison en traits bleus sur fond bleu nuit, avec un léger
halo et une grille. Comme il vient de la même photo, il se superpose exactement à la maison finie (aucun crédit d'IA).

Usage : python3 tools/blueprint.py photo-maison-finie.jpg plan.jpg
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
W, H = im.size
g = np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255

# Contours (Sobel), puis on ne garde que les traits nets : murs, fenêtres, toiture, colonnes.
kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], np.float32)
def conv(a, k):
    p = np.pad(a, 1, mode="edge"); o = np.zeros_like(a)
    for dy in range(3):
        for dx in range(3):
            o += k[dy, dx] * p[dy:dy + a.shape[0], dx:dx + a.shape[1]]
    return o
mag = np.hypot(conv(g, kx), conv(g, kx.T))
mag = mag / (np.percentile(mag, 99.3) + 1e-6)
lines = np.clip((mag - 0.18) / 0.5, 0, 1) ** 1.1
# Le ciel et le sol comptent moins que la maison (centre de l'image), pour un plan lisible.
yy, xx = np.mgrid[0:H, 0:W]
focus = np.clip(1.25 - np.hypot((xx - W / 2) / (W * 0.62), (yy - H * 0.52) / (H * 0.62)), 0.25, 1)
lines *= focus

line_img = Image.fromarray((lines * 255).astype(np.uint8))
glow = np.asarray(line_img.filter(ImageFilter.GaussianBlur(W / 260)), np.float32) / 255
glow2 = np.asarray(line_img.filter(ImageFilter.GaussianBlur(W / 90)), np.float32) / 255

# Fond bleu nuit, grille fine, traits bleu électrique avec halo.
bg = np.zeros((H, W, 3), np.float32)
top, bot = np.array([7, 15, 26]) / 255, np.array([20, 38, 61]) / 255
t = (yy / H)[..., None]
bg[:] = top * (1 - t) + bot * t
step = max(24, W // 48)
grid = ((xx % step) < 1) | ((yy % step) < 1)
bg[grid] += np.array([0.03, 0.06, 0.09])
blue = np.array([127, 193, 255]) / 255
out = bg + blue * (lines[..., None] * 0.95 + glow[..., None] * 1.6 + glow2[..., None] * 0.8)
out = np.clip(out, 0, 1)
Image.fromarray((out * 255).astype(np.uint8)).save(dst, quality=92)
print("Plan écrit :", dst)
