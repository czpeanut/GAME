extends Node2D
## 八方位烘焙：W 用側面骨架，S/SW/NW/N 用簡化骨架；E/SE/NE 之後在像素階段鏡像。

const ACTIONS := [["idle", 4, 2.222], ["walk", 8, 1.0], ["run", 8, 0.645], ["aim", 3, 0.0], ["aim_walk", 8, 1.0], ["roll", 8, 0.62]]
const VIEWS := ["W", "S", "SW", "NW", "N"]
const GROUND := 328.5
const S_FRONT := 0.2152
var rigs := {}
var frames: Array = []
var i := -3

func _ready() -> void:
	RenderingServer.set_default_clear_color(Color(1, 0, 1))
	for v in VIEWS:
		var r: Node2D
		if v == "W":
			r = SideRig.new()
			r.scale = Vector2(0.2, 0.2)
			r.position = Vector2(320, 172)
		else:
			r = ViewRig.new()
			add_child(r)
			r.setup(v)
			r.scale = Vector2(S_FRONT, S_FRONT)
			var m: Dictionary = r.meta
			r.position = Vector2(320, GROUND - (float(m["size"][1]) - float(m["hem"])) * S_FRONT)
			remove_child(r)
		r.visible = false
		add_child(r)
		rigs[v] = r
	for v in VIEWS:
		for a in ACTIONS:
			if a[0] == "roll" and v != "W":
				continue
			for k in int(a[1]):
				frames.append([v, a[0], k, a[1], a[2]])
	var man := []
	for f in frames:
		man.append([f[0], f[1], f[2]])
	FileAccess.open("user://bake8_manifest.json", FileAccess.WRITE).store_string(JSON.stringify(man))
	print("BAKE_FRAMES ", frames.size(), " ", ProjectSettings.globalize_path("user://bake8_manifest.json"))

func _process(_d: float) -> void:
	i += 1
	var f: Array = frames[clampi(i, 0, frames.size() - 1)]
	for v in rigs:
		rigs[v].visible = v == f[0]
	var r = rigs[f[0]]
	r.anim = f[1]
	var k := int(f[2])
	var n := int(f[3])
	if f[1] == "aim":
		r.aim_angle = deg_to_rad([-12.0, 0.0, 12.0][k])
		r.t = 0.0
	elif f[1] == "roll":
		r.aim_angle = 0.0
		r.t = 0.62 * float(k) / float(n - 1)
	else:
		r.aim_angle = 0.0
		r.t = float(f[4]) * float(k) / float(n)
	r.pose(0.0)
