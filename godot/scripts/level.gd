class_name Level
extends Node2D
## 第一章「東港與林園廢墟」關卡：以程式依 GDD 藍圖生成地圖、碰撞、遮光與敵人配置。
## 座標單位：格（1 格 = 16 px）。

const T := 16
const W := 100
const H := 56

const OCCLUDING := ["wall", "shelf", "car", "lockdoor", "frdoor"]
const LAYER_WORLD := 1
const LAYER_SHUTTER := 8
const LAYER_LOW := 16

var solid := {}                      # Vector2i -> kind
var floors := {}                     # Vector2i -> floor id
var buildings: Array[Dictionary] = []
var glass_rects: Array[Rect2i] = []
var shutter_rects: Array[Rect2i] = []
var solid_rects: Array[Dictionary] = []
var door_bodies := {}                # id -> StaticBody2D
var door_cells := {}                 # id -> Array[Vector2i]
var exit_rect := Rect2i(90, 5, 6, 5)
var player_start := Vector2.ZERO
var astar: AStarGrid2D
var tiles: Texture2D
var actors: Node2D
var enemies: Array[Enemy] = []
var companion: Node2D = null

func setup(actors_node: Node2D) -> void:
	actors = actors_node
	tiles = load("res://assets/art/tiles.png")
	z_index = -10
	_define()
	_build_astar()
	_build_collision()
	_build_ground()
	_build_roofs()
	_spawn_entities()
	queue_redraw()

# ------------------------------------------------------------------ 地圖定義
func _cell(x: int, y: int) -> Vector2i:
	return Vector2i(x, y)

func _fill(r: Rect2i, kind: String) -> void:
	for x in range(r.position.x, r.end.x):
		for y in range(r.position.y, r.end.y):
			solid[Vector2i(x, y)] = kind

func _building(name: String, r: Rect2i, dark: int, floor_id: int, gaps: Array) -> void:
	for x in range(r.position.x, r.end.x):
		for y in range(r.position.y, r.end.y):
			floors[Vector2i(x, y)] = floor_id
			if x == r.position.x or x == r.end.x - 1 or y == r.position.y or y == r.end.y - 1:
				solid[Vector2i(x, y)] = "wall"
	for g in gaps:
		for x in range(g.position.x, g.end.x):
			for y in range(g.position.y, g.end.y):
				solid.erase(Vector2i(x, y))
	buildings.append({"name": name, "rect": r, "dark": dark, "roof": null})

func _door(id: String, kind: String, r: Rect2i) -> void:
	_fill(r, kind)
	var cells: Array[Vector2i] = []
	for x in range(r.position.x, r.end.x):
		for y in range(r.position.y, r.end.y):
			cells.append(Vector2i(x, y))
	door_cells[id] = cells

func _define() -> void:
	for x in W:
		solid[Vector2i(x, 0)] = "fence"
		solid[Vector2i(x, H - 1)] = "fence"
	for y in H:
		solid[Vector2i(0, y)] = "fence"
		solid[Vector2i(W - 1, y)] = "fence"

	# A. 老伯防空洞（起點）
	_building("防空洞", Rect2i(3, 38, 14, 12), 1, 0, [Rect2i(16, 43, 1, 2)])
	_fill(Rect2i(4, 46, 3, 2), "crate")
	_fill(Rect2i(13, 39, 2, 2), "crate")
	_fill(Rect2i(11, 45, 1, 1), "fire")
	player_start = _center(Vector2i(9, 43))

	# B1. 廢棄派出所（鐵捲門卡一半：蹲姿鑽入）
	_building("廢棄派出所", Rect2i(26, 12, 18, 13), 1, 0, [])
	_fill(Rect2i(34, 24, 2, 1), "shutter")
	shutter_rects.append(Rect2i(34, 24, 2, 1))
	_fill(Rect2i(30, 18, 7, 1), "shelf")          # 櫃檯
	_fill(Rect2i(40, 14, 3, 1), "crate")
	_fill(Rect2i(28, 22, 2, 2), "crate")

	# B2. 民左黨鄉代服務處
	_building("民左黨鄉代服務處", Rect2i(26, 30, 16, 9), 1, 0, [Rect2i(26, 34, 1, 2)])
	_fill(Rect2i(29, 33, 4, 1), "shelf")
	_fill(Rect2i(35, 33, 4, 1), "shelf")
	_fill(Rect2i(29, 36, 4, 1), "shelf")
	_fill(Rect2i(35, 36, 4, 1), "shelf")
	_fill(Rect2i(39, 31, 2, 2), "crate")

	# C. 林園萊爾富超商
	_building("萊爾富超商", Rect2i(60, 20, 24, 17), 2, 1, [Rect2i(60, 26, 1, 3)])
	_fill(Rect2i(65, 23, 7, 1), "shelf")
	_fill(Rect2i(65, 32, 7, 1), "shelf")
	_fill(Rect2i(74, 24, 1, 7), "shelf")
	_fill(Rect2i(61, 31, 2, 4), "shelf")           # 收銀櫃檯
	_fill(Rect2i(77, 21, 1, 6), "wall")            # 冷凍庫西牆
	_fill(Rect2i(77, 27, 7, 1), "wall")            # 冷凍庫南牆
	solid.erase(Vector2i(79, 27)); solid.erase(Vector2i(80, 27))
	_door("freezer", "frdoor", Rect2i(79, 27, 2, 1))
	for x in range(78, 83):
		for y in range(21, 27):
			floors[Vector2i(x, y)] = 2
	for x in range(79, 81):
		floors[Vector2i(x, 27)] = 2
	solid.erase(Vector2i(72, 36)); solid.erase(Vector2i(73, 36))
	_door("back", "lockdoor", Rect2i(72, 36, 2, 1))
	glass_rects.append(Rect2i(56, 25, 7, 5))

	# 加油站（繞後門路線）
	_fill(Rect2i(66, 44, 1, 2), "pump")
	_fill(Rect2i(66, 48, 1, 2), "pump")
	_fill(Rect2i(72, 44, 1, 2), "pump")
	_fill(Rect2i(72, 48, 1, 2), "pump")
	_fill(Rect2i(76, 42, 3, 2), "car")
	# 道路殘骸、魚塭、柵欄
	_fill(Rect2i(46, 36, 3, 2), "car")
	_fill(Rect2i(52, 40, 3, 2), "car")
	_fill(Rect2i(88, 30, 3, 2), "car")
	_fill(Rect2i(56, 12, 2, 3), "car")
	_fill(Rect2i(6, 5, 17, 9), "pond")
	for x in range(20, 25):
		solid[Vector2i(x, 31)] = "fence"
	for y in range(15, 22):
		solid[Vector2i(52, y)] = "fence"
	for x in range(86, 94):
		solid[Vector2i(x, 22)] = "fence"

func _center(c: Vector2i) -> Vector2:
	return Vector2(c.x * T + T / 2.0, c.y * T + T / 2.0)

# ------------------------------------------------------------------ 查詢 API
func building_at(pos: Vector2) -> Variant:
	for b in buildings:
		var r: Rect2i = b["rect"]
		if Rect2(r.position * T, r.size * T).has_point(pos):
			return b
	return null

func darkness_at(pos: Vector2) -> int:
	var b: Variant = building_at(pos)
	return 0 if b == null else int(b["dark"])

func is_dark_at(pos: Vector2) -> bool:
	return darkness_at(pos) == 1

func is_glass(pos: Vector2) -> bool:
	for r in glass_rects:
		if Rect2(r.position * T, r.size * T).has_point(pos):
			return true
	return false

func in_shutter_zone(pos: Vector2) -> bool:
	for r in shutter_rects:
		if Rect2(Vector2(r.position * T) - Vector2(5, 7), Vector2(r.size * T) + Vector2(10, 14)).has_point(pos):
			return true
	return false

func in_exit(pos: Vector2) -> bool:
	return Rect2(exit_rect.position * T, exit_rect.size * T).has_point(pos)

func open_door(id: String) -> void:
	if door_bodies.has(id):
		var b: Node = door_bodies[id]
		if is_instance_valid(b):
			b.queue_free()
		door_bodies.erase(id)
	if door_cells.has(id):
		for c in door_cells[id]:
			solid.erase(c)
			if astar != null:
				astar.set_point_solid(c, false)
		door_cells.erase(id)
	for i in range(solid_rects.size() - 1, -1, -1):
		if solid_rects[i].get("door", "") == id:
			solid_rects.remove_at(i)
	queue_redraw()

# ------------------------------------------------------------------ 路徑
func _build_astar() -> void:
	astar = AStarGrid2D.new()
	astar.region = Rect2i(0, 0, W, H)
	astar.cell_size = Vector2(T, T)
	astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	astar.update()
	for c in solid:
		astar.set_point_solid(c, true)

func _nearest_free(c: Vector2i) -> Vector2i:
	if astar.is_in_boundsv(c) and not astar.is_point_solid(c):
		return c
	for r in range(1, 5):
		for dx in range(-r, r + 1):
			for dy in range(-r, r + 1):
				if maxi(absi(dx), absi(dy)) != r:
					continue
				var n := c + Vector2i(dx, dy)
				if astar.is_in_boundsv(n) and not astar.is_point_solid(n):
					return n
	return c

func find_path(from: Vector2, to: Vector2) -> PackedVector2Array:
	var a := _nearest_free(Vector2i(int(floor(from.x / T)), int(floor(from.y / T))))
	var b := _nearest_free(Vector2i(int(floor(to.x / T)), int(floor(to.y / T))))
	var ids := astar.get_id_path(a, b)
	var out := PackedVector2Array()
	for i in ids.size():
		if i == 0 and ids.size() > 1:
			continue
		out.append(_center(ids[i]))
	if out.size() > 0 and not astar.is_point_solid(Vector2i(int(floor(to.x / T)), int(floor(to.y / T)))):
		out[out.size() - 1] = to
	return out

# ------------------------------------------------------------------ 碰撞與遮光
func _layer_for(kind: String) -> int:
	match kind:
		"shutter": return LAYER_SHUTTER
		"crate", "fence", "pond", "fire": return LAYER_LOW
		_: return LAYER_WORLD

func _merge(cells: Array) -> Array[Rect2i]:
	var set := {}
	for c in cells:
		set[c] = true
	var sorted := cells.duplicate()
	sorted.sort_custom(func(a: Vector2i, b: Vector2i): return a.y < b.y or (a.y == b.y and a.x < b.x))
	var used := {}
	var out: Array[Rect2i] = []
	for c in sorted:
		if used.has(c):
			continue
		var w := 1
		while set.has(Vector2i(c.x + w, c.y)) and not used.has(Vector2i(c.x + w, c.y)):
			w += 1
		var h := 1
		var ok := true
		while ok:
			for i in w:
				var n := Vector2i(c.x + i, c.y + h)
				if not set.has(n) or used.has(n):
					ok = false
					break
			if ok:
				h += 1
		for i in w:
			for j in h:
				used[Vector2i(c.x + i, c.y + j)] = true
		out.append(Rect2i(c.x, c.y, w, h))
	return out

func _build_collision() -> void:
	var kinds := {}
	for c in solid:
		if not kinds.has(solid[c]):
			kinds[solid[c]] = []
		kinds[solid[c]].append(c)
	for kind in kinds:
		for r in _merge(kinds[kind]):
			var body := StaticBody2D.new()
			body.collision_layer = _layer_for(kind)
			body.collision_mask = 0
			body.position = Vector2(r.position * T)
			var cs := CollisionShape2D.new()
			var sh := RectangleShape2D.new()
			sh.size = Vector2(r.size * T)
			cs.shape = sh
			cs.position = sh.size / 2.0
			body.add_child(cs)
			if kind in OCCLUDING:
				var occ := LightOccluder2D.new()
				var poly := OccluderPolygon2D.new()
				poly.polygon = PackedVector2Array([Vector2.ZERO, Vector2(sh.size.x, 0), sh.size, Vector2(0, sh.size.y)])
				occ.occluder = poly
				body.add_child(occ)
			add_child(body)
			var entry := {"rect": r, "kind": kind}
			if kind == "lockdoor":
				door_bodies["back"] = body
				entry["door"] = "back"
			elif kind == "frdoor":
				door_bodies["freezer"] = body
				entry["door"] = "freezer"
			solid_rects.append(entry)

func _build_ground() -> void:
	var g := Sprite2D.new()
	g.texture = load("res://assets/reused/ground_rubble.png")
	g.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	g.region_enabled = true
	g.region_rect = Rect2(0, 0, W * T, H * T)
	g.centered = false
	g.z_index = -1
	g.modulate = Color(0.9, 0.9, 0.95)
	add_child(g)

func _build_roofs() -> void:
	for b in buildings:
		var r: Rect2i = b["rect"]
		var roof := Roof.new()
		roof.size = Vector2(r.size * T)
		roof.position = Vector2(r.position * T)
		roof.name_text = b["name"]
		roof.z_as_relative = false
		roof.z_index = 50
		add_child(roof)
		b["roof"] = roof

func update_roofs(player_pos: Vector2, delta: float) -> void:
	var inside: Variant = building_at(player_pos)
	for b in buildings:
		var roof: Roof = b["roof"]
		var target := 0.0 if (inside != null and inside == b) else 0.97
		roof.fade_to(target, delta)

# ------------------------------------------------------------------ 實體生成
func _spawn_enemy(kind: String, cell: Vector2i, face: Vector2, sweep: float, nm: String, route: Array = []) -> Enemy:
	var e := Enemy.new()
	e.kind = kind
	e.position = _center(cell)
	e.facing = face
	e.home_facing = face
	e.sweep_deg = sweep
	e.display_name = nm
	for c in route:
		e.patrol.append(_center(c))
	if route.size() > 0:
		e.state = Enemy.S.PATROL
	actors.add_child(e)
	enemies.append(e)
	return e

func _spawn_item(kind: String, cell: Vector2, label: String, icon: String, hold := 0.0) -> Interactable:
	var it := Interactable.new()
	it.kind = kind
	it.label = label
	it.icon_name = icon
	it.hold_time = hold
	it.position = Vector2(cell.x * T, cell.y * T)
	actors.add_child(it)
	return it

func _spawn_entities() -> void:
	# 敵人
	_spawn_enemy("thug", Vector2i(38, 19), Vector2.LEFT, 22.0, "遊蕩地痞")
	_spawn_enemy("torch", Vector2i(63, 27), Vector2.RIGHT, 0.0, "乙炔混混",
		[Vector2i(63, 27), Vector2i(70, 27), Vector2i(70, 30), Vector2i(63, 30)])
	_spawn_enemy("torch", Vector2i(69, 34), Vector2.LEFT, 25.0, "乙炔混混")
	var cf := Campfire.new()
	cf.position = _center(Vector2i(11, 45)) + Vector2(0, 4)
	actors.add_child(cf)
	# 道具與互動
	_spawn_item("tutorial", _center(Vector2i(6, 41)), "老伯留下的字條", "bench")
	_spawn_item("grave", _center(Vector2i(19, 46)), "老伯的新墳", "grave")
	_spawn_item("oil", _center(Vector2i(28, 14)), "針車油", "oil")
	_spawn_item("doc_m01", _center(Vector2i(30, 35)), "半焚毀的碎紙機文件", "doc")
	_spawn_item("glow", _center(Vector2i(39, 33)).round() + Vector2(0, 0), "鐵櫃裡的紀念螢光棒", "glow")
	_spawn_item("lock_door", Vector2(73 * T, 36 * T + 8), "[按住 E] 螺絲起子撬後門鎖", "", float(Balance.d["interact"]["pry_time"]))
	_spawn_item("freezer_door", Vector2(80 * T, 27 * T + 8), "[E] 打開冷凍庫門", "")
	var comp := Companion.new()
	comp.position = _center(Vector2i(80, 23))
	actors.add_child(comp)
	companion = comp

# ------------------------------------------------------------------ 繪製
func _tile_rect(i: int) -> Rect2:
	return Rect2((i % 8) * 16, (i / 8) * 16, 16, 16)

func _hash(c: Vector2i) -> float:
	var h := (c.x * 73856093) ^ (c.y * 19349663)
	return float(absi(h) % 1000) / 1000.0

func _draw() -> void:
	_draw_roads()
	_draw_floors()
	_draw_glass()
	_draw_solids()
	_draw_exit()

func _draw_roads() -> void:
	for r in [Rect2i(1, 39, 98, 3), Rect2i(48, 1, 3, 54)]:
		for x in range(r.position.x, r.end.x):
			for y in range(r.position.y, r.end.y):
				var c := Vector2i(x, y)
				draw_texture_rect_region(tiles, Rect2(Vector2(c) * T, Vector2(T, T)), _tile_rect(7 if _hash(c) > 0.82 else 6))
		# 路緣
		var rr := Rect2(r.position * T, r.size * T)
		draw_rect(Rect2(rr.position, Vector2(rr.size.x, 1)), Color(0.55, 0.53, 0.5, 0.55))
		draw_rect(Rect2(rr.position + Vector2(0, rr.size.y - 1), Vector2(rr.size.x, 1)), Color(0.1, 0.1, 0.11, 0.6))
	for x in range(2, 98, 4):
		draw_rect(Rect2(x * T, 40 * T + 6, 20, 2), Color(0.78, 0.7, 0.32, 0.5))
	for y in range(2, 54, 4):
		draw_rect(Rect2(49 * T + 7, y * T, 2, 20), Color(0.78, 0.7, 0.32, 0.5))
	# 戶外散落物：雜草、碎石、油漬、積水、紙屑
	for x in range(1, W - 1):
		for y in range(1, H - 1):
			var c := Vector2i(x, y)
			if solid.has(c) or floors.has(c):
				continue
			var h := _hash(c)
			var idx := -1
			if h < 0.035: idx = 11
			elif h < 0.05: idx = 12
			elif h < 0.058: idx = 15
			elif h > 0.992: idx = 14
			if idx < 0:
				continue
			if idx == 11 and (y >= 39 and y < 42 or x >= 48 and x < 51):
				continue
			draw_texture_rect_region(tiles, Rect2(Vector2(c) * T, Vector2(T, T)), _tile_rect(idx))
	for r in [Rect2i(1, 39, 98, 3), Rect2i(48, 1, 3, 54)]:
		for i in 14:
			var c := Vector2i(r.position.x + int(_hash(Vector2i(i, r.position.y)) * r.size.x), r.position.y + int(_hash(Vector2i(r.position.x, i)) * r.size.y))
			draw_texture_rect_region(tiles, Rect2(Vector2(c) * T, Vector2(T, T)), _tile_rect(13 if i % 3 else 12))

func _draw_floors() -> void:
	for c in floors:
		var id: int = floors[c]
		var idx := 0
		match id:
			0: idx = 0 if _hash(c) < 0.8 else 1
			1: idx = 2 if (c.x + c.y) % 2 == 0 else 3
			2: idx = 4
			3: idx = 5
		draw_texture_rect_region(tiles, Rect2(Vector2(c) * T, Vector2(T, T)), _tile_rect(idx))

func _draw_glass() -> void:
	for r in glass_rects:
		for x in range(r.position.x, r.end.x):
			for y in range(r.position.y, r.end.y):
				var c := Vector2i(x, y)
				if solid.has(c) or _hash(c) < 0.25:
					continue
				draw_texture_rect_region(tiles, Rect2(Vector2(c) * T, Vector2(T, T)), _tile_rect(10))

func _draw_solids() -> void:
	# 牆：逐格貼圖，南側露出牆面
	for c in solid:
		if solid[c] != "wall":
			continue
		var p := Vector2(c) * T
		draw_texture_rect_region(tiles, Rect2(p, Vector2(T, T)), _tile_rect(8))
		if solid.get(c + Vector2i(0, 1), "") != "wall":
			draw_texture_rect_region(tiles, Rect2(p + Vector2(0, T), Vector2(T, 10)), Rect2(16, 16, 16, 10))
			draw_rect(Rect2(p + Vector2(0, T + 10), Vector2(T, 3)), Color(0, 0, 0, 0.35))
	for e in solid_rects:
		var r: Rect2i = e["rect"]
		var rect := Rect2(r.position * T, r.size * T)
		match e["kind"]:
			"shelf":
				var horiz: bool = rect.size.x >= rect.size.y
				draw_rect(Rect2(rect.position + Vector2(1, rect.size.y), Vector2(rect.size.x - 1, 4)), Color(0, 0, 0, 0.35))
				draw_rect(rect, Color(0.36, 0.28, 0.2))
				draw_rect(Rect2(rect.position, Vector2(rect.size.x, 3)), Color(0.6, 0.49, 0.36))
				draw_rect(rect, Color(0.12, 0.09, 0.07), false, 1.0)
				var goods := [Color(0.82, 0.38, 0.28), Color(0.36, 0.62, 0.56), Color(0.88, 0.76, 0.34), Color(0.5, 0.42, 0.7)]
				if horiz:
					var rows := maxi(1, int((rect.size.y - 3) / 8.0))
					for row in rows:
						var yy := rect.position.y + 4 + row * 8
						draw_line(Vector2(rect.position.x + 1, yy + 6), Vector2(rect.end.x - 1, yy + 6), Color(0.2, 0.15, 0.1), 1.0)
						for i in int((rect.size.x - 2) / 5.0):
							var gc: Color = goods[(i + row * 2) % 4]
							draw_rect(Rect2(rect.position.x + 2 + i * 5, yy + 1, 4, 5), gc)
							draw_rect(Rect2(rect.position.x + 2 + i * 5, yy + 1, 4, 1), gc.lightened(0.35))
				else:
					for i in int((rect.size.y - 2) / 5.0):
						var gc2: Color = goods[i % 4]
						draw_rect(Rect2(rect.position.x + 3, rect.position.y + 2 + i * 5, rect.size.x - 6, 4), gc2)
						draw_rect(Rect2(rect.position.x + 3, rect.position.y + 2 + i * 5, rect.size.x - 6, 1), gc2.lightened(0.35))
			"crate":
				draw_rect(Rect2(rect.position + Vector2(1, rect.size.y - 1), Vector2(rect.size.x, 3)), Color(0, 0, 0, 0.3))
				draw_rect(rect, Color(0.42, 0.34, 0.22))
				for ci in int(rect.size.x / 16.0):
					for cj in int(rect.size.y / 16.0):
						var o := rect.position + Vector2(ci * 16, cj * 16)
						draw_rect(Rect2(o, Vector2(16, 16)), Color(0.12, 0.09, 0.06), false, 1.0)
						draw_rect(Rect2(o + Vector2(1, 1), Vector2(14, 2)), Color(0.58, 0.47, 0.31))
						draw_line(o + Vector2(2, 14), o + Vector2(14, 2), Color(0.25, 0.19, 0.12), 1.0)
						draw_line(o + Vector2(2, 2), o + Vector2(14, 14), Color(0.25, 0.19, 0.12), 1.0)
			"car":
				draw_rect(Rect2(rect.position + Vector2(2, rect.size.y - 2), Vector2(rect.size.x, 5)), Color(0, 0, 0, 0.35))
				draw_rect(rect, Color(0.34, 0.26, 0.24))
				draw_rect(rect.grow(-2), Color(0.46, 0.35, 0.31))
				draw_rect(Rect2(rect.position + Vector2(rect.size.x * 0.28, 4), Vector2(rect.size.x * 0.44, rect.size.y - 8)), Color(0.17, 0.22, 0.27))
				draw_rect(Rect2(rect.position + Vector2(rect.size.x * 0.28, 4), Vector2(rect.size.x * 0.44, 3)), Color(0.36, 0.46, 0.54))
				draw_rect(Rect2(rect.position, Vector2(rect.size.x, 2)), Color(0.62, 0.5, 0.45))
				draw_rect(rect, Color(0.1, 0.07, 0.07), false, 1.0)
				for k in 5:
					var rp := rect.position + Vector2(fmod(float(k) * 17.3 + 5.0, rect.size.x - 4.0), fmod(float(k) * 11.1 + 3.0, rect.size.y - 4.0))
					draw_rect(Rect2(rp, Vector2(3, 2)), Color(0.55, 0.3, 0.16, 0.8))
				draw_rect(Rect2(rect.position + Vector2(2, rect.size.y - 1), Vector2(5, 3)), Color(0.08, 0.08, 0.08))
				draw_rect(Rect2(rect.position + Vector2(rect.size.x - 7, rect.size.y - 1), Vector2(5, 3)), Color(0.08, 0.08, 0.08))
			"pump":
				draw_rect(Rect2(rect.position + Vector2(1, rect.size.y - 1), Vector2(rect.size.x, 4)), Color(0, 0, 0, 0.3))
				draw_rect(rect, Color(0.66, 0.2, 0.18))
				draw_rect(Rect2(rect.position, Vector2(rect.size.x, 3)), Color(0.86, 0.32, 0.27))
				draw_rect(Rect2(rect.position + Vector2(3, 5), Vector2(rect.size.x - 6, 8)), Color(0.84, 0.84, 0.78))
				draw_rect(Rect2(rect.position + Vector2(4, 6), Vector2(rect.size.x - 8, 3)), Color(0.2, 0.55, 0.3))
				draw_rect(rect, Color(0.12, 0.05, 0.05), false, 1.0)
			"pond":
				draw_rect(rect, Color(0.05, 0.12, 0.12))
				for i in range(0, int(rect.size.y), 12):
					draw_line(rect.position + Vector2(6, i + 6), rect.position + Vector2(rect.size.x - 6, i + 6), Color(0.12, 0.26, 0.26, 0.6), 1.0)
			"fence":
				for x in range(int(rect.position.x), int(rect.end.x), 8):
					draw_line(Vector2(x, rect.position.y), Vector2(x, rect.end.y), Color(0.55, 0.55, 0.5, 0.55), 1.0)
				draw_line(rect.position + Vector2(0, 2), Vector2(rect.end.x, rect.position.y + 2), Color(0.6, 0.6, 0.55, 0.7), 1.0)
			"shutter":
				draw_rect(rect, Color(0.46, 0.48, 0.5))
				for i in range(0, int(rect.size.y) + 1, 3):
					draw_line(rect.position + Vector2(0, i), rect.position + Vector2(rect.size.x, i), Color(0.3, 0.32, 0.34), 1.0)
				draw_rect(Rect2(rect.position + Vector2(0, 0), Vector2(rect.size.x, 4)), Color(0.3, 0.32, 0.34))
			"lockdoor":
				draw_rect(rect, Color(0.34, 0.3, 0.26))
				draw_rect(rect.grow(-2), Color(0.42, 0.37, 0.31))
				draw_rect(Rect2(rect.position + Vector2(rect.size.x - 7, 5), Vector2(3, 5)), Color(0.8, 0.7, 0.3))
			"frdoor":
				draw_rect(rect, Color(0.78, 0.86, 0.9))
				draw_rect(rect.grow(-2), Color(0.64, 0.74, 0.8))
				draw_rect(Rect2(rect.position + Vector2(rect.size.x * 0.5 - 1, 4), Vector2(2, 6)), Color(0.3, 0.3, 0.3))

func _draw_exit() -> void:
	var rect := Rect2(exit_rect.position * T, exit_rect.size * T)
	draw_rect(rect, Color(0.2, 0.7, 0.35, 0.18))
	draw_rect(rect, Color(0.4, 0.95, 0.55, 0.7), false, 1.0)
	var font := ThemeDB.fallback_font
	draw_string(font, rect.position + Vector2(4, 12), "E", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.5, 1, 0.6))
