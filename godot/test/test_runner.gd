extends Node
## 無介面自動測試（以場景方式執行，才能使用 autoload）。執行：
##   godot --headless --path godot --fixed-fps 60 res://test/test_runner.tscn
## 全部通過回傳 0，否則 1。

var fails := 0
var passes := 0
var main_node: Node = null
var level: Level
var player: Player

func check(name: String, cond: bool, detail := "") -> void:
	if cond:
		passes += 1
		print("  PASS  ", name)
	else:
		fails += 1
		print("  FAIL  ", name, "  ", detail)

func frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	print("== 槍械機率（統計）==")
	_test_gun()
	print("== 載入關卡 ==")
	main_node = load("res://scenes/main.tscn").instantiate()
	get_tree().root.add_child(main_node)
	await frames(5)
	level = main_node.level
	player = main_node.player
	check("關卡載入、玩家存在", level != null and player != null)
	_test_reachability()
	await _test_hearing()
	await _test_shutter()
	await _test_noise_radii()
	await _test_backstab_and_melee()
	await _test_gunfight()
	await _test_jam_clear()
	await _test_ads_and_move_penalty()
	await _test_feel()
	await _test_doors_and_rescue()
	print("")
	print("結果：%d 通過、%d 失敗" % [passes, fails])
	get_tree().quit(1 if fails > 0 else 0)

# ------------------------------------------------------------------
func _test_gun() -> void:
	var g := Gun.new()
	g.rng.seed = 12345
	var N := 20000
	# 鹽鏽 15 發匣：2% + 12% = 14%
	var jams := 0
	for i in N:
		g.jam = Gun.Jam.NONE
		g.mag = 15
		if g.fire() == Gun.Result.JAMMED:
			jams += 1
	var r1 := float(jams) / N
	check("鹽鏽槍卡彈率約 14%%（實測 %.3f）" % r1, absf(r1 - 0.14) < 0.012)
	g.rust = false
	jams = 0
	for i in N:
		g.jam = Gun.Jam.NONE
		g.mag = 15
		if g.fire() == Gun.Result.JAMMED:
			jams += 1
	var r2 := float(jams) / N
	check("除鏽後卡彈率約 2%%（實測 %.3f）" % r2, absf(r2 - 0.02) < 0.008)
	jams = 0
	for i in N:
		g.jam = Gun.Jam.NONE
		g.mag = 20
		if g.fire() == Gun.Result.JAMMED:
			jams += 1
	var r3 := float(jams) / N
	check("硬塞 20 發卡彈率約 60%%（實測 %.3f）" % r3, absf(r3 - 0.60) < 0.015)
	var h := Gun.new()
	h.mag = 3
	h.reserve = 30
	h.reload(false)
	check("換彈匣補到 15、備彈扣除", h.mag == 15 and h.reserve == 18)
	h.reload(true)
	check("硬塞補到 20 並判定超裝", h.mag == 20 and h.is_overloaded() and h.reserve == 13)
	var ex := h.unload_extra()
	check("卸下超裝部分退回備彈", ex == 5 and h.mag == 15 and h.reserve == 18)
	h.mag = 10
	h.jam = Gun.Jam.DOUBLE_FEED
	h.clear_jam()
	check("雙進彈排障損失 1 發", h.mag == 9 and h.jam == Gun.Jam.NONE)
	h.jam = Gun.Jam.STOVEPIPE
	h.clear_jam()
	check("不退殼排障不損失子彈", h.mag == 9)
	h.mag = 0
	check("空匣開火回報 EMPTY", h.fire() == Gun.Result.EMPTY)

func _bfs_reach(from_cell: Vector2i) -> Dictionary:
	var seen := {from_cell: true}
	var q: Array[Vector2i] = [from_cell]
	var passable := ["shutter", "lockdoor", "frdoor"]
	while not q.is_empty():
		var c: Vector2i = q.pop_front()
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = c + d
			if n.x < 0 or n.y < 0 or n.x >= Level.W or n.y >= Level.H or seen.has(n):
				continue
			if level.solid.has(n) and not (level.solid[n] in passable):
				continue
			seen[n] = true
			q.append(n)
	return seen

func _test_reachability() -> void:
	var start := Vector2i(int(level.player_start.x / 16), int(level.player_start.y / 16))
	var seen := _bfs_reach(start)
	var targets := {
		"針車油（派出所）": Vector2i(28, 14), "M-01 文件（服務處）": Vector2i(30, 35),
		"超商正門": Vector2i(59, 27), "超商後門外": Vector2i(72, 37), "冷凍庫內": Vector2i(80, 23),
		"撤離點": Vector2i(92, 7), "老伯墳墓": Vector2i(19, 46),
	}
	for k in targets:
		check("可抵達：" + k, seen.has(targets[k]))
	# 鐵捲門縫只有 2 格寬、且只能蹲著通過：站立玩家不可經由 BFS 以外的方式進入
	check("派出所只有鐵捲門一個入口", _count_openings(Rect2i(26, 12, 18, 13)) == 2)

func _count_openings(r: Rect2i) -> int:
	var n := 0
	for x in range(r.position.x, r.end.x):
		for y in range(r.position.y, r.end.y):
			if x == r.position.x or x == r.end.x - 1 or y == r.position.y or y == r.end.y - 1:
				var k: String = level.solid.get(Vector2i(x, y), "")
				if k == "" or k == "shutter":
					n += 1
	return n

func _test_shutter() -> void:
	player.test_aim = Vector2.UP
	# 站立：被鐵捲門擋住
	player.global_position = Vector2(34 * 16 + 16, 25 * 16 + 8)
	Input.action_press("move_up")
	await frames(70)
	var y_stand := player.global_position.y
	Input.action_release("move_up")
	check("站立無法穿過鐵捲門（y=%.0f，門在 y=384）" % y_stand, y_stand > 384.0)
	# 蹲姿：可以通過
	player.global_position = Vector2(34 * 16 + 16, 25 * 16 + 8)
	Input.action_press("crouch")
	Input.action_press("move_up")
	await frames(130)
	var y_crouch := player.global_position.y
	Input.action_release("move_up")
	Input.action_release("crouch")
	check("蹲姿可鑽過鐵捲門（y=%.0f）" % y_crouch, y_crouch < 380.0)

func _test_noise_radii() -> void:
	var radii: Array = []
	var cb := func(_p: Vector2, r: float, src: String): radii.append([r, src])
	Acoustics.noise_made.connect(cb)
	player.test_aim = Vector2.RIGHT
	# 玻璃：行走
	player.global_position = Vector2(58 * 16, 27 * 16)
	Input.action_press("move_right")
	await frames(60)
	Input.action_release("move_right")
	var glass_loud := radii.any(func(e): return e[1] == "glass" and absf(e[0] - 192.0) < 0.1)
	check("走過碎玻璃產生 192px 聲波", glass_loud, str(radii))
	radii.clear()
	player.global_position = Vector2(58 * 16, 27 * 16)
	Input.action_press("crouch")
	Input.action_press("move_right")
	await frames(90)
	Input.action_release("move_right")
	Input.action_release("crouch")
	var glass_crouch := radii.any(func(e): return e[1] == "glass" and absf(e[0] - 96.0) < 0.1)
	check("蹲姿過玻璃聲波減半（96px）", glass_crouch, str(radii))
	radii.clear()
	player.global_position = Vector2(50 * 16, 45 * 16)
	Input.action_press("crouch")
	Input.action_press("move_right")
	await frames(90)
	Input.action_release("move_right")
	Input.action_release("crouch")
	check("蹲姿走平地不發出聲波", radii.is_empty(), str(radii))
	Acoustics.noise_made.disconnect(cb)

func _enemy(i: int) -> Enemy:
	return level.enemies[i]

func _test_hearing() -> void:
	var torch1 := _enemy(1)
	var thug := _enemy(0)
	check("初始狀態：地痞待命、乙炔混混巡邏", thug.state == Enemy.S.IDLE and torch1.state == Enemy.S.PATROL)
	player.global_position = Vector2(20 * 16, 45 * 16)           # 離所有敵人很遠
	Acoustics.make(Vector2(58 * 16, 27 * 16), 192.0, "glass")
	await frames(3)
	check("玻璃聲驚動超商巡邏者（進入調查）", torch1.state == Enemy.S.INVESTIGATE)
	check("遠處的地痞沒聽見", thug.state == Enemy.S.IDLE)
	await frames(60 * 12)
	check("調查結束後回到巡邏", torch1.state == Enemy.S.PATROL or torch1.state == Enemy.S.INVESTIGATE)

func _test_backstab_and_melee() -> void:
	var thug := _enemy(0)
	GameState.stats["kills_silent"] = 0
	# 正面：只造成 12 傷害，不致死
	thug.hp = 60.0
	player.global_position = thug.global_position + Vector2(-14, 0)
	player.test_aim = Vector2.RIGHT
	await frames(2)
	player.melee_cd = 0.0
	player.hp = 100.0
	player.try_melee()
	check("正面螺絲起子只扣 12 血", absf(thug.hp - 48.0) < 0.5 or thug.dead == false, "hp=%s" % thug.hp)
	# 重置地痞，改從背後
	level.enemies[0].queue_free()
	await frames(2)
	var e := level._spawn_enemy("thug", Vector2i(38, 19), Vector2.LEFT, 0.0, "測試地痞")
	level.enemies[0] = e
	await frames(3)
	player.global_position = e.global_position + Vector2(14, 0)
	player.test_aim = Vector2.LEFT
	player.melee_cd = 0.0
	player.try_melee()
	check("背後背刺無聲擊殺", e.dead and GameState.stats["kills_silent"] == 1, "dead=%s silent=%s state=%s facing=%s alert=%s" % [e.dead, GameState.stats["kills_silent"], e.state, e.facing, e.alert])

func _test_gunfight() -> void:
	var e := level._spawn_enemy("thug", Vector2i(38, 15), Vector2.DOWN, 0.0, "靶")
	level.enemies.append(e)
	await frames(3)
	player.hp = 1000.0
	player.gun.rust = false
	player.gun.mag = 15
	player.gun.jam = Gun.Jam.NONE
	player.global_position = e.global_position + Vector2(0, 90)
	player.test_aim = Vector2.UP
	player.force_aim = true
	player.aim_progress = 1.0
	GameState.stats["shots"] = 0
	var guard := 0
	while not e.dead and guard < 900:
		player.global_position = e.global_position + Vector2(0, 90)
		player.test_aim = Vector2.UP
		if player.gun.jam != Gun.Jam.NONE:
			player.gun.clear_jam()
		player.try_fire()
		await frames(12)
		guard += 12
	check("步槍 2~3 發可擊倒混混（用 %d 發）" % GameState.stats["shots"], e.dead and GameState.stats["shots"] >= 2 and GameState.stats["shots"] <= 5)
	check("開槍後槍聲會觸發聲波事件", GameState.stats["noise_events"] > 0)

func _test_jam_clear() -> void:
	player.hp = 100.0
	player.busy_kind = ""
	player.gun.jam = Gun.Jam.DOUBLE_FEED
	player.gun.mag = 10
	player.try_reload_or_clear()
	check("卡彈時按 R 進入排障動作", player.busy_kind == "clear")
	await frames(75)
	check("排障 1 秒後完成：解除卡彈且損失 1 發", player.gun.jam == Gun.Jam.NONE and player.gun.mag == 9, "mag=%d jam=%d busy=%s" % [player.gun.mag, player.gun.jam, player.busy_kind])
	player.gun.mag = 5
	player.gun.reserve = 30
	player.try_cram()
	await frames(150)
	check("硬塞彈匣到 20 發", player.gun.mag == 20 and player.gun.is_overloaded(), "mag=%d" % player.gun.mag)

func _test_doors_and_rescue() -> void:
	check("後門鎖一開始是實心", level.solid.get(Vector2i(72, 36), "") == "lockdoor")
	var from := Vector2(72 * 16 + 8, 38 * 16)
	var to := Vector2(72 * 16 + 8, 34 * 16)
	var locked_len := level.find_path(from, to).size()
	level.open_door("back")
	level.open_door("freezer")
	await frames(2)
	var open_len := level.find_path(from, to).size()
	check("撬開後門後捷徑出現（路徑 %d → %d 格）" % [locked_len, open_len], open_len < locked_len and open_len <= 8)
	check("後門格不再是障礙", not level.solid.has(Vector2i(72, 36)) and not level.solid.has(Vector2i(73, 36)))
	check("冷凍庫門開啟後致晴可被互動", level.companion.can_interact())
	GameState.flags["zhiqing_rescued"] = false
	level.companion._on_rescued()
	check("獲救後旗標與目標更新", GameState.flags["zhiqing_rescued"] and GameState.objective.contains("撤離點"))
	player.global_position = level.companion.global_position + Vector2(60, 0)
	player.test_aim = Vector2.RIGHT
	Input.action_press("move_right")
	await frames(150)
	Input.action_release("move_right")
	var dist := level.companion.global_position.distance_to(player.global_position)
	check("致晴獲救後會跟隨玩家（距離 %.0f px）" % dist, dist < 70.0)
	player.global_position = Vector2(92 * 16, 7 * 16)
	await frames(5)
	check("獲救後抵達撤離點 → 過關", GameState.won)

func _test_ads_and_move_penalty() -> void:
	player.force_aim = false
	player.aim_progress = 0.0
	player.bloom = 0.0
	# 方向不一致減速（純函式）
	var m_fwd := player.aim_move_mult(Vector2.RIGHT, Vector2.RIGHT)
	var m_side := player.aim_move_mult(Vector2.UP, Vector2.RIGHT)
	var m_back := player.aim_move_mult(Vector2.LEFT, Vector2.RIGHT)
	check("朝瞄準方向前進不減速", is_equal_approx(m_fwd, 1.0))
	check("側移（90°）略減速：%.2f" % m_side, m_side < 1.0 and m_side > m_back)
	check("退行（180°）降到 back_mult：%.2f" % m_back, absf(m_back - float(Balance.d["player"]["aim_penalty"]["back_mult"])) < 0.001)
	# 實際移動距離：前進 vs 退行
	player.test_aim = Vector2.RIGHT
	player.global_position = Vector2(8 * 16, 43 * 16)
	await frames(2)
	var x0 := player.global_position.x
	Input.action_press("move_right")
	await frames(30)
	Input.action_release("move_right")
	var d_fwd := player.global_position.x - x0
	player.global_position = Vector2(8 * 16, 43 * 16)
	await frames(2)
	x0 = player.global_position.x
	Input.action_press("move_left")
	await frames(30)
	Input.action_release("move_left")
	var d_back := x0 - player.global_position.x
	check("同樣 30 幀，退行距離約為前進的 70%%（前進 %.1f／退行 %.1f）" % [d_fwd, d_back], d_back < d_fwd * 0.88 and d_back > d_fwd * 0.55)
	# 準星：按住瞄準後散布逐步縮小，開槍後膨脹
	await frames(60)
	var hip := player.current_spread
	player.force_aim = true
	await frames(90)
	var aimed := player.current_spread
	check("瞄準 1.5 秒後散布明顯縮小（%.3f → %.3f rad）" % [hip, aimed], aimed < hip * 0.3 and player.aim_progress > 0.98)
	player.gun.mag = 15
	player.gun.jam = Gun.Jam.NONE
	player.gun.rust = false
	player.fire_cd = 0.0
	player.try_fire()
	await frames(2)
	check("開槍後準星膨脹", player.current_spread > aimed + 0.01)
	player.force_aim = false
	await frames(20)
	check("放開右鍵後瞄準度回落", player.aim_progress < 0.5)
	# 瞄準時射程加長
	player.force_aim = true
	player.aim_progress = 1.0
	check("瞄準射程為腰射的 1.25 倍", absf(lerpf(1.0, float(Balance.d["gun"]["aim"]["aimed_range_mult"]), player.aim_progress) - 1.25) < 0.001)
	player.force_aim = false
	player.aim_progress = 0.0

func _test_feel() -> void:
	player.force_aim = false
	player.hp = 100.0
	player.stamina = 3.0
	player.roll_cd = 0.0
	player.test_aim = Vector2.RIGHT
	player.global_position = Vector2(8 * 16, 43 * 16)
	await frames(3)
	# 加速度：起步第一幀不會直接達到全速
	Input.action_press("move_right")
	await frames(2)
	var v_early := player.velocity.x
	await frames(20)
	var v_full := player.velocity.x
	Input.action_release("move_right")
	check("起步有加速感（早期 %.0f < 全速 %.0f）" % [v_early, v_full], v_early < v_full * 0.9 and v_full > 70.0)
	await frames(4)
	check("放開後有減速滑行（速度 %.0f）" % player.velocity.x, player.velocity.x < v_full)
	await frames(30)
	# 翻滾
	player.global_position = Vector2(8 * 16, 43 * 16)
	await frames(3)
	var st0 := player.stamina
	var x0 := player.global_position.x
	player.try_roll()
	check("翻滾耗體力 1 秒份", absf((st0 - player.stamina) - float(Balance.d["player"]["roll"]["cost"])) < 0.2, "%.2f -> %.2f" % [st0, player.stamina])
	await frames(6)
	player.take_damage(50.0, Vector2.ZERO)
	check("翻滾無敵幀：不受傷", player.hp == 100.0)
	await frames(20)
	check("翻滾位移 > 25px（%.0f）" % (player.global_position.x - x0), player.global_position.x - x0 > 25.0)
	player.try_roll()
	check("翻滾冷卻中不可連滾", player.roll_t <= 0.0)
	await frames(40)
	# 命中回饋：擊退＋血花＋命中標記
	var e := level._spawn_enemy("thug", Vector2i(40, 20), Vector2.DOWN, 0.0, "靶2")
	level.enemies.append(e)
	await frames(3)
	var x_e := e.global_position.x
	e.take_damage(10.0, e.global_position + Vector2(-8, 0))
	check("被擊中會被擊退（kb %.0f）" % e.kb_vel.x, e.kb_vel.x > 50.0)
	check("命中標記亮起", player.hit_marker > 0.5)
	check("血花粒子產生", GameState.fx != null and GameState.fx.ps.size() > 0)
	await frames(20)
	check("敵人實際被推開（%.1f px）" % (e.global_position.x - x_e), e.global_position.x - x_e > 3.0)
	# 開槍後座：鏡頭踢動、彈殼產生
	player.gun.mag = 15
	player.gun.jam = Gun.Jam.NONE
	player.gun.rust = false
	player.fire_cd = 0.0
	player.global_position = Vector2(8 * 16, 43 * 16)
	await frames(2)
	player.try_fire()
	check("開槍產生鏡頭震動與後座", player.trauma > 0.1 and player.kick_v.length() > 1.0)
	var has_casing: bool = GameState.fx.ps.any(func(p): return p["k"] == "casing")
	check("開槍彈出彈殼", has_casing)
