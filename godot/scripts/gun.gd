class_name Gun
extends RefCounted
## T65K2 槍械邏輯（與畫面無關，可單獨測試）。
## 規則（GDD）：彈匣標準 15 發；硬塞超過 15 發 → 卡彈率 60%；初期帶鹽分鏽蝕。
## 卡彈種類：雙進彈（排障時損失 1 發）／不退殼。

enum Jam { NONE, DOUBLE_FEED, STOVEPIPE }
enum Result { FIRED, JAMMED, EMPTY, BUSY }

var mag := 15
var reserve := 30
var rust := true
var jam: int = Jam.NONE
var rng := RandomNumberGenerator.new()

func _init() -> void:
	mag = int(Balance.d["gun"]["start_mag"])
	reserve = int(Balance.d["gun"]["start_reserve"])
	rng.randomize()

func mag_size() -> int:
	return int(Balance.d["gun"]["mag_size"])

func is_overloaded() -> bool:
	return mag > mag_size()

func jam_chance() -> float:
	var j: Dictionary = Balance.d["gun"]["jam"]
	if is_overloaded():
		return float(j["overload"])
	return float(j["base"]) + (float(j["rust"]) if rust else 0.0)

## 嘗試開火。回傳 Result；FIRED 時已扣彈。
func fire() -> int:
	if jam != Jam.NONE:
		return Result.JAMMED
	if mag <= 0:
		return Result.EMPTY
	if rng.randf() < jam_chance():
		jam = Jam.DOUBLE_FEED if rng.randf() < 0.5 else Jam.STOVEPIPE
		GameState.stats["jams"] += 1
		return Result.JAMMED
	mag -= 1
	return Result.FIRED

## 排障：拉槍機。雙進彈會損失一發。
func clear_jam() -> void:
	if jam == Jam.DOUBLE_FEED and mag > 0:
		mag -= 1
	jam = Jam.NONE

## 換彈匣：補到 15 發（cram=true 則硬塞到 20 發）。回傳實際補入發數。
func reload(cram := false) -> int:
	var target := int(Balance.d["gun"]["cram_size"]) if cram else mag_size()
	var need := maxi(0, target - mag)
	var take := mini(need, reserve)
	mag += take
	reserve -= take
	return take

## 卸下超過 15 發的部分，退回備彈。
func unload_extra() -> int:
	if mag <= mag_size():
		return 0
	var extra := mag - mag_size()
	mag = mag_size()
	reserve += extra
	return extra

func status_text() -> String:
	var s := "%s  %d/%d  備彈 %d" % [Balance.d["gun"]["name"], mag, mag_size(), reserve]
	return s
