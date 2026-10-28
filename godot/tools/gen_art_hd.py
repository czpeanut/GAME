#!/usr/bin/env python3
"""2x 解析度暫代美術（角色 32x48、地磚 32px、道具、地面、圖示）。
遊戲內以 0.5 倍縮放繪製：世界大小不變，細節為原本 4 倍像素。
全部程序生成，之後可直接用同名正式美術覆蓋。
用法：python3 godot/tools/gen_art_hd.py
"""
import os, random, math
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "assets", "art")
os.makedirs(ART, exist_ok=True)

def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=np.float32)

def to_img(rgb, alpha):
    a = np.clip(alpha, 0, 255).astype(np.uint8)
    c = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([c, a]), "RGBA")

# ====================================================================== 角色
CW, CH = 32, 48

class Canvas:
    """以「部位編號」為單位繪製，最後依部位邊界自動上光影與選擇性描邊。"""
    def __init__(self):
        self.part = np.full((CH, CW), -1, dtype=np.int32)
        self.col = np.zeros((CH, CW, 3), dtype=np.float32)
        self.flat = np.zeros((CH, CW), dtype=bool)   # 細節像素：不再上光影
        self.n = 0
    def new_part(self):
        self.n += 1; return self.n
    def put(self, x, y, c, pid, flat=False):
        if 0 <= x < CW and 0 <= y < CH:
            self.part[y, x] = pid; self.col[y, x] = c; self.flat[y, x] = flat
    def rect(self, x0, y0, x1, y1, c, pid=None):
        pid = pid or self.new_part()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c, pid)
        return pid
    def ellipse(self, x0, y0, x1, y1, c, pid=None):
        pid = pid or self.new_part()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; rx, ry = (x1 - x0) / 2 + .5, (y1 - y0) / 2 + .5
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c, pid)
        return pid
    def round_rect(self, x0, y0, x1, y1, c, pid=None, r=1):
        pid = pid or self.new_part()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx = min(x - x0, x1 - x); dy = min(y - y0, y1 - y)
                if dx < r and dy < r and (r - dx) + (r - dy) > r + 1:
                    continue
                self.put(x, y, c, pid)
        return pid
    def dot(self, x, y, c):
        if 0 <= x < CW and 0 <= y < CH and self.part[y, x] >= 0:
            self.col[y, x] = c; self.flat[y, x] = True
    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1): self.dot(x, y, c)
    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1): self.dot(x, y, c)

    def render(self, mirror=False):
        part, col = self.part, self.col.copy()
        filled = part >= 0
        H, W = part.shape
        out = col.copy()
        # 部位內的立體光影（光源左上）
        for pid in range(1, self.n + 1):
            m = part == pid
            if not m.any(): continue
            ys, xs = np.nonzero(m)
            x0, x1 = xs.min(), xs.max(); y0, y1 = ys.min(), ys.max()
            w = max(1, x1 - x0); h = max(1, y1 - y0)
            for y, x in zip(ys, xs):
                if self.flat[y, x]: continue
                f = 1.0
                fx = (x - x0) / w; fy = (y - y0) / h
                f *= 1.08 - 0.22 * fx - 0.08 * fy                      # 漸層：左上亮、右下暗
                up = part[y - 1, x] if y > 0 else -1
                rt = part[y, x + 1] if x < W - 1 else -1
                dn = part[y + 1, x] if y < H - 1 else -1
                lf = part[y, x - 1] if x > 0 else -1
                if up != pid: f *= 1.22                                 # 上緣高光
                if lf != pid and up == pid: f *= 1.08
                if dn != pid or rt != pid: f *= 0.78                    # 下緣、右緣陰影
                out[y, x] = col[y, x] * f
        # 部位交界的暗線（讓手臂、衣服層次分明）
        for y in range(H):
            for x in range(W):
                if not filled[y, x] or self.flat[y, x]: continue
                p = part[y, x]
                dn = part[y + 1, x] if y < H - 1 else -1
                if dn >= 0 and dn != p and dn < p:   # 前景部位壓在後景之上
                    pass
                lf = part[y, x - 1] if x > 0 else -1
                if lf >= 0 and lf > p:
                    out[y, x] *= 0.82
        alpha = np.where(filled, 255, 0).astype(np.float32)
        # 選擇性描邊：外框用鄰近顏色的深色
        res = out.copy(); ra = alpha.copy()
        for y in range(H):
            for x in range(W):
                if filled[y, x]: continue
                for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and filled[ny, nx]:
                        res[y, x] = out[ny, nx] * 0.28 + np.array([6, 4, 8]); ra[y, x] = 255; break
        img = to_img(res, ra)
        if mirror:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        return img

def shade(c, f): return np.clip(np.asarray(c, dtype=np.float32) * f, 0, 255)

SKIN = {"player": "#c99470", "thug": "#b5835f", "torch": "#a8775a", "zhiqing": "#e3b996"}

def draw_character(kind, d, f):
    """d: 0 正面、1 背面、2 左側（右側＝左側鏡像）；f: 0 站立、1/2 走路。"""
    cv = Canvas()
    skin = hexc(SKIN[kind])
    P = {
        "player":  dict(hair="#1d1719", top="#5b6340", top2="#4a5134", pants="#3f4434", boots="#2a231e", belt="#2c2a22"),
        "thug":    dict(hair="#141113", top="#26262b", top2="#1b1b1f", pants="#3b4a63", boots="#1f1b1b", belt="#5a1d1a"),
        "torch":   dict(hair="#2a1f19", top="#c4772a", top2="#a35f1d", pants="#c4772a", boots="#2a2422", belt="#3a3530"),
        "zhiqing": dict(hair="#2b2225", top="#5f6b62", top2="#4d574f", pants="#3c4250", boots="#2d2828", belt="#cfc8bb"),
    }[kind]
    C = {k: hexc(v) for k, v in P.items()}
    side = d == 2
    bob = -1 if f in (1, 2) else 0
    # ---------------- 腿與鞋
    if not side:
        la = {0: 0, 1: -2, 2: 1}[f]; lb = {0: 0, 1: 1, 2: -2}[f]
        legL = cv.rect(11, 33 + bob, 15, 42 + la, C["pants"])
        legR = cv.rect(17, 33 + bob, 21, 42 + lb, C["pants"])
        cv.round_rect(10, 42 + la, 15, 45 + la, C["boots"], r=1)
        cv.round_rect(17, 42 + lb, 22, 45 + lb, C["boots"], r=1)
        if kind == "torch":
            cv.hline(11, 15, 38 + bob, shade(C["pants"], .8)); cv.hline(17, 21, 38 + bob, shade(C["pants"], .8))
    else:
        stride = {0: 0, 1: 3, 2: -3}[f]
        cv.rect(14 - stride // 2, 33 + bob, 18 - stride // 2, 42, shade(C["pants"], .82))      # 後腿
        cv.round_rect(13 - stride // 2, 42, 19 - stride // 2, 45, shade(C["boots"], .85), r=1)
        cv.rect(14 + stride // 2, 33 + bob, 18 + stride // 2, 42, C["pants"])                   # 前腿
        cv.round_rect(12 + stride // 2, 42, 18 + stride // 2, 45, C["boots"], r=1)
    # ---------------- 背包／氣瓶（背面先畫在身後）
    if kind == "torch" and side:
        cv.round_rect(20, 19 + bob, 25, 31 + bob, hexc("#7c7e86"), r=2)
    if kind == "player" and side:
        cv.round_rect(19, 20 + bob, 24, 31 + bob, hexc("#6b5436"), r=2)
    # ---------------- 軀幹
    if not side:
        torso = cv.round_rect(9, 19 + bob, 22, 32 + bob, C["top"], r=2)
    else:
        torso = cv.round_rect(11, 19 + bob, 20, 32 + bob, C["top"], r=2)
    tx0, tx1 = (9, 22) if not side else (11, 20)
    # 腰帶
    cv.hline(tx0, tx1, 31 + bob, C["belt"]); cv.hline(tx0, tx1, 32 + bob, shade(C["belt"], .8))
    # 衣物細節
    if kind == "player":
        if d == 0:
            cv.vline(15, 21 + bob, 30 + bob, shade(C["top"], .7))                      # 拉鍊
            cv.rect(10, 24 + bob, 13, 27 + bob, C["top2"], pid=torso); cv.rect(18, 24 + bob, 21, 27 + bob, C["top2"], pid=torso)
            cv.hline(10, 13, 24 + bob, shade(C["top"], 1.25)); cv.hline(18, 21, 24 + bob, shade(C["top"], 1.25))
            cv.vline(12, 19 + bob, 30 + bob, hexc("#3b2f22")); cv.vline(19, 19 + bob, 30 + bob, hexc("#3b2f22"))   # 背帶
            cv.dot(16, 31 + bob, hexc("#b8a76a"))                                       # 皮帶扣
        elif d == 1:
            cv.round_rect(10, 20 + bob, 21, 31 + bob, hexc("#6b5436"), r=2)              # 背包
            cv.hline(11, 20, 22 + bob, hexc("#86693f")); cv.rect(13, 25 + bob, 18, 28 + bob, hexc("#594630"))
            cv.hline(13, 18, 25 + bob, hexc("#7a5f3d"))
        else:
            cv.rect(12, 24 + bob, 15, 27 + bob, C["top2"], pid=torso); cv.vline(18, 19 + bob, 30 + bob, hexc("#3b2f22"))
    if kind == "thug":
        if d == 0:
            cv.rect(13, 19 + bob, 18, 21 + bob, skin, pid=torso)                          # 背心領口
            cv.hline(12, 19, 22 + bob, shade(C["top"], .7))
            cv.dot(11, 27 + bob, hexc("#7a1f1a")); cv.dot(20, 27 + bob, hexc("#7a1f1a"))
        elif d == 1:
            cv.hline(10, 21, 22 + bob, shade(C["top"], .7))
        cv.dot(16 if d != 2 else 15, 31 + bob, hexc("#d6c27a"))
    if kind == "torch":
        if d == 0:
            cv.rect(14, 20 + bob, 17, 30 + bob, hexc("#d8d2c4"), pid=torso)                # 胸前反光條
            cv.hline(10, 21, 26 + bob, hexc("#e9e24a"))
        elif d == 1:
            cv.round_rect(11, 20 + bob, 20, 31 + bob, hexc("#7c7e86"), r=3)              # 乙炔瓶
            cv.vline(13, 21 + bob, 30 + bob, hexc("#a2a5ad")); cv.rect(14, 18 + bob, 17, 20 + bob, hexc("#3a3a40"))
            cv.hline(10, 21, 26 + bob, hexc("#e9e24a"))
        else:
            cv.hline(11, 20, 26 + bob, hexc("#e9e24a"))
    if kind == "zhiqing":
        if d == 0:
            cv.rect(14, 19 + bob, 17, 22 + bob, shade(C["top"], 1.2), pid=torso)          # 襯衫領
            cv.vline(15, 23 + bob, 30 + bob, shade(C["top"], .75)); cv.vline(16, 23 + bob, 30 + bob, shade(C["top"], .75))
        cv.rect(tx0, 22 + bob, tx0 + 2, 24 + bob, hexc("#d8d2c4"), pid=torso)            # 臂章
        cv.dot(tx0 + 1, 23 + bob, hexc("#c0392b"))
    # ---------------- 手臂
    swing = {0: 0, 1: 2, 2: -2}[f]
    if not side:
        aL = cv.round_rect(6, 20 + bob, 9, 30 + bob + (swing if swing > 0 else 0), C["top2"], r=1)
        aR = cv.round_rect(22, 20 + bob, 25, 30 + bob + (-swing if swing < 0 else 0), C["top2"], r=1)
        hy1 = 31 + bob + max(0, swing); hy2 = 31 + bob + max(0, -swing)
        if kind == "thug":   # 背心：手臂露肉＋刺青
            cv.round_rect(6, 22 + bob, 9, 30 + bob + max(0, swing), skin, pid=aL)
            cv.round_rect(22, 22 + bob, 25, 30 + bob + max(0, -swing), skin, pid=aR)
            cv.dot(7, 25 + bob, hexc("#2f4a6a")); cv.dot(8, 26 + bob, hexc("#2f4a6a")); cv.dot(23, 24 + bob, hexc("#2f4a6a"))
        cv.round_rect(6, hy1, 9, hy1 + 2, skin, r=1)
        cv.round_rect(22, hy2, 25, hy2 + 2, skin, r=1)
        if kind == "player" and d == 0:
            cv.rect(6, 26 + bob, 9, 27 + bob, hexc("#d9d2c2"))                          # 手臂繃帶
    else:
        sw = {0: 0, 1: 3, 2: -3}[f]
        arm = cv.round_rect(14 + sw // 2, 20 + bob, 17 + sw // 2, 30 + bob, C["top2"], r=1)
        if kind == "thug":
            cv.round_rect(14 + sw // 2, 22 + bob, 17 + sw // 2, 30 + bob, skin, pid=arm)
        cv.round_rect(14 + sw // 2, 31 + bob, 17 + sw // 2, 33 + bob, skin, r=1)
    # ---------------- 武器（敵人）
    if kind == "thug" and d != 1:
        bx = 25 if not side else 15 + (sw // 2 if side else 0)
        by = 31 + bob
        cv.rect(bx, by - 9, bx + 1, by + 2, hexc("#8a6a44"))                                # 球棒
        cv.dot(bx, by - 9, hexc("#b08a5a"))
    if kind == "torch" and d != 1:
        bx = 25 if not side else 15
        cv.rect(bx, 26 + bob, bx + 1, 33 + bob, hexc("#5b5e66"))                            # 乙炔槍
        cv.rect(bx - 1, 24 + bob, bx + 2, 25 + bob, hexc("#3a3a40"))
    # ---------------- 頭
    hy = 5 + bob
    neck = cv.rect(14, 17 + bob, 17, 19 + bob, shade(skin, .85))
    head = cv.ellipse(10, hy, 21, hy + 12, skin)
    hair = C["hair"]
    if d == 0:
        cv.ellipse(9, hy - 1, 22, hy + 6, hair)                                              # 瀏海與頭頂
        cv.rect(10, hy + 3, 21, hy + 4, skin, pid=head)
        cv.rect(11, hy + 4, 20, hy + 11, skin, pid=head)
        cv.rect(9, hy + 3, 10, hy + 8, hair); cv.rect(21, hy + 3, 22, hy + 8, hair)
        # 臉：眉、眼（含高光）、鼻影、嘴
        cv.hline(12, 14, hy + 5, shade(hair, 1.0)); cv.hline(17, 19, hy + 5, shade(hair, 1.0))
        for ex in (13, 18):
            cv.dot(ex, hy + 7, hexc("#1a1416")); cv.dot(ex, hy + 8, hexc("#1a1416")); cv.dot(ex + 1, hy + 7, hexc("#f1ece4"))
        cv.dot(15, hy + 9, shade(skin, .8)); cv.hline(15, 16, hy + 10, shade(skin, .62))
        if kind == "thug":
            cv.hline(9, 22, hy + 2, hexc("#b0302a")); cv.hline(9, 22, hy + 3, hexc("#8a2320"))     # 紅頭巾
            cv.hline(13, 18, hy + 11, shade(hair, 1.4))                                           # 鬍渣
        if kind == "zhiqing":
            cv.dot(9, hy + 8, hexc("#e0457b")); cv.dot(22, hy + 8, hexc("#46b0e0"))                # 耳環
        if kind == "player":
            cv.dot(19, hy + 9, hexc("#a8504a"))                                                   # 臉頰擦傷
    elif d == 1:
        cv.ellipse(9, hy - 1, 22, hy + 11, hair)
        cv.hline(11, 20, hy + 2, shade(hair, 1.6)); cv.hline(12, 18, hy + 5, shade(hair, 1.35))
        if kind == "thug":
            cv.hline(9, 22, hy + 2, hexc("#b0302a")); cv.hline(9, 22, hy + 3, hexc("#8a2320"))
            cv.rect(15, hy + 3, 16, hy + 6, hexc("#b0302a"))                                       # 頭巾結
        if kind == "zhiqing":
            cv.round_rect(14, hy + 9, 17, hy + 16, hair, r=1)                                       # 馬尾
    else:
        cv.ellipse(10, hy - 1, 22, hy + 7, hair)
        cv.rect(17, hy + 3, 22, hy + 10, hair)
        cv.rect(10, hy + 4, 16, hy + 11, skin, pid=head)
        cv.hline(11, 13, hy + 5, hair)
        cv.dot(12, hy + 7, hexc("#1a1416")); cv.dot(12, hy + 8, hexc("#1a1416")); cv.dot(11, hy + 7, hexc("#f1ece4"))
        cv.dot(9, hy + 8, skin); cv.dot(9, hy + 9, shade(skin, .9))                                 # 鼻
        cv.hline(11, 12, hy + 10, shade(skin, .62))
        cv.dot(18, hy + 7, shade(skin, .9)); cv.dot(18, hy + 8, shade(skin, .8))                    # 耳
        if kind == "thug":
            cv.hline(10, 22, hy + 2, hexc("#b0302a")); cv.hline(10, 22, hy + 3, hexc("#8a2320")); cv.rect(22, hy + 3, 23, hy + 6, hexc("#b0302a"))
        if kind == "zhiqing":
            cv.round_rect(21, hy + 5, 24, hy + 12, hair, r=1); cv.dot(18, hy + 9, hexc("#e0457b"))
    if kind == "torch":
        hat = hexc("#e6e0d2")
        cv.ellipse(8, hy - 2, 23, hy + 4, hat)                                                       # 工地帽
        cv.hline(8, 23, hy + 4, shade(hat, .75))
        cv.hline(13, 18, hy - 1, hexc("#f2b33d"))
        if d == 0:
            cv.rect(11, hy + 6, 20, hy + 8, hexc("#2b2f36")); cv.dot(13, hy + 7, hexc("#6fd0e0")); cv.dot(18, hy + 7, hexc("#6fd0e0"))   # 護目鏡
        elif d == 2:
            cv.rect(10, hy + 6, 14, hy + 8, hexc("#2b2f36")); cv.dot(11, hy + 7, hexc("#6fd0e0"))
    return cv.render(mirror=False)

def build_sheet(kind):
    sheet = Image.new("RGBA", (CW * 3, CH * 4), (0, 0, 0, 0))
    for row, d in enumerate((0, 1, 2, 3)):
        for f in range(3):
            if d == 3:
                im = draw_character(kind, 2, f).transpose(Image.FLIP_LEFT_RIGHT)
            else:
                im = draw_character(kind, d, f)
            sheet.paste(im, (f * CW, row * CH))
    sheet.save(os.path.join(ART, f"char_{kind}.png"))

for k in ("player", "thug", "torch", "zhiqing"):
    build_sheet(k)

# ====================================================================== 材質工具
def value_noise(size, cells, seed, octaves=3):
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), dtype=np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = cells * (2 ** o)
        g = rng.random((n, n)).astype(np.float32)
        ys = np.linspace(0, n, size, endpoint=False); xs = ys
        y0 = np.floor(ys).astype(int); x0 = y0.copy()
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % n; x1 = (x0 + 1) % n; y0 %= n; x0 %= n
        a = g[y0][:, x0]; b = g[y0][:, x1]; c = g[y1][:, x0]; d = g[y1][:, x1]
        v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
        out += v * amp; tot += amp; amp *= 0.5
    return out / tot

def tex(base, size, seed, var=14, cells=4, grain=6):
    n = value_noise(size, cells, seed)
    rng = np.random.default_rng(seed + 99)
    g = rng.integers(-grain, grain + 1, (size, size)).astype(np.float32)
    rgb = np.asarray(base, dtype=np.float32)[None, None, :] + ((n - .5) * 2 * var + g)[:, :, None]
    return rgb

def img_rgb(rgb):
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

def crack(d, rng, x, y, steps, col, w=1):
    pts = [(x, y)]
    ang = rng.uniform(0, math.tau)
    for _ in range(steps):
        ang += rng.uniform(-.7, .7); x += math.cos(ang) * rng.uniform(2, 4); y += math.sin(ang) * rng.uniform(2, 4)
        pts.append((x, y))
    d.line(pts, fill=col, width=w)

# ====================================================================== 地磚圖集（32px，8 欄 x 2 列）
S = 32
atlas = Image.new("RGBA", (S * 8, S * 3), (0, 0, 0, 0))
def put(i, im): atlas.paste(im, ((i % 8) * S, (i // 8) * S))
rng = random.Random(5)

# 0 室內水泥地
t = img_rgb(tex((80, 77, 74), S, 1, var=10)); d = ImageDraw.Draw(t)
d.line([(0, S - 1), (S - 1, S - 1)], fill=(56, 54, 52, 255)); d.line([(S - 1, 0), (S - 1, S - 1)], fill=(60, 58, 56, 255))
d.line([(0, 0), (S - 1, 0)], fill=(98, 95, 91, 255))
for _ in range(5):
    x, y = rng.randint(2, 29), rng.randint(2, 29); d.point((x, y), fill=(100, 96, 92, 255))
put(0, t)
# 1 龜裂水泥地
t = img_rgb(tex((76, 73, 71), S, 2, var=11)); d = ImageDraw.Draw(t)
crack(d, rng, 6, 4, 9, (42, 40, 40, 255)); crack(d, rng, 20, 18, 6, (46, 44, 44, 255))
d.line([(0, S - 1), (S - 1, S - 1)], fill=(56, 54, 52, 255)); d.line([(S - 1, 0), (S - 1, S - 1)], fill=(60, 58, 56, 255))
for _ in range(4):
    x, y = rng.randint(3, 28), rng.randint(3, 28); d.rectangle([x, y, x + 1, y + 1], fill=(104, 100, 96, 255))
put(1, t)
# 2/3 超商磁磚（亮面、溝縫、反光、污漬）
for idx, base, sd in ((2, (156, 156, 150), 3), (3, (112, 113, 108), 4)):
    t = img_rgb(tex(base, S, sd, var=5, grain=3)); d = ImageDraw.Draw(t)
    b = np.array(base)
    d.line([(0, 0), (S - 1, 0)], fill=tuple((b + 30).clip(0, 255).astype(int)) + (255,))
    d.line([(0, 0), (0, S - 1)], fill=tuple((b + 16).clip(0, 255).astype(int)) + (255,))
    d.line([(0, S - 1), (S - 1, S - 1)], fill=tuple((b - 48).clip(0, 255).astype(int)) + (255,))
    d.line([(S - 1, 0), (S - 1, S - 1)], fill=tuple((b - 40).clip(0, 255).astype(int)) + (255,))
    d.line([(4, 22), (12, 14)], fill=tuple((b + 22).clip(0, 255).astype(int)) + (255,))
    d.line([(6, 24), (14, 16)], fill=tuple((b + 12).clip(0, 255).astype(int)) + (255,))
    if idx == 3:
        d.ellipse([16, 18, 26, 25], fill=tuple((b - 22).clip(0, 255).astype(int)) + (200,))
    put(idx, t)
# 4 冷凍庫：防滑花紋鋼板
t = img_rgb(tex((120, 146, 162), S, 5, var=6, grain=3)); d = ImageDraw.Draw(t)
for yy in range(2, S, 8):
    for xx in range(2 + (yy // 8 % 2) * 4, S, 8):
        d.line([(xx, yy + 3), (xx + 3, yy)], fill=(168, 194, 208, 255)); d.line([(xx + 1, yy + 4), (xx + 4, yy + 1)], fill=(88, 110, 124, 255))
for _ in range(10):
    x, y = rng.randint(0, 31), rng.randint(0, 31); d.point((x, y), fill=(225, 240, 248, 255))
d.line([(0, S - 1), (S - 1, S - 1)], fill=(80, 100, 112, 255))
put(4, t)
# 5 木地板
t = img_rgb(tex((104, 76, 56), S, 6, var=8, cells=2)); d = ImageDraw.Draw(t)
for i, yy in enumerate(range(0, S, 8)):
    d.line([(0, yy), (S - 1, yy)], fill=(56, 40, 30, 255)); d.line([(0, yy + 1), (S - 1, yy + 1)], fill=(128, 96, 72, 255))
    jx = (i * 13 + 7) % S
    d.line([(jx, yy), (jx, yy + 7)], fill=(56, 40, 30, 255))
    for g in range(3):
        gy = yy + 3 + g; d.line([(rng.randint(0, 10), gy), (rng.randint(14, 31), gy)], fill=(92, 66, 48, 160))
    d.point((jx + 2, yy + 4), fill=(40, 34, 30, 255))
put(5, t)
# 6/7 柏油路
for idx, sd in ((6, 61), (7, 64)):
    t = img_rgb(tex((48, 47, 50), S, sd, var=7, grain=8)); d = ImageDraw.Draw(t)
    for _ in range(26):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        d.point((x, y), fill=rng.choice([(76, 74, 78, 255), (30, 29, 32, 255), (90, 86, 82, 255)]))
    if idx == 7:
        crack(d, rng, 2, 14, 10, (24, 23, 26, 255), 1)
        d.point((14, 15), fill=(84, 110, 60, 255)); d.point((15, 14), fill=(96, 124, 66, 255))
    put(idx, t)
# 8 牆頂（水泥壓頂，邊緣受光）
t = img_rgb(tex((122, 113, 104), S, 8, var=8)); d = ImageDraw.Draw(t)
d.line([(0, 0), (S - 1, 0)], fill=(170, 160, 148, 255)); d.line([(0, 1), (S - 1, 1)], fill=(148, 138, 128, 255))
d.line([(0, S - 1), (S - 1, S - 1)], fill=(78, 70, 64, 255)); d.line([(0, S - 2), (S - 1, S - 2)], fill=(92, 84, 78, 255))
for _ in range(6):
    x, y = rng.randint(2, 29), rng.randint(3, 28); d.point((x, y), fill=(96, 88, 82, 255))
crack(d, rng, 10, 12, 4, (90, 82, 76, 255))
put(8, t)
# 9 牆面（灰泥剝落露出紅磚、髒污由下往上）
t = img_rgb(tex((150, 140, 126), S, 9, var=9)); d = ImageDraw.Draw(t)
d.polygon([(4, 6), (16, 4), (22, 12), (14, 20), (5, 16)], fill=(124, 72, 58, 255))
for yy in range(4, 22, 4):
    d.line([(4, yy), (22, yy)], fill=(92, 56, 46, 255))
    for xx in range(4 + (yy // 4 % 2) * 4, 22, 8):
        d.line([(xx, yy), (xx, yy + 3)], fill=(92, 56, 46, 255))
d.line([(4, 6), (16, 4), (22, 12), (14, 20), (5, 16), (4, 6)], fill=(108, 100, 90, 255))
arr = np.array(t).astype(np.float32)
for yy in range(S):
    arr[yy, :, :3] *= (1.0 - (yy / S) ** 1.5 * 0.45)
for xx in range(0, S, 7):
    arr[10:, xx, :3] *= 0.85                                                            # 雨痕
t = Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")
put(9, t)
# 10 碎玻璃
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
for _ in range(16):
    x, y = rng.randint(1, 29), rng.randint(1, 29); s = rng.randint(1, 3)
    pts = [(x, y), (x + s + 1, y + rng.randint(0, 2)), (x + rng.randint(0, s), y + s + 1)]
    d.polygon(pts, fill=rng.choice([(190, 230, 240, 220), (150, 200, 215, 190), (225, 245, 250, 235)]), outline=(90, 120, 130, 200))
    d.point((x + 1, y), fill=(255, 255, 255, 255))
put(10, g)
# 11 雜草
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
for _ in range(14):
    bx = rng.randint(6, 25); h = rng.randint(5, 12); lean = rng.randint(-3, 3)
    d.line([(bx, 28), (bx + lean, 28 - h)], fill=rng.choice([(70, 92, 52, 255), (92, 118, 62, 255), (110, 132, 70, 255)]))
d.ellipse([7, 26, 25, 30], fill=(40, 46, 30, 120))
put(11, g)
# 12 碎石瓦礫
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
d.ellipse([3, 22, 29, 30], fill=(0, 0, 0, 70))
for _ in range(7):
    x, y = rng.randint(4, 22), rng.randint(12, 22); w, h = rng.randint(3, 7), rng.randint(3, 5)
    c = rng.choice([(110, 104, 96), (92, 86, 80), (128, 120, 110), (122, 74, 58)])
    d.rectangle([x, y, x + w, y + h], fill=c + (255,), outline=(36, 32, 30, 255))
    d.line([(x + 1, y + 1), (x + w - 1, y + 1)], fill=tuple(min(255, v + 40) for v in c) + (255,))
d.line([(6, 10), (16, 16)], fill=(70, 60, 50, 255), width=1); d.point((6, 10), fill=(140, 90, 60, 255))  # 鋼筋
put(12, g)
# 13 油漬
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
d.ellipse([3, 9, 27, 24], fill=(16, 14, 18, 140)); d.ellipse([9, 12, 21, 20], fill=(28, 24, 32, 160))
d.arc([10, 13, 20, 19], 200, 300, fill=(90, 70, 120, 140))
put(13, g)
# 14 積水
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
d.ellipse([2, 8, 29, 25], fill=(56, 80, 98, 130)); d.ellipse([6, 11, 24, 22], fill=(70, 100, 120, 110))
d.arc([7, 11, 22, 20], 200, 330, fill=(170, 205, 220, 190))
put(14, g)
# 15 紙屑垃圾
g = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
d.polygon([(5, 19), (15, 15), (19, 23), (9, 27)], fill=(210, 203, 186, 255), outline=(70, 64, 56, 255))
d.line([(8, 21), (15, 18)], fill=(150, 140, 126, 255)); d.line([(9, 23), (16, 20)], fill=(150, 140, 126, 255))
d.polygon([(18, 7), (26, 9), (24, 15), (17, 13)], fill=(186, 180, 164, 255), outline=(70, 64, 56, 255))
d.ellipse([22, 20, 28, 25], fill=(180, 40, 36, 255), outline=(60, 20, 18, 255))  # 壓扁鋁罐
put(15, g)
# 16/17/18 牆面變化（素面灰泥／剝落紅磚／水漬），避免整排重複
def wall_front(seed, brick=False, stain=False):
    r = random.Random(seed)
    t = img_rgb(tex((150, 140, 126), S, seed, var=9)); d = ImageDraw.Draw(t)
    if brick:
        x0 = r.randint(2, 12); y0 = r.randint(3, 8)
        poly = [(x0, y0), (x0 + 12, y0 - 2), (x0 + 17, y0 + 7), (x0 + 9, y0 + 14), (x0 + 1, y0 + 10)]
        d.polygon(poly, fill=(124, 72, 58, 255))
        for yy in range(y0, y0 + 14, 4):
            d.line([(x0, yy), (x0 + 17, yy)], fill=(92, 56, 46, 255))
            for xx in range(x0 + (yy // 4 % 2) * 4, x0 + 17, 8):
                d.line([(xx, yy), (xx, yy + 3)], fill=(92, 56, 46, 255))
        d.line(poly + [poly[0]], fill=(108, 100, 90, 255))
    for _ in range(r.randint(0, 2)):
        crack(d, r, r.randint(4, 28), r.randint(2, 12), r.randint(2, 5), (104, 96, 86, 255))
    arr = np.array(t).astype(np.float32)
    for yy in range(S):
        arr[yy, :, :3] *= (1.0 - (yy / S) ** 1.5 * 0.45)
    if stain:
        sx = r.randint(4, 24)
        arr[4:, sx:sx + 4, :3] *= 0.78
        arr[2:6, sx - 2:sx + 6, :3] *= 0.85
    for xx in range(r.randint(0, 6), S, r.randint(6, 11)):
        arr[12:, xx, :3] *= 0.88
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")
put(16, wall_front(901)); put(17, wall_front(902, brick=True)); put(18, wall_front(903, stain=True))
# 19/20 室內水泥地變化
for idx, sd in ((19, 41), (20, 42)):
    r = random.Random(sd)
    t = img_rgb(tex((80, 77, 74), S, sd, var=10)); d = ImageDraw.Draw(t)
    d.line([(0, S - 1), (S - 1, S - 1)], fill=(56, 54, 52, 255)); d.line([(S - 1, 0), (S - 1, S - 1)], fill=(60, 58, 56, 255))
    d.line([(0, 0), (S - 1, 0)], fill=(98, 95, 91, 255))
    if idx == 19:
        x, y = r.randint(4, 18), r.randint(4, 18); d.ellipse([x, y, x + 10, y + 6], fill=(64, 60, 58, 110))
    else:
        for _ in range(3):
            x, y = r.randint(3, 27), r.randint(3, 27); d.rectangle([x, y, x + 1, y + 1], fill=(108, 102, 96, 255))
    put(idx, t)
atlas.save(os.path.join(ART, "tiles.png"))

# ====================================================================== 地面（512x512 可無縫拼接）
G = 512
n1 = value_noise(G, 6, 201, 4); n2 = value_noise(G, 16, 202, 3); n3 = value_noise(G, 3, 203, 2)
base = np.array([92, 78, 66], dtype=np.float32)
rgb = base[None, None, :] + ((n1 - .5) * 34)[:, :, None]
rgb += ((n2 - .5) * 16)[:, :, None]
grass = np.clip((n3 - .58) * 5, 0, 1)                                                    # 零星草地
rgb = rgb * (1 - grass[:, :, None] * .6) + np.array([66, 82, 50])[None, None, :] * grass[:, :, None] * .6
ash = np.clip((n2 - .7) * 4, 0, 1)                                                        # 焦黑灰燼
rgb *= (1 - ash * .35)[:, :, None]
r2 = np.random.default_rng(204)
rgb += r2.integers(-7, 8, (G, G))[:, :, None]
img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA"); d = ImageDraw.Draw(img)
for _ in range(900):                                                                      # 小石子
    x, y = rng.randint(0, G - 3), rng.randint(0, G - 3)
    c = rng.choice([(128, 118, 106), (70, 62, 56), (140, 132, 120), (110, 80, 64)])
    d.rectangle([x, y, x + rng.randint(0, 2), y + rng.randint(0, 1)], fill=c + (255,))
for _ in range(40):
    x, y = rng.randint(20, G - 20), rng.randint(20, G - 20); crack(d, rng, x, y, rng.randint(3, 7), (52, 44, 38, 255))
img.save(os.path.join(ART, "ground.png"))

# ====================================================================== 道具（2 倍，世界尺寸 = 格數 x16，正面多 4px）
def outline_box(d, box, col):
    d.rectangle(box, outline=col)

# 貨架（橫）：左端、中段、右端，各 32 寬；高 32＋8（正面）
sh = Image.new("RGBA", (96, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
goods = [(206, 92, 70), (88, 156, 140), (226, 192, 84), (128, 104, 178), (220, 220, 210), (70, 120, 190)]
d.rectangle([0, 32, 95, 39], fill=(54, 42, 32, 255))                                      # 正面
d.rectangle([0, 0, 95, 31], fill=(98, 78, 58, 255))
d.rectangle([0, 0, 95, 2], fill=(150, 124, 94, 255))
for row, yy in enumerate((5, 18)):
    d.rectangle([2, yy + 10, 93, yy + 11], fill=(64, 50, 38, 255))                         # 層板
    x = 3
    while x < 92:
        w = rng.randint(4, 7); h = rng.randint(6, 9); c = rng.choice(goods)
        d.rectangle([x, yy + 10 - h, x + w - 1, yy + 9], fill=c + (255,), outline=(30, 24, 22, 255))
        d.line([(x + 1, yy + 11 - h), (x + w - 2, yy + 11 - h)], fill=tuple(min(255, v + 50) for v in c) + (255,))
        if rng.random() < .3:
            d.rectangle([x + 1, yy + 13 - h, x + w - 2, yy + 14 - h], fill=(240, 240, 230, 255))   # 標籤
        x += w + 1
for xx in (0, 31, 32, 63, 64, 95):
    pass
d.rectangle([0, 0, 2, 39], fill=(120, 98, 74, 255)); d.rectangle([93, 0, 95, 39], fill=(76, 60, 46, 255))
d.rectangle([0, 0, 95, 39], outline=(26, 20, 16, 255))
sh.save(os.path.join(ART, "prop_shelf_h.png"))
# 貨架（直）：上端、中段、下端，寬 32；高 32 每段＋最下面 8 正面
sv = Image.new("RGBA", (32, 104), (0, 0, 0, 0)); d = ImageDraw.Draw(sv)
d.rectangle([0, 0, 31, 95], fill=(98, 78, 58, 255)); d.rectangle([0, 96, 31, 103], fill=(54, 42, 32, 255))
d.rectangle([0, 0, 2, 103], fill=(140, 116, 88, 255)); d.rectangle([29, 0, 31, 103], fill=(70, 56, 42, 255))
y = 3
while y < 92:
    h = rng.randint(4, 6); c = rng.choice(goods)
    d.rectangle([5, y, 26, y + h - 1], fill=c + (255,), outline=(30, 24, 22, 255)); d.line([(6, y + 1), (25, y + 1)], fill=tuple(min(255, v + 50) for v in c) + (255,))
    y += h + 1
d.rectangle([0, 0, 31, 103], outline=(26, 20, 16, 255))
sv.save(os.path.join(ART, "prop_shelf_v.png"))
# 木箱（每格 32x36）
cr = Image.new("RGBA", (32, 36), (0, 0, 0, 0)); d = ImageDraw.Draw(cr)
d.rectangle([0, 30, 31, 35], fill=(70, 54, 34, 255))
d.rectangle([0, 0, 31, 29], fill=(132, 104, 66, 255))
for yy in range(0, 30, 6):
    d.line([(1, yy), (30, yy)], fill=(96, 74, 46, 255)); d.line([(1, yy + 1), (30, yy + 1)], fill=(156, 126, 84, 255))
d.rectangle([0, 0, 31, 3], fill=(170, 138, 92, 255)); d.rectangle([0, 0, 3, 29], fill=(150, 120, 80, 255)); d.rectangle([28, 0, 31, 29], fill=(104, 80, 52, 255))
d.line([(4, 26), (27, 4)], fill=(104, 80, 50, 255), width=3); d.line([(5, 26), (28, 4)], fill=(150, 120, 80, 255))
for (x, y) in ((2, 2), (29, 2), (2, 27), (29, 27)):
    d.point((x, y), fill=(60, 60, 64, 255))
d.text((9, 12), "", fill=(60, 44, 30, 255))
d.rectangle([0, 0, 31, 35], outline=(30, 22, 14, 255))
cr.save(os.path.join(ART, "prop_crate.png"))
# 廢棄車（橫 96x72；直 64x104）
def car(w, h, horiz, seed):
    r = random.Random(seed)
    im = Image.new("RGBA", (w, h + 8), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    body = (122, 84, 70)
    d.rounded_rectangle([1, 4, w - 2, h + 6], 6, fill=(22, 20, 20, 255))                    # 車底陰影＋輪胎
    for (x, y) in ([(6, h - 4), (w - 20, h - 4), (6, 0), (w - 20, 0)] if horiz else [(0, 10), (w - 8, 10), (0, h - 26), (w - 8, h - 26)]):
        d.rectangle([x, y, x + (14 if horiz else 7), y + (7 if horiz else 16)], fill=(26, 24, 24, 255))
    d.rounded_rectangle([2, 2, w - 3, h - 1], 7, fill=body + (255,), outline=(40, 24, 20, 255))
    if horiz:
        d.rounded_rectangle([w * .28, 6, w * .7, h - 6], 4, fill=(50, 62, 72, 255), outline=(30, 24, 22, 255))   # 車頂玻璃
        d.line([(w * .3, 8), (w * .45, 8)], fill=(150, 180, 196, 255))
        d.rectangle([w * .28 + 4, 10, w * .7 - 4, h - 10], fill=(96, 70, 60, 255))                             # 車頂
        d.rectangle([4, 10, 9, h - 10], fill=(200, 196, 170, 255)); d.rectangle([w - 9, 10, w - 5, h - 10], fill=(130, 40, 36, 255))
    else:
        d.rounded_rectangle([6, h * .28, w - 7, h * .7], 4, fill=(50, 62, 72, 255), outline=(30, 24, 22, 255))
        d.line([(8, h * .3), (8, h * .45)], fill=(150, 180, 196, 255))
        d.rectangle([10, h * .28 + 4, w - 11, h * .7 - 4], fill=(96, 70, 60, 255))
        d.rectangle([10, 4, w - 11, 8], fill=(200, 196, 170, 255)); d.rectangle([10, h - 8, w - 11, h - 5], fill=(130, 40, 36, 255))
    d.line([(4, 3), (w - 5, 3)], fill=(176, 130, 110, 255))
    for _ in range(26):                                                                                             # 鏽斑
        x, y = r.randint(4, w - 6), r.randint(4, h - 6); s = r.randint(1, 3)
        d.ellipse([x, y, x + s, y + s], fill=r.choice([(150, 78, 40), (110, 58, 32), (90, 64, 50)]) + (255,))
    for _ in range(4):                                                                                              # 彈孔
        x, y = r.randint(6, w - 8), r.randint(6, h - 8); d.point((x, y), fill=(10, 10, 10, 255)); d.point((x + 1, y), fill=(200, 190, 170, 255))
    arr = np.array(im).astype(np.float32); arr[h - 1:, :, :3] *= .6
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")
car(96, 64, True, 31).save(os.path.join(ART, "prop_car_h.png"))
car(64, 96, False, 32).save(os.path.join(ART, "prop_car_v.png"))
# 加油機（32x72）
pm = Image.new("RGBA", (32, 72), (0, 0, 0, 0)); d = ImageDraw.Draw(pm)
d.rectangle([2, 64, 29, 71], fill=(70, 22, 20, 255))
d.rectangle([2, 0, 29, 63], fill=(184, 52, 44, 255), outline=(50, 14, 12, 255))
d.rectangle([3, 1, 28, 4], fill=(226, 92, 80, 255))
d.rectangle([6, 8, 25, 24], fill=(214, 214, 204, 255), outline=(60, 60, 60, 255))
d.rectangle([8, 10, 23, 15], fill=(36, 70, 46, 255)); d.text((9, 9), "", fill=(120, 230, 140, 255))
for i in range(3): d.rectangle([9 + i * 5, 18, 12 + i * 5, 21], fill=(60, 60, 64, 255))
d.rectangle([22, 30, 27, 48], fill=(40, 40, 44, 255)); d.line([(24, 48), (20, 58), (14, 60)], fill=(30, 30, 32, 255), width=2)  # 油槍與油管
d.rectangle([6, 52, 25, 60], fill=(240, 200, 60, 255)); d.line([(6, 56), (25, 56)], fill=(40, 40, 40, 255))
pm.save(os.path.join(ART, "prop_pump.png"))

# ====================================================================== 互動圖示（24x24，顯示為 12x12）
def icon(fn, name):
    im = Image.new("RGBA", (24, 24), (0, 0, 0, 0)); d = ImageDraw.Draw(im); fn(d); im.save(os.path.join(ART, f"icon_{name}.png"))
OL = (22, 16, 18, 255)
def _oil(d):
    d.rounded_rectangle([5, 7, 18, 21], 2, fill=(196, 182, 64, 255), outline=OL); d.rectangle([6, 8, 9, 20], fill=(226, 214, 110, 255))
    d.rectangle([9, 2, 13, 7], fill=(150, 150, 150, 255), outline=OL); d.line([(13, 3), (19, 1)], fill=(150, 150, 150, 255), width=2)
    d.rectangle([7, 12, 16, 16], fill=(230, 230, 220, 255)); d.line([(8, 14), (15, 14)], fill=(160, 40, 36, 255))
icon(_oil, "oil")
def _doc(d):
    d.polygon([(4, 3), (17, 3), (20, 6), (20, 21), (4, 21)], fill=(222, 214, 196, 255), outline=OL)
    for y in (7, 10, 13, 16): d.line([(7, y), (17, y)], fill=(120, 112, 100, 255))
    d.polygon([(12, 14), (20, 12), (20, 21), (10, 21)], fill=(40, 30, 26, 255))                                    # 燒焦
    d.line([(12, 14), (20, 12)], fill=(220, 120, 40, 255))
icon(_doc, "doc")
def _glow(d):
    d.ellipse([2, 6, 22, 18], fill=(110, 240, 140, 70)); d.rounded_rectangle([5, 9, 19, 14], 2, fill=(120, 236, 150, 255), outline=OL)
    d.line([(7, 10), (16, 10)], fill=(220, 255, 228, 255))
icon(_glow, "glow")
def _bench(d):
    d.rectangle([2, 12, 21, 20], fill=(116, 92, 70, 255), outline=OL); d.rectangle([3, 13, 20, 14], fill=(150, 122, 92, 255))
    d.polygon([(7, 4), (17, 5), (16, 12), (8, 12)], fill=(226, 218, 200, 255), outline=OL); d.line([(9, 7), (15, 7)], fill=(110, 100, 90, 255)); d.line([(9, 9), (14, 9)], fill=(110, 100, 90, 255))
icon(_bench, "bench")
def _grave(d):
    d.ellipse([1, 15, 22, 23], fill=(78, 62, 46, 255), outline=OL)
    d.rectangle([9, 2, 13, 17], fill=(150, 120, 84, 255), outline=OL); d.rectangle([4, 6, 18, 9], fill=(150, 120, 84, 255), outline=OL)
    d.point((6, 18), fill=(220, 210, 120, 255)); d.point((16, 19), fill=(230, 120, 140, 255))
icon(_grave, "grave")
print("HD art written to", ART)
