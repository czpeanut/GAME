class_name FrontRig
extends Node2D
## 正面（S）分解圖骨架：Gemini 畫的獨立零件（含被遮住的部分），手肘與膝蓋可彎。
## 根節點＝兩髖中點。座標單位為原圖像素。

const DIR := "res://assets/chars/youren_parts_S/"
const HIP_L := Vector2(170, 1180)
const HIP_R := Vector2(400, 1180)
const SH_L := Vector2(45, 560)
const SH_R := Vector2(535, 560)
const ROOT := Vector2(285, 1180)
const LEG_SCALE := 0.85

var anim := "idle"
var t := 0.0
var body: Node2D
var torso: Node2D
var leg := {}
var arm := {}

func _spr(tex: String, pivot: Vector2) -> Node2D:
	var n := Node2D.new()
	var s := Sprite2D.new()
	s.texture = load(DIR + tex + ".png")
	s.centered = false
	s.offset = -pivot
	s.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	n.add_child(s)
	return n

func _ready() -> void:
	body = Node2D.new()
	add_child(body)
	# 腿（畫在軀幹後面，褲頭被外套下襬蓋住）
	leg["L"] = _make_leg("L", HIP_L, Vector2(154, 63), Vector2(126, 637), Vector2(131, 63))
	leg["R"] = _make_leg("R", HIP_R, Vector2(126, 63), Vector2(151, 645), Vector2(103, 63))
	# 手臂畫在軀幹後面：肩膀的斷面被軀幹的肩頭蓋住
	arm["L"] = _make_arm("L", SH_L, Vector2(270, 90), Vector2(70, 430), Vector2(103, 63))
	arm["R"] = _make_arm("R", SH_R, Vector2(50, 90), Vector2(245, 420), Vector2(88, 63))
	torso = _spr("torso", ROOT)
	body.add_child(torso)

func _make_leg(s: String, hip: Vector2, piv: Vector2, knee: Vector2, shin_piv: Vector2) -> Dictionary:
	var th := _spr("thigh" + s, piv)
	th.position = hip - ROOT
	th.scale = Vector2(LEG_SCALE, LEG_SCALE)
	body.add_child(th)
	var sh := _spr("shin" + s, shin_piv)
	sh.position = knee - piv
	sh.show_behind_parent = true      # 膝蓋的斷面藏在大腿後面
	th.add_child(sh)
	th.set_meta("base", th.position)
	return {"thigh": th, "shin": sh, "knee": knee - piv}

func _make_arm(s: String, shoulder: Vector2, piv: Vector2, elbow: Vector2, fore_piv: Vector2) -> Dictionary:
	var up := _spr("upper" + s, piv)
	up.position = shoulder - ROOT
	var v := elbow - piv
	var base_rot := Vector2.DOWN.angle() - v.angle()      # 讓肩→肘方向朝正下方
	up.rotation = base_rot
	body.add_child(up)
	var fo := _spr("fore" + s, fore_piv)
	fo.position = v
	fo.rotation = -base_rot
	fo.show_behind_parent = true      # 手肘的斷面藏在上臂後面
	up.add_child(fo)
	up.set_meta("base_rot", base_rot)
	return {"upper": up, "fore": fo}

func pose(delta: float) -> void:
	t += delta
	var run := anim == "run"
	var moving := anim == "walk" or anim == "run"
	var amp := 1.6 if run else 1.0
	var p := t * TAU * (1.55 if run else 1.0)
	var breath := sin(t * TAU * 0.45) if anim == "idle" else 0.0
	var bob := (-absf(cos(p)) * 10.0 + 5.0) * amp if moving else breath * 3.0
	var sway := sin(p) * 6.0 * amp if moving else 0.0
	body.position = Vector2(sway, bob)
	for s in ["L", "R"]:
		var sgn := 1.0 if s == "L" else -1.0
		var lift := maxf(0.0, sgn * sin(p)) if moving else 0.0       # 擺動腿抬起
		var fwd := -sgn * cos(p) if moving else 0.0                  # 腿在前（朝鏡頭）為正
		var th: Node2D = leg[s]["thigh"]
		var sh: Node2D = leg[s]["shin"]
		# 抬腿時大腿朝鏡頭前伸而縮短，膝蓋彎曲讓小腿也縮短；著地的前腳略長
		th.position = th.get_meta("base") + Vector2(0, -lift * 30.0 * amp)
		var ky := 1.0 - 0.22 * lift * amp + 0.04 * maxf(0.0, fwd)
		(th.get_child(0) as Sprite2D).scale = Vector2(1.0, ky)
		sh.position = leg[s]["knee"] * Vector2(1.0, ky)
		(sh.get_child(0) as Sprite2D).scale = Vector2(1.0, 1.0 - 0.28 * lift * amp)
		# 手臂與同側腿反向：往前擺時上臂縮短、手肘彎、前臂縮短
		var afwd := -fwd
		var up: Node2D = arm[s]["upper"]
		var fo: Node2D = arm[s]["fore"]
		var a := maxf(0.0, afwd) * amp
		var b := maxf(0.0, -afwd) * amp
		up.rotation = up.get_meta("base_rot") + sgn * 0.05 * b
		var uy := 1.0 - 0.2 * a + 0.03 * b
		(up.get_child(0) as Sprite2D).scale = Vector2(1.0, uy)
		if not fo.has_meta("v"):
			fo.set_meta("v", fo.position)
		# 上臂貼圖本身是斜的：用「沿肩→肘方向」縮放肘點位置
		var v: Vector2 = fo.get_meta("v")
		fo.position = v * uy
		(fo.get_child(0) as Sprite2D).scale = Vector2(1.0, 1.0 - 0.35 * a)
		if not moving:
			up.rotation = up.get_meta("base_rot") + sgn * 0.02 * breath
	torso.scale = Vector2(1.0, 1.0 + 0.006 * breath)
