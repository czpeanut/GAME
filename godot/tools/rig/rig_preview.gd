extends Node2D
## 骨架角色動作預覽：依序播放各動作，供評估用（可用 --write-movie 輸出影片）。

const SEQ := [
	["idle", 2.2, "待機（呼吸）"],
	["walk", 3.0, "走路"],
	["run", 2.4, "奔跑"],
	["aim", 3.0, "舉槍瞄準（上下調整角度）"],
	["aim_walk", 3.0, "舉槍移動（Helldivers 式慢走）"],
	["roll", 1.2, "翻滾閃避"],
]
var big: SideRig
var small: SideRig
var label: Label
var idx := 0
var seg_t := 0.0
var ref: Sprite2D
var font: Font

func _ready() -> void:
	scale = Vector2(0.5, 0.5)   # 專案基準解析度為 640x360，這裡用 1280x720 座標排版
	RenderingServer.set_default_clear_color(Color(0.11, 0.11, 0.13))
	font = SystemFont.new()
	(font as SystemFont).font_names = PackedStringArray(["Noto Sans CJK TC", "Noto Sans CJK SC", "WenQuanYi Zen Hei", "sans-serif"])
	# 參考：AI 三視圖（側面）
	ref = Sprite2D.new()
	ref.texture = load("res://assets/chars/youren_turnaround.png")
	ref.region_enabled = true
	ref.region_rect = Rect2(1900, 30, 700, 1400)
	ref.scale = Vector2(0.24, 0.24)
	ref.position = Vector2(1100, 270)
	ref.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	add_child(ref)
	big = SideRig.new()
	big.scale = Vector2(0.3, 0.3)
	big.position = Vector2(470, 380)
	add_child(big)
	# 遊戲內大小（約 73 螢幕像素高）放在地面上
	var g := Sprite2D.new()
	g.texture = load("res://assets/art/ground.png")
	g.region_enabled = true
	g.region_rect = Rect2(0, 0, 360, 180)
	g.centered = false
	g.position = Vector2(820, 520)
	g.scale = Vector2(1.0, 1.0)
	add_child(g)
	small = SideRig.new()
	small.scale = Vector2(0.042, 0.042)
	small.position = Vector2(1000, 600)
	add_child(small)
	label = Label.new()
	label.position = Vector2(40, 30)
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", 34)
	add_child(label)

func _process(delta: float) -> void:
	seg_t += delta
	var cur: Array = SEQ[idx]
	if seg_t > float(cur[1]):
		seg_t = 0.0
		idx = (idx + 1) % SEQ.size()
		cur = SEQ[idx]
		big.t = 0.0
		small.t = 0.0
	for r in [big, small]:
		r.anim = cur[0]
		r.aim_angle = deg_to_rad(14.0) * sin(seg_t * 2.2) if cur[0] == "aim" else 0.0
		r.pose(delta)
	label.text = "陳佑任｜骨架動畫測試（Gemini 生成零件）\n動作：" + String(cur[2])
	queue_redraw()

func _draw() -> void:
	draw_line(Vector2(80, 380 + 860 * 0.3), Vector2(780, 380 + 860 * 0.3), Color(1, 1, 1, 0.15), 2.0)
	draw_string(font, Vector2(990, 70), "AI 三視圖（側面參考）", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(0.8, 0.8, 0.8))
	draw_string(font, Vector2(840, 510), "遊戲內大小", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(0.8, 0.8, 0.8))
