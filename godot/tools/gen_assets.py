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
    # outline
    a = im.split()[3]; ap = a.load()
    out = im.copy(); op = out.load()
    for y in range(24):
        for x in range(16):
            if ap[x, y] == 0:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < 16 and 0 <= ny < 24 and ap[nx, ny] > 0:
                        op[x, y] = OUTLINE; break
    return out

PALS = {
    "player":  dict(skin=hexc("#c99a74"), hair=hexc("#1c1618"), top=hexc("#5a5f3d"), pants=hexc("#3d4036"), boots=hexc("#25211f"), belt=hexc("#2b2a22"), bandage=True),
    "thug":    dict(skin=hexc("#b88a68"), hair=hexc("#151215"), top=hexc("#2a2a2e"), pants=hexc("#37445a"), boots=hexc("#1e1b1b"), band=hexc("#a8322d"), sleeve=hexc("#2a2a2e")),
    "torch":   dict(skin=hexc("#a97a58"), hair=hexc("#241c18"), top=hexc("#c27a2c"), pants=hexc("#3c3a34"), boots=hexc("#1e1b1b"), cap=hexc("#d8d2c4"), sleeve=hexc("#c27a2c")),
    "zhiqing": dict(skin=hexc("#e0b896"), hair=hexc("#2a2224"), top=hexc("#59635a"), pants=hexc("#3a3f4a"), boots=hexc("#2a2626"), sleeve=hexc("#59635a"), belt=hexc("#c9c3b8"), earring=True),
}
for name, pal in PALS.items():
    sheet = Image.new("RGBA", (16 * 3, 24 * 4), (0, 0, 0, 0))
    for d in range(4):
        for f in range(3):
            sheet.paste(draw_char(pal, d, f), (f * 16, d * 24))
    sheet.save(os.path.join(ART, f"char_{name}.png"))

# ---------------------------------------------------------------- tile atlas (16px cells, 8 columns)
rnd = random.Random(7)
def noisy(base, spread, size=16, seed=0):
    r = random.Random(seed)
    im = Image.new("RGBA", (size, size)); px = im.load()
    for y in range(size):
        for x in range(size):
            k = r.randint(-spread, spread)
            px[x, y] = (max(0,min(255,base[0]+k)), max(0,min(255,base[1]+k)), max(0,min(255,base[2]+k)), 255)
    return im
atlas = Image.new("RGBA", (16 * 8, 16 * 2), (0, 0, 0, 0))
def put(i, im): atlas.paste(im, ((i % 8) * 16, (i // 8) * 16))
put(0, noisy((74, 71, 69), 5, seed=1))            # concrete a
t = noisy((70, 67, 66), 5, seed=2); ImageDraw.Draw(t).line([(2,3),(7,9),(6,14)], fill=(48,46,45,255)); put(1, t)   # concrete b (crack)
t = noisy((138, 138, 132), 4, seed=3); put(2, t)  # checker light
t = noisy((104, 104, 99), 4, seed=4); put(3, t)   # checker dark
t = noisy((111, 141, 160), 4, seed=5); ImageDraw.Draw(t).line([(0,15),(15,15)], fill=(150,180,196,255)); put(4, t)  # freezer floor
t = noisy((90, 68, 52), 5, seed=6); d = ImageDraw.Draw(t); d.line([(0,5),(15,5)], fill=(60,44,34,255)); d.line([(0,11),(15,11)], fill=(60,44,34,255)); put(5, t)  # wood floor
# wall top
t = noisy((112, 104, 98), 4, seed=8); d = ImageDraw.Draw(t); d.line([(0,0),(15,0)], fill=(140,132,124,255)); put(8, t)
# wall front
t = noisy((72, 64, 60), 4, seed=9); d = ImageDraw.Draw(t); d.line([(0,7),(15,7)], fill=(52,46,43,255)); d.line([(0,3),(15,3)], fill=(60,53,50,255)); d.line([(8,0),(8,3)], fill=(52,46,43,255)); d.line([(4,4),(4,7)], fill=(52,46,43,255)); d.line([(12,4),(12,7)], fill=(52,46,43,255)); put(9, t)
# glass shards (transparent decal)
g = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); gp = g.load(); r = random.Random(11)
for _ in range(14):
    x, y = r.randint(0, 15), r.randint(0, 15); c = r.choice([(190,230,240,230),(150,200,215,200),(235,248,252,240)])
    gp[x, y] = c
    if r.random() < .5 and x < 15: gp[x+1, y] = c
put(10, g)
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
def cone_texture(size=512, half_angle=28, falloff=1.6):
    a = np.zeros((size, size), dtype=np.float32); c = size / 2
    ys, xs = np.mgrid[0:size, 0:size]; dx = xs - c; dy = ys - c
    dist = np.sqrt(dx*dx + dy*dy) / c; ang = np.degrees(np.arctan2(dy, dx))      # facing +x
    soft = np.clip(1.0 - np.abs(ang) / half_angle, 0, 1) ** 0.6
    radial = np.clip(1.0 - dist, 0, 1) ** falloff
    near = np.clip(1.0 - dist / 0.18, 0, 1) ** 1.2 * 0.7                          # soft glow around the holder
    v = np.clip(np.maximum(soft * radial, near), 0, 1)
    img = np.stack([v*255]*3 + [np.full_like(v, 255)], axis=-1).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(ART, "light_cone.png"))
cone_texture()
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
