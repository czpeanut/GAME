class_name Roof
extends Node2D
## 建築屋頂：玩家進入時淡出，露出剖面（X-Ray Cutaway 的 2D 簡化版）。
var size := Vector2(64, 64)
var name_text := ""
var target_alpha := 0.97

func _ready() -> void:
	modulate.a = 0.97

func fade_to(a: float, delta: float) -> void:
	modulate.a = move_toward(modulate.a, a, delta * 4.0)
	visible = modulate.a > 0.01

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.19, 0.18, 0.19))
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.32, 0.3, 0.3), false, 2.0)
	var step := 24.0
	var x := step
	while x < size.x:
		draw_line(Vector2(x, 2), Vector2(x, size.y - 2), Color(0.24, 0.23, 0.24), 1.0)
		x += step
	draw_rect(Rect2(size * 0.7, Vector2(14, 10)), Color(0.28, 0.27, 0.28))
	if name_text != "":
		var font := ThemeDB.fallback_font
		draw_string(font, Vector2(8, size.y * 0.5), name_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.55, 0.52, 0.5))
