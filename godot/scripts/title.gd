extends Control
## 標題畫面：沿用 repo 既有的街屋廢墟背景。

var t := 0.0
var shot_path := ""
var sky: Texture2D
var far_t: Texture2D
var mid_t: Texture2D

func _ready() -> void:
	sky = load("res://assets/reused/bg_sky.png")
	far_t = load("res://assets/reused/bg_far.png")
	mid_t = load("res://assets/reused/bg_mid.png")
	set_anchors_preset(Control.PRESET_FULL_RECT)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			shot_path = a.substr(7)

func _process(delta: float) -> void:
	t += delta
	queue_redraw()
	if shot_path != "" and t > 0.5:
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot_path)
		get_tree().quit()
		return
	if Input.is_action_just_pressed("restart") or Input.is_action_just_pressed("fire") or Input.is_action_just_pressed("interact"):
		get_tree().change_scene_to_file("res://scenes/main.tscn")

func _draw() -> void:
	draw_texture_rect(sky, Rect2(0, 0, 640, 360), false, Color(0.55, 0.45, 0.45))
	draw_texture_rect(far_t, Rect2(0, 150, 640, 190), false, Color(0.5, 0.45, 0.47))
	draw_texture_rect(mid_t, Rect2(0, 120, 640, 240), false, Color(0.65, 0.6, 0.62))
	draw_rect(Rect2(0, 0, 640, 360), Color(0, 0, 0, 0.5))
	var f := ThemeDB.fallback_font
	_c(f, 72, "焦土台灣：焦土歸途", 30, Color(1, 0.93, 0.8))
	_c(f, 98, "Ch.1 灰盒原型　東港與林園廢墟", 13, Color(0.85, 0.8, 0.75))
	var lines := [
		"WASD 移動　Shift 跑步（吵）　C 蹲姿（靜）　滑鼠 瞄準／左鍵 開槍　右鍵 螺絲起子（背刺）",
		"R 換彈匣／排障　T 硬塞彈匣（20 發，卡彈 60%）　F 手電筒　E 互動　Esc 回標題",
	]
	var y := 232.0
	for l in lines:
		_c(f, y, l, 10, Color(0.8, 0.8, 0.8))
		y += 15.0
	if int(t * 1.6) % 2 == 0:
		_c(f, 300, "按 Enter 或點擊滑鼠開始", 14, Color(1, 0.95, 0.7))

func _c(f: Font, y: float, s: String, size: int, col: Color) -> void:
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(f, Vector2(320.0 - w / 2.0 + 1, y + 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(0, 0, 0, 0.8))
	draw_string(f, Vector2(320.0 - w / 2.0, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)
