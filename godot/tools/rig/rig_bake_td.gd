extends Node2D
## 俯視角骨架烘焙：S、SE、E、NW、N（其餘方向在像素階段鏡像）。
const ACTIONS := [["idle", 4, 2.222], ["walk", 8, 1.0], ["run", 8, 0.645]]
const VIEWS := ["S", "SE", "E", "NW", "N"]
const GROUND := 330.0
const SC := 0.226
var rigs := {}
var frames: Array = []
var i := -3

func _ready() -> void:
	RenderingServer.set_default_clear_color(Color(1, 0, 1))
	for v in VIEWS:
		var r := TopRig.new()
		add_child(r)
		r.setup(v)
		r.scale = Vector2(SC, SC)
		r.position = Vector2(320, GROUND)
		r.visible = false
		rigs[v] = r
		for a in ACTIONS:
			for k in int(a[1]):
				frames.append([v, a[0], k, a[1], a[2]])
	var man := []
	for f in frames:
		man.append([f[0], f[1], f[2]])
	FileAccess.open("user://bake_td_manifest.json", FileAccess.WRITE).store_string(JSON.stringify(man))
	print("BAKE_FRAMES ", frames.size())

func _process(_d: float) -> void:
	i += 1
	var f: Array = frames[clampi(i, 0, frames.size() - 1)]
	for v in rigs:
		rigs[v].visible = v == f[0]
	var r: TopRig = rigs[f[0]]
	r.anim = f[1]
	r.t = float(f[4]) * float(f[2]) / float(f[3])
	r.pose(0.0)
