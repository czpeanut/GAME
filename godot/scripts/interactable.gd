class_name Interactable
extends Node2D
## 場景中可互動的物件：道具、文獻、墳墓、撬鎖門、冷凍庫門。

var kind := ""
var label := ""
var icon_name := ""
var hold_time := 0.0
var used := false
var icon: Texture2D = null
var t := 0.0

func _ready() -> void:
	add_to_group("interactable")
	if icon_name != "":
		icon = load("res://assets/art/icon_%s.png" % icon_name)
	t = randf() * 6.0

func can_interact() -> bool:
	if used:
		return false
	return true

func prompt() -> String:
	return label

func _process(delta: float) -> void:
	t += delta
	if icon != null and not used:
		queue_redraw()

func _draw() -> void:
	if icon == null or used:
		return
	var bob := sin(t * 2.5) * 1.2
	draw_circle(Vector2(0, 0), 7.0, Color(1, 1, 0.8, 0.10))
	draw_texture_rect(icon, Rect2(-6, -12 + bob, 12, 12), false)

func on_hold_start(_p: Node) -> void:
	if kind == "lock_door":
		Sfx.play("pry")
		Acoustics.make(global_position, float(Balance.d["noise"]["pry"]), "pry")

func _consume() -> void:
	used = true
	remove_from_group("interactable")
	visible = false

func interact(p: Node) -> void:
	var lvl: Level = GameState.level
	match kind:
		"tutorial":
			GameState.show_dialogue([
				"老伯留下的字條：「小子，T65K2 的鹽鏽要用針車油擦。派出所的鐵捲門卡了一半，蹲著才鑽得進去。」",
				"【移動】WASD　【跑步】Shift（吵）　【蹲姿】C / Ctrl（安靜，視野較小）\n【瞄準】滑鼠　【開槍】左鍵　【螺絲起子】右鍵（從背後 = 無聲擊殺）",
				"【換彈匣／排障】R　【硬塞彈匣到 20 發】T（卡彈率 60%）　【手電筒】F　【互動】E",
			], "")
		"grave":
			GameState.flags["grave_seen"] = true
			GameState.show_dialogue([
				"（東港的小土堆，土還是鬆的。）",
				"佑任：……謝了，老伯。是你把我從枋寮撿回來，撐了我一個月。",
				"佑任：我得回嘉義，找雅涵和念念。",
			], "oldman")
		"oil":
			p.gun.rust = false
			GameState.flags["has_oil"] = true
			GameState.flags["rust_removed"] = true
			GameState.say("用針車油擦拭槍機：T65K2 鹽鏽清除（卡彈率 14% → 2%）", Color(0.7, 1, 0.7))
			Sfx.play("rack")
			GameState.set_objective("目標：前往林園超商（地圖東側）救出被困的人")
			_consume()
		"doc_m01":
			GameState.flags["fragment_read"] = true
			GameState.show_dialogue([
				"【碎紙機半焚毀文件】《新境界智庫：封鎖期選情推演簡報》",
				"【封鎖第 6 個月・極機密】「數據顯示外部威脅焦慮有效壓制國右黨支持度。建議持續放大『戰貓全民防衛』公關聲量，將缺電缺糧責任全面導向境外勢力。」",
				"「切記：維持『準戰爭邊緣』最有利於本黨年底特別預算通過，中蘇絕不敢跨越紅線實體登陸。」",
			], "")
			_consume()
		"glow":
			GameState.flags["glowsticks"] = 30
			GameState.show_dialogue([
				"鐵櫃裡只有 30 箱未拆封的「戰貓紀念螢光棒」。",
				"半顆子彈都沒有。",
			], "")
			_consume()
		"lock_door":
			if lvl != null:
				lvl.open_door("back")
			Sfx.play("pry")
			Acoustics.make(global_position, float(Balance.d["noise"]["pry"]), "pry")
			GameState.say("後門鎖撬開了", Color(0.7, 1, 0.7))
			_consume()
		"freezer_door":
			if lvl != null:
				lvl.open_door("freezer")
			Sfx.play("rack")
			Acoustics.make(global_position, float(Balance.d["noise"]["freezer_door"]), "door")
			_consume()
