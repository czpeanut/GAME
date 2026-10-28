class_name Player
extends CharacterBody2D
## 佑任：移動／蹲姿／手電筒／開槍／近戰背刺／互動。

signal died

const SHEET := "res://assets/art/char_player.png"
const FOOT_RADIUS := 4.5

var gun := Gun.new()
var hp := 100.0
var stamina := 3.0
var stamina_lock := 0.0
var crouching := false
var sprinting := false
var flashlight_on := true
var facing_row := 0
var aim_dir := Vector2.DOWN
var test_aim: Variant = null          # 測試／腳本可覆寫瞄準方向（Vector2）
var fire_cd := 0.0
var melee_cd := 0.0
var step_t := 0.0
var shutter_t := 0.0
var busy_kind := ""                   # "" | reload | cram | clear | unload
var busy_t := 0.0
var busy_total := 1.0
var hold_t := 0.0                     # 長按互動進度
var muzzle_flash := 0.0
var stab_flash := 0.0
var hurt_flash := 0.0
var anim_t := 0.0
var interact_target: Node = null
# ADS 準星（移植自 Scratched-T 的縮小準星系統）
var aim_progress := 0.0               # 0 = 腰射，1 = 完全瞄準
var bloom := 0.0                      # 開槍後的準星膨脹（度）
var current_spread := 0.15            # 目前半角散布（弧度）
var force_aim := false                # 測試用：視為按住瞄準
var aim_locked_played := false
var trauma := 0.0                     # 鏡頭震動
var cam_lead := Vector2.ZERO          # 鏡頭往準星方向前推
var kick_v := Vector2.ZERO            # 開槍後座（鏡頭）
var hit_marker := 0.0
var kill_marker := false
var roll_t := 0.0
var roll_total := 0.28
var roll_cd := 0.0
var roll_dir := Vector2.RIGHT
var aiming := false                   # Helldivers 式舉槍狀態
var raise_t := 0.0                    # 開槍後維持舉槍的秒數
var laser_len := 0.0                  # 雷射瞄準線長度
var still_t := 0.0                    # 站定秒數（準星自動收斂）
var move_mult := 1.0                  # 移動方向與瞄準方向不同造成的減速倍率

var sprite: Sprite2D
var cone: PointLight2D                # 寬光錐（腰射）
var cone_n: PointLight2D              # 窄光錐（瞄準時，射程更遠）
var glow: PointLight2D
var flash_light: PointLight2D
var cam: Camera2D

func _ready() -> void:
	add_to_group("player")
	GameState.player = self
	hp = float(Balance.d["player"]["hp"])
	stamina = float(Balance.d["player"]["stamina_max"])
	collision_layer = 2
	collision_mask = 1 | 16
	var cs := CollisionShape2D.new()
	var sh := CircleShape2D.new()
	sh.radius = FOOT_RADIUS
	cs.shape = sh
	cs.position = Vector2(0, -3)
	add_child(cs)
	sprite = Sprite2D.new()
	sprite.texture = load(SHEET)
	sprite.hframes = 3
	sprite.vframes = 4
	sprite.offset = Vector2(0, -12)
	add_child(sprite)
	cone = PointLight2D.new()
	cone.texture = load("res://assets/art/light_cone.png")
	cone.texture_scale = 0.9
	cone.energy = 1.25
	cone.shadow_enabled = true
	cone.shadow_filter = Light2D.SHADOW_FILTER_PCF5
	cone.position = Vector2(0, -10)
	add_child(cone)
	cone_n = PointLight2D.new()
	cone_n.texture = load("res://assets/art/light_cone_narrow.png")
	cone_n.texture_scale = 1.15
	cone_n.energy = 0.0
	cone_n.shadow_enabled = true
	cone_n.shadow_filter = Light2D.SHADOW_FILTER_PCF5
	cone_n.position = Vector2(0, -10)
	add_child(cone_n)
	glow = PointLight2D.new()
	glow.texture = load("res://assets/art/light_radial.png")
	glow.texture_scale = 0.22
	glow.energy = 0.55
	glow.color = Color(0.9, 0.95, 1.0)
	glow.shadow_enabled = true
	glow.position = Vector2(0, -10)
	add_child(glow)
	flash_light = PointLight2D.new()
	flash_light.texture = load("res://assets/art/light_radial.png")
	flash_light.texture_scale = 0.75
	flash_light.energy = 0.0
	flash_light.color = Color(1.0, 0.85, 0.5)
	flash_light.position = Vector2(0, -10)
	add_child(flash_light)
	cam = Camera2D.new()
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 9.0
	cam.position = Vector2(0, -10)
	var z := float(Balance.d["feel"]["zoom"])
	cam.zoom = Vector2(z, z)
	add_child(cam)

func _aim_vector() -> Vector2:
	if test_aim is Vector2:
		return (test_aim as Vector2).normalized()
	var o := global_position + Vector2(0, -10)
	var d := get_global_mouse_position() - o
	return d.normalized() if d.length() > 2.0 else aim_dir

func _physics_process(delta: float) -> void:
	if GameState.game_over or GameState.won:
		velocity = Vector2.ZERO
		return
	_update_aim_dir(delta)
	_update_facing()
	_update_timers(delta)
	_update_camera(delta)
	if GameState.in_dialogue:
		velocity = Vector2.ZERO
		_animate(delta, false)
		return
	_handle_flashlight_toggle()
	_update_aim(delta)
	_handle_actions(delta)
	_handle_move(delta)
	_handle_interact(delta)
	_update_lights()

## Helldivers 式：不舉槍時身體朝移動方向；右鍵或開槍即舉槍，
## 舉槍時身體以有限轉速轉向滑鼠（武器重量感），子彈沿身體實際朝向射出。
func _update_aim_dir(delta: float) -> void:
	var M: Dictionary = Balance.d["player"]["aim_mode"]
	var firing := Input.is_action_pressed("fire") and not GameState.in_dialogue
	if firing:
		raise_t = float(M["hold_after_fire"])
	raise_t = maxf(0.0, raise_t - delta)
	aiming = (force_aim or Input.is_action_pressed("aim") or firing or raise_t > 0.0) and roll_t <= 0.0 and not GameState.in_dialogue
	if test_aim is Vector2:
		aim_dir = (test_aim as Vector2).normalized()
		return
	var target := aim_dir
	if aiming:
		target = _aim_vector()
	elif velocity.length() > 12.0:
		target = velocity.normalized()
	var rate := deg_to_rad(float(M["turn_deg"]) if aiming else float(M["turn_free_deg"]))
	aim_dir = Vector2.from_angle(rotate_toward(aim_dir.angle(), target.angle(), rate * delta))

func _update_aim(delta: float) -> void:
	var A: Dictionary = Balance.d["gun"]["aim"]
	if aiming:
		aim_progress = minf(1.0, aim_progress + delta / float(A["ramp_time"]))
		if aim_progress >= 0.98 and not aim_locked_played:
			aim_locked_played = true
			Sfx.play("blip", -9.0, 1.7)
	else:
		aim_progress = maxf(0.0, aim_progress - delta * float(A["release_speed"]))
		aim_locked_played = false
	bloom = maxf(0.0, bloom - delta * float(A["bloom_recover_deg"]))
	var mx := float(A["spread_max_deg"])
	var mn := float(A["spread_min_deg"])
	if velocity.length() > 8.0 or roll_t > 0.0:
		still_t = 0.0
	else:
		still_t += delta
	var settle := lerpf(1.0, float(A["settle_mult"]), clampf(still_t / float(A["settle_time"]), 0.0, 1.0))
	var base := lerpf(mx, mn, aim_progress) * settle
	if crouching:
		base *= float(A["crouch_mult"])
	var deg := base + bloom
	if velocity.length() > 5.0:
		deg += float(A["move_spread_deg"])
	current_spread = deg_to_rad(clampf(deg, mn, mx + float(A["bloom_cap_deg"])))

func _update_lights() -> void:
	var ang := aim_dir.angle()
	cone.rotation = ang
	cone_n.rotation = ang
	var on := 1.0 if flashlight_on else 0.0
	cone.energy = 1.25 * on * (1.0 - aim_progress)
	_update_laser()
	cone_n.energy = 1.45 * on * aim_progress
	flash_light.position = Vector2(0, -10) + aim_dir * 12.0
	flash_light.energy = muzzle_flash * 2.2

func _update_laser() -> void:
	laser_len = 0.0
	if not aiming:
		return
	var o := global_position + Vector2(0, -10)
	var rng := float(Balance.d["gun"]["bullet_range"]) * lerpf(1.0, float(Balance.d["gun"]["aim"]["aimed_range_mult"]), aim_progress)
	var q := PhysicsRayQueryParameters2D.create(o, o + aim_dir * rng, 1 | 32)
	q.collide_with_areas = true
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	laser_len = rng if hit.is_empty() else o.distance_to(hit["position"])

func add_trauma(a: float) -> void:
	trauma = minf(1.0, trauma + a)

func _update_camera(delta: float) -> void:
	var F: Dictionary = Balance.d["feel"]
	var lead := Vector2.ZERO
	if not GameState.in_dialogue:
		var to: Vector2
		if test_aim is Vector2:
			to = (test_aim as Vector2).normalized() * 90.0
		else:
			to = get_global_mouse_position() - (global_position + Vector2(0, -10))
		var k := lerpf(float(F["cam_lead"]), float(F["cam_lead_aim"]), aim_progress)
		var mx := lerpf(float(F["cam_lead_max"]), float(F["cam_lead_max_aim"]), aim_progress)
		lead = (to * k).limit_length(mx)
	cam_lead = cam_lead.lerp(lead, 1.0 - exp(-9.0 * delta))
	kick_v = kick_v * exp(-14.0 * delta)
	trauma = maxf(0.0, trauma - delta * 1.8)
	var sh := Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * trauma * trauma * 9.0
	cam.offset = cam_lead + kick_v + sh

func aim_move_mult(dir: Vector2, aim: Vector2) -> float:
	## 移動方向與瞄準方向夾角越大越慢：夾角 <= free_deg 不受影響，180° 退行為 back_mult。
	if dir == Vector2.ZERO:
		return 1.0
	var P: Dictionary = Balance.d["player"]["aim_penalty"]
	var ang := rad_to_deg(absf(angle_difference(dir.angle(), aim.angle())))
	var free := float(P["free_deg"])
	if ang <= free:
		return 1.0
	var t := (ang - free) / (180.0 - free)
	return lerpf(1.0, float(P["back_mult"]), t)

func _update_timers(delta: float) -> void:
	fire_cd = maxf(0.0, fire_cd - delta)
	melee_cd = maxf(0.0, melee_cd - delta)
	muzzle_flash = maxf(0.0, muzzle_flash - delta * 9.0)
	stab_flash = maxf(0.0, stab_flash - delta * 6.0)
	hurt_flash = maxf(0.0, hurt_flash - delta * 4.0)
	hit_marker = maxf(0.0, hit_marker - delta * 5.0)
	roll_cd = maxf(0.0, roll_cd - delta)
	if roll_t > 0.0:
		roll_t = maxf(0.0, roll_t - delta)
	if busy_kind != "":
		busy_t -= delta
		if busy_t <= 0.0:
			_finish_busy()

func _update_facing() -> void:
	if absf(aim_dir.x) > absf(aim_dir.y):
		facing_row = 3 if aim_dir.x > 0 else 2
	else:
		facing_row = 0 if aim_dir.y > 0 else 1

func _handle_flashlight_toggle() -> void:
	if Input.is_action_just_pressed("flashlight"):
		flashlight_on = not flashlight_on
		Sfx.play("click", -6.0)

func _handle_move(delta: float) -> void:
	var P: Dictionary = Balance.d["player"]
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var lvl: Node = GameState.level
	crouching = Input.is_action_pressed("crouch")
	var wants_sprint := Input.is_action_pressed("sprint") and not crouching and not aiming and dir != Vector2.ZERO
	stamina_lock = maxf(0.0, stamina_lock - delta)
	sprinting = wants_sprint and stamina > 0.0 and stamina_lock <= 0.0
	if sprinting:
		stamina -= delta
		if stamina <= 0.0:
			stamina = 0.0
			stamina_lock = float(P["stamina_cooldown"])
	elif stamina < float(P["stamina_max"]):
		stamina = minf(float(P["stamina_max"]), stamina + delta * float(P["stamina_regen"]))
	var speed: float = float(P["crouch"]) if crouching else (float(P["sprint"]) if sprinting else float(P["walk"]))
	if busy_kind != "":
		speed *= 0.5
	# 鐵捲門縫：蹲著才能通過
	var in_shutter: bool = lvl != null and lvl.in_shutter_zone(global_position)
	collision_mask = 1 | 16 | (0 if (crouching or in_shutter) else 8)
	move_mult = 1.0
	if aiming:
		move_mult = float(P["aim_mode"]["walk_mult"]) * aim_move_mult(dir, aim_dir)
	speed *= move_mult
	if roll_t > 0.0:
		var pr := 1.0 - roll_t / maxf(roll_total, 0.01)
		velocity = roll_dir * float(P["roll"]["speed"]) * (1.0 - 0.55 * pr)
	else:
		var target := dir * speed
		var rate := float(P["accel"]) if dir != Vector2.ZERO else float(P["friction"])
		velocity = velocity.move_toward(target, rate * delta)
	move_and_slide()
	var moving := dir != Vector2.ZERO and velocity.length() > 5.0
	if moving and roll_t <= 0.0:
		_footsteps(delta, in_shutter)
	else:
		step_t = 0.0
	_animate(delta, moving)

func _footsteps(delta: float, in_shutter: bool) -> void:
	var P: Dictionary = Balance.d["player"]
	var N: Dictionary = Balance.d["noise"]
	var interval: float = float(P["step_crouch"]) if crouching else (float(P["step_sprint"]) if sprinting else float(P["step_walk"]))
	step_t += delta
	if step_t < interval:
		return
	step_t = 0.0
	var lvl: Node = GameState.level
	var radius: float = float(N["crouch"]) if crouching else (float(N["sprint"]) if sprinting else float(N["walk"]))
	var src := "step"
	if lvl != null and lvl.is_glass(global_position):
		radius = float(N["glass"]) * (float(N["glass_crouch_mult"]) if crouching else 1.0)
		src = "glass"
		Sfx.play("glass", 0.0, randf_range(0.9, 1.1))
	elif in_shutter:
		radius = maxf(radius, float(N["shutter"]))
		src = "shutter"
		Sfx.play("pry", -10.0)
	else:
		Sfx.play("step" if not crouching else "step_soft", -8.0, randf_range(0.9, 1.15))
	Acoustics.make(global_position, radius, src)

func _animate(delta: float, moving: bool) -> void:
	anim_t += delta * (9.0 if sprinting else (5.0 if crouching else 7.0))
	var f := 0
	if moving:
		f = 1 + (int(anim_t) % 2)
	sprite.frame = facing_row * 3 + f
	if roll_t > 0.0:
		var pr := 1.0 - roll_t / maxf(roll_total, 0.01)
		sprite.position = Vector2(0, -8)
		sprite.offset = Vector2.ZERO
		sprite.rotation = pr * TAU * (1.0 if roll_dir.x >= 0.0 else -1.0) * 1.0
		sprite.scale = Vector2(1, 0.8)
	else:
		sprite.position = Vector2.ZERO
		sprite.rotation = 0.0
		sprite.scale = Vector2(1, 0.82) if crouching else Vector2.ONE
		sprite.offset = Vector2(0, -12 if not crouching else -10)
	sprite.modulate = Color(1, 0.55, 0.55) if hurt_flash > 0.0 else Color.WHITE
	queue_redraw()

# ------------------------------------------------------------------ 動作
func _handle_actions(delta: float) -> void:
	if Input.is_action_just_pressed("roll"):
		try_roll()
	if Input.is_action_pressed("fire"):
		try_fire()
	if Input.is_action_just_pressed("melee"):
		try_melee()
	if Input.is_action_just_pressed("reload"):
		try_reload_or_clear()
	if Input.is_action_just_pressed("cram"):
		try_cram()

func try_roll() -> void:
	var R: Dictionary = Balance.d["player"]["roll"]
	if roll_t > 0.0 or roll_cd > 0.0 or busy_kind != "" or stamina < float(R["cost"]):
		return
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if dir == Vector2.ZERO:
		dir = aim_dir
	roll_dir = dir.normalized()
	roll_total = float(R["time"])
	roll_t = roll_total
	roll_cd = float(R["cooldown"])
	stamina -= float(R["cost"])
	aim_progress = 0.0
	Sfx.play("step", -2.0, 0.7)
	Acoustics.make(global_position, float(R["noise"]), "roll")
	add_trauma(0.08)

func try_fire() -> int:
	if busy_kind != "" or fire_cd > 0.0 or roll_t > 0.0:
		return Gun.Result.BUSY
	if test_aim is Vector2:
		aim_dir = (test_aim as Vector2).normalized()
	raise_t = maxf(raise_t, float(Balance.d["player"]["aim_mode"]["hold_after_fire"]))
	var G: Dictionary = Balance.d["gun"]
	fire_cd = float(G["fire_delay"])
	var r := gun.fire()
	match r:
		Gun.Result.FIRED:
			GameState.stats["shots"] += 1
			var spread := current_spread
			var d := aim_dir.rotated(randf_range(-spread, spread))
			var b := Bullet.new()
			b.dir = d
			b.speed = float(G["bullet_speed"])
			b.max_range = float(G["bullet_range"]) * lerpf(1.0, float(G["aim"]["aimed_range_mult"]), aim_progress)
			b.damage = float(G["damage"])
			b.global_position = global_position + Vector2(0, -10)
			var root: Node = GameState.level.get_parent() if GameState.level != null else get_parent()
			root.add_child(b)
			muzzle_flash = 1.0
			bloom += float(G["aim"]["bloom_per_shot_deg"])
			kick_v -= aim_dir * float(G["aim"]["kick_px"])
			add_trauma(float(G["aim"]["shake"]))
			if GameState.fx != null:
				var mz := global_position + Vector2(0, -10) + aim_dir * 14.0
				GameState.fx.casing(global_position + Vector2(0, -12) + aim_dir * 4.0, aim_dir)
				GameState.fx.smoke(mz, aim_dir)
			Sfx.play("shot")
			Acoustics.make(global_position, float(Balance.d["noise"]["gunshot"]), "gunshot")
		Gun.Result.JAMMED:
			Sfx.play("click")
			Acoustics.make(global_position, float(Balance.d["noise"]["jam_click"]), "jam", true)
			GameState.say("卡彈！按 [R] 拉槍機排障", Color(1, 0.55, 0.4))
		Gun.Result.EMPTY:
			Sfx.play("click")
			GameState.say("彈匣空了：按 [R] 換彈匣", Color(1, 0.8, 0.4))
	return r

func try_reload_or_clear() -> void:
	if busy_kind != "":
		return
	var G: Dictionary = Balance.d["gun"]
	if gun.jam != Gun.Jam.NONE:
		_start_busy("clear", float(G["clear_time"]))
		Sfx.play("rack")
		Acoustics.make(global_position, float(Balance.d["noise"]["rack"]), "rack")
	elif gun.is_overloaded():
		_start_busy("unload", float(G["unload_time"]))
	elif gun.mag < gun.mag_size() and gun.reserve > 0:
		_start_busy("reload", float(G["reload_time"]))
		Acoustics.make(global_position, float(Balance.d["noise"]["reload"]), "reload")
	elif gun.reserve <= 0 and gun.mag < gun.mag_size():
		GameState.say("沒有備彈了", Color(1, 0.7, 0.4))

func try_cram() -> void:
	if busy_kind != "" or gun.jam != Gun.Jam.NONE:
		return
	if gun.mag >= int(Balance.d["gun"]["cram_size"]) or gun.reserve <= 0:
		return
	_start_busy("cram", float(Balance.d["gun"]["cram_time"]))
	Acoustics.make(global_position, float(Balance.d["noise"]["reload"]), "reload")

func _start_busy(kind: String, t: float) -> void:
	busy_kind = kind
	busy_t = t
	busy_total = t

func _finish_busy() -> void:
	match busy_kind:
		"clear":
			var was := gun.jam
			gun.clear_jam()
			GameState.say("排障完成" + ("（雙進彈：損失 1 發）" if was == Gun.Jam.DOUBLE_FEED else "（退出卡殼彈殼）"), Color(0.7, 1, 0.7))
		"reload":
			gun.reload(false)
		"cram":
			gun.reload(true)
			if gun.is_overloaded():
				GameState.say("硬塞了 %d 發……彈簧在哀號（卡彈率 60%%）" % gun.mag, Color(1, 0.7, 0.4))
		"unload":
			var n := gun.unload_extra()
			GameState.say("卸下 %d 發，退回備彈" % n, Color(0.8, 0.9, 1))
	busy_kind = ""
	busy_t = 0.0

func busy_ratio() -> float:
	if busy_kind == "":
		return 0.0
	return 1.0 - clampf(busy_t / maxf(busy_total, 0.01), 0.0, 1.0)

func try_melee() -> void:
	if melee_cd > 0.0 or busy_kind != "" or roll_t > 0.0:
		return
	if test_aim is Vector2:
		aim_dir = (test_aim as Vector2).normalized()
	var M: Dictionary = Balance.d["melee"]
	melee_cd = float(M["cooldown"])
	stab_flash = 1.0
	var best: Node = null
	var best_d := 1e9
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e) or e.dead:
			continue
		var to: Vector2 = e.global_position - global_position
		var d := to.length()
		if d > float(M["range"]):
			continue
		if d > 4.0 and to.normalized().dot(aim_dir) < 0.3:
			continue
		if d < best_d:
			best_d = d
			best = e
	if best == null:
		Sfx.play("step_soft", -4.0)
		return
	# 背刺：敵人未警覺，且玩家位於其背後（敵人面向與「敵人→玩家」向量夾角 > 90°）
	var to_me: Vector2 = (global_position - best.global_position).normalized()
	var behind: bool = best.is_unaware() and best.facing.dot(to_me) < -float(M["backstab_dot"])
	Sfx.play("stab")
	if behind:
		best.take_damage(9999.0, global_position, true)
		GameState.stats["kills_silent"] += 1
		GameState.say("無聲背刺", Color(0.7, 1, 0.8))
		Acoustics.make(global_position, float(Balance.d["noise"]["backstab"]), "backstab")
	else:
		best.take_damage(float(M["damage"]), global_position, false)
		Acoustics.make(global_position, float(Balance.d["noise"]["melee"]), "melee")

# ------------------------------------------------------------------ 互動
func _handle_interact(delta: float) -> void:
	var range_: float = float(Balance.d["interact"]["range"])
	var best: Node = null
	var best_d := range_
	for n in get_tree().get_nodes_in_group("interactable"):
		if not is_instance_valid(n) or not n.can_interact():
			continue
		var d: float = n.global_position.distance_to(global_position)
		if d < best_d:
			best_d = d
			best = n
	if best != interact_target:
		hold_t = 0.0
	interact_target = best
	if best == null:
		return
	if best.hold_time > 0.0:
		if Input.is_action_pressed("interact"):
			if hold_t == 0.0:
				best.on_hold_start(self)
			hold_t += delta
			if hold_t >= best.hold_time:
				hold_t = 0.0
				best.interact(self)
		else:
			hold_t = 0.0
	elif Input.is_action_just_pressed("interact"):
		best.interact(self)

func take_damage(amount: float, from_pos: Vector2 = Vector2.ZERO) -> void:
	if GameState.game_over or roll_t > 0.0:
		return
	add_trauma(0.5)
	if GameState.fx != null:
		GameState.fx.blood(global_position + Vector2(0, -10), (global_position - from_pos).normalized() if from_pos != Vector2.ZERO else Vector2.DOWN, 6)
	hp -= amount
	hurt_flash = 1.0
	GameState.stats["damage_taken"] += int(amount)
	Sfx.play("hurt")
	if hp <= 0.0:
		hp = 0.0
		GameState.game_over = true
		died.emit()

func is_crouching() -> bool:
	return crouching

func _draw() -> void:
	# 腳下陰影
	draw_circle(Vector2(0, -1), 5.0, Color(0, 0, 0, 0.28))
	var o := Vector2(0, -10)
	if roll_t > 0.0:
		return
	if laser_len > 14.0:
		var a0 := o + aim_dir * 14.0
		var a1 := o + aim_dir * laser_len
		draw_line(a0, a1, Color(1.0, 0.15, 0.1, 0.10), 3.0)
		draw_line(a0, a1, Color(1.0, 0.25, 0.15, 0.45), 1.0)
		draw_circle(a1, 1.6, Color(1.0, 0.35, 0.25, 0.9))
	var perp := aim_dir.orthogonal()
	# 持槍的手臂（與身體朝向分離，指向瞄準方向）
	var hand := o + aim_dir * 8.0
	var sleeve := Color(0.30, 0.32, 0.2)
	draw_line(o + perp * 2.0, hand, sleeve.darkened(0.35), 3.0)
	draw_line(o + perp * 2.0, hand, sleeve, 2.0)
	draw_circle(hand, 1.4, Color(0.79, 0.6, 0.45))
	# 手槍：槍身＋槍管，瞄準時槍口抬起、略長
	var gun_col := Color(0.14, 0.14, 0.16)
	var tip := hand + aim_dir * (6.0 + 1.5 * aim_progress)
	draw_line(hand, tip, Color(0, 0, 0, 0.9), 3.0)
	draw_line(hand, tip, gun_col, 2.0)
	draw_line(hand + aim_dir * 1.0, tip - aim_dir * 1.0, Color(0.38, 0.38, 0.42), 1.0)
	if gun.jam != Gun.Jam.NONE:
		draw_circle(o + Vector2(0, -14), 2.5, Color(1, 0.3, 0.2))
		draw_circle(o + Vector2(0, -14), 1.0, Color(1, 0.9, 0.7))
	# 槍口火光：多角星芒＋亮芯
	if muzzle_flash > 0.0:
		var c := tip + aim_dir * 2.0
		var pts := PackedVector2Array()
		var n := 10
		for k in n * 2:
			var a := aim_dir.angle() + TAU * float(k) / float(n * 2)
			var r := (6.0 + 5.0 * muzzle_flash) if k % 2 == 0 else 2.2
			if k % 4 == 0:
				r *= 1.5
			pts.append(c + Vector2.from_angle(a) * r)
		draw_colored_polygon(pts, Color(1, 0.8, 0.3, muzzle_flash * 0.9))
		draw_circle(c, 2.6 * muzzle_flash + 0.8, Color(1, 0.97, 0.8, muzzle_flash))
	if stab_flash > 0.0:
		draw_arc(o, 16.0, aim_dir.angle() - 0.7, aim_dir.angle() + 0.7, 8, Color(1, 1, 1, stab_flash), 2.0)
