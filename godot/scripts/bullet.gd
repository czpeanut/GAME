class_name Bullet
extends Node2D
## 簡單射線式子彈：每幀沿路徑做射線檢查，命中牆或敵人即消失。
var dir := Vector2.RIGHT
var speed := 720.0
var travelled := 0.0
var max_range := 520.0
var damage := 35.0
var trail: Array[Vector2] = []

func _ready() -> void:
	z_index = 25

func _physics_process(delta: float) -> void:
	var from := global_position
	var step := speed * delta
	var to := from + dir * step
	var q := PhysicsRayQueryParameters2D.create(from, to, 1 | 4)   # 世界 + 敵人
	q.collide_with_bodies = true
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	trail.append(from)
	if trail.size() > 4:
		trail.pop_front()
	if not hit.is_empty():
		global_position = hit["position"]
		var c: Object = hit["collider"]
		if c != null and c.has_method("take_damage"):
			c.take_damage(damage, global_position - dir * 4.0, false)
		queue_free()
		return
	global_position = to
	travelled += step
	if travelled >= max_range:
		queue_free()
	queue_redraw()

func _draw() -> void:
	for i in trail.size():
		var p := trail[i] - global_position
		draw_line(p, Vector2.ZERO, Color(1.0, 0.9, 0.55, 0.9), 1.0)
	draw_circle(Vector2.ZERO, 1.2, Color(1, 0.95, 0.7))
