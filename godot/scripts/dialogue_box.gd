class_name DialogueBox
extends CanvasLayer
## 底部對話框：打字機效果；E／左鍵／空白鍵推進。

var lines: Array = []
var idx := 0
var chars := 0.0
var done_cb: Callable = Callable()
var active := false
var open_t := 0.0
var panel: ColorRect
var label: Label
var hint: Label
var portrait: TextureRect

func _ready() -> void:
	layer = 11
	panel = ColorRect.new()
	panel.color = Color(0.04, 0.04, 0.06, 0.88)
	panel.position = Vector2(30, 258)
	panel.size = Vector2(580, 88)
	panel.visible = false
	add_child(panel)
	portrait = TextureRect.new()
	portrait.position = Vector2(8, 8)
	portrait.size = Vector2(45, 72)
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	panel.add_child(portrait)
	label = Label.new()
	label.position = Vector2(62, 8)
	label.size = Vector2(506, 62)
	label.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	label.add_theme_font_size_override("font_size", 12)
	panel.add_child(label)
	hint = Label.new()
	hint.text = "[E] 繼續"
	hint.position = Vector2(500, 70)
	hint.add_theme_font_size_override("font_size", 9)
	hint.modulate = Color(1, 1, 1, 0.6)
	panel.add_child(hint)
	GameState.dialogue_requested.connect(_open)

func _open(new_lines: Array, portrait_id: String, done: Callable) -> void:
	lines = new_lines
	idx = 0
	chars = 0.0
	done_cb = done
	active = true
	open_t = 0.0
	GameState.in_dialogue = true
	panel.visible = true
	if portrait_id == "oldman":
		var at := AtlasTexture.new()
		at.atlas = load("res://assets/reused/zhou_oldman.png")
		at.region = Rect2(14, 6, 24, 42)
		portrait.texture = at
		portrait.visible = true
		label.position.x = 62
		label.size.x = 506
	else:
		portrait.visible = false
		label.position.x = 12
		label.size.x = 556
	_show_line()

func _show_line() -> void:
	label.text = String(lines[idx])
	label.visible_characters = 0
	chars = 0.0

func _process(delta: float) -> void:
	if not active:
		return
	open_t += delta
	var total := label.get_total_character_count()
	if label.visible_characters < total:
		chars += delta * 55.0
		label.visible_characters = int(chars)
	var advance := open_t > 0.15 and (Input.is_action_just_pressed("interact") or Input.is_action_just_pressed("fire") or Input.is_key_pressed(KEY_SPACE) and open_t > 0.4)
	if advance:
		if label.visible_characters < total:
			label.visible_characters = total
			chars = float(total)
		else:
			idx += 1
			if idx >= lines.size():
				_close()
			else:
				_show_line()

func _close() -> void:
	active = false
	panel.visible = false
	GameState.in_dialogue = false
	var cb := done_cb
	done_cb = Callable()
	if cb.is_valid():
		cb.call()
