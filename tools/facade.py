# Génère public/img/facade.svg : élévation d'une villa R+1 en dessin d'architecte, une couche par étape du chantier
# (0 terrain, 1 fondations, 2 soubassement, 3 murs, 4 dalle et étage, 5 toiture, 6 finitions).
# L'étape affichée se règle avec l'attribut data-stage de la balise <svg> (la page d'accueil l'anime au défilement).
# Usage : python3 tools/facade.py public/img/facade.svg
import sys
W, H = 1000, 620
G = 470            # niveau du sol (±0,00)
L1 = 330           # dessus dalle RDC (+3,20)
L2 = 190           # dessus dalle étage (+6,40)
X0, X1 = 160, 840  # nus extérieurs
COLS = [160, 330, 500, 670, 840]
STYLE = """.facade { --fx-bg: #14263D; --fx-ink: rgba(255,255,255,.9); --fx-soft: rgba(255,255,255,.36); --fx-accent: #F0A27A; display: block; width: 100%; height: auto; overflow: visible; }
.facade path { fill: none; }
.facade .ln { stroke: var(--fx-ink); stroke-width: 1.4; }
.facade .ln2, .facade .dim, .facade .axis { stroke: var(--fx-soft); stroke-width: 1; }
.facade .axis, .facade .outline { fill: none; }
.facade .thin { stroke-width: .7; }
.facade .dash { stroke-dasharray: 6 5; }
.facade .hl { stroke: var(--fx-soft); stroke-width: 1; }
.facade .bl { stroke: var(--fx-soft); stroke-width: .7; fill: none; }
.facade .dot { fill: var(--fx-soft); }
.facade .txt { fill: var(--fx-soft); font: 500 11px "Geist", system-ui, sans-serif; letter-spacing: .1em; }
.facade .c { text-anchor: middle; } .facade .r { text-anchor: end; } .facade .sm { font-size: 10px; }
.facade .col, .facade .open, .facade .door, .facade .roof, .facade .render { fill: var(--fx-bg); }
.facade .glass { fill: rgba(255,255,255,.06); }
.facade .render { stroke: none; }
.facade .st { opacity: 0; clip-path: inset(100% 0 0 0); transition: opacity .9s ease, clip-path 1.1s cubic-bezier(.2,.7,.2,1); }
.facade[data-stage="0"] .st-0 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="1"] .st-0, .facade[data-stage="1"] .st-1 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="1"] .st-1 .ln { stroke: var(--fx-accent); }
.facade[data-stage="2"] .st-0, .facade[data-stage="2"] .st-1, .facade[data-stage="2"] .st-2 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="2"] .st-2 .ln { stroke: var(--fx-accent); }
.facade[data-stage="3"] .st-0, .facade[data-stage="3"] .st-1, .facade[data-stage="3"] .st-2, .facade[data-stage="3"] .st-3 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="3"] .st-3 .ln { stroke: var(--fx-accent); }
.facade[data-stage="4"] .st-0, .facade[data-stage="4"] .st-1, .facade[data-stage="4"] .st-2, .facade[data-stage="4"] .st-3, .facade[data-stage="4"] .st-4 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="4"] .st-4 .ln { stroke: var(--fx-accent); }
.facade[data-stage="5"] .st-0, .facade[data-stage="5"] .st-1, .facade[data-stage="5"] .st-2, .facade[data-stage="5"] .st-3, .facade[data-stage="5"] .st-4, .facade[data-stage="5"] .st-5 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="5"] .st-5 .ln { stroke: var(--fx-accent); }
.facade[data-stage="6"] .st-0, .facade[data-stage="6"] .st-1, .facade[data-stage="6"] .st-2, .facade[data-stage="6"] .st-3, .facade[data-stage="6"] .st-4, .facade[data-stage="6"] .st-5, .facade[data-stage="6"] .st-6 { opacity: 1; clip-path: inset(0 0 0 0); }
.facade[data-stage="6"] .st-6 .ln { stroke: var(--fx-accent); }
.facade[data-stage="6"] .scaffold { opacity: 0; transition: opacity .8s; }
"""
out = []
a = out.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" class="facade" data-stage="6" role="img" aria-label="Plan de façade d\'une villa en construction">')
a("<style>" + STYLE + "</style>")
a('''<defs>
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="hl"/></pattern>
<pattern id="blocks" width="40" height="20" patternUnits="userSpaceOnUse"><path d="M0 0H40M0 10H40M20 0V10M0 10V20M40 10V20" class="bl"/></pattern>
<pattern id="earth" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".8" class="dot"/><circle cx="7" cy="8" r=".6" class="dot"/></pattern>
</defs>''')

# 0 — terrain : sol, terre, implantation, axes, cotes, niveaux
a('<g class="st st-0">')
a(f'<path d="M30 {G}H970" class="ln ground"/>')
a(f'<rect x="30" y="{G}" width="940" height="60" fill="url(#earth)" class="earth"/>')
a(f'<path d="M{X0-20} {G-6}V{G+6}M{X1+20} {G-6}V{G+6}" class="ln2"/>')
a(f'<path d="M{X0-20} {G}H{X1+20}" class="ln2 dash"/>')
# cote totale
a(f'<path d="M{X0} 560H{X1}M{X0} 553V567M{X1} 553V567" class="dim"/>')
a(f'<text x="{(X0+X1)/2}" y="552" class="txt c">17,00</text>')
for i, x in enumerate(COLS):
    a(f'<path d="M{x} 567V585" class="dim"/><circle cx="{x}" cy="597" r="11" class="axis"/><text x="{x}" y="601" class="txt c sm">{"ABCDE"[i]}</text>')
for y, lab in [(G, "±0,00"), (L1, "+3,20"), (L2, "+6,40")]:
    a(f'<path d="M84 {y}H120M84 {y}l8 -8h-16z" class="dim lvl"/><text x="80" y="{y-12}" class="txt r sm">{lab}</text>')
a('</g>')

# 1 — fondations : semelles et longrine (sous le sol, hachurées)
a('<g class="st st-1">')
for x in COLS:
    a(f'<rect x="{x-32}" y="{G+18}" width="64" height="26" fill="url(#hatch)" class="ln"/>')
    a(f'<rect x="{x-9}" y="{G}" width="18" height="18" fill="url(#hatch)" class="ln"/>')
a(f'<rect x="{X0-9}" y="{G}" width="{X1-X0+18}" height="10" fill="url(#hatch)" class="ln"/>')
a('</g>')

# 2 — soubassement : trois rangs de parpaings
a('<g class="st st-2">')
a(f'<rect x="{X0}" y="{G-30}" width="{X1-X0}" height="30" fill="url(#blocks)" class="ln"/>')
a('</g>')

# 3 — élévation des murs du rez-de-chaussée : poteaux, murs, ouvertures, échafaudage
a('<g class="st st-3">')
a(f'<rect x="{X0}" y="{L1}" width="{X1-X0}" height="{G-30-L1}" fill="url(#blocks)" class="ln2 wall"/>')
for x in COLS:
    a(f'<rect x="{x-7}" y="{L1}" width="14" height="{G-L1}" class="ln col"/>')
# ouvertures RDC : fenêtres et porte (masquent les parpaings)
for (x, y, w, h) in [(190, 360, 110, 64), (530, 360, 110, 64), (700, 360, 110, 64)]:
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="ln open"/>')
a(f'<rect x="370" y="352" width="90" height="{G-352}" class="ln open"/>')
# échafaudage côté droit
sx = 875
a(f'<g class="scaffold"><path d="M{sx} {G}V{L2-20}M{sx+34} {G}V{L2-20}" class="ln2"/>')
for y in range(G - 40, L2 - 21, -46):
    a(f'<path d="M{sx-6} {y}H{sx+40}M{sx} {y}L{sx+34} {y-46}" class="ln2"/>')
a('</g>')
a('</g>')

# 4 — dalle et chaînage, étage
a('<g class="st st-4">')
a(f'<rect x="{X0-12}" y="{L1-12}" width="{X1-X0+24}" height="12" fill="url(#hatch)" class="ln"/>')
a(f'<rect x="{X0}" y="{L2}" width="{X1-X0}" height="{L1-12-L2}" fill="url(#blocks)" class="ln2 wall"/>')
for x in COLS:
    a(f'<rect x="{x-7}" y="{L2}" width="14" height="{L1-12-L2}" class="ln col"/>')
for (x, y, w, h) in [(190, 222, 110, 70), (360, 222, 110, 70), (530, 222, 110, 70), (700, 222, 110, 70)]:
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="ln open"/>')
a(f'<rect x="{X0-12}" y="{L2-10}" width="{X1-X0+24}" height="10" fill="url(#hatch)" class="ln"/>')
a('</g>')

# 5 — toiture à quatre pans, tôles
a('<g class="st st-5">')
a(f'<path d="M{X0-40} {L2-10}L{X0+90} {L2-92}H{X1-90}L{X1+40} {L2-10}Z" class="ln roof"/>')
for i in range(1, 15):
    x = X0 + 90 + i * (X1 - X0 - 180) / 15
    a(f'<path d="M{x:.0f} {L2-92}V{L2-10}" class="ln2 thin"/>')
a(f'<path d="M{X0-40} {L2-10}H{X1+40}" class="ln"/>')
a('</g>')

# 6 — finitions : enduit, menuiseries, garde-corps, palmier, échafaudage retiré (CSS)
a('<g class="st st-6">')
a(f'<rect x="{X0}" y="{L2}" width="{X1-X0}" height="{G-L2}" class="render"/>')
a(f'<rect x="{X0}" y="{L2}" width="{X1-X0}" height="{G-L2}" class="ln2 outline"/>')
a(f'<path d="M{X0-12} {L1-12}H{X1+12}M{X0-12} {L1}H{X1+12}M{X0} {G-30}H{X1}" class="ln"/>')
for (x, y, w, h) in [(190, 360, 110, 64), (530, 360, 110, 64), (700, 360, 110, 64), (190, 222, 110, 70), (360, 222, 110, 70), (530, 222, 110, 70), (700, 222, 110, 70)]:
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="ln glass"/><path d="M{x+w/2} {y}V{y+h}M{x} {y+h*.55}H{x+w}" class="ln2"/>')
a(f'<rect x="370" y="352" width="90" height="{G-352}" class="ln door"/><path d="M415 352V{G}M404 {G-60}h4M422 {G-60}h4" class="ln2"/>')
a(f'<path d="M350 {L1-12}V{L1-46}H480V{L1-12}M350 {L1-34}H480" class="ln2"/>')
for x in range(358, 480, 12):
    a(f'<path d="M{x} {L1-46}V{L1-12}" class="ln2 thin"/>')
# palmier
a(f'<path d="M928 {G}C924 {G-60} 932 {G-120} 924 {G-170}" class="ln trunk"/>')
for d in ["M66 300c-26-10-46-2-58 14", "M66 300c22-14 44-12 58 2", "M66 300c-8-22-26-32-44-32", "M66 300c10-22 30-30 48-28", "M66 300c-2 18-14 34-30 42", "M66 300c8 16 22 26 40 30"]:
    a(f'<path d="{d.replace("M66 300", "M924 300")}" class="ln2 leaf"/>')
a('</g>')

# cartouche
a(f'<g class="st st-0 cartouche"><text x="970" y="40" class="txt r sm">FAÇADE PRINCIPALE · ÉCH. 1/100</text><text x="970" y="58" class="txt r sm dimtxt">VILLA R+1 · SALY</text></g>')
a('</svg>')
open(sys.argv[1], "w").write("\n".join(out))
print("ok", len("\n".join(out)))
