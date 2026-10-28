class_name Enemy
extends CharacterBody2D
## 混混 AI：視錐＋聽覺＋A* 路徑。狀態：待命／巡邏／調查／追擊／搜索／死亡。

enum S { IDLE, PATROL, INVESTIGATE, CHASE, SEARCH, DEAD }

var kind := "thug"                 # thug（遊蕩地痞）/ torch（乙炔混混）
var state: int = S.IDLE
var hp := 60.0
var dead := false
var facing := Vector2.LEFT
var home_pos := Vector2.ZERO
var home_facing := Vector2.LEFT
var patrol: Array[Vector2] = []
var patrol_i := 0
var sweep_deg := 0.0
var alert := 0.0
var path := PackedVector2Array()
var path_i := 0
var path_t := 0.0
var target_pos := Vector2.ZERO
var last_seen := Vector2.ZERO
var wait_t := 0.0
var lose_t := 0.0
var attack_t := 0.0
var attack_cd := 0.0
var flash := 0.0
var anim_t := 0.0
var t_alive := 0.0
var sprite: Sprite2D
var display_name := "混混"

var kb_vel := Vector2.ZERO
var stun := 0.0
var hit_t := 0.0

func _ready() -> void:
	add_to_group("enemies")
	add_to_group("hearing")
	hp = float(Balance.d["enemy"]["hp"])
	collision_layer = 4
	collision_mask = 1 | 16 | 8
	var cs := CollisionShape2D.new()
	var sh := CircleShape2D.new()
	sh.radius = 4.5
	cs.shape = sh
	cs.position = Vector2(0, -3)
	add_child(cs)
	sprite = Sprite2D.new()
	sprite.texture = load("res://assets/art/char_%s.png" % ("torch" if kind == "torch" else "thug"))
	sprite.hframes = 3
	sprite.vframes = 4
	sprite.offset = Vector2(0, -12)
	add_child(sprite)
	home_pos = global_position
	home_facing = facing
	t_alive = randf() * 10.0

func is_unaware() -> bool:
	return not dead and state != S.CHASE

# ------------------------------------------------------------------ 感知
func _sees_player() -> bool:
	var p: Node2D = GameState.player
	if p == null or GameState.game_over or dead:
		return false
	var E: Dictionary = Balance.d["enemy"]
	var eye := global_position + Vector2(0, -10)
	var tgt := p.global_position + Vector2(0, -8)
	var to := tgt - eye
	var d := to.length()
	var r := float(E["vision_range"])
	if p.crouching:
		r *= float(E["crouch_vision_mult"])
	var lvl: Node = GameState.level
	if p.flashlight_on and lvl != null and lvl.is_dark_at(p.global_position):
		r *= float(E["flashlight_vision_mult"])
	if state == S.CHASE:
		r *= 1.4
	if d > r:
		return false
	if state != S.CHASE and d > float(E["close_sense"]):
		if absf(facing.angle_to(to)) > deg_to_rad(float(E["vision_fov"]) * 0.5):
			return false
	var q := PhysicsRayQueryParameters2D.create(eye, tgt, 1)
	q.exclude = [get_rid()]
	return get_world_2d().direct_space_state.intersect_ray(q).is_empty()

func hear(pos: Vector2, _radius: float, _source: String) -> void:
	if dead or state == S.CHASE:
		return
	state = S.INVESTIGATE
	target_pos = pos
	wait_t = 0.0
	alert = maxf(alert, 0.35)
	_set_target(pos)

# ------------------------------------------------------------------ 主迴圈
func _physics_process(delta: float) -> void:
	if dead:
		return
	t_alive += delta
	attack_cd = maxf(0.0, attack_cd - delta)
	flash = maxf(0.0, flash - delta * 5.0)
	hit_t = maxf(0.0, hit_t - delta)
	if stun > 0.0 or kb_vel.length() > 4.0:
		stun = maxf(0.0, stun - delta)
		velocity = kb_vel
		move_and_slide()
		kb_vel = kb_vel.move_toward(Vector2.ZERO, 700.0 * delta)
		_animate(delta)
		return
	var E: Dictionary = Balance.d["enemy"]
	var sees := _sees_player()
	var p: Node2D = GameState.player
	if sees:
		last_seen = p.global_position
		var need: float = float(E["detect_time_crouch"]) if p.crouching else float(E["detect_time"])
		alert += delta / need
		if state == S.CHASE:
			alert = 1.0
		if alert >= 1.0 and state != S.CHASE:
			_enter_chase()
	else:
		alert = maxf(0.0, alert - delta * 0.35)
	velocity = Vector2.ZERO
	match state:
		S.IDLE: _do_idle(delta)
		S.PATROL: _do_patrol(delta)
		S.INVESTIGATE: _do_investigate(delta)
		S.CHASE: _do_chase(delta, sees)
		S.SEARCH: _do_search(delta)
	_animate(delta)

func _enter_chase() -> void:
	state = S.CHASE
	lose_t = 0.0
	attack_t = 0.0
	path_t = 0.0
	var E: Dictionary = Balance.d["enemy"]
	for o in get_tree().get_nodes_in_group("enemies"):
		if o != self and is_instance_valid(o) and not o.dead and o.state != S.CHASE:
			if o.global_position.distance_to(global_position) <= float(E["shout_radius"]):
				o.hear(last_seen, 0.0, "shout")

func _return_to_post() -> void:
	state = S.PATROL if patrol.size() > 0 else S.IDLE
	path = PackedVector2Array()
	path_i = 0
	wait_t = 0.0
	if state == S.IDLE:
		_set_target(home_pos)

func _do_idle(delta: float) -> void:
	if global_position.distance_to(home_pos) > 5.0 and path_i < path.size():
		_follow_path(float(Balance.d["enemy"]["walk"]))
		return
	var base := home_facing.angle()
	facing = Vector2.from_angle(base + sin(t_alive * 0.7) * deg_to_rad(sweep_deg))

func _do_patrol(delta: float) -> void:
	if patrol.is_empty():
		_return_to_post()
		return
	if wait_t > 0.0:
		wait_t -= delta
		facing = facing.rotated(sin(t_alive * 2.0) * delta * 0.8)
		return
	if path_i >= path.size():
		_set_target(patrol[patrol_i])
	if _follow_path(float(Balance.d["enemy"]["walk"])):
		patrol_i = (patrol_i + 1) % patrol.size()
		wait_t = 1.0
		path = PackedVector2Array()
		path_i = 0

func _do_investigate(delta: float) -> void:
	if path_i < path.size():
		_follow_path(float(Balance.d["enemy"]["walk"]) * 1.25)
		return
	wait_t += delta
	facing = facing.rotated(sin(t_alive * 3.0) * delta * 1.6)
	if wait_t >= float(Balance.d["enemy"]["investigate_time"]):
		_return_to_post()

func _do_search(delta: float) -> void:
	if path_i < path.size():
		_follow_path(float(Balance.d["enemy"]["walk"]) * 1.3)
		return
	wait_t += delta
	facing = facing.rotated(sin(t_alive * 3.5) * delta * 2.0)
	if wait_t >= float(Balance.d["enemy"]["search_time"]):
		_return_to_post()

func _do_chase(delta: float, sees: bool) -> void:
	var E: Dictionary = Balance.d["enemy"]
	var p: Node2D = GameState.player
	if p == null:
		return
	if sees:
		lose_t = 0.0
	else:
		lose_t += delta
		if lose_t > 1.6:
			state = S.SEARCH
			wait_t = 0.0
			_set_target(last_seen)
			return
	var d := global_position.distance_to(p.global_position)
	if d <= float(E["attack_range"]) and sees:
		var to := (p.global_position - global_position).normalized()
		facing = to
		if attack_cd <= 0.0:
			attack_t += delta
			flash = 1.0
			if attack_t >= float(E["attack_windup"]):
				attack_t = 0.0
				attack_cd = float(E["attack_cooldown"])
				if global_position.distance_to(p.global_position) <= float(E["attack_range"]) + 6.0:
					p.take_damage(float(E["attack_damage"]), global_position)
					Sfx.play("stab", 0.0, 0.8)
		return
	attack_t = 0.0
	path_t -= delta
	if path_t <= 0.0 or path_i >= path.size():
		path_t = 0.35
		_set_target(p.global_position if sees else last_seen)
	_follow_path(float(E["chase"]))

# ------------------------------------------------------------------ 移動
func _set_target(pos: Vector2) -> void:
	var lvl: Node = GameState.level
	if lvl == null:
		path = PackedVector2Array([pos])
	else:
		path = lvl.find_path(global_position, pos)
	path_i = 0

## 沿路徑前進；抵達終點回傳 true。
func _follow_path(speed: float) -> bool:
	if path_i >= path.size():
		return true
	var tgt := path[path_i]
	var to := tgt - global_position
	if to.length() < 3.0:
		path_i += 1
		return path_i >= path.size()
	var dir := to.normalized()
	velocity = dir * speed
	facing = facing.lerp(dir, 0.2)
	if facing.length() < 0.01:
		facing = dir
	facing = facing.normalized()
	move_and_slide()
	return false

func _animate(delta: float) -> void:
	var moving := velocity.length() > 5.0
	anim_t += delta * 6.0
	var row := 0
	if absf(facing.x) > absf(facing.y):
		row = 3 if facing.x > 0 else 2
	else:
		row = 0 if facing.y > 0 else 1
	sprite.frame = row * 3 + (1 + int(anim_t) % 2 if moving else 0)
	if hit_t > 0.0:
		sprite.modulate = Color(2.6, 2.6, 2.6)
	else:
		sprite.modulate = Color(1.5, 0.8, 0.8) if flash > 0.0 and state == S.CHASE and attack_t > 0.0 else Color.WHITE
	queue_redraw()

# ------------------------------------------------------------------ 受傷／死亡
func take_damage(amount: float, _from_pos: Vector2 = Vector2.ZERO, silent := false) -> void:
	if dead:
		return
	hp -= amount
	hit_t = 0.09
	var F: Dictionary = Balance.d["feel"]
	var push := (global_position + Vector2(0, -8) - _from_pos).normalized() if _from_pos != Vector2.ZERO else Vector2.ZERO
	if GameState.fx != null and not silent:
		GameState.fx.blood(global_position + Vector2(0, -8), push, 10 if hp <= 0.0 else 6)
	var pl := GameState.player as Player
	if pl != null and not silent:
		pl.hit_marker = 1.0
		pl.kill_marker = hp <= 0.0
		pl.add_trauma(0.12 if hp > 0.0 else 0.22)
		Sfx.play("stab", -7.0, 1.5)
	if hp > 0.0:
		kb_vel = push * float(F["knockback"])
		stun = float(F["stun"])
	if hp <= 0.0:
		_die(silent)
		return
	if state != S.CHASE:
		last_seen = GameState.player.global_position if GameState.player != null else global_position
		alert = 1.0
		_enter_chase()

func _die(silent: bool) -> void:
	dead = true
	state = S.DEAD
	remove_from_group("hearing")
	collision_layer = 0
	collision_mask = 0
	if not silent:
		GameState.stats["kills_loud"] += 1
	sprite.rotation = deg_to_rad(90)
	sprite.offset = Vector2(0, -4)
	sprite.modulate = Color(0.55, 0.5, 0.5)
	sprite.frame = 0
	z_index = -1
	queue_redraw()

func _draw() -> void:
	if dead:
		draw_circle(Vector2(0, 0), 7.0, Color(0.35, 0.03, 0.03, 0.75))
		return
	draw_circle(Vector2(0, -1), 5.0, Color(0, 0, 0, 0.28))
	var E: Dictionary = Balance.d["enemy"]
	var r := float(E["vision_range"]) * (1.4 if state == S.CHASE else 1.0)
	var half := deg_to_rad(float(E["vision_fov"]) * 0.5)
	var col := Color(1, 0.95, 0.5, 0.07)
	if state == S.INVESTIGATE or state == S.SEARCH:
		col = Color(1, 0.65, 0.2, 0.10)
	elif state == S.CHASE:
		col = Color(1, 0.2, 0.2, 0.12)
	var o := Vector2(0, -10)
	var pts := PackedVector2Array([o])
	var base := facing.angle()
	var n := 14
	for i in n + 1:
		var a := base - half + (2.0 * half) * float(i) / float(n)
		pts.append(o + Vector2.from_angle(a) * r)
	draw_colored_polygon(pts, col)
	# 警覺條與符號
	if alert > 0.05 and state != S.CHASE:
		draw_rect(Rect2(-7, -30, 14, 2), Color(0, 0, 0, 0.6))
		draw_rect(Rect2(-7, -30, 14.0 * clampf(alert, 0.0, 1.0), 2), Color(1, 0.8, 0.3))
	var font := ThemeDB.fallback_font
	if state == S.CHASE:
		draw_string(font, Vector2(-3, -31), "!", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 0.25, 0.25))
	elif state == S.INVESTIGATE or state == S.SEARCH:
		draw_string(font, Vector2(-3, -31), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 0.8, 0.3))
