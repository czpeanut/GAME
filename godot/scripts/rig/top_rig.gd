class_name TopRig
extends Node2D
## 俯視角骨架：外觀來自 Gemini 畫的俯視角站姿，動作由程式連續驅動（流暢、可任意格數）。
## 視角：S、SE、NW、N 用「上半身＋兩臂＋兩腿」；E 用「上半身＋近側手臂＋側面骨架的膝關節雙腿」。
## 根節點位於腳底中央。座標單位為原圖像素。

const DIR := "res://assets/chars/youren_td/"
const SIDE := "res://assets/chars/youren_side/"

var view := "S"
var anim := "idle"
var t := 0.0
var meta: Dictionary
var body: Node2D
var upper: Node2D
var legL: Node2D
var legR: Node2D
var armL: Node2D
var armR: Node2D
var side_legs := {}       # E 視角：near/far -> {thigh, shin}
var legs_root: Node2D

func _tex_piece(path: String, origin: Vector2, pivot: Vector2) -> Node2D:
	## origin：貼圖中要對齊根節點的點；pivot：此零件的旋轉中心（貼圖座標）
	var n := Node2D.new()
	n.position = pivot - origin
	var s := Sprite2D.new()
	s.texture = load(path)
	s.centered = false
	s.offset = -pivot
	s.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	n.add_child(s)
	n.set_meta("base", n.position)
	return n

func setup(v: String) -> void:
	view = v
	var all: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DIR + "views.json"))
	meta = all[v]
	var H := float(meta["size"][1])
	var hem := float(meta["hem"])
	body = Node2D.new()
	add_child(body)
	if v == "E":
		var origin := Vector2(215, H)
		# 側面骨架的腿（原圖面向左，鏡像成面向右），髖關節藏在外套下襬內
		legs_root = Node2D.new()
		legs_root.position = Vector2(222, hem - 20) - origin
		legs_root.scale = Vector2(-0.86, 0.8)
		body.add_child(legs_root)
		side_legs["far"] = _side_leg("far", Color(0.75, 0.75, 0.78), Vector2(-14, 0))
		side_legs["near"] = _side_leg("near", Color.WHITE, Vector2(10, 0))
		var shf: Array = meta["shF"]
		armL = _tex_piece(DIR + "E_armF.png", origin, Vector2(shf[0], shf[1]))   # 遠側手臂（畫在身體後面）
		body.add_child(armL)
		upper = _tex_piece(DIR + "E_body.png", origin, origin)
		body.add_child(upper)
		var sh: Array = meta["shN"]
		armR = _tex_piece(DIR + "E_armN.png", origin, Vector2(sh[0], sh[1]))
		body.add_child(armR)
		return
	var split := float(meta["split"])
	var origin2 := Vector2(split, H)
	legL = _tex_piece(DIR + v + "_legL.png", origin2, Vector2(split - 60, hem))
	legR = _tex_piece(DIR + v + "_legR.png", origin2, Vector2(split + 60, hem))
	body.add_child(legL)
	body.add_child(legR)
	var shL: Array = meta["shL"]
	var shR: Array = meta["shR"]
	armL = _tex_piece(DIR + v + "_armL.png", origin2, Vector2(shL[0], shL[1]))
	armR = _tex_piece(DIR + v + "_armR.png", origin2, Vector2(shR[0], shR[1]))
	var far = meta["far"]
	if far == "L":
		body.add_child(armL)
	if far == "R":
		body.add_child(armR)
	upper = _tex_piece(DIR + v + "_body.png", origin2, origin2)
	body.add_child(upper)
	if far != "L":
		body.add_child(armL)
	if far != "R":
		body.add_child(armR)

func _side_leg(side: String, m: Color, off: Vector2) -> Dictionary:
	var piv := Vector2(107, 40) if side == "near" else Vector2(121, 40)
	var thigh := Node2D.new()
	thigh.position = off
	var ts := Sprite2D.new()
	ts.texture = load(SIDE + "thigh_" + side + ".png")
	ts.centered = false
	ts.offset = -piv
	ts.modulate = m
	ts.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	thigh.add_child(ts)
	var shin := Node2D.new()
	shin.position = Vector2(0, 262 - 40)
	var ss := Sprite2D.new()
	ss.texture = load(SIDE + "shin_" + side + ".png")
	ss.centered = false
	ss.offset = -Vector2(piv.x, 32)
	ss.modulate = m
	ss.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	shin.add_child(ss)
	thigh.add_child(shin)
	legs_root.add_child(thigh)
	return {"thigh": thigh, "shin": shin}

func pose(delta: float) -> void:
	t += delta
	var run := anim == "run"
	var moving := anim == "walk" or anim == "run"
	var p := t * TAU * (1.55 if run else 1.0)
	var breath := sin(t * TAU * 0.45) if anim == "idle" else 0.0
	var pos_l := -cos(p) if moving else 0.0          # 左腿沿前進方向的位置（-1 後、+1 前）
	var lift_l := maxf(0.0, sin(p)) if moving else 0.0
	var lift_r := maxf(0.0, -sin(p)) if moving else 0.0
	var amp := 1.6 if run else 1.0
	var bob := (-absf(cos(p)) * 10.0 * amp + 5.0 * amp) if moving else breath * 3.0
	if view == "E":
		_pose_side(p, moving, run, bob, breath)
		return
	var sv: Array = meta["stride"]
	var fwd := Vector2(sv[0], sv[1])
	var frontal := absf(fwd.x) < 0.1     # 正面／背面
	var sway := sin(p) * 5.0 * amp if (moving and frontal) else 0.0
	body.position = Vector2(sway, bob)
	var L := 60.0 * amp
	var A := 26.0 * amp
	for side in [["L", legL, pos_l, lift_l], ["R", legR, -pos_l, lift_r]]:
		var leg: Node2D = side[1]
		var pos: float = side[2]
		var lift: float = side[3]
		# 前進方向的跨步：水平分量用位移，深度分量（朝鏡頭／遠離鏡頭）用長短變化表現
		var dx := fwd.x * pos * A
		var depth := fwd.y * pos
		leg.position = leg.get_meta("base") + Vector2(dx, -lift * L * 0.5)
		leg.scale = Vector2(1.0, 1.0 + depth * 0.07 * amp - lift * 0.06)
	# 手臂與同側腿反向擺動
	for side in [[armL, -pos_l], [armR, pos_l]]:
		var arm: Node2D = side[0]
		var sw: float = side[1]
		if frontal:
			arm.rotation = 0.0
			arm.position = arm.get_meta("base") + Vector2(0, -sw * fwd.y * 16.0 * amp)
			arm.scale = Vector2(1.0, 1.0 + sw * fwd.y * 0.13 * amp)
		else:
			# 斜角：手臂沿前進方向前後平移，只加一點點旋轉（大角度旋轉會讓手往外甩）
			arm.position = arm.get_meta("base") + fwd.normalized() * sw * 26.0 * amp
			arm.rotation = -sw * signf(fwd.x) * 0.16 * amp
			arm.scale = Vector2(1.0, 1.0 + sw * fwd.y * 0.08 * amp)
	upper.scale = Vector2(1.0, 1.0 + 0.006 * breath)

func _pose_side(p: float, moving: bool, run: bool, bob: float, breath: float) -> void:
	body.position = Vector2(0, bob)
	var A := deg_to_rad(38.0 if run else 26.0)
	var K := deg_to_rad(80.0 if run else 50.0)
	var th_n := A * sin(p) if moving else 0.0
	var kn_n := (-K * pow(maxf(0.0, cos(p)), 1.3) - 0.08) if moving else 0.0
	var kn_f := (-K * pow(maxf(0.0, -cos(p)), 1.3) - 0.08) if moving else 0.0
	side_legs["near"]["thigh"].rotation = th_n
	side_legs["far"]["thigh"].rotation = -th_n
	side_legs["near"]["shin"].rotation = kn_n
	side_legs["far"]["shin"].rotation = kn_f
	# 近側手臂與近側腿反向（面向右：往前擺＝逆時針）
	var swing := (0.5 if not run else 0.8) * sin(p) if moving else 0.03 * breath
	armR.rotation = swing
	armL.rotation = -swing * 0.9
	upper.scale = Vector2(1.0, 1.0 + 0.006 * breath)
	upper.rotation = deg_to_rad(4.0) if run else 0.0
