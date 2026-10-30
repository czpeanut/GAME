extends Node2D
## 混合烘焙：W 用側面關節骨架（第一版像素的左右走路），S/SE/NW/N 用俯視角骨架。
const ACTIONS := [["idle", 4, 2.222], ["walk", 8, 1.0], ["run", 8, 0.645]]
const VIEWS := ["S", "SE", "W", "NW", "N"]
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
			add_child(r)
		else:
			r = TopRig.new()
			add_child(r)
			r.setup(v)
			r.scale = Vector2(0.226, 0.226)
			r.position = Vector2(320, 330)
		r.visible = false
		rigs[v] = r
		for a in ACTIONS:
			for k in int(a[1]):
				frames.append([v, a[0], k, a[1], a[2]])
	var man := []
	for f in frames:
		man.append([f[0], f[1], f[2]])
	FileAccess.open("user://bake_mix_manifest.json", FileAccess.WRITE).store_string(JSON.stringify(man))

func _process(_d: float) -> void:
	i += 1
	var f: Array = frames[clampi(i, 0, frames.size() - 1)]
	for v in rigs:
		rigs[v].visible = v == f[0]
	var r = rigs[f[0]]
	r.anim = f[1]
	r.t = float(f[4]) * float(f[2]) / float(f[3])
	r.pose(0.0)
