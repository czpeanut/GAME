extends Node2D
## 正面分解圖骨架測試烘焙（S 方向）
const ACTIONS := [["idle", 4, 2.222], ["walk", 8, 1.0], ["run", 8, 0.645]]
var r: FrontRig
var frames: Array = []
var i := -3
func _ready() -> void:
	RenderingServer.set_default_clear_color(Color(1, 0, 1))
	r = FrontRig.new()
	r.scale = Vector2(0.135, 0.135)
	r.position = Vector2(320, 172)
	add_child(r)
	for a in ACTIONS:
		for k in int(a[1]):
			frames.append(["S", a[0], k, a[1], a[2]])
	var man := []
	for f in frames: man.append([f[0], f[1], f[2]])
	FileAccess.open("user://bake_front_manifest.json", FileAccess.WRITE).store_string(JSON.stringify(man))
func _process(_d: float) -> void:
	i += 1
	var f: Array = frames[clampi(i, 0, frames.size() - 1)]
	r.anim = f[1]
	r.t = float(f[4]) * float(f[2]) / float(f[3])
	r.pose(0.0)
