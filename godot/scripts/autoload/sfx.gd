extends Node
## 簡易音效播放：Sfx.play("shot")。無音訊裝置（headless）時自動略過。
var streams := {}
var pool: Array[AudioStreamPlayer] = []

func _ready() -> void:
	for n in ["shot", "click", "step", "step_soft", "rack", "stab", "glass", "blip", "hurt", "pry", "hit", "kill"]:
		var p := "res://assets/audio/%s.wav" % n
		if ResourceLoader.exists(p):
			streams[n] = load(p)
	for i in 8:
		var a := AudioStreamPlayer.new()
		add_child(a)
		pool.append(a)

func play(name: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not streams.has(name):
		return
	for a in pool:
		if not a.playing:
			a.stream = streams[name]
			a.volume_db = volume_db
			a.pitch_scale = pitch
			a.play()
			return
