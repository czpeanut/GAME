class_name DustMotes
extends CanvasLayer
## 手電筒光柱中的飄浮灰塵（移植自 Scratched-T）：光錐內的微塵閃爍發亮，其餘處只有極淡的環境微塵。
## 繪於獨立 CanvasLayer，不受環境暗化影響；光錐內以射線檢查是否被牆擋住。

const COUNT := 90
const HALF := Vector2(340, 200)

var canvas: Control
var motes: Array[Dictionary] = []
var t := 0.0

func _ready() -> void:
	layer = 5
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_motes)
	add_child(canvas)

func _spawn(center: Vector2) -> Dictionary:
	return {
		"p": center + Vector2(randf_range(-HALF.x, HALF.x), randf_range(-HALF.y, HALF.y)),
		"v": Vector2(randf_range(-3.0, 3.0), randf_range(-5.0, -0.5)),
		"s": randf_range(0.8, 1.8), "a": randf_range(0.25, 0.8), "ph": randf() * TAU,
	}

func _process(delta: float) -> void:
	t += delta
	var p: Player = GameState.player as Player
	if p == null:
		return
	if motes.is_empty():
		for i in COUNT:
			motes.append(_spawn(p.global_position))
	for m in motes:
		m["p"] += m["v"] * delta + Vector2(sin(t * 0.7 + m["ph"]) * 2.0, 0.0) * delta
		var d: Vector2 = m["p"] - p.global_position
		if absf(d.x) > HALF.x or absf(d.y) > HALF.y:
			var n := _spawn(p.global_position)
			m["p"] = n["p"]
	canvas.queue_redraw()

func _draw_motes() -> void:
	var p: Player = GameState.player as Player
	if p == null or GameState.level == null:
		return
	var lvl: Node = GameState.level
	var xf := p.get_viewport().get_canvas_transform()
	var ap := p.aim_progress
	var half := deg_to_rad(lerpf(26.0, 15.0, ap))
	var reach := lerpf(190.0, 270.0, ap)
	var origin := p.global_position + Vector2(0, -10)
	var ang := p.aim_dir.angle()
	var dark: float = 1.0 if lvl.darkness_at(p.global_position) != 0 else 0.4
	var space := p.get_world_2d().direct_space_state
	var rays := 0
	for m in motes:
		var wp: Vector2 = m["p"]
		var sp := xf * wp
		if sp.x < -4 or sp.y < -4 or sp.x > 644 or sp.y > 364:
			continue
		var d := wp - origin
		var dist := d.length()
		var in_beam := false
		if p.flashlight_on and dist > 10.0 and dist < reach and absf(angle_difference(ang, d.angle())) < half and rays < 40:
			rays += 1
			var q := PhysicsRayQueryParameters2D.create(origin, wp, 1)
			in_beam = space.intersect_ray(q).is_empty()
		var sz: float = m["s"]
		if in_beam:
			var fall := 1.0 - dist / reach
			var shimmer := 0.55 + 0.35 * sin(t * 6.0 + float(m["ph"]) * 3.0)
			canvas.draw_rect(Rect2(sp, Vector2(sz, sz)), Color(0.8, 0.93, 1.0, clampf(float(m["a"]) * 1.7 * shimmer * (0.4 + fall), 0.0, 1.0)))
		else:
			canvas.draw_rect(Rect2(sp, Vector2(sz * 0.8, sz * 0.8)), Color(0.5, 0.63, 0.78, float(m["a"]) * 0.22 * dark))
