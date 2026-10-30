extends Node2D
## 把骨架動作逐格烘焙成畫面（每一幀一個姿勢），供轉成像素 sprite 用。
## 以 --write-movie 輸出；背景為純洋紅色以便去背。

const ACTIONS := [
	# [動作, 格數, 週期秒數, 額外參數]
	["idle", 4, 2.222, 0.0],
	["walk", 8, 1.0, 0.0],
	["run", 8, 0.645, 0.0],
	["aim", 3, 0.0, 0.0],
	["aim_walk", 8, 1.0, 0.0],
	["roll", 8, 0.62, 0.0],
]
var rig: SideRig
var frames: Array = []
var i := -3

func _ready() -> void:
	RenderingServer.set_default_clear_color(Color(1, 0, 1))
	rig = SideRig.new()
	rig.scale = Vector2(0.2, 0.2)
	rig.position = Vector2(320, 172)
	add_child(rig)
	for a in ACTIONS:
		for k in int(a[1]):
			frames.append([a[0], k, a[1], a[2]])
	print("BAKE_FRAMES ", frames.size())

func _process(_d: float) -> void:
	i += 1
	var f: Array = frames[clampi(i, 0, frames.size() - 1)]
	rig.anim = f[0]
	var k := int(f[1])
	var n := int(f[2])
	if f[0] == "aim":
		rig.aim_angle = deg_to_rad([-12.0, 0.0, 12.0][k])
		rig.t = 0.0
	elif f[0] == "roll":
		rig.aim_angle = 0.0
		rig.t = float(f[3]) * float(k) / float(n - 1) if false else 0.62 * float(k) / float(n - 1)
	else:
		rig.aim_angle = 0.0
		rig.t = float(f[3]) * float(k) / float(n)
	rig.pose(0.0)
