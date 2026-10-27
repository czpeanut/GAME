extends Node2D
## 第一章遊戲場景：組裝關卡、玩家、介面；處理光照、屋頂淡出、撤離與重來。
## 命令列（僅供開發驗證用）：godot --path godot -- --shot=out.png --at=x,y --aim=dx,dy --frames=30 --zoom=0.3 --noroof --bright

const AMB_OUT := Color(0.52, 0.48, 0.52)
const AMB_DARK := Color(0.09, 0.09, 0.12)
const AMB_DIM := Color(0.30, 0.29, 0.31)

var canvas_mod: CanvasModulate
var level: Level
var actors: Node2D
var player: Player
var hud: Hud
var dlg: DialogueBox
var args := {}
var frame_count := 0
var warn_t := 0.0

func _ready() -> void:
	GameState.reset()
	Acoustics.world = self
	_parse_args()
	canvas_mod = CanvasModulate.new()
	canvas_mod.color = AMB_DARK
	add_child(canvas_mod)
	level = Level.new()
	add_child(level)
	actors = Node2D.new()
	actors.y_sort_enabled = true
	add_child(actors)
	GameState.level = level
	level.setup(actors)
	player = Player.new()
	player.position = level.player_start
	actors.add_child(player)
	player.died.connect(_on_died)
	_apply_cam_limits()
	add_child(DustMotes.new())
	hud = Hud.new()
	add_child(hud)
	Input.mouse_mode = Input.MOUSE_MODE_HIDDEN
	dlg = DialogueBox.new()
	add_child(dlg)
	_apply_dev_args()

func _parse_args() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1] if kv.size() > 1 else "1"

func _apply_cam_limits() -> void:
	player.cam.limit_left = 0
	player.cam.limit_top = 0
	player.cam.limit_right = Level.W * Level.T
	player.cam.limit_bottom = Level.H * Level.T

func _apply_dev_args() -> void:
	if args.has("at"):
		var xy: PackedStringArray = String(args["at"]).split(",")
		player.global_position = Vector2(float(xy[0]), float(xy[1]))
		player.cam.position_smoothing_enabled = false
	if args.has("aim"):
		var d: PackedStringArray = String(args["aim"]).split(",")
		player.test_aim = Vector2(float(d[0]), float(d[1]))
	if args.has("zoom"):
		var z := float(args["zoom"])
		player.cam.zoom = Vector2(z, z)
		player.cam.limit_left = -10000
		player.cam.limit_top = -10000
		player.cam.limit_right = 10000
		player.cam.limit_bottom = 10000
	if args.has("ads"):
		player.force_aim = true
	if args.has("crouch"):
		Input.action_press("crouch")
	if args.has("flashlight_off"):
		player.flashlight_on = false
	if args.has("interact"):
		for n in get_tree().get_nodes_in_group("interactable"):
			if n is Interactable and n.kind == String(args["interact"]):
				n.interact(player)
				break
	if args.has("win"):
		GameState.flags["zhiqing_rescued"] = true
		GameState.won = true

func _process(delta: float) -> void:
	frame_count += 1
	if args.has("noise") and frame_count == 5:
		Acoustics.make(player.global_position, float(args["noise"]), "gunshot" if float(args["noise"]) > 300.0 else "glass")
	var target := AMB_OUT
	match level.darkness_at(player.global_position):
		1: target = AMB_DARK
		2: target = AMB_DIM
	if args.has("bright"):
		target = Color(1, 1, 1)
	canvas_mod.color = canvas_mod.color.lerp(target, clampf(delta * 5.0, 0.0, 1.0))
	if not args.has("noroof"):
		level.update_roofs(player.global_position, delta)
	else:
		for b in level.buildings:
			b["roof"].visible = false
	warn_t = maxf(0.0, warn_t - delta)
	if args.has("fire") and frame_count == int(args.get("frames", "30")) - 3:
		player.gun.jam = Gun.Jam.NONE
		player.gun.rust = false
		player.try_fire()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if (GameState.game_over or GameState.won) else Input.MOUSE_MODE_HIDDEN
	if not GameState.game_over and not GameState.won and level.in_exit(player.global_position):
		if GameState.flags["zhiqing_rescued"]:
			GameState.won = true
		elif warn_t <= 0.0:
			warn_t = 4.0
			GameState.say("不能丟下致晴——先去超商救人", Color(1, 0.8, 0.4))
	if (GameState.game_over or GameState.won) and Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
	if Input.is_action_just_pressed("pause"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		get_tree().change_scene_to_file("res://scenes/title.tscn")
	if args.has("shot") and frame_count >= int(args.get("frames", "30")):
		_save_shot(String(args["shot"]))

func _save_shot(path: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("saved ", path, " ", img.get_size())
	get_tree().quit()

func _on_died() -> void:
	GameState.say("你倒下了……", Color(1, 0.4, 0.4))
