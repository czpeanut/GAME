class_name Hud
extends CanvasLayer
## 畫面介面：血量／體力／彈藥／噪音／目標／互動提示／訊息／結算。

var canvas: Control
var msgs: Array[Dictionary] = []
var show_stats := true

func _ready() -> void:
	layer = 10
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_hud)
	add_child(canvas)
	GameState.message.connect(_on_message)

func _on_message(text: String, color: Color) -> void:
	msgs.append({"text": text, "color": color, "t": 4.0})
	if msgs.size() > 4:
		msgs.pop_front()

func _process(delta: float) -> void:
	for m in msgs:
		m["t"] -= delta
	msgs = msgs.filter(func(m): return m["t"] > 0.0)
	canvas.queue_redraw()

func _bar(x: float, y: float, w: float, h: float, ratio: float, col: Color) -> void:
	canvas.draw_rect(Rect2(x, y, w, h), Color(0, 0, 0, 0.6))
	canvas.draw_rect(Rect2(x, y, w * clampf(ratio, 0.0, 1.0), h), col)
	canvas.draw_rect(Rect2(x, y, w, h), Color(1, 1, 1, 0.25), false, 1.0)

func _text(pos: Vector2, s: String, col: Color = Color.WHITE, size := 11, shadow := true) -> void:
	var f := ThemeDB.fallback_font
	if shadow:
		canvas.draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(0, 0, 0, 0.85))
	canvas.draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)

func _text_center(y: float, s: String, col: Color = Color.WHITE, size := 11) -> void:
	var f := ThemeDB.fallback_font
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	_text(Vector2(320.0 - w / 2.0, y), s, col, size)

func _draw_hud() -> void:
	var p: Player = GameState.player as Player
	if p == null:
		return
	# 左上：血量／體力
	_text(Vector2(8, 15), "HP", Color(1, 0.7, 0.7), 10)
	_bar(26, 8, 100, 8, p.hp / float(Balance.d["player"]["hp"]), Color(0.85, 0.2, 0.2))
	_text(Vector2(8, 30), "體力", Color(0.8, 0.9, 1), 9)
	_bar(36, 22, 90, 5, p.stamina / float(Balance.d["player"]["stamina_max"]), Color(0.35, 0.75, 0.95))
	# 姿態／噪音
	var stance := "蹲姿（安靜）" if p.crouching else ("奔跑（吵）" if p.sprinting else "行走")
	_text(Vector2(8, 46), stance, Color(0.85, 0.85, 0.85), 10)
	_text(Vector2(8, 59), "手電筒 " + ("開" if p.flashlight_on else "關") + "  [F]", Color(0.85, 0.85, 0.7), 10)
	var n := Acoustics.recent_player_noise()
	_text(Vector2(520, 15), "噪音", Color(0.85, 0.95, 1), 10)
	_bar(548, 8, 84, 8, n / float(Balance.d["noise"]["gunshot"]), Color(0.95, 0.75, 0.3))
	# 目標
	_text_center(18, GameState.objective, Color(1, 0.95, 0.75))
	if GameState.in_dialogue:
		return
	# 左下：槍
	var g := p.gun
	var base_y := 326.0
	var gcol := Color.WHITE
	_text(Vector2(8, base_y), g.status_text(), gcol, 12)
	var warn := ""
	var wcol := Color(1, 0.8, 0.4)
	if g.jam != Gun.Jam.NONE:
		warn = "卡彈！[R] 拉槍機排障" + ("（雙進彈）" if g.jam == Gun.Jam.DOUBLE_FEED else "（不退殼）")
		wcol = Color(1, 0.35, 0.3)
	elif g.is_overloaded():
		warn = "彈匣超裝：卡彈率 %d%%（[R] 可卸下多餘子彈）" % int(round(g.jam_chance() * 100.0))
		wcol = Color(1, 0.55, 0.3)
	else:
		warn = "卡彈率 %d%%%s" % [int(round(g.jam_chance() * 100.0)), "（槍機鹽鏽）" if g.rust else ""]
	_text(Vector2(8, base_y + 14), warn, wcol, 10)
	if p.busy_kind != "":
		var names := {"reload": "換彈匣", "cram": "硬塞彈匣", "clear": "排障", "unload": "卸彈"}
		_bar(8, base_y - 24, 110, 6, p.busy_ratio(), Color(0.9, 0.9, 0.5))
		_text(Vector2(124, base_y - 17), names.get(p.busy_kind, ""), Color(0.95, 0.95, 0.7), 10)
	# 互動提示
	var tgt: Node = p.interact_target
	if tgt != null and not GameState.in_dialogue and not GameState.game_over and not GameState.won:
		var label: String = tgt.prompt() if tgt.has_method("prompt") else "[E] 互動"
		if not label.begins_with("["):
			label = "[E] " + label
		_text_center(292, label, Color(1, 1, 0.8), 11)
		if tgt.hold_time > 0.0 and p.hold_t > 0.0:
			_bar(280, 298, 80, 5, p.hold_t / tgt.hold_time, Color(0.95, 0.85, 0.4))
	# 訊息
	var y := 262.0
	for m in msgs:
		var a: float = clampf(float(m["t"]), 0.0, 1.0)
		var c: Color = m["color"]
		_text_center(y, m["text"], Color(c, a), 11)
		y += 14.0
	if GameState.game_over:
		_overlay("任務失敗", Color(0.9, 0.25, 0.25), "按 Enter 重來")
	elif GameState.won:
		_overlay("第一章完成", Color(0.5, 1, 0.6), "按 Enter 再玩一次")

func _overlay(title: String, col: Color, hint: String) -> void:
	canvas.draw_rect(Rect2(0, 0, 640, 360), Color(0, 0, 0, 0.72))
	_text_center(100, title, col, 26)
	var s: Dictionary = GameState.stats
	var secs := int(GameState.elapsed)
	var rows := [
		["用時", "%d:%02d" % [secs / 60, secs % 60]],
		["開槍", str(s["shots"])],
		["卡彈次數", str(s["jams"])],
		["製造噪音事件", str(s["noise_events"])],
		["無聲擊殺", str(s["kills_silent"])],
		["驚動後擊殺", str(s["kills_loud"])],
		["受到傷害", str(s["damage_taken"])],
	]
	var y := 140.0
	for r in rows:
		_text(Vector2(240, y), r[0], Color(0.85, 0.85, 0.85), 12)
		_text(Vector2(380, y), r[1], Color.WHITE, 12)
		y += 18.0
	if GameState.won:
		var rating := "硬撐過關"
		if s["shots"] == 0 and s["kills_loud"] == 0:
			rating = "幽靈：零槍聲過關"
		elif s["kills_loud"] == 0:
			rating = "安靜獵人"
		_text_center(y + 8, "評價：" + rating, Color(1, 0.9, 0.5), 13)
	_text_center(y + 40, hint, Color(0.8, 0.8, 0.8), 11)
