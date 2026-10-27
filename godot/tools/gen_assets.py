#!/usr/bin/env python3
"""Generate placeholder pixel art + light textures + synth SFX for the graybox prototype.
Everything here is procedural so it can be regenerated or replaced with real art later.
Usage: python3 godot/tools/gen_assets.py
"""
import math, os, random, wave
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets")
ART = os.path.join(OUT, "art")
AUD = os.path.join(OUT, "audio")
os.makedirs(ART, exist_ok=True); os.makedirs(AUD, exist_ok=True)
OUTLINE = (22, 16, 18, 255)

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

# ---------------------------------------------------------------- characters
# 16x24 frames, sheet = 3 columns (idle, walkA, walkB) x 4 rows (down, up, left, right)
def draw_char(pal, d, f):
    im = Image.new("RGBA", (16, 24), (0, 0, 0, 0)); px = im.load()
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < 16 and 0 <= y < 24: px[x, y] = c
    bob = 1 if f in (1, 2) else 0
    skin, hair, top, pants, boots = (pal[k] for k in ("skin", "hair", "top", "pants", "boots"))
    # legs
    la = 0; lb = 0
    if f == 1: la, lb = -1, 1
    if f == 2: la, lb = 1, -1
    if d in (0, 1):
        rect(5, 16 + bob + max(0, -la) * 0, 7, 21 + la, pants); rect(8, 16 + bob, 10, 21 + lb, pants)
        rect(5, 21 + la, 7, 22 + la, boots); rect(8, 21 + lb, 10, 22 + lb, boots)
    else:
        sh = 1 if f else 0
        rect(6, 16 + bob, 9, 21, pants)
        rect(6 - sh, 21, 9 + sh, 22, boots)
    # torso
    rect(4, 8 + bob, 11, 15 + bob, top)
    if pal.get("belt"): rect(4, 14 + bob, 11, 14 + bob, pal["belt"])
    # arms
    if d in (0, 1):
        rect(3, 9 + bob, 3, 14 + bob + (1 if f == 1 else 0), top); rect(12, 9 + bob, 12, 14 + bob + (1 if f == 2 else 0), top)
        rect(3, 15 + bob, 3, 15 + bob, skin); rect(12, 15 + bob, 12, 15 + bob, skin)
    else:
        ax = 7 if d == 2 else 7
        rect(ax, 9 + bob, ax + 2, 14 + bob, pal.get("sleeve", top)); rect(ax, 15 + bob, ax + 2, 15 + bob, skin)
    if pal.get("pack") and d == 1:
        rect(5, 9 + bob, 10, 15 + bob, pal["pack"]); rect(5, 9 + bob, 10, 9 + bob, tuple(min(255, int(c * 1.25)) for c in pal["pack"][:3]) + (255,))
    if pal.get("collar") and d in (0, 2, 3):
        rect(6, 8 + bob, 9, 8 + bob, pal["collar"])
    # head
    hy = 2 + bob
    rect(5, hy, 10, hy + 5, skin)
    if d == 0:
        rect(5, hy, 10, hy + 1, hair); rect(5, hy + 2, 5, hy + 2, hair); rect(10, hy + 2, 10, hy + 2, hair)
        px[6, hy + 3] = (30, 24, 24, 255); px[9, hy + 3] = (30, 24, 24, 255)
    elif d == 1:
        rect(5, hy, 10, hy + 4, hair)
        if pal.get("ponytail"): rect(7, hy + 5, 8, hy + 8, hair)
    else:
        rect(5, hy, 10, hy + 1, hair)
        back = (9, 10) if d == 2 else (5, 6)
        rect(back[0], hy + 2, back[1], hy + 4, hair)
        face_x = 5 if d == 2 else 10
        px[face_x + (1 if d == 2 else -1), hy + 3] = (30, 24, 24, 255)
        if pal.get("ponytail"):
            tx = 11 if d == 2 else 3
            rect(tx, hy + 3, tx + 1, hy + 6, hair)
    if pal.get("earring") and d in (0, 2, 3):
        ex = {0: 4, 2: 9, 3: 6}[d]
        px[ex, hy + 4] = hexc("#e0457b")
        if d == 0: px[11, hy + 4] = hexc("#46b0e0")
    if pal.get("cap"):
        rect(5, hy - 1, 10, hy, pal["cap"]);
        if d == 0: rect(5, hy + 1, 10, hy + 1, pal["cap"])
    if pal.get("band"):
        rect(5, hy + 2, 10, hy + 2, pal["band"])
    if pal.get("bandage") and d in (0, 2, 3):
        rect(5, 18 + 0, 7, 19, hexc("#d8d2c4"))
    # shading pass: top edge highlight, right/bottom edge shade (light from top-left)
    base = im.copy(); bp = base.load()
    def opaque(x, y): return 0 <= x < 16 and 0 <= y < 24 and bp[x, y][3] > 0
    for y in range(24):
        for x in range(16):
            if bp[x, y][3] == 0: continue
            r, g, b, a = bp[x, y]
            if not opaque(x, y - 1): f = 1.20
            elif not opaque(x + 1, y) or not opaque(x, y + 1): f = 0.80
            elif not opaque(x - 1, y): f = 1.08
            else: f = 1.0
            px[x, y] = (min(255, int(r * f)), min(255, int(g * f)), min(255, int(b * f)), 255)
    # selective outline: darkened version of the neighbouring colour
    a = im.split()[3]; ap = a.load()
    out = im.copy(); op = out.load(); sp = im.load()
    for y in range(24):
        for x in range(16):
            if ap[x, y] == 0:
                for dx, dy in ((0,1),(1,0),(-1,0),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < 16 and 0 <= ny < 24 and ap[nx, ny] > 0:
                        c = sp[nx, ny]
                        op[x, y] = (int(c[0]*.28), int(c[1]*.26), int(c[2]*.3), 255); break
    return out

PALS = {
    "player":  dict(skin=hexc("#c99a74"), hair=hexc("#1c1618"), top=hexc("#5a5f3d"), pants=hexc("#3d4036"), boots=hexc("#25211f"), belt=hexc("#2b2a22"), bandage=True, pack=hexc("#6b5436"), collar=hexc("#8a8f68")),
    "thug":    dict(skin=hexc("#b88a68"), hair=hexc("#151215"), top=hexc("#2a2a2e"), pants=hexc("#37445a"), boots=hexc("#1e1b1b"), band=hexc("#a8322d"), sleeve=hexc("#2a2a2e"), belt=hexc("#6a1f1c"), collar=hexc("#3a3a40")),
    "torch":   dict(skin=hexc("#a97a58"), hair=hexc("#241c18"), top=hexc("#c27a2c"), pants=hexc("#3c3a34"), boots=hexc("#1e1b1b"), cap=hexc("#d8d2c4"), sleeve=hexc("#c27a2c"), belt=hexc("#2b2a22"), pack=hexc("#7a7a80")),
    "zhiqing": dict(skin=hexc("#e0b896"), hair=hexc("#2a2224"), top=hexc("#59635a"), pants=hexc("#3a3f4a"), boots=hexc("#2a2626"), sleeve=hexc("#59635a"), belt=hexc("#c9c3b8"), earring=True, collar=hexc("#7d8a7f")),
}
for name, pal in PALS.items():
    sheet = Image.new("RGBA", (16 * 3, 24 * 4), (0, 0, 0, 0))
    for d in range(4):
        for f in range(3):
            sheet.paste(draw_char(pal, d, f), (f * 16, d * 24))
    sheet.save(os.path.join(ART, f"char_{name}.png"))

# ---------------------------------------------------------------- tile atlas (16px cells, 8 columns)
rnd = random.Random(7)
def clampc(v): return max(0, min(255, int(v)))
def noisy(base, spread, size=16, seed=0, dither=True):
    r = random.Random(seed)
    im = Image.new("RGBA", (size, size)); px = im.load()
    for y in range(size):
        for x in range(size):
            k = r.randint(-spread, spread)
            if dither and (x + y) % 2 == 0: k += 1
            px[x, y] = (clampc(base[0]+k), clampc(base[1]+k), clampc(base[2]+k), 255)
    return im
def speckle(im, n, col, seed):
    r = random.Random(seed); px = im.load()
    for _ in range(n):
        x, y = r.randint(0, 15), r.randint(0, 15); px[x, y] = col
atlas = Image.new("RGBA", (16 * 8, 16 * 2), (0, 0, 0, 0))
def put(i, im): atlas.paste(im, ((i % 8) * 16, (i // 8) * 16))
# 0/1 interior concrete (slab seams, stains, chips)
t = noisy((78, 75, 73), 4, seed=1); d = ImageDraw.Draw(t); d.line([(0,15),(15,15)], fill=(58,56,55,255)); d.line([(15,0),(15,15)], fill=(62,60,59,255)); speckle(t, 6, (96,92,89,255), 21); put(0, t)
t = noisy((74, 71, 70), 4, seed=2); d = ImageDraw.Draw(t); d.line([(3,2),(6,6),(5,9),(9,13)], fill=(46,44,44,255)); d.line([(6,6),(10,5)], fill=(50,48,48,255)); d.line([(0,15),(15,15)], fill=(58,56,55,255)); d.line([(15,0),(15,15)], fill=(62,60,59,255)); put(1, t)
# 2/3 checker tile floor (convenience store): glossy tiles with grout
for idx, base, sd in ((2, (150, 150, 144), 3), (3, (108, 108, 103), 4)):
    t = noisy(base, 3, seed=sd); d = ImageDraw.Draw(t)
    d.line([(0,0),(15,0)], fill=(base[0]+26, base[1]+26, base[2]+24, 255)); d.line([(0,0),(0,15)], fill=(base[0]+14, base[1]+14, base[2]+12, 255))
    d.line([(0,15),(15,15)], fill=(base[0]-40, base[1]-40, base[2]-38, 255)); d.line([(15,0),(15,15)], fill=(base[0]-34, base[1]-34, base[2]-32, 255))
    speckle(t, 4, (base[0]-24, base[1]-24, base[2]-22, 255), sd+30); put(idx, t)
# 4 freezer floor (frosty, cold blue)
t = noisy((112, 142, 162), 4, seed=5); d = ImageDraw.Draw(t); d.line([(0,15),(15,15)], fill=(150,184,202,255)); d.line([(15,0),(15,15)], fill=(140,172,192,255)); speckle(t, 8, (214,236,246,255), 41); put(4, t)
# 5 wood floor
t = noisy((98, 72, 54), 5, seed=6); d = ImageDraw.Draw(t)
for yy in (0, 5, 10): d.line([(0,yy),(15,yy)], fill=(58,42,32,255)); d.line([(0,yy+1),(15,yy+1)], fill=(120,90,68,255))
d.line([(4,0),(4,4)], fill=(58,42,32,255)); d.line([(11,5),(11,9)], fill=(58,42,32,255)); d.line([(7,10),(7,14)], fill=(58,42,32,255)); put(5, t)
# 6/7 asphalt road (grit, cracks)
t = noisy((46, 45, 48), 4, seed=61); speckle(t, 14, (68,66,70,255), 62); speckle(t, 8, (32,31,34,255), 63); put(6, t)
t = noisy((44, 43, 46), 4, seed=64); d = ImageDraw.Draw(t); d.line([(0,6),(5,8),(9,7),(15,11)], fill=(26,25,28,255)); d.line([(9,7),(11,3)], fill=(28,27,30,255)); speckle(t, 10, (66,64,68,255), 65); put(7, t)
# 8 wall top (brick cap, top-lit)
t = noisy((118, 108, 100), 3, seed=8); d = ImageDraw.Draw(t)
d.line([(0,0),(15,0)], fill=(158,148,138,255)); d.line([(0,1),(15,1)], fill=(138,128,120,255)); d.line([(0,15),(15,15)], fill=(78,70,66,255))
for xx in (4, 10): d.line([(xx,3),(xx,6)], fill=(92,84,78,255))
d.line([(0,7),(15,7)], fill=(96,88,82,255))
for xx in (0, 7, 14): d.line([(xx,8),(xx,14)], fill=(92,84,78,255))
put(8, t)
# 9 wall front (brick face, darker toward the bottom)
t = noisy((84, 72, 66), 3, seed=9); d = ImageDraw.Draw(t)
for yy, off in ((0, 0), (4, 4), (8, 0), (12, 4)):
    d.line([(0,yy+3),(15,yy+3)], fill=(54,46,43,255))
    for xx in range(off, 16, 8): d.line([(xx,yy),(xx,yy+3)], fill=(54,46,43,255))
for yy in range(16):
    for xx in range(16):
        r_, g_, b_, a_ = t.getpixel((xx, yy)); f = 1.0 - yy * 0.012; t.putpixel((xx, yy), (clampc(r_*f), clampc(g_*f), clampc(b_*f), 255))
put(9, t)
# 10 glass shards (transparent decal)
g = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); gp = g.load(); r = random.Random(11)
for _ in range(16):
    x, y = r.randint(0, 15), r.randint(0, 15); c = r.choice([(190,230,240,230),(150,200,215,200),(235,248,252,240)])
    gp[x, y] = c
    if r.random() < .5 and x < 15: gp[x+1, y] = c
    if r.random() < .25 and y < 15: gp[x, y+1] = (255,255,255,255)
put(10, g)
# 11 weed tuft, 12 rubble, 13 oil stain, 14 puddle, 15 paper litter (transparent decals)
g = Image.new("RGBA", (16, 16), (0,0,0,0)); d = ImageDraw.Draw(g)
for bx, h in ((4, 5), (7, 7), (10, 4), (6, 4), (9, 6)):
    d.line([(bx,14),(bx + (1 if h>5 else -1),14-h)], fill=(70,92,52,255)); d.line([(bx+1,14),(bx+1,14-h+1)], fill=(96,122,64,255))
put(11, g)
g = Image.new("RGBA", (16, 16), (0,0,0,0)); d = ImageDraw.Draw(g)
for (x0,y0,x1,y1,c) in ((3,9,7,13,(104,98,92,255)),(8,7,12,10,(90,84,80,255)),(6,12,10,14,(120,114,106,255)),(11,11,13,13,(80,76,72,255))):
    d.rectangle([x0,y0,x1,y1], fill=c, outline=(40,36,34,255)); d.line([(x0,y0),(x1,y0)], fill=(150,144,134,255))
put(12, g)
g = Image.new("RGBA", (16, 16), (0,0,0,0)); d = ImageDraw.Draw(g); d.ellipse([2,5,13,12], fill=(18,16,20,150)); d.ellipse([5,7,10,10], fill=(40,36,44,170)); put(13, g)
g = Image.new("RGBA", (16, 16), (0,0,0,0)); d = ImageDraw.Draw(g); d.ellipse([1,4,14,12], fill=(60,86,104,120)); d.arc([3,5,11,10], 200, 340, fill=(150,190,210,180)); put(14, g)
g = Image.new("RGBA", (16, 16), (0,0,0,0)); d = ImageDraw.Draw(g)
d.polygon([(3,10),(8,8),(10,12),(5,13)], fill=(205,198,180,255), outline=(70,64,56,255)); d.polygon([(9,4),(13,5),(12,8),(8,7)], fill=(190,184,168,255), outline=(70,64,56,255)); put(15, g)
atlas.save(os.path.join(ART, "tiles.png"))

# ---------------------------------------------------------------- small item icons (12x12)
def icon(draw_fn, name):
    im = Image.new("RGBA", (12, 12), (0, 0, 0, 0)); d = ImageDraw.Draw(im); draw_fn(d); im.save(os.path.join(ART, f"icon_{name}.png"))
icon(lambda d: (d.rectangle([3,3,8,10], fill=hexc("#b8b03a"), outline=OUTLINE), d.rectangle([5,1,6,3], fill=hexc("#8a8a8a"), outline=OUTLINE)), "oil")
icon(lambda d: (d.rectangle([2,2,9,10], fill=hexc("#d8d2c4"), outline=OUTLINE), d.line([(4,5),(7,5)], fill=OUTLINE), d.line([(4,7),(7,7)], fill=OUTLINE)), "doc")
icon(lambda d: (d.rectangle([2,4,9,7], fill=hexc("#6fe08a"), outline=OUTLINE),), "glow")
icon(lambda d: (d.rectangle([1,6,10,10], fill=hexc("#6a5a4a"), outline=OUTLINE), d.rectangle([4,2,7,6], fill=hexc("#8a8a8a"), outline=OUTLINE)), "bench")
icon(lambda d: (d.rectangle([1,4,10,10], fill=hexc("#5a4a3a"), outline=OUTLINE), d.rectangle([4,1,7,4], fill=hexc("#d8d2c4"), outline=OUTLINE), d.line([(5,2),(6,2)], fill=OUTLINE)), "grave")

# ---------------------------------------------------------------- light textures
def cone_texture(name="light_cone.png", size=512, half_angle=28, falloff=1.6):
    a = np.zeros((size, size), dtype=np.float32); c = size / 2
    ys, xs = np.mgrid[0:size, 0:size]; dx = xs - c; dy = ys - c
    dist = np.sqrt(dx*dx + dy*dy) / c; ang = np.degrees(np.arctan2(dy, dx))      # facing +x
    soft = np.clip(1.0 - np.abs(ang) / half_angle, 0, 1) ** 0.6
    radial = np.clip(1.0 - dist, 0, 1) ** falloff
    near = np.clip(1.0 - dist / 0.18, 0, 1) ** 1.2 * 0.7                          # soft glow around the holder
    v = np.clip(np.maximum(soft * radial, near), 0, 1)
    img = np.stack([v*255]*3 + [np.full_like(v, 255)], axis=-1).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(ART, name))
cone_texture()
cone_texture("light_cone_narrow.png", half_angle=15, falloff=1.2)
def radial_texture(name, size=256, power=2.0):
    ys, xs = np.mgrid[0:size, 0:size]; c = size/2; d = np.sqrt((xs-c)**2 + (ys-c)**2)/c
    v = np.clip(1-d, 0, 1) ** power
    img = np.stack([v*255]*3 + [np.full_like(v, 255)], axis=-1).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(ART, name))
radial_texture("light_radial.png")

# ---------------------------------------------------------------- synth SFX
SR = 22050
def write(name, samples):
    s = np.clip(samples, -1, 1); data = (s * 32767).astype(np.int16)
    with wave.open(os.path.join(AUD, name + ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
rng = np.random.default_rng(3)
def t_(d): return np.linspace(0, d, int(SR*d), endpoint=False)
def noise(d, lp=None):
    n = rng.uniform(-1, 1, int(SR*d))
    if lp:
        k = int(lp); n = np.convolve(n, np.ones(k)/k, mode="same")
    return n
t = t_(.45); write("shot", (noise(.45)*np.exp(-t*14)*.9 + np.sin(2*np.pi*70*t)*np.exp(-t*18)*.8)*.9)
t = t_(.05); write("click", np.sign(np.sin(2*np.pi*900*t))*np.exp(-t*90)*.5)
t = t_(.07); write("step", noise(.07, 6)*np.exp(-t*45)*.6)
t = t_(.04); write("step_soft", noise(.04, 10)*np.exp(-t*50)*.35)
t = t_(.3); a = np.sign(np.sin(2*np.pi*700*t))*np.exp(-t*60)*.4; b = np.zeros_like(a); k = int(SR*.14); b[k:] = a[:-k]; write("rack", a + b*.9)
t = t_(.14); write("stab", (noise(.14, 4)*.5 + np.sin(2*np.pi*110*t)*.7)*np.exp(-t*28))
t = t_(.2); write("glass", (noise(.2)*np.exp(-t*20) + noise(.2)*np.sign(np.sin(2*np.pi*40*t))*np.exp(-t*12)*.6)*.6)
t = t_(.1); write("blip", np.sin(2*np.pi*660*t)*np.exp(-t*30)*.4)
t = t_(.35); write("hurt", (noise(.35, 5)*.4 + np.sin(2*np.pi*(150-60*t)*t)*.6)*np.exp(-t*9))
t = t_(.6); write("pry", noise(.6, 3)*(0.5+0.5*np.sign(np.sin(2*np.pi*9*t)))*np.exp(-t*2)*.4)
print("assets written to", OUT)
