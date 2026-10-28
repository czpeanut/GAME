class_name Fx
extends CanvasLayer
## 打擊感特效：火花、血花、彈殼、煙。繪於獨立圖層（不受環境暗化），變換跟隨鏡頭。

const MAX := 520
var node: Node2D
var ps: Array[Dictionary] = []

func _ready() -> void:
	layer = 4
	node = Node2D.new()
	add_child(node)
	node.draw.connect(_draw_ps)
	GameState.fx = self

func _exit_tree() -> void:
	if GameState.fx == self:
		GameState.fx = null

func _add(p: Dictionary) -> void:
	if ps.size() >= MAX:
		ps.pop_front()
	ps.append(p)

func sparks(pos: Vector2, dir: Vector2, n := 6) -> void:
	for i in n:
		var d := dir.rotated(randf_range(-1.1, 1.1))
		_add({"k": "spark", "p": pos, "v": d * randf_range(60.0, 190.0), "life": randf_range(0.12, 0.3), "max": 0.3, "drag": 5.0})

func blood(pos: Vector2, dir: Vector2, n := 8) -> void:
	for i in n:
		var d := dir.rotated(randf_range(-0.8, 0.8))
		_add({"k": "blood", "p": pos, "v": d * randf_range(40.0, 150.0), "life": randf_range(0.25, 0.7), "max": 0.7, "drag": 6.0, "s": randf_range(1.0, 2.2)})

func casing(pos: Vector2, dir: Vector2) -> void:
	var side := dir.orthogonal() * (1.0 if randf() < 0.5 else 1.0)
	_add({"k": "casing", "p": pos, "v": side * randf_range(40.0, 75.0) + dir * randf_range(-15.0, 10.0), "z": 8.0, "vz": randf_range(70.0, 120.0), "life": 2.6, "max": 2.6, "drag": 0.0})

func smoke(pos: Vector2, dir: Vector2) -> void:
	_add({"k": "smoke", "p": pos, "v": dir * randf_range(8.0, 22.0) + Vector2(0, -8), "life": 0.5, "max": 0.5, "drag": 2.0})

func _process(delta: float) -> void:
	node.transform = get_viewport().get_canvas_transform()
	for p in ps:
		p["life"] -= delta
		var k: String = p["k"]
		if k == "casing":
			p["z"] += p["vz"] * delta
			p["vz"] -= 420.0 * delta
			if p["z"] <= 0.0:
				p["z"] = 0.0
				if absf(p["vz"]) > 40.0:
					p["vz"] = -p["vz"] * 0.35
				else:
					p["vz"] = 0.0
				p["v"] = p["v"] * exp(-9.0 * delta)
			p["p"] += p["v"] * delta
		else:
			p["p"] += p["v"] * delta
			p["v"] = p["v"] * exp(-float(p["drag"]) * delta)
	ps = ps.filter(func(p): return p["life"] > 0.0)
	node.queue_redraw()

func _draw_ps() -> void:
	for p in ps:
		var a: float = clampf(float(p["life"]) / float(p["max"]), 0.0, 1.0)
		var pos: Vector2 = p["p"]
		match p["k"]:
			"spark":
				node.draw_line(pos, pos - (p["v"] as Vector2).normalized() * (2.0 + 4.0 * a), Color(1.0, 0.85, 0.4, a), 1.0)
			"blood":
				node.draw_rect(Rect2(pos, Vector2(p["s"], p["s"])), Color(0.55, 0.05, 0.05, 0.4 + 0.6 * a))
			"casing":
				var q: Vector2 = pos + Vector2(0, -float(p["z"]))
				node.draw_rect(Rect2(q, Vector2(2, 1)), Color(0.9, 0.72, 0.25, minf(1.0, a * 3.0)))
			"smoke":
				node.draw_circle(pos, 1.5 + (1.0 - a) * 3.0, Color(0.75, 0.75, 0.75, a * 0.25))
