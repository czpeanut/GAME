# 開發紀錄與技術交接文件

這份文件記錄「會說話的人」這個專案從最初構想到目前狀態的完整技術決策過程，包含試過但放棄的方案、為什麼放棄、已修好的 bug 與根因、還沒解決的問題。目的是讓合併到其他專案時不會丟失這些脈絡——很多決策背後有實測數據支撐，不是憑感覺選的。

最後更新：把 Simli 串流虛擬人換成自己畫的剛體人偶（分支 `claude/speaking-puppet`）。
在那之前的狀態對應 commit `346db8a`（分支 `claude/zealous-thompson-93pmdy`）。

---

## 1. 專案是什麼

使用者在網頁輸入問題 → Gemini 回答 → 畫面上的角色人偶把答案唸出來、嘴型跟著語音走。目前介面是「AI 學習問答助理」的樣式（Industry 藍圖風格設計系統），左側對話紀錄、中間人偶、右側對話串。

**畫面這一層換過人**：原本是 Simli 的串流虛擬人（真人照片 + WebRTC），現在是本地 Canvas 上的剛體切塊人偶。為什麼換、換掉之後哪些問題跟著消失，見第 6.2 節。

## 2. 目前架構（最終版）

```
使用者輸入問題
      │
      ▼
POST /api/ask ──────► Gemini API (gemini-3.6-flash)
      │                 系統指令要求：簡短口語、無 Markdown/LaTeX
      │◄──────────────  回傳文字答案（後端再做一層符號清洗保險）
      ▼
顯示答案文字 + 加入對話紀錄
      ▼
GET /api/tts?text=... ──► Gemini TTS API (gemini-2.5-flash-preview-tts)
      │                    男聲 "Puck"，回傳無檔頭 L16 PCM
      │◄───────────────── 後端補上 WAV 檔頭回傳
      ▼
瀏覽器端：decodeAudioData 解碼（順便重取樣成 16kHz）
      ▼
analyseEnvelope()：每 60ms 量一格音量 → 嘴型軌道（0 閉 / 1 半開 / 2 張開）
      ▼
<audio> 直接播放原始 WAV；每一幀用 audio.currentTime 查嘴型軌道
      ▼
Canvas 上的剛體人偶：呼吸／微傾／頭髮彈簧 + 查到的嘴型
```

後端（`server.js`）只做兩件事，金鑰全部留在伺服器端：
1. `POST /api/ask`：呼叫 Gemini 拿文字答案
2. `GET /api/tts`：呼叫 Gemini TTS 拿語音，包裝成 WAV

**沒有第三個端點了**。畫面那一層完全在瀏覽器裡，不需要任何 session token、不需要 WebRTC、不需要第二個服務的帳號。

## 3. 檔案結構

```
server.js                      後端：/api/ask、/api/tts
（render.yaml 在 repo 根目錄，不在這裡——Render 只從根目錄讀藍圖，用 rootDir 指回來）
package.json                   npm scripts：build / start / test / test:browser
scripts/
  build-client.js              esbuild 打包 public/src/app.js → public/app.bundle.js
                               （順便檢查人偶模組有沒有跟遊戲本體的原始檔漂移）
test/
  lipsync.test.mjs             嘴型軌道的單元測試（純數學，不需要瀏覽器）
  smoke.browser.mjs            端對端：起 server、開 Chromium、擋掉 Gemini、驗嘴型跟著音訊
  harness.mjs                  測試用的斷言小工具
public/
  index.html                   頁面結構（Industry 設計系統）
  style.css                    設計系統 tokens + 版面（藍圖風格：直角、四角測繪標記）
  assets/characters/hero/      人偶的部件圖（頭／軀幹／雙手／瀏海／三張嘴型）
  src/app.js                   前端邏輯原始碼（會被打包成 app.bundle.js，不要直接改 bundle）
  src/puppet/                  人偶引擎，從遊戲本體複製過來的（見下方說明）
    speaking-puppet.js         Canvas 上的人偶：構圖、迴圈、把嘴型軌道接到 audio.currentTime
    lipsync.js                 音量包絡 → 嘴型軌道（純函式，所以測得動）
    hero.js                    這個角色的 rig 定義（關節位置、各部件的動態權重）
    rig.js / spring.js / portrait-motion.js / portrait-renderer.js
    character.js / image-cache.js / loop.js
  app.bundle.js                打包產物，.gitignore 排除，每次改 src/ 後要重跑 npm run build
.env.example                   環境變數範本
```

**`public/src/puppet/` 是複製品**，原始檔在遊戲本體的 `src/vn/` 和 `src/engine/`。這樣做是為了讓這個資料夾可以整包搬走還能跑，代價是會漂移，所以 `npm run build` 會在原始檔還在的時候比對，不一樣就印警告。`hero.js`、`lipsync.js`、`speaking-puppet.js` 這三個是這個專案自己的，遊戲那邊沒有。

**重要**：`public/src/app.js` 是原始碼，`public/app.bundle.js` 是 `npm run build` 的打包產物（esbuild），兩者不同步會導致改了程式碼但畫面沒變。合併到其他專案時，CI/CD 或部署流程要確保有跑 `npm run build`（`render.yaml` 的 `buildCommand` 已經包含）。

## 4. API 串接細節

### 4.1 Gemini 問答（`/api/ask` → Gemini generateContent）

```
POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent
Header: x-goog-api-key: <GEMINI_API_KEY>
Body:
{
  "system_instruction": { "parts": [{ "text": "<語音助理系統指令，見 server.js SPEECH_SYSTEM_INSTRUCTION>" }] },
  "contents": [{ "parts": [{ "text": "<使用者問題>" }] }],
  "generationConfig": { "maxOutputTokens": 2048 }
}
```

**踩過的坑**：`gemini-3.6-flash` 是會「思考」的模型，`thoughtsTokenCount` 會吃掉 `maxOutputTokens` 的額度。原本設 300 導致 `finishReason: MAX_TOKENS`、答案在句子中間被切斷（思考用掉 285/300）。改成 2048 才穩定留出空間給思考＋可見答案兩者。`thinkingConfig.thinkingBudget` 試過設低值（128）或 0，0 會被 API 拒絕（400 INVALID_ARGUMENT），128 也沒有嚴格生效（實測還是用了 564 tokens 思考）——這個參數目前看起來不可靠，不要依賴它來省 token，直接拉高 `maxOutputTokens` 上限比較實際。

回答文字經過 `sanitizeForSpeech()`（`server.js`）清洗 Markdown/LaTeX 符號後才回傳，因為答案會被直接朗讀，殘留的 `**`、`$\frac{}{}` 這類符號唸出來會是逐字唸符號。系統指令已經要求模型不要輸出這些，清洗是保險，不是主要防線。

### 4.2 Gemini 語音合成（`/api/tts` → Gemini TTS generateContent）

```
POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TTS_MODEL}:generateContent
Header: x-goog-api-key: <GEMINI_API_KEY>
Body:
{
  "contents": [{ "parts": [{ "text": "<答案文字，語速用自然語言前綴>" }] }],
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": { "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Puck" } } }
  }
}
```

回應是 base64 的**無檔頭 L16 PCM**（`mimeType` 字串裡帶 `rate=24000`），後端 `wavHeader()` 手動組 44-byte WAV 檔頭再回傳給前端，因為瀏覽器的 `decodeAudioData` 需要完整的檔案容器格式，不能直接吃裸 PCM。

語速控制**不是精確倍率**，是靠在文字前面加自然語言指示達成（`withPaceDirection()`）：
- `rate <= 0.85` → 「請用較慢的語速說：」
- `rate >= 1.15` → 「請用較快的語速說：」

實測同一句話：慢 12.1 秒／正常 7.2 秒／快 5.3 秒，指示確實有效，但不是線性可控的倍率。

**已知延遲數據**（線上 Render 實測，2026-09-18）：
- `/api/ask`：約 3.5 秒
- `/api/tts`：約 7-17 秒（依答案長度，見下方「延遲根因」）
- 總計使用者從送出問題到聽到聲音：**約 14-20 秒**

Gemini TTS **不支援真正的逐段串流**：測過 `streamGenerateContent?alt=sse`，回應還是整段音訊一次送達（`chunks=1`），沒有邊生成邊送的效果。

### 4.3 人偶與嘴型（完全在瀏覽器裡）

沒有 API。這一層的三個重點：

**嘴型是先量好、再查表，不是即時分析。** Gemini TTS 不支援串流，整段語音會一次回來，所以在播放之前就能把整段的音量包絡量完（`lipsync.js` 的 `analyseEnvelope`），存成一格 60ms 的陣列；播放時每一幀拿 `audio.currentTime` 去查。這樣做的好處是播放路徑上沒有任何 Web Audio 節點——`<audio>` 元素照舊自己播、音量滑桿照舊有效、手機的自動播放解鎖（bug #7）照舊成立——而且它是一個純函式，可以在 Node 裡測。

包絡處理有三個實測調出來的細節，改動前先看一下：
- **60ms 一格**：中文一秒約 5-7 個音節，這個長度抓得到音節、又讓嘴巴最多一秒換 16 次。再細下去嘴巴會像在抖。
- **用第 95 百分位數正規化，不是用最大值**：一個爆音（ㄆ、ㄊ 之類）會把整句話的相對音量壓下去，結果整段都是半開嘴在喃喃自語。
- **只做「向下平滑」**：音量可以瞬間上升，但每格最多掉 0.45。字中間的塞音（ㄅㄉㄍ）有接近無聲的短暫空隙，不擋的話嘴巴會在字中間閉一下，看起來像結巴。

**構圖是「畫布是一扇窗」。** 人偶是 402×720 的全身立繪，`speaking-puppet.js` 的 `FRAMING` 指定要看哪一段（目前 `bottom: 0.46`，頭頂到腰）。注意這兩個數字是連動的：畫布尺寸固定，縱向看得越少、橫向也跟著看得越少。在 200×300 的框裡 `bottom` 壓到 0.46 以下，兩隻手就會被切掉——而手臂擺動是人偶「活著」的一半來源。

**動態分兩層。** `PortraitMotion` 只產生正規化訊號（呼吸、微傾、搖擺），`Rig` 把訊號變成每個部件的位移，`PortraitRenderer` 畫出來。`SpeakingPuppet` 的迴圈裡兩個都要呼叫——只呼叫 motion 不呼叫 rig 的話，畫面會是一張只有嘴巴在動的靜止圖（開發時真的踩到，是瀏覽器測試抓出來的）。

素材怎麼拆、嘴型怎麼從三張完稿截出來，見遊戲本體 README 的「動態立繪：素材拆分規格」。

## 5. 環境變數完整清單

| 變數 | 必要 | 說明 | 取得方式 |
|---|---|---|---|
| `GEMINI_API_KEY` | 是 | 問答與語音共用同一把 | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | 否，預設 `gemini-3.6-flash` | 問答模型 | 若這個 model 被下架，錯誤訊息通常會直接告訴你該換成哪個 |
| `GEMINI_TTS_MODEL` | 否，預設 `gemini-2.5-flash-preview-tts` | 語音合成模型 | — |
| `GEMINI_TTS_VOICE` | 否，預設 `Puck` | Gemini 內建語音角色 | Gemini API 文件列有完整清單 |
| `PORT` | 否，預設 `3000` | — | — |

`.env` 不會被 commit（`.gitignore`），合併專案時記得把這幾把 key 手動搬過去，不會隨 git 走。

## 6. 開發歷程：試過並放棄的方案

依時間序，每個都是有明確原因才放棄，不是隨意換的：

### 6.1 語音合成（TTS）演進

| 順序 | 方案 | 結果 | 放棄原因 |
|---|---|---|---|
| 1 | Azure Speech (Cognitive Services) | 可用 | 使用者希望完全免費、不需申請帳號的路徑 |
| 2 | 本機 Piper（C++ binary，女聲 huayan） | 可用但只有女聲 | 使用者要求男聲 |
| 3 | 本機 Piper（Python 版，男聲 chaowen，g2pW+BERT 拼音注音） | **實測 OOM 崩潰** | 中文男聲需要拼音注音（非 espeak），只有 Python 版 Piper 支援；記憶體峰值 **583MB**，Render 免費方案上限 512MB，服務被系統反覆 OOM 強制關閉，表現為間歇性「語音合成失敗」（見第 7 節）。已加過自動重啟機制treat 症狀，但根因是記憶體不夠，treat 不了 |
| 4 | **Gemini TTS**（現行） | 採用 | 記憶體降到 62MB、免自建服務、速度沒有變慢（Piper 在 Render 共用 CPU 上本來就要 9 秒左右） |

中文 Piper 官方語音只有三個：`huayan`（女聲，espeak 注音，穩定）、`xiao_ya`（女聲，拼音注音）、`chaowen`（男聲，拼音注音）。用音高分析（autocorrelation-based F0 estimation）量過：huayan 199Hz、xiao_ya 245Hz、chaowen 154Hz——chaowen 明顯是三者中唯一偏男聲的。

### 6.2 畫面／嘴型演進

| 順序 | 方案 | 結果 | 放棄原因 |
|---|---|---|---|
| 1 | MediaPipe 臉部特徵點偵測 + Canvas 疊圖變形（拉伸下嘴唇像素、疊深色嘴巴內部色塊） | 可動但效果差 | 使用者實測後反饋「非常不自然的色塊」、無肢體動作。這是純前端零延遲方案的技術天花板——沒有 AI 生成模型就是做不到真實嘴型，色塊是唯一能做到的效果 |
| 2 | Simli Trinity（新版 Gaussian-splat avatar） | **API 直接拒絕** | 免費方案 403，付費限定功能 |
| 3 | Simli Legacy pipeline | 用了一段時間，後來整個移除 | 見下方 |
| 4 | **Canvas 剛體切塊人偶**（現行） | 採用 | 見下方 |

**為什麼把 Simli 整個拿掉**：它能work，但代價一直都在——每次回答都要一趟外部 session token ＋ 一整段 WebRTC 串流；使用者要先等連線成功才能發問，而手機上這一步常常失敗（第 8 節的老問題）；免費額度每月 50 分鐘；而且 Legacy face pipeline 是官方標記 deprecated 的 API，隨時可能消失。改成本地人偶之後，這四件事一次全部消失：沒有外部往返、沒有連線步驟、沒有額度、沒有 deprecated API 風險，而且角色可以是任何畫出來的人，不限真人正臉照片。

**代價說清楚**：人偶的嘴型只有閉合／半開／張開三段，是音量對應而不是音素對嘴，不會有 ㄅㄆㄇ 的嘴型差異。實測在 200×300 的框裡看不太出來——會動、而且閉合的時機對得上句子的停頓，這兩件事到位就夠了。另外人偶目前不會眨眼，因為還沒有眼睛素材。

**跟第 1 個方案的差別**（都是「純前端、零延遲」）：方案 1 是拿真人照片去做像素變形，硬把嘴唇拉開、疊深色色塊，結果是使用者說的「非常不自然的色塊」——因為真人照片裡沒有「嘴巴張開的樣子」這個資訊，只能硬掰。人偶不一樣：三張嘴型是畫出來（截出來）的真實素材，切換的是完整的圖，不是變形的像素。同樣是純前端零延遲，這是差別所在。

**中途考慮過但沒有實作的方向**（使用者問過技術細節，尚未拍板）：
- **預錄「待機」+「說話」動作影片，播音檔時切換影片**：不做即時嘴型比對，只在音訊播放期間播放通用說話動作迴圈。優點：完全不需要 Simli（沒有 WebRTC/WebSocket，因此不會有手機連線失敗的問題）、可以搭配瀏覽器本地 TTS（見下）把延遲壓到最低。缺點：嘴型跟實際發音完全不同步，是更低一級的擬真度。
- **在此前提下改用瀏覽器內建 `speechSynthesis`（Web Speech API）**：因為不需要即時嘴型，原本排除 Web Speech API 的理由（無法把音訊波形接到 Web Audio API 做音量分析）就不成立了。優點：**零網路延遲**（本地生成，取代現在 Gemini TTS 的 7-17 秒），順便解決手機連線失敗與（可能的）自動播放權限問題。缺點：音質較生硬，不同裝置的語音引擎、男聲音色不保證一致。
- **ElevenLabs 聲音克隆**：可以訓練出貼合真人（例如老師本人）聲線的語音模型。Instant Voice Clone 需要 1-2 分鐘乾淨語音樣本，API 流程是 `voices.ivc.create(files=[...])` 拿到 `voice_id`，之後 TTS 呼叫帶這個 id。Flash v2.5 模型延遲約 75ms（比 Gemini TTS 快非常多個量級）。需要付費訂閱（Starter tier $6/月起才能用 Instant Voice Clone）+ 按字數計費（Flash 模型約 $0.05/1000 字元）+ **一定要取得聲音本人的同意**，這是服務條款要求也是基本倫理。這個方案跟「畫面用 Simli 還是預錄影片」是正交的兩個決策，可以任意搭配。

以上三個方向都只停留在研究/報價階段，**沒有寫進程式碼**，如果要接續開發需要重新確認需求。

### 6.3 介面演進

| 順序 | 風格 | 說明 |
|---|---|---|
| 1 | 紫色漸層卡片式（最初版本） | 使用者反饋「太醜」 |
| 2 | 「CODEX STUDY」風格（白底、藍色主色、細線表格） | 中繼版本 |
| 3 | **Industry 藍圖風格**（現行） | 使用者提供 Claude Design 畫布設計稿，照樣式重新實作：方形直角、四角測繪標記線（`.blueprint` + `.corner` class）、Barlow Condensed 標題字體、steel-blue 主色 `#5980a6`、三欄式版面（對話紀錄／虛擬人／對話串）。設計稿本身的多組對話切換、setTimeout 假回覆是 demo 用假資料，已改接真實 Gemini/Simli 功能，不是照抄 mockup 行為 |

## 7. 已修復的 Bug（含根因）

這是一份歷史紀錄，所以 Simli 相關的項目（#4、#8、#9）留著沒刪——那些程式碼已經不在了，但踩過的坑值得留著。#7（手機靜音）則**還活著而且更重要**：聲音現在是自己播的，被擋掉就整個沒聲音，不像以前還有影像撐著。

| # | 現象 | 根因 | 修法 | Commit |
|---|---|---|---|---|
| 1 | 前端改了但瀏覽器看不到變化 | `app.bundle.js` 無檔名雜湊，瀏覽器快取舊版不會自動更新 | `Cache-Control: no-cache`（搭配 etag／lastModified，未變更時仍走 304 省頻寬） | `8773cb1` |
| 2 | Gemini 回答在句子中間被截斷，語音合成失敗 | `gemini-3.6-flash` 思考消耗的 tokens 吃掉 `maxOutputTokens`（300 太低），`finishReason: MAX_TOKENS` | 拉高到 2048 | `77c6257` |
| 3 | 語音唸出符號（星號、`$`、`\frac{}{}`） | Gemini 答案含 Markdown/LaTeX | 系統指令要求純口語＋後端 `sanitizeForSpeech()` 保險清洗 | `77c6257` |
| 4 | Simli session 建立失敗但錯誤訊息看不出原因 | 後端有回傳 `detail` 欄位，前端只顯示 `error`，把細節丟了 | 前端改成 `[error, detail].join('：')`，後端也補上 `console.error` 讓 Render Logs 看得到 | `6e4d9cd` |
| 5 | 語音合成間歇性失敗（503／502） | **Piper Python 服務 OOM 崩潰**（見 6.1 節），約 30 秒後自動重啟恢復，表現為時好時壞 | 治標：加自動重啟機制。治本：整個換成 Gemini TTS，移除 Piper | `c19bb95`（治標）、`b6e5e88`（治本） |
| 6 | 貼錯 API key 給使用者 | 人工複製打字錯誤（`...c6ly` 誤植為 `...c6ry`） | 無程式碼修法，純提醒：**任何 key 用完都建議去源頭重新產生一把**，尤其出現在對話記錄裡的 | — |
| 7 | 動畫（說話中徽章）出現時聲音消失 | `<audio autoplay>` 播放 Simli 語音軌需要「近期使用者手勢」授權；Gemini TTS 要等 7-17 秒，等音軌真的送達時授權早已過期（iOS Safari 尤其嚴格），影片因為 `muted` 不受影響所以畫面正常、純聲音被靜默擋掉 | 在 `askForm` 的 `submit` handler 內**同步**呼叫一次 `audioEl.play()`，搶在長時間非同步等待之前用真實手勢「解鎖」該元素 | `346db8a` |
| 8 | Simli 連線失敗只能整頁重新整理 | 沒有重試機制 | 加「重試連線」按鈕，呼叫 `connectAvatar()` 重跑一次（含清掉舊的 `simliClient`） | `346db8a` |
| 9 | `simli-client@3.0.2` npm 套件在 Linux 上 `require` 失敗 | 套件自己的 `dist/index.js` 寫 `require("./Client")`，但實際檔名是小寫 `client.js`——macOS/Windows 檔案系統不分大小寫所以沒事，Linux（含所有伺服器）會直接壞掉 | 改成直接 `import from "simli-client/dist/client.js"`（繞過壞掉的 index.js），用 esbuild 打包 | 專案建立初期就發現並繞過 |

## 8. 已知未解決的問題

- **手機連線失敗（應該已隨 Simli 一起消失，但沒有實機驗證）**：舊的回報是「手機版都會連線失敗」，合理懷疑是 Simli 的 WebRTC/WebSocket 在行動網路上被擋。現在整個連線步驟都不存在了——頁面只從自己的伺服器抓兩個一般的 HTTP 回應——所以這個問題在原理上不該再發生。但這是推論，**還沒有實機回報佐證**。
- **手機自動播放仍是風險**：bug #7 的解法（在送出手勢裡同步播一小段無聲音訊解鎖 `<audio>`）保留下來了，而且現在更關鍵——以前聲音是從 Simli 的音軌來的，現在是自己播的 WAV，擋掉就整個沒聲音。桌面 Chromium 的端對端測試會走完整條播放路徑並驗證嘴型有動（代表音訊真的在播），但 **iOS Safari 沒有實機驗證過**。若真的被擋，前端會顯示「瀏覽器擋下了自動播放，請再按一次送出」，而不是靜悄悄地失敗。
- **語音生成延遲 ~7-17 秒**：根因是 Gemini TTS 生成時間本身（無串流）。這一項沒有因為換掉 Simli 而改變，第 6.2 節列的「本地 TTS」「逐句 pipeline」仍然是可能的解法，都還沒實作。
- **人偶不會眨眼**：`eyes` 部件在 rig 裡已經接好（`blink: true`），但沒有 `open.png` / `closed.png` 素材，所以那個部件會被跳過。補上兩張圖就會自動開始眨眼，程式不用改。

## 9. 費用參考（2026-09 查證，會浮動）

- **畫面**：$0。人偶跑在使用者自己的瀏覽器裡，沒有任何外部服務。（換掉的 Simli 原本是免費 50 分鐘／月，超過約 $0.009/分鐘）
- **Gemini**：問答與 TTS 都是用量計費，確切費率請查 https://ai.google.dev/pricing （當時沒有特別記錄費率數字）
- **Render**：免費方案，閒置約 15 分鐘會休眠，下次造訪冷啟動約十幾秒到一分鐘
- **ElevenLabs**（若採用聲音克隆，尚未實作）：Starter $6/月起（約 NT$190）才能用 Instant Voice Clone，另外按字數計費（Flash 模型約 NT$1.6/1000 字元）

## 10. 合併到其他專案時的檢查清單

- [ ] 只有一把環境變數（`GEMINI_API_KEY`）要手動搬過去，不會隨 git 走
- [ ] `public/assets/characters/` 底下的人偶素材要跟著走，少了部件圖畫面只會剩一個標了名字的方框
- [ ] `render.yaml` 放在 **repo 根目錄**（Render 不會去子資料夾找藍圖），用 `rootDir: speaking` 指回這個資料夾；單獨拉出去要把它搬到新 repo 的根目錄並刪掉 `rootDir` 那一行
- [ ] 部署環境要能跑 `npm run build`（esbuild 打包 `public/src/app.js` → `public/app.bundle.js`），純靜態檔案不會自動反映 `src/` 的修改
- [ ] 如果目標專案也用 Express，注意 `server.js` 目前把 `Cache-Control: no-cache` 設成全域 middleware（見 bug #1），合併時如果有其他靜態資源想被快取，這個全域設定需要調整成只針對 `public/` 或特定副檔名
- [ ] `public/src/puppet/` 是遊戲本體 `src/vn/`、`src/engine/` 的複製品；兩邊都在改的話記得看 `npm run build` 的漂移警告
- [ ] `voices/`、`vendor/`、`piper_service.py`、`requirements.txt`、`scripts/setup-voices.js` 這些是**舊架構（Piper）的殘留**，已在 `b6e5e88` 這個 commit 移除，如果合併時看到舊分支/舊 commit 裡有這些檔案，不要重新引入
