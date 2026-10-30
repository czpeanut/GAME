#!/usr/bin/env python3
"""AI 走路連續圖 → 八方位像素動畫。
每張圖是一個方向的一列連續動作（洋紅背景）。依腳底對齊、統一身高、共用調色盤、加描邊。
用法：pixelize_strips.py <輸出資料夾> <目標身高px> <色數> 方向=檔案[:mirror] ...
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy import ndimage

out, H, NCOL = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
specs = [a.split("=", 1) for a in sys.argv[4:]]
os.makedirs(out, exist_ok=True)
SAT = float(os.environ.get("PIX_SAT", "1.25"))

def key(path):
    a = np.array(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2)
    al = np.clip((d - 60) / 100, 0, 1)
    ex = np.clip(np.minimum(r, b) - g, 0, None)
    return np.dstack([np.clip(r - ex, 0, 255), g, np.clip(b - ex, 0, 255)]), al

def frames_of(path):
    rgb, al = key(path)
    lab, n = ndimage.label(ndimage.binary_dilation(al > 0.5, iterations=8))
    objs = ndimage.find_objects(lab)
    items = []
    for i, sl in enumerate(objs):
        area = (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start)
        if area < 20000: continue
        m = (lab[sl] == i + 1)
        items.append((sl[1].start, rgb[sl], al[sl] * m))
    items.sort(key=lambda t: t[0])
    return [(c, a) for _, c, a in items]

dirs = {}
for d, src in specs:
    mirror = src.endswith(":mirror")
    src = src.replace(":mirror", "")
    fr = frames_of(src)
    if mirror:
        fr = [(c[:, ::-1], a[:, ::-1]) for c, a in fr]
    dirs[d] = fr
    print(d, len(fr), "frames", [a.shape for _, a in fr][:2])

# 每個方向用該方向畫格的中位數身高縮放到目標身高
small = {}
for d, fr in dirs.items():
    hs = []
    for c, a in fr:
        ys = np.nonzero((a > 0.5).any(axis=1))[0]; hs.append(ys.max() - ys.min())
    sc = H / float(np.median(hs))
    out_frames = []
    for c, a in fr:
        hi = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8))
        k = max(3, int(round(5 / sc / 8)) * 2 + 1)
        hi = hi.filter(ImageFilter.MedianFilter(min(k, 7))).filter(ImageFilter.UnsharpMask(3, 150, 2))
        cc = np.array(hi).astype(np.float32) * a[..., None]
        W2 = max(1, int(round(a.shape[1] * sc))); H2 = max(1, int(round(a.shape[0] * sc)))
        ci = np.array(Image.fromarray(np.clip(cc, 0, 255).astype(np.uint8)).resize((W2, H2), Image.BOX)).astype(np.float32)
        ai = np.array(Image.fromarray((a * 255).astype(np.uint8)).resize((W2, H2), Image.BOX)).astype(np.float32) / 255
        rgb = np.where(ai[..., None] > 0.01, ci / np.maximum(ai[..., None], 0.01), 0)
        out_frames.append((rgb, ai))
    small[d] = out_frames

# 共用調色盤
pix = np.concatenate([r[a > 0.5] for fr in small.values() for r, a in fr]).astype(np.uint8)
strip = Image.fromarray(pix.reshape(1, -1, 3))
strip = ImageEnhance.Color(ImageEnhance.Brightness(ImageEnhance.Contrast(strip).enhance(1.2)).enhance(1.08)).enhance(SAT)
pal = strip.quantize(colors=NCOL, method=Image.Quantize.MEDIANCUT)

def finish(rgb, a):
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    im = ImageEnhance.Color(ImageEnhance.Brightness(ImageEnhance.Contrast(im).enhance(1.2)).enhance(1.08)).enhance(SAT)
    q = np.array(im.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB"))
    mask = a > 0.5
    h, w = mask.shape
    o = np.zeros((h + 2, w + 2, 4), np.uint8)
    o[1:-1, 1:-1][mask, :3] = q[mask]; o[1:-1, 1:-1][mask, 3] = 255
    M = np.zeros((h + 2, w + 2), bool); M[1:-1, 1:-1] = mask
    Q = np.zeros((h + 2, w + 2, 3), np.uint8); Q[1:-1, 1:-1] = q
    edge = np.zeros_like(M)
    for dy, dx in ((1, 0), (0, 1), (0, -1), (-1, 0)):
        sh = np.roll(np.roll(M, dy, 0), dx, 1); src = np.roll(np.roll(Q, dy, 0), dx, 1)
        nb = sh & ~M & ~edge
        o[nb, :3] = (src[nb] * 0.3 + 6).astype(np.uint8); o[nb, 3] = 255; edge |= nb
    return o

# 統一畫格大小：以腳底中央為錨點
fin = {d: [finish(r, a) for r, a in fr] for d, fr in small.items()}
def anchor(o):
    m = o[..., 3] > 0
    ys = np.nonzero(m.any(axis=1))[0]; bottom = ys.max()
    low = m[max(0, bottom - 6):bottom + 1]
    xs = np.nonzero(m.any(axis=0))[0]
    cx = int(round(np.nonzero(m)[1].mean()))
    return bottom, cx
FW = max(o.shape[1] for fr in fin.values() for o in fr) + 6
FH = max(o.shape[0] for fr in fin.values() for o in fr) + 4
ORDER = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]
maxn = max(len(fr) for fr in fin.values())
sheet = Image.new("RGBA", (FW * maxn, FH * len(ORDER)), (0, 0, 0, 0))
meta = {"frame_w": FW, "frame_h": FH, "anchor": [FW // 2, FH - 3], "rows": []}
for r, d in enumerate(ORDER):
    for j, o in enumerate(fin[d]):
        b, cx = anchor(o)
        cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        cell.alpha_composite(Image.fromarray(o, "RGBA"), (FW // 2 - cx, FH - 3 - b))
        cell.save(os.path.join(out, f"{d}_walk_{j}.png")); sheet.alpha_composite(cell, (j * FW, r * FH))
    meta["rows"].append({"dir": d, "name": "walk", "frames": len(fin[d])})
sheet.save(os.path.join(out, "sheet.png"))
json.dump(meta, open(os.path.join(out, "sheet.json"), "w"), indent=1)
print("frame", FW, FH)
