class_name Campfire
extends Node2D
## 營火：暖色閃爍光源（移植自 Scratched-T）＋動態火焰。

var light: PointLight2D
var t := randf() * 10.0

func _ready() -> void:
	light = PointLight2D.new()
	light.texture = load("res://assets/art/light_radial.png")
	light.texture_scale = 1.15
	light.color = Color(1.0, 0.62, 0.28)
	light.energy = 1.25
	light.shadow_enabled = true
	light.position = Vector2(0, -4)
	add_child(light)

func _process(delta: float) -> void:
	t += delta
	var fl := sin(t * 9.0) * 0.08 + cos(t * 14.0) * 0.05 + randf_range(-0.03, 0.03)
	light.energy = 1.25 + fl
	light.texture_scale = 1.15 + fl * 0.25
	queue_redraw()

func _draw() -> void:
	draw_circle(Vector2(0, 1), 8.0, Color(0, 0, 0, 0.3))
	# 石圈
	for k in 8:
		var a := TAU * float(k) / 8.0
		draw_circle(Vector2(cos(a) * 6.5, sin(a) * 3.6), 1.9, Color(0.32, 0.3, 0.3))
		draw_circle(Vector2(cos(a) * 6.5, sin(a) * 3.6 - 0.5), 1.3, Color(0.5, 0.48, 0.46))
	# 柴
	draw_line(Vector2(-5, 1), Vector2(5, -1), Color(0.25, 0.15, 0.09), 2.0)
	draw_line(Vector2(-4, -1), Vector2(5, 1), Color(0.32, 0.2, 0.11), 2.0)
	# 火焰（三層）
	for layer_i in 3:
		var h := (9.0 - layer_i * 2.5) + sin(t * (11.0 + layer_i * 3.0)) * 1.8
		var w := 4.2 - layer_i * 1.1
		var cols: Array[Color] = [Color(0.95, 0.3, 0.1, 0.95), Color(1.0, 0.6, 0.15, 0.95), Color(1.0, 0.92, 0.55, 0.95)]
		var col: Color = cols[layer_i]
		var sway := sin(t * 7.0 + layer_i) * 1.2
		draw_colored_polygon(PackedVector2Array([
			Vector2(-w, -1), Vector2(-w * 0.5, -h * 0.55), Vector2(sway, -h), Vector2(w * 0.5, -h * 0.55), Vector2(w, -1)
		]), col)
	# 火星
	for k in 3:
		var ph := fmod(t * 1.3 + float(k) * 0.37, 1.0)
		draw_rect(Rect2(Vector2(sin(t * 3.0 + k * 2.0) * 4.0, -8.0 - ph * 16.0), Vector2(1, 1)), Color(1.0, 0.75, 0.3, 1.0 - ph))
