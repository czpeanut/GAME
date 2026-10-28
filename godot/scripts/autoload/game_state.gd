extends Node
## 全域狀態、統計、輸入設定。

signal message(text: String, color: Color)
signal objective_changed(text: String)
signal dialogue_requested(lines: Array, portrait: String, done: Callable)

var player: Node2D = null
var level: Node2D = null
var fx: Node = null
var in_dialogue := false
var game_over := false
var won := false

var stats := {}
var flags := {}
var objective := ""
var elapsed := 0.0

func _ready() -> void:
	_setup_input()
	_setup_font()
	reset()

## 中文字型：使用系統字型（Windows 微軟正黑體／macOS 蘋方／Linux Noto CJK），不需內嵌字型檔。
func _setup_font() -> void:
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Source Han Sans TC", "WenQuanYi Zen Hei", "sans-serif"])
	f.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
	ThemeDB.fallback_font = f
	ThemeDB.fallback_font_size = 11

func show_dialogue(lines: Array, portrait := "", done: Callable = Callable()) -> void:
	dialogue_requested.emit(lines, portrait, done)

func reset() -> void:
	stats = {"shots": 0, "jams": 0, "noise_events": 0, "kills_silent": 0, "kills_loud": 0, "damage_taken": 0}
	flags = {"rust_removed": false, "has_oil": false, "fragment_read": false, "zhiqing_rescued": false,
		"glowsticks": 0, "grave_seen": false}
	in_dialogue = false
	game_over = false
	won = false
	elapsed = 0.0
	player = null
	level = null
	set_objective("目標：找到針車油，替 T65K2 除鏽；然後前往林園超商救人")

func set_objective(t: String) -> void:
	objective = t
	objective_changed.emit(t)

func say(t: String, c: Color = Color(1, 1, 1)) -> void:
	message.emit(t, c)

func _process(delta: float) -> void:
	if not game_over and not won and player != null:
		elapsed += delta

func _setup_input() -> void:
	var keys := {
		"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT],
		"move_up": [KEY_W, KEY_UP], "move_down": [KEY_S, KEY_DOWN],
		"sprint": [KEY_SHIFT], "crouch": [KEY_C, KEY_CTRL],
		"melee": [KEY_Q, KEY_V], "roll": [KEY_SPACE], "reload": [KEY_R], "cram": [KEY_T], "interact": [KEY_E],
		"flashlight": [KEY_F], "restart": [KEY_ENTER, KEY_KP_ENTER], "pause": [KEY_ESCAPE],
		"debug": [KEY_F3],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for k in keys[action]:
			var e := InputEventKey.new()
			e.physical_keycode = k
			InputMap.action_add_event(action, e)
	var mice := {"fire": MOUSE_BUTTON_LEFT, "aim": MOUSE_BUTTON_RIGHT}
	for action in mice:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var m := InputEventMouseButton.new()
		m.button_index = mice[action]
		InputMap.action_add_event(action, m)
