# 會說話的人偶 AI QA Avatar

輸入問題，Gemini 回答，畫面上的角色人偶把答案唸出來，嘴型跟著真實語音走。介面是「學習問答助理」三欄式版面：左側對話紀錄、中間人偶、右側對話串。

> 完整的技術決策過程、試過並放棄的方案、已修復 bug 的根因、還沒解決的問題，見 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。要合併這個 repo 到其他專案之前建議先看過。

## 技術架構

- **問答**：[Gemini API](https://ai.google.dev) 產生答案。系統指令要求它用簡短口語回答、不要 Markdown 或 LaTeX，因為答案會被直接唸出來；後端另有一層清洗當保險。
- **語音**：Gemini 的 TTS 模型（男聲 `Puck`）。回傳無檔頭的 L16 PCM，後端補上 WAV 檔頭再送給前端，**由瀏覽器自己播放**。
- **畫面**：Canvas 上的**剛體切塊人偶**——角色立繪拆成頭／軀幹／雙手／瀏海／嘴型等部件，各自有關節和彈簧，會呼吸、微傾、頭髮延遲擺動。沒有任何第三方服務、沒有 WebRTC、沒有授權費。
- **嘴型**：語音回來之後先量一次**音量包絡**（每 60ms 一格），播放時用 `audio.currentTime` 查表決定嘴巴閉合／半開／張開。不是隨機開合，是跟著真的在說什麼走。
- **後端**：Node.js + Express，只做兩件事：呼叫 Gemini 取得答案、呼叫 Gemini TTS 取得語音（金鑰全部留在伺服器端）。

## 為什麼不用第三方虛擬人服務

前一版用的是 [Simli](https://www.simli.com) 的即時串流虛擬人：把照片送上去建 avatar，播放時把音訊餵過去、透過 WebRTC 取回嘴型同步的影像。換掉的原因：

| | Simli 串流 | 現在的人偶 |
|---|---|---|
| 每次回答的外部往返 | 建 session token ＋ 整段 WebRTC 串流 | 無 |
| 開場等待 | 要先連線才能發問（手機上常失敗） | 直接就能問 |
| 費用 | 免費 50 分鐘／月，超過按量計費 | 0 |
| 素材 | 需要清晰正臉照片 | 需要拆好的角色立繪部件 |
| 風格 | 真人照片 | 可以是任何畫出來的角色 |

代價是嘴型只有三段（閉合／半開／張開），不是真的音素對嘴。實測在這個尺寸下看不太出來——會動的是嘴、閉合的時機對得上句子的停頓，這兩件事到位就夠了。

## 事前準備

1. Node.js 18 以上
2. 一組 [Gemini API key](https://aistudio.google.com/apikey)（問答與語音共用同一把）

沒了。不需要第二個服務的帳號，也不需要事先建立 avatar。

## 安裝與設定

```bash
npm install
cp .env.example .env    # 填入 GEMINI_API_KEY
npm run build
npm start
```

開啟 `http://localhost:3000`。

## 測試

```bash
npm test          # 嘴型軌道的單元測試（純數學，不需要瀏覽器）
npm run test:browser   # 端對端：真的開 Chromium、擋掉兩個 Gemini 呼叫、檢查嘴型有跟著音訊走
```

瀏覽器測試會自己啟動 server，不需要 API key（兩個 Gemini 端點都被攔截成假資料），也不會花到錢。沒裝 playwright 或找不到 Chromium 時會直接跳過。

## 換成別的角色

人偶的素材規格和拆分工具在這個 repo 的根目錄（`tools/split-parts.py`、`tools/cut-variants.py`，說明見根目錄 README 的「動態立繪：素材拆分規格」）。換角色要做的事：

1. 把部件圖放進 `public/assets/characters/<新角色 id>/<部件>/<變體>.png`
2. 改 `public/src/puppet/hero.js`：角色 id、關節位置（`pivot`，每個角色各自量）、名字
3. `npm run build`

沒提供的部件會自動跳過，可以一張一張補。目前 `eyes` 還沒有素材，所以人偶不會眨眼。

## 部署到 Render

在 [Render](https://render.com) 點 **New +** → **Blueprint** → 選這個 repo → 分支選 `claude/speaking-puppet` → **Apply**。環境變數只需要 `GEMINI_API_KEY`。

**`render.yaml` 在 repo 根目錄，不在這個資料夾裡。** Render 只從 repo 根目錄讀這個檔，不會去子資料夾找——所以藍圖放在根目錄，用 `rootDir: speaking` 指回這裡，`npm install`、建置、啟動都在這個資料夾裡跑。

如果把這個資料夾單獨拉出去變成自己的 repo，把根目錄那份 `render.yaml` 搬過來，並刪掉 `rootDir` 那一行。

**注意**：免費方案閒置約 15 分鐘會休眠，下次有人造訪要等十幾秒到一分鐘的冷啟動。

## 可調整的環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.6-flash` | 回答問題用的模型 |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | 語音合成模型 |
| `GEMINI_TTS_VOICE` | `Puck` | 語音角色，可換成 Gemini 其他內建聲音 |

## 已知限制

- 嘴型是三段音量對應，不是音素對嘴——聽起來對得上，但不會有 ㄅㄆㄇ 的嘴型差異
- 人偶不會眨眼（缺 `eyes` 素材）
- 語音合成一句話約需 7–11 秒（Gemini TTS 不支援逐段串流，實測會整段一次回傳）
- 語速控制是靠自然語言指示（「請用較慢的語速說」）達成，不是精確倍率
- 手機上的自動播放限制仍然存在，靠的是在送出當下先播一小段無聲音訊把 `<audio>` 解鎖（見 `public/src/app.js`）
