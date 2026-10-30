#!/usr/bin/env python3
"""骨架烘焙畫格 → 像素 sprite：去背、對齊、縮小、共用調色盤量化、選擇性描邊。
用法：pixelize.py <烘焙資料夾> <輸出資料夾> <目標身高px> <調色盤色數>
"""
import sys, os, glob, json
import numpy as np
from PIL import Image, ImageEnhance

src, out, H, NCOL = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
MAN = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else None
os.makedirs(out, exist_ok=True)
ACTIONS = [("idle", 4), ("walk", 8), ("run", 8), ("aim", 3), ("aim_walk", 8), ("roll", 8)]
N = len(MAN) if MAN else sum(n for _, n in ACTIONS)
files = sorted(glob.glob(os.path.join(src, "f*.png")))
arrs = [np.array(Image.open(f).convert("RGB")) for f in files]
# 找出第一個與第 0 格不同的畫格：前面重複的都是 idle 第 0 格
first = next(i for i in range(1, len(arrs)) if np.abs(arrs[i].astype(int) - arrs[0].astype(int)).sum() > 1000)
start = first - 1
poses = arrs[start:start + N]

def key(a):
    a = a.astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2)
    al = np.clip((d - 60) / 100, 0, 1)
    ex = np.clip(np.minimum(r, b) - g, 0, None)
    rgb = np.dstack([np.clip(r - ex, 0, 255), g, np.clip(b - ex, 0, 255)])
    return rgb, al

keyed = [key(p) for p in poses]
# 以「站姿身高」決定縮放：idle 第 0 格的實際高度對應目標身高
m0 = keyed[0][1] > 0.5
ys = np.nonzero(m0.any(axis=1))[0]
body_h = ys.max() - ys.min()
scale = H / body_h
# 所有畫格共用的裁切框（讓角色在每格中位置一致）
union = np.zeros_like(m0)
for _, al in keyed: union |= al > 0.3
yy = np.nonzero(union.any(axis=1))[0]; xx = np.nonzero(union.any(axis=0))[0]
y0, y1, x0, x1 = yy.min() - 4, yy.max() + 4, xx.min() - 4, xx.max() + 4
W2 = int(round((x1 - x0) * scale)) + 2; H2 = int(round((y1 - y0) * scale)) + 2

small = []
from PIL import ImageFilter
SMOOTH = int(os.environ.get("PIX_SMOOTH", "7"))
for rgb, al in keyed:
    # 先在高解析度把迷彩等細碎紋理抹平（中值濾波）並銳化輪廓，縮小後才會是乾淨的色塊而不是雜訊
    hi = Image.fromarray(np.clip(rgb[y0:y1, x0:x1], 0, 255).astype(np.uint8))
    if SMOOTH > 1:
        hi = hi.filter(ImageFilter.MedianFilter(SMOOTH)).filter(ImageFilter.UnsharpMask(4, 160, 2))
    rgb_s = np.array(hi).astype(np.float32)
    c = rgb_s * al[y0:y1, x0:x1, None]          # 預乘 alpha，避免邊緣混入背景色
    a = al[y0:y1, x0:x1]
    ci = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).resize((W2, H2), Image.BOX)
    ai = Image.fromarray((a * 255).astype(np.uint8)).resize((W2, H2), Image.BOX)
    ca = np.array(ci).astype(np.float32); aa = np.array(ai).astype(np.float32) / 255
    rgbs = np.where(aa[..., None] > 0.01, ca / np.maximum(aa[..., None], 0.01), 0)
    small.append((np.clip(rgbs, 0, 255), aa))

# 共用調色盤：把所有不透明像素拼起來做量化
pix = np.concatenate([s[0][s[1] > 0.5] for s in small]).astype(np.uint8)
strip = Image.fromarray(pix.reshape(1, -1, 3))
strip = ImageEnhance.Brightness(ImageEnhance.Contrast(strip).enhance(1.25)).enhance(1.12)
strip = ImageEnhance.Color(strip).enhance(float(os.environ.get("PIX_SAT", "1.0")))
pal_img = strip.quantize(colors=NCOL, method=Image.Quantize.MEDIANCUT)
pal = np.array(pal_img.getpalette()[:NCOL * 3]).reshape(-1, 3)

frames = []
for rgb, a in small:
    im = Image.fromarray(rgb.astype(np.uint8))
    im = ImageEnhance.Brightness(ImageEnhance.Contrast(im).enhance(1.25)).enhance(1.12)
    im = ImageEnhance.Color(im).enhance(float(os.environ.get("PIX_SAT", "1.0")))
    q = np.array(im.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGB"))
    mask = a > 0.5
    outa = np.zeros(mask.shape + (4,), np.uint8)
    outa[mask, :3] = q[mask]; outa[mask, 3] = 255
    # 選擇性描邊：外圍一圈用鄰近顏色的深色
    h, w = mask.shape
    edge = np.zeros_like(mask)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        sh = np.zeros_like(mask)
        sy0, sy1 = max(0, dy), h + min(0, dy); sx0, sx1 = max(0, dx), w + min(0, dx)
        sh[sy0:sy1, sx0:sx1] = mask[sy0 - dy:sy1 - dy, sx0 - dx:sx1 - dx]
        nb = sh & ~mask & ~edge
        if nb.any():
            src_rgb = np.zeros_like(q); src_rgb[sy0:sy1, sx0:sx1] = q[sy0 - dy:sy1 - dy, sx0 - dx:sx1 - dx]
            outa[nb, :3] = (src_rgb[nb] * 0.3 + 6).astype(np.uint8); outa[nb, 3] = 255
            edge |= nb
    frames.append(Image.fromarray(outa, "RGBA"))

fw, fh = frames[0].size
if MAN:
    MIRROR = {"E": "W", "SE": "SW", "NE": "NW"}
    ORDER = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]
    by = {}
    for (v, act, k), fr in zip(MAN, frames):
        by.setdefault(v, {}).setdefault(act, []).append(fr)
    for d, srcv in MIRROR.items():
        by[d] = {act: [f.transpose(Image.FLIP_LEFT_RIGHT) for f in fl] for act, fl in by[srcv].items()}
    acts = [a for a, _ in ACTIONS]
    rows = [(d, act) for d in ORDER for act in acts if act in by[d]]
    maxn = max(len(by[d][act]) for d, act in rows)
    sheet = Image.new("RGBA", (fw * maxn, fh * len(rows)), (0, 0, 0, 0))
    meta = {"frame_w": fw, "frame_h": fh, "rows": []}
    for r, (d, act) in enumerate(rows):
        for j, fr in enumerate(by[d][act]):
            sheet.paste(fr, (j * fw, r * fh)); fr.save(os.path.join(out, f"{d}_{act}_{j}.png"))
        meta["rows"].append({"dir": d, "name": act, "frames": len(by[d][act])})
    sheet.save(os.path.join(out, "sheet.png"))
    json.dump(meta, open(os.path.join(out, "sheet.json"), "w"), ensure_ascii=False, indent=1)
    print("8dir frames", len(frames), "rows", len(rows), "size", fw, fh, "palette", NCOL, "start", start)
    sys.exit(0)
fw, fh = frames[0].size
maxn = max(n for _, n in ACTIONS)
sheet = Image.new("RGBA", (fw * maxn, fh * len(ACTIONS)), (0, 0, 0, 0))
k = 0; meta = {"frame_w": fw, "frame_h": fh, "rows": []}
for row, (name, n) in enumerate(ACTIONS):
    for j in range(n):
        sheet.paste(frames[k], (j * fw, row * fh)); frames[k].save(os.path.join(out, f"{name}_{j}.png")); k += 1
    meta["rows"].append({"name": name, "frames": n})
sheet.save(os.path.join(out, "sheet.png"))
json.dump(meta, open(os.path.join(out, "sheet.json"), "w"), ensure_ascii=False, indent=1)
print("frames", len(frames), "size", fw, fh, "palette", NCOL, "start", start)
