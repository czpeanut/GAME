class_name SideRig
extends Node2D
## 骨架角色（側面、面向左）：由 AI 生成的零件組成，動作全部由程式驅動。
## 座標單位為原圖像素；根節點位於髖關節。外部用 scale 縮到遊戲大小。

const DIR := "res://assets/chars/youren_side/"

# 各零件的關節點（零件圖內的像素座標）
const P := {
	"torso_hip": Vector2(200, 470), "torso_neck": Vector2(222, 42), "torso_sh_near": Vector2(228, 120), "torso_sh_far": Vector2(250, 118),
	"head_neck": Vector2(132, 292),
	"thigh_near": Vector2(107, 40), "thigh_far": Vector2(121, 40),
	"knee": 262.0, "shin_top": 32.0,
	"upper": Vector2(76, 38), "elbow": 330.0, "fore_top": 26.0,
	"aim_sh": Vector2(786, 74),
}
const LEG_SCALE := 1.32
const ARM_SCALE := 1.22
const AIM_SCALE := 1.25

var anim := "idle"
var t := 0.0
var aim_angle := 0.0          # 正值＝槍口往上（弧度）
var aiming := false

var torso: Node2D
var head: Node2D
var legs := {}                # near/far -> {thigh, shin}
var arms := {}                # near/far -> {upper, fore}
var aim_node: Node2D
var body: Node2D              # 翻滾時整體旋轉

func _part(tex: String, pivot: Vector2, modul := Color.WHITE) -> Node2D:
	var n := Node2D.new()
	var s := Sprite2D.new()
	s.texture = load(DIR + tex + ".png")
	s.centered = false
	s.offset = -pivot
	s.modulate = modul
	s.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	n.add_child(s)
	return n

func _ready() -> void:
	body = Node2D.new()
	add_child(body)
	var far_mod := Color(0.72, 0.72, 0.76)
	# 繪製順序：遠側手臂 → 遠側腿 → 近側腿 → 軀幹 → 頭 → 近側手臂 → 瞄準手臂
	arms["far"] = _make_arm("far", far_mod)
	legs["far"] = _make_leg("far", far_mod, Vector2(4, 8))
	legs["near"] = _make_leg("near", Color.WHITE, Vector2(-8, 8))
	torso = _part("torso", P["torso_hip"])
	body.add_child(torso)
	head = _part("head", P["head_neck"])
	head.position = P["torso_neck"] - P["torso_hip"]
	torso.add_child(head)
	arms["near"] = _make_arm("near", Color.WHITE)
	torso.add_child(arms["near"]["upper"])
	arms["near"]["upper"].position = P["torso_sh_near"] - P["torso_hip"]
	aim_node = _part("aim", P["aim_sh"])
	aim_node.scale = Vector2(AIM_SCALE, AIM_SCALE)
	aim_node.position = P["torso_sh_near"] - P["torso_hip"] + Vector2(10, 6)
	torso.add_child(aim_node)
	aim_node.visible = false

func _make_leg(side: String, m: Color, off: Vector2) -> Dictionary:
	var thigh := _part("thigh_" + side, P["thigh_" + side], m)
	thigh.position = off
	thigh.scale = Vector2(LEG_SCALE, LEG_SCALE)
	body.add_child(thigh)
	var shin := _part("shin_" + side, Vector2(P["thigh_" + side].x, P["shin_top"]), m)
	shin.position = Vector2(0, P["knee"] - P["thigh_" + side].y)
	thigh.add_child(shin)
	return {"thigh": thigh, "shin": shin}

func _make_arm(side: String, m: Color) -> Dictionary:
	var up := _part("upper_" + side, P["upper"], m)
	up.scale = Vector2(ARM_SCALE, ARM_SCALE)
	var fore := _part("fore_" + side, Vector2(P["upper"].x, P["fore_top"]), m)
	fore.position = Vector2(0, P["elbow"] - P["upper"].y)
	up.add_child(fore)
	if side == "far":
		body.add_child(up)
	return {"upper": up, "fore": fore, "side": side}

## 每幀更新姿勢。anim: idle / walk / run / aim / aim_walk / roll
func pose(delta: float) -> void:
	t += delta
	var hip_y := 0.0
	var lean := 0.0
	var th_n := 0.0; var th_f := 0.0; var kn_n := 0.0; var kn_f := 0.0
	var ar_n := 0.0; var ar_f := 0.0; var el_n := 0.15; var el_f := 0.15
	var head_r := 0.0
	var roll := 0.0
	var show_aim := false
	match anim:
		"idle":
			var b := sin(t * TAU * 0.45)
			hip_y = b * 3.0
			ar_n = 0.03 * b; ar_f = -0.03 * b
			head_r = 0.02 * b
			torso.scale = Vector2(1.0, 1.0 + 0.008 * b)
		"walk", "run", "aim_walk":
			var run := anim == "run"
			var freq := 1.55 if run else 1.0
			var p := t * TAU * freq
			var A := deg_to_rad(38.0 if run else 26.0)
			var K := deg_to_rad(80.0 if run else 50.0)
			th_n = A * sin(p); th_f = -A * sin(p)
			kn_n = -K * pow(maxf(0.0, cos(p)), 1.3) - 0.08
			kn_f = -K * pow(maxf(0.0, -cos(p)), 1.3) - 0.08
			hip_y = -(10.0 if run else 6.0) * absf(cos(p)) + (6.0 if run else 3.0)
			lean = deg_to_rad(-10.0 if run else -3.0)
			ar_n = -(0.6 if run else 0.35) * sin(p); ar_f = (0.6 if run else 0.35) * sin(p)
			el_n = (1.1 if run else 0.25) + 0.25 * maxf(0.0, -sin(p))
			el_f = (1.1 if run else 0.25) + 0.25 * maxf(0.0, sin(p))
			head_r = -lean * 0.5
			torso.scale = Vector2.ONE
			show_aim = anim == "aim_walk"
		"aim":
			var b2 := sin(t * TAU * 0.45)
			hip_y = b2 * 2.0
			th_n = deg_to_rad(-6.0); th_f = deg_to_rad(10.0); kn_n = -0.12; kn_f = -0.05
			show_aim = true
			torso.scale = Vector2.ONE
		"roll":
			var d := 0.62
			var u := clampf(t / d, 0.0, 1.0)
			var tuck := sin(u * PI)
			roll = -TAU * smoothstep(0.0, 1.0, u)
			th_n = deg_to_rad(115.0) * tuck; th_f = deg_to_rad(100.0) * tuck
			kn_n = deg_to_rad(-140.0) * tuck; kn_f = deg_to_rad(-130.0) * tuck
			ar_n = deg_to_rad(60.0) * tuck; ar_f = deg_to_rad(50.0) * tuck
			el_n = deg_to_rad(90.0) * tuck; el_f = deg_to_rad(80.0) * tuck
			lean = deg_to_rad(-25.0) * tuck
			head_r = deg_to_rad(-20.0) * tuck
			torso.scale = Vector2.ONE
			# 繞腹部旋轉，並讓身體縮成一團時仍貼著地面
			var c := Vector2(0, -140)
			var c_world := Vector2(0, lerpf(-140.0, 860.0 - 470.0, tuck))
			body.position = c_world - c.rotated(roll)
			body.rotation = roll
			torso.rotation = lean
			head.rotation = head_r
			_apply_limbs(th_n, th_f, kn_n, kn_f, ar_n, ar_f, el_n, el_f, lean, false)
			return
	body.position = Vector2(0, hip_y)
	body.rotation = roll
	torso.rotation = lean
	head.rotation = head_r
	_apply_limbs(th_n, th_f, kn_n, kn_f, ar_n, ar_f, el_n, el_f, lean, show_aim)

func _apply_limbs(th_n: float, th_f: float, kn_n: float, kn_f: float, ar_n: float, ar_f: float, el_n: float, el_f: float, lean: float, show_aim: bool) -> void:
	legs["near"]["thigh"].rotation = th_n
	legs["far"]["thigh"].rotation = th_f
	legs["near"]["shin"].rotation = kn_n
	legs["far"]["shin"].rotation = kn_f
	arms["near"]["upper"].rotation = ar_n
	arms["far"]["upper"].rotation = ar_f
	arms["near"]["fore"].rotation = el_n
	arms["far"]["fore"].rotation = el_f
	# 遠側手臂掛在 body 上：位置跟著肩膀
	arms["far"]["upper"].position = (P["torso_sh_far"] - P["torso_hip"]).rotated(lean)
	aim_node.visible = show_aim
	arms["near"]["upper"].visible = not show_aim
	arms["far"]["upper"].visible = not show_aim
	if show_aim:
		aim_node.rotation = -lean + aim_angle
