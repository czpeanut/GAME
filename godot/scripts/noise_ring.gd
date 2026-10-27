class_name NoiseRing
extends Node2D
## 擴散的聲波圈視覺。
var max_radius := 100.0
var tint := Color(0.85, 0.95, 1.0)
var t := 0.0
const DURATION := 0.7

func _ready() -> void:
	z_index = 30

func _process(delta: float) -> void:
	t += delta
	if t >= DURATION:
		queue_free()
	queue_redraw()

func _draw() -> void:
	var k := clampf(t / DURATION, 0.0, 1.0)
	var r := max_radius * (1.0 - pow(1.0 - k, 2.0))
	var a := (1.0 - k) * 0.85
	draw_arc(Vector2.ZERO, r, 0.0, TAU, 64, Color(tint, a), 2.0)
	draw_arc(Vector2.ZERO, r * 0.82, 0.0, TAU, 64, Color(tint, a * 0.45), 1.0)
