class_name ViewRig
extends Node2D
## 正面／斜角／背面的簡化骨架：上半身一塊、兩隻手臂、兩條腿；舉槍時換成 AI 畫的完整舉槍上半身。
## 根節點位於外套下襬中央（胯部）。座標單位為原圖像素。

const DIR := "res://assets/chars/youren_dirs/"

var view := "S"
var anim := "idle"
var t := 0.0
var aim_angle := 0.0
var meta: Dictionary
var body: Node2D
var upper: Node2D
var aim_upper: Node2D
var legL: Node2D
var legR: Node2D
var armL: Node2D
var armR: Node2D

func setup(v: String) -> void:
	view = v
	var all: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DIR + "views.json"))
	meta = all[v]
	var hem := float(meta["hem"])
	var split := float(meta["split"])
	var root := Vector2(split, hem)
	body = Node2D.new()
	add_child(body)
	var threeq: bool = meta["threeq"]
	# 繪製順序：腿 → (3/4 視角時遠側手臂) → 上半身 → 近側手臂
	legL = _piece(v + "_legL", root, Vector2(split - 60, hem))
	legR = _piece(v + "_legR", root, Vector2(split + 60, hem))
	body.add_child(legL)
	body.add_child(legR)
	var shL: Array = meta["shL"]
	var shR: Array = meta["shR"]
	armL = _piece(v + "_armL", root, Vector2(shL[0], shL[1]))
	armR = _piece(v + "_armR", root, Vector2(shR[0], shR[1]))
	if threeq:
		body.add_child(armL)
	upper = _piece(v + "_body", root, root)
	body.add_child(upper)
	if not threeq:
		body.add_child(armL)
	body.add_child(armR)
	# 舉槍上半身：對齊胯部與下襬
	var ac := Vector2(float(meta["aim_crotch"]), float(meta["aim_hem"]))
	aim_upper = _piece(v + "_aim", ac, ac)
	aim_upper.visible = false
	body.add_child(aim_upper)

## 建立一塊零件：貼圖原點對齊 root，節點放在 pivot（相對 root）。
func _piece(tex: String, root: Vector2, pivot: Vector2) -> Node2D:
	var n := Node2D.new()
	n.position = pivot - root
	var s := Sprite2D.new()
	s.texture = load(DIR + tex + ".png")
	s.centered = false
	s.offset = -pivot
	s.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	n.add_child(s)
	n.set_meta("base", n.position)
	return n

func pose(delta: float) -> void:
	t += delta
	var threeq: bool = meta["threeq"]
	var lift_l := 0.0; var lift_r := 0.0; var stride := 0.0
	var bob := 0.0; var arm := 0.0; var breath := 0.0
	var show_aim := false
	match anim:
		"idle":
			breath = sin(t * TAU * 0.45)
			bob = breath * 3.0
		"walk", "run", "aim_walk":
			var run := anim == "run"
			var p := t * TAU * (1.55 if run else 1.0)
			var L := 110.0 if run else 70.0
			lift_l = maxf(0.0, sin(p)) * L
			lift_r = maxf(0.0, -sin(p)) * L
			stride = sin(p) * (34.0 if run else 20.0)
			bob = -absf(cos(p)) * (14.0 if run else 8.0) + (7.0 if run else 4.0)
			arm = sin(p) * (0.22 if run else 0.12)
			show_aim = anim == "aim_walk"
		"aim":
			show_aim = true
			breath = sin(t * TAU * 0.45)
			bob = breath * 2.0
	body.position = Vector2(0, bob)
	# 抬起的腿：往上收、略縮短（透視上的抬腿）；斜角視角另加前後跨步的位移
	var sx := -1.0 if view in ["SW", "NW"] else 0.0
	legL.position = legL.get_meta("base") + Vector2(sx * stride, -lift_l * 0.55)
	legR.position = legR.get_meta("base") + Vector2(-sx * stride, -lift_r * 0.55)
	legL.scale = Vector2(1.0, 1.0 - lift_l / 900.0)
	legR.scale = Vector2(1.0, 1.0 - lift_r / 900.0)
	armL.rotation = arm
	armR.rotation = -arm
	upper.scale = Vector2(1.0, 1.0 + 0.006 * breath)
	upper.visible = not show_aim
	armL.visible = not show_aim
	armR.visible = not show_aim
	aim_upper.visible = show_aim
	if show_aim:
		aim_upper.rotation = aim_angle * 0.25
