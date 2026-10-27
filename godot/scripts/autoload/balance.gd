extends Node
## 載入 res://data/balance.json；其他腳本以 Balance.d["gun"]["mag_size"] 讀取。
var d: Dictionary = {}

func _init() -> void:
	# 若執行檔旁有 balance.json 就優先使用（不開 Godot 也能調數值）
	var path := "res://data/balance.json"
	var ext := OS.get_executable_path().get_base_dir().path_join("balance.json")
	if FileAccess.file_exists(ext):
		path = ext
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("balance.json 載入失敗")
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		d = parsed
