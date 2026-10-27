extends Node
## 聲學共鳴圈：所有會發出聲音的行為都呼叫 Acoustics.make(位置, 半徑, 來源)。
## 範圍內的 "hearing" 群組節點會收到 hear()；隔牆時半徑打折。

signal noise_made(pos: Vector2, radius: float, source: String)
var world: Node2D = null     # 放置波紋視覺的容器（由 main 設定）
var last_player_noise := 0.0
var last_player_noise_time := -10.0

func make(pos: Vector2, radius: float, source: String = "", from_player := true) -> void:
	if radius <= 0.0:
		return
	GameState.stats["noise_events"] += 1
	if from_player:
		last_player_noise = radius
		last_player_noise_time = Time.get_ticks_msec() / 1000.0
	noise_made.emit(pos, radius, source)
	for n in get_tree().get_nodes_in_group("hearing"):
		if not is_instance_valid(n) or not n.has_method("hear"):
			continue
		var d: float = n.global_position.distance_to(pos)
		var eff := radius
		if world != null and _blocked(pos, n.global_position):
			eff *= float(Balance.d["noise"]["wall_mult"])
		if d <= eff:
			n.hear(pos, radius, source)
	if world != null and radius >= 48.0:
		var ring := NoiseRing.new()
		ring.max_radius = radius
		ring.global_position = pos
		ring.tint = Color(0.85, 0.95, 1.0) if source != "gunshot" else Color(1.0, 0.75, 0.4)
		world.add_child(ring)

func _blocked(a: Vector2, b: Vector2) -> bool:
	var space := world.get_world_2d().direct_space_state
	var q := PhysicsRayQueryParameters2D.create(a, b, 1)
	return not space.intersect_ray(q).is_empty()

func level_now() -> float:
	return Time.get_ticks_msec() / 1000.0

## 近 0.8 秒內玩家製造的最大噪音半徑（給 HUD 用）
func recent_player_noise() -> float:
	var age := level_now() - last_player_noise_time
	if age > 0.8:
		return 0.0
	return last_player_noise * (1.0 - age / 0.8)
