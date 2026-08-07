# Hollow Runner

一款 2D 橫向捲軸動作射擊遊戲，以《空洞騎士》(Hollow Knight) 的操作手感為參照：
流暢的角色控制、可變高度跳躍、衝刺、爬牆跳，以及會捲動的大地圖場景。
在這之上，另外搭建了一套完整的劇情系統——場景堆疊、對話、過場動畫、能力解鎖與存檔，
並用它做出了第一章劇情關卡「焦土台灣：甦醒」。

使用純 HTML5 Canvas + 原生 ES Modules 開發，**執行時零相依套件**、不需要建置步驟、
不需要下載任何美術或音效素材（圖形以程式繪製，音效以 WebAudio 即時合成）。

## 快速開始

```bash
npm start          # 啟動本機伺服器，開啟 http://localhost:8080
```

> ES Modules 無法從 `file://` 直接載入（瀏覽器 CORS 限制），所以需要透過
> `npm start` 提供的簡易靜態伺服器來執行，它本身也沒有任何相依套件。

預設開啟的是劇情第一章「焦土台灣：甦醒」——射擊與衝刺一開始是鎖住的，
會隨著劇情進展解鎖（見下方「劇情系統」）。原本的純動作關卡「The Undercroft」
仍完整保留在 `src/game/level.js` 的 `buildLevel1()`，可作為獨立關卡使用。

## 操作方式

| 動作 | 鍵盤 | 手把 |
| --- | --- | --- |
| 移動 | `A` `D` / 方向鍵 | 左類比 / 十字鍵 |
| 跳躍 | `Space` / `K` | A |
| 射擊 | `J` / `Z` | X / RT |
| 衝刺 | `Shift` / `L` | B / RB |
| 對話／互動 | `E` | Y |
| 暫停 | `Esc` / `P` | Start |
| 靜音 | `M` | — |
| 除錯資訊 | `F3` | — |

- **可變跳躍高度**：按住跳得高，輕點跳得低。
- **瞄準**：射擊時同時按住 `W`/`S`（上/下）可改變射擊方向，含八方向斜射。
- **踩踏**：從高處落下踩到敵人可造成傷害並彈起。
- **衝刺**：八方向，帶無敵幀；落地或觸牆後恢復。
- **對話中**：`W`/`S` 切換選項，`J`/`Space` 確認（文字未跑完時先跳過打字機效果）。

## 手感設計（Game Feel）

動作遊戲的「手感」多半來自玩家察覺不到的容錯設計。本專案實作了：

| 機制 | 說明 | 位置 |
| --- | --- | --- |
| Coyote time | 走出平台邊緣後 0.1 秒內仍可跳躍 | `player.js` |
| Jump buffering | 落地前 0.12 秒按下的跳躍，會在著地瞬間觸發 | `player.js` |
| 可變跳躍高度 | 放開跳躍鍵立即截斷上升速度至 42% | `player.js` |
| 非對稱重力 | 下落比上升更快，頂點附近重力減弱以產生滯空感 | `constants.js` |
| 轉向加速 | 反向輸入時加速度加倍，讓轉身更俐落 | `player.js` |
| 命中停頓 (hit-stop) | 命中/受擊時凍結數幀，讓打擊有重量 | `game.js` |
| 畫面震動 | 以 trauma² 衰減，大擊有感、小擊不吵 | `camera.js` |
| 擠壓拉伸 | 起跳與落地時的形變回饋，依落地速度縮放 | `player.js` |
| 攝影機死區 | 小幅移動不推動鏡頭，避免畫面晃動 | `camera.js` |
| 速度預看 | 鏡頭朝行進方向偏移，讓玩家看見前方 | `camera.js` |

所有數值集中在 `src/game/constants.js`，可單獨調整而不必翻找程式碼。

## 劇情系統

在動作遊戲的手感之上，另外搭了一層完全獨立的劇情系統，讓「加入對話與故事」
不必重寫任何物理或戰鬥程式碼。

### 場景堆疊（Scene Stack）

`Game` 不再用一個扁平的字串（`'playing' | 'paused' | ...`）記狀態，而是用一疊
`Scene`（`src/engine/scene.js`）：世界（`WorldScene`）永遠墊在最底層、不會被
彈出，暫停、死亡、對話、過場動畫都是疊上去的畫面。這代表：

- 對話框可以疊在遊戲畫面「上面」而不是「取代」它——角色與場景在對話框後面
  依然看得到、依然有微幅的環境動畫（粒子、視差背景）。
- 新增一種畫面（例如商店、地圖）不需要更動既有的任何狀態分支，只要再寫一個
  `Scene` 子類別疊上去即可。
- `game.state` 仍然存在（從堆疊頂端推導），舊有讀取它的地方不必更動。

`WorldScene` 用三個旗標決定自己該跑多少：`frozen`（完全靜止，只有暫停選單會用）、
`simulate`（關掉時角色/敵人/子彈停止模擬，但粒子、背景、鏡頭仍在動，讓畫面
不會像被按了暫停鍵）、`showHud`（是否顯示血條等常駐介面，只有標題畫面關閉它）。
這三個旗標由疊在上面的場景自己在 `enter()`/`exit()` 時切換，`WorldScene`
完全不需要知道上面疊的是哪一種畫面。

### 劇情狀態與能力解鎖

`StoryState`（`src/game/story-state.js`）記錄旗標（flag）、已解鎖的能力、
存檔點，並可存讀 `localStorage`（沒有 storage 的環境——純 Node 測試、
鎖死的 webview——會安全地退化成不存檔，不會拋錯）。

角色的射擊、衝刺、二段跳、爬牆跳都改成讀取 `player.abilities`，預設
（沒有接上 `game.story` 時，例如所有既有測試）**全部開啟**，行為與加入
劇情系統前完全一致。要做出「這個能力要在劇情裡才解鎖」的效果，是關卡自己
選擇的事：

```js
new StoryState({ fire: false, dash: false }) // 讓這兩項一開始鎖住
story.grantAbility('dash')                    // 在對話或過場動畫裡解鎖
```

能力讀取是即時的（不是建構時複製一份），所以過場動畫一解鎖，下一幀角色
就能衝刺，不必等重生或重新載入關卡。

### 觸發器與 NPC

`StoryTrigger`（`src/game/trigger.js`）是一個看不見的矩形，玩家走進去就會
呼叫一個回呼函式——可以開對話、設旗標、解鎖能力。`once: true`（預設）代表
只觸發一次；也可以額外指定 `flag`，讓它記在 `StoryState` 裡，即使整個關卡
重新讀取也不會再觸發第二次。`Npc` 則是站著不動、玩家靠近按 `E` 才觸發互動的
角色，本身不知道對話系統存在，純粹是資料 + 回呼。

在 `LevelBuilder` 上對應的 API：

```js
b.storyTrigger(c0, r0, c1, r1, { flag: 'found_note', onEnter: (world, game) => {...} });
b.npc(col, row, { id: 'old-zhou', onInteract: (world, game) => {...} });
```

### 對話（Dialogue）

對話是一個節點圖（`DialogueRunner`，`src/game/dialogue-runner.js`），每個節點
可以有多行文字（逐行打字機效果顯示）、`next` 接到下一個節點、或是 `choices`
分支成多個選項，每個選項各自可以設旗標、解鎖能力、接到不同節點。這一整套
邏輯完全不碰 canvas 或 DOM，可以直接在 Node 裡測試分支是否正確、旗標是否
真的被設到、打字機計時對不對。

實際畫面渲染在 `DialogueScene`（`src/game/scenes/dialogue-scene.js`），文字
自動換行用 `wrapText`（`src/engine/text.js`）：中文沒有空白可以斷行，
所以是逐字判斷寬度來斷行，並且處理了基本的「行首禁則」（不能用「」』，。」
開頭）與「行尾禁則」（不能用「『」結尾）。

### 過場動畫（Cutscene）

`CutsceneRunner`（`src/game/cutscene-runner.js`）依序執行一串步驟：
`wait`（等待）、`fadeIn`/`fadeOut`（畫面淡入淡出）、`dialogue`（開一段對話，
對話關閉後才繼續）、`setFlag` / `grantAbility`（立即生效）、`call`（任意
回呼）。過場動畫期間 `world.simulate = false`，玩家完全無法操作，直到過場
結束。

### 甦醒：第一章

`src/game/levels/opening.js` 是用以上所有系統組出來的實際內容：

醒來（過場動畫）→ 環境敘事（牆上的公告）→ 純跳躍教學缺口 → 與倖存者老周對話
（五年前的戰爭、政府瓦解、解放軍殘部與劫匪、尋找家人的線索，含一個分支選項）
→ 獲得手槍（解鎖射擊）→ 首次戰鬥 → 找到腎上腺素（解鎖衝刺）→ 衝刺缺口
→ 廢棄哨戒砲台 → 章節結尾過場動畫與收尾畫面。

雙跳與爬牆跳兩項能力在本章維持解鎖狀態——這一章的地形沒有用到它們，
沒有劇情理由的限制就不刻意加上去。

## 專案結構

```
index.html            版面與 canvas 容器
serve.js              零相依靜態伺服器（開發用）
assets/
  player.png          角色 sprite sheet（由 tools/ 產生，可自行替換）
tools/
  png.mjs             自製 PNG 編碼器與像素畫布（僅用 node:zlib）
  make-spritesheet.mjs 產生 assets/player.png
src/
  main.js             進入點：畫布縮放、事件綁定、啟動迴圈、選擇要載入的關卡
  engine/             與遊戲內容無關的通用層
    loop.js           固定時間步長主迴圈（物理與畫面更新分離）
    input.js          鍵盤 + 手把輸入，含按鍵邊緣偵測
    camera.js         死區、預看、邊界夾制、震動
    particles.js      物件池粒子系統（避免 GC 卡頓）
    audio.js          WebAudio 即時合成音效
    sprites.js        Sprite sheet 載入與單格繪製
    animator.js       動畫幀計時（不依賴 DOM）
    tilemap.js        圖磚網格與碰撞查詢
    math.js           數學工具
    scene.js          場景堆疊：Scene 基底類別與 SceneStack
    text.js           中文友善的文字換行（純函式，不依賴 canvas）
  game/
    constants.js      所有手感與數值調校參數
    body.js           AABB 移動體與圖磚碰撞解析
    player.js         玩家控制器（含能力閘門）
    player-anims.js   Sprite 版面定義與動畫狀態選擇（純函式）
    enemy.js          敵人：Walker / Flyer / Turret
    bullet.js         彈丸
    level.js          LevelBuilder 關卡建構 API 與第一關（The Undercroft）
    levels/
      opening.js       第一章「甦醒」的關卡幾何、觸發器、能力解鎖流程
    dialogues/
      opening-dialogues.js  第一章的對話文本
    story-state.js    劇情旗標、能力解鎖、存讀檔
    trigger.js        StoryTrigger（劇情觸發區）與 Npc
    dialogue-runner.js  對話節點圖狀態機（純函式，可離線測試）
    cutscene-runner.js  過場動畫步驟執行器（純函式，可離線測試）
    scenes/
      world-scene.js    遊戲世界本體（原本 game.js 的主要內容）
      title-scene.js    標題畫面
      pause-scene.js    暫停選單
      death-scene.js    death 畫面
      win-scene.js      戰鬥關卡的通關畫面（分數/死亡數/時間）
      ending-scene.js   劇情關卡的收尾畫面（不用分數/時間，純文字）
      dialogue-scene.js 對話框渲染與輸入處理
      cutscene-scene.js 過場動畫的場景包裝（含淡入淡出、巢狀對話）
    background.js     多層視差背景
    tilerender.js     圖磚繪製（含視野裁切）
    hud.js            常駐介面（血條/衝刺量表/分數）+ 疊層畫面共用的繪圖函式
    game.js           頂層容器：canvas/input/audio/story，轉發至 WorldScene
test/                 測試
```

### 幾個設計取捨

- **固定時間步長**：物理以 1/60 秒固定推進，畫面則每個 animation frame 繪製一次。
  跳躍弧線與衝刺距離因此在任何更新率的機器上都完全一致。
- **分軸碰撞解析**：先解 X 再解 Y。同時處理兩軸會讓「撞到牆」與「踩到地」
  難以區分，也會讓角色卡在由多塊平坦圖磚拼成的地面接縫上。
- **子步進**：高速移動（衝刺、長距墜落、子彈）會拆成不超過半格的子步驟，
  確保不會穿透牆面。
- **粒子物件池**：粒子從固定大小的池中重複使用，激烈戰鬥時不會觸發 GC 停頓。
- **視野裁切**：地圖有 4350 格圖磚，每幀只繪製鏡頭範圍內的部分。

## 角色美術（Sprite Sheet）

角色使用 sprite sheet 繪製，圖檔在 `assets/player.png`。

**版面**：6 欄 × 7 列，每格 32 × 40 px（192 × 280 px）。列的順序**必須**與
`src/game/player-anims.js` 的 `ANIMS` 一致：

| 列 | 動畫 | 幀數 | fps |
| --- | --- | --- | --- |
| 0 | idle | 4 | 6 |
| 1 | run | 6 | 14 |
| 2 | jump | 2 | 10 |
| 3 | fall | 2 | 10 |
| 4 | dash | 2 | 18 |
| 5 | wall | 2 | 8 |
| 6 | hurt | 2 | 12 |

圖片朝向**右**，向左時由程式水平翻轉，不需另外畫。角色腳底對齊格子最底列。

### 換成你自己的圖

直接覆蓋 `assets/player.png` 即可，只要維持同樣的格子尺寸與列順序。
想改格子大小就同步改 `player-anims.js` 的 `FRAME_W` / `FRAME_H`。

要調整幀數或速度，改 `ANIMS` 裡的 `frames` 與 `fps`；新增動作則多加一列，
並在 `pickPlayerAnimation()` 補上選擇條件。

### 重新產生預設圖

```bash
npm run art        # 重新產生 assets/player.png
```

`tools/make-spritesheet.mjs` 以參數化的方式畫出角色——同一個 `drawCharacter()`
接受一組姿勢參數（呼吸起伏、前傾、腿部位置、斗篷擺幅），每個動畫幀只是不同的姿勢，
因此所有幀天然保持一致。PNG 由 `tools/png.mjs` 自行編碼（只用 `node:zlib`），
所以產生美術同樣不需要安裝任何套件。

> 每一幀是先畫進自己的格子大小暫存區再貼上去的。這是刻意的：早期版本直接畫在整張圖上，
> 跳躍姿勢的角伸出格子外，結果**溢出到隔壁動畫列**，在遊戲中變成跑步動畫底部的雜訊像素。

### 沒有圖片也能跑

`SpriteSheet` 是非同步載入且不阻塞的：遊戲立刻開始，圖載好才切換過去。
若圖片缺失、載入失敗，或尺寸不符版面，會自動退回原本的程式繪製角色並在
console 留下警告——不會崩潰，也不會變成空白。

外觀與物理是分離的：碰撞箱固定為 `PLAYER.w × PLAYER.h`（20 × 34），sprite 則是
32 × 40 蓄意大於碰撞箱，讓角與斗篷可以超出去。**換圖不會影響任何手感或判定。**
擠壓拉伸是物理回饋而非美術的一部分，會疊加在當前幀之上。

## 關卡

第一關「The Undercroft」為 150 × 29 格（4800 × 928 px），
依「先單獨介紹、再組合運用」的節奏編排：

平地射擊 → 跳躍缺口 → 尖刺 → 垂直爬牆豎井 → 單向平台 → 衝刺長坑 → 最終戰鬥區 → 終點

關卡以 `LevelBuilder` 的矩形與平台 API 描述（`src/game/level.js`）。
手動排 150 字元寬的 ASCII 地圖難以維護，改用座標式 API 後新增區段只需幾行；
`Tilemap.fromASCII()` 仍保留，可用於小型地圖。

## 測試

```bash
npm test               # 全部單元測試（純 Node，無需瀏覽器）
npm run test:browser   # 端對端煙霧測試（需 npm i 安裝 playwright，且伺服器執行中）
```

`npm test` 會執行 `test/` 底下所有 `*.test.mjs`（目前 11 個檔案、約 270 項）。
玩家控制器、關卡、劇情系統全部不依賴 DOM，因此整個模擬可在 Node 中無頭執行。
這讓一些在瀏覽器裡很難驗證的問題可以被自動化檢查：

| 測試檔 | 驗證什麼 |
| --- | --- |
| `level.test.mjs` | 第一關（The Undercroft）可通關性：機器人實際跳過缺口、爬上豎井 |
| `opening.test.mjs` | 第一章（甦醒）可通關性，**外加**衝刺缺口在沒解鎖衝刺時真的過不去 |
| `player.test.mjs` | coyote time、跳躍緩衝、可變跳躍高度、衝刺距離、無敵幀、數值穩定性 |
| `abilities.test.mjs` | 能力閘門：鎖住時完全無效、解鎖瞬間立即生效、不影響舊有測試 |
| `story.test.mjs` | 旗標、能力預設值、存讀檔（含毀損存檔、跨版本存檔的處理） |
| `trigger.test.mjs` | StoryTrigger 的一次性/重複觸發、flag 綁定；Npc 的靠近判定 |
| `dialogue.test.mjs` | 對話節點圖：分支、旗標副作用、打字機計時、異常節點的容錯 |
| `cutscene.test.mjs` | 過場動畫步驟排程：計時、對話交接、skip、未知步驟類型的容錯 |
| `text.test.mjs` | 中文換行：行首/行尾禁則、中英混排、超長不可斷詞的強制斷行 |
| `scene.test.mjs` | 場景堆疊的 push/pop/replace 順序與 update/render 派發規則 |
| `anim.test.mjs` | Sprite 動畫選擇的優先順序、幀計時、版面與圖檔尺寸一致性 |

一個看起來正確但有一處跳不過去的關卡就是壞掉的遊戲——這也是為什麼
`opening.test.mjs` 不只驗證衝刺缺口「解鎖後能過」，也驗證它「沒解鎖時真的過不去」：
只測前者無法排除「其實用跳的也能過，能力閘門形同虛設」的情況。

`npm run test:browser` 若未安裝 playwright 或伺服器未啟動，會直接跳過而非失敗。
它額外覆蓋單元測試無法驗證的部分：sprite 圖真的載入、中文字型真的正確顯示、
一整輪 game loop 真的沒有拋出例外。

## 延伸方向

- 新增劇情章節：仿照 `src/game/levels/opening.js` 寫一個新的 level builder，
  搭配 `storyTrigger` / `npc` 放置劇情點，對話文本另外放一個 `dialogues/*.js`。
- 新增對話：在某個 `nodes` 物件裡加節點即可，`next` 接續、`choices` 分支，
  `flag` / `action` 掛副作用。不需要碰 `DialogueRunner` 或 `DialogueScene`。
- 新增過場步驟：`CutsceneRunner` 目前支援 `wait` / `fadeIn` / `fadeOut` /
  `dialogue` / `setFlag` / `grantAbility` / `call`，`call` 可以塞任意回呼，
  通常已經夠用；真的需要新步驟類型時，在 `_advance()` 的 `switch` 裡加一個 case。
- 新增能力閘門：`StoryState` 建構時傳入 `{ 能力名稱: false }` 即可鎖住，
  `player.abilities.<名稱>` 會自動反映；不需要改 `player.js`。
- 新增關卡：仿照 `buildLevel1()` 寫一個 builder。
- 新增敵人：繼承 `enemy.js` 的 `Enemy`，實作 `think()` 與 `draw()`，
  再登記到 `ENEMY_TYPES`。
- 換角色美術：覆蓋 `assets/player.png`（見上方 Sprite Sheet 一節）。
- 敵人目前仍是程式繪製；若也想改用 sprite，同一套 `SpriteSheet` + `Animator`
  可以直接沿用。
- 調整手感：只改 `constants.js`，然後 `npm test` 確認沒有破壞既有機制。

## 授權

MIT
