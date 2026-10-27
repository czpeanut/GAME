class_name Companion
extends Node2D
## 李致晴：被困冷凍庫 → 獲救後跟隨玩家，可長按 E 讓她清創包紮（TCCC 技能雛形）。

var rescued := false
var heal_cd := 0.0
var hold_time := 0.0
var trail: Array[Vector2] = []
var sprite: Sprite2D
var facing_row := 0
var anim_t := 0.0
var t := 0.0
var moving := false

func _ready() -> void:
	add_to_group("interactable")
	sprite = Sprite2D.new()
	sprite.texture = load("res://assets/art/char_zhiqing.png")
	sprite.hframes = 3
	sprite.vframes = 4
	sprite.offset = Vector2(0, -12)
	add_child(sprite)
	sprite.modulate = Color(0.85, 0.95, 1.1)

func can_interact() -> bool:
	if not rescued:
		return GameState.level != null and not GameState.level.door_cells.has("freezer")
	var p: Node2D = GameState.player
	return heal_cd <= 0.0 and p != null and p.hp < float(Balance.d["player"]["hp"]) - 5.0

func prompt() -> String:
	return "[E] 和她說話" if not rescued else "[按住 E] 請致晴清創包紮"

func on_hold_start(_p: Node) -> void:
	pass

func interact(p: Node) -> void:
	if not rescued:
		GameState.show_dialogue([
			"（冷凍庫裡，她縮在角落發抖，嘴唇發紫。）",
			"李致晴：……你是誰？外面那些人……走了嗎？",
			"佑任：走了。起來，我帶你出去。",
			"李致晴：小嵐……他們把小嵐拖走了。她是為了掩護我——",
			"佑任：先活下來，才有機會找她。",
		], "", Callable(self, "_on_rescued"))
	else:
		p.hp = minf(float(Balance.d["player"]["hp"]), p.hp + 35.0)
		heal_cd = 45.0
		GameState.say("致晴替你清創包紮（+35 HP）", Color(0.7, 1, 0.8))

func _on_rescued() -> void:
	rescued = true
	hold_time = 1.5
	GameState.flags["zhiqing_rescued"] = true
	GameState.set_objective("目標：帶著致晴前往地圖東北角的撤離點（沿高屏溪北上）")
	GameState.say("李致晴加入了你", Color(0.7, 1, 0.9))

func _process(delta: float) -> void:
	t += delta
	heal_cd = maxf(0.0, heal_cd - delta)
	var p: Node2D = GameState.player
	if not rescued or p == null:
		sprite.position.x = sin(t * 38.0) * 0.5     # 發抖
		sprite.frame = 0
		return
	if trail.is_empty() or p.global_position.distance_to(trail[trail.size() - 1]) > 3.0:
		trail.append(p.global_position)
		if trail.size() > 12:
			trail.pop_front()
	sprite.position.x = 0
	var target: Vector2 = trail[0] if trail.size() >= 10 else global_position
	var before := global_position
	global_position = global_position.move_toward(target, 135.0 * delta)
	var mv := global_position - before
	moving = mv.length() > 0.2
	if moving:
		if absf(mv.x) > absf(mv.y):
			facing_row = 3 if mv.x > 0 else 2
		else:
			facing_row = 0 if mv.y > 0 else 1
	anim_t += delta * 7.0
	sprite.frame = facing_row * 3 + (1 + int(anim_t) % 2 if moving else 0)
	queue_redraw()

func _draw() -> void:
	draw_circle(Vector2(0, -1), 5.0, Color(0, 0, 0, 0.28))
