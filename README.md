# Hollow Runner

一款 2D 橫向捲軸動作射擊遊戲，以《空洞騎士》(Hollow Knight) 的操作手感為參照：
流暢的角色控制、可變高度跳躍、衝刺、爬牆跳，以及會捲動的大地圖場景。

使用純 HTML5 Canvas + 原生 ES Modules 開發，**執行時零相依套件**、不需要建置步驟、
不需要下載任何美術或音效素材（圖形以程式繪製，音效以 WebAudio 即時合成）。

## 快速開始

```bash
npm start          # 啟動本機伺服器，開啟 http://localhost:8080
```

> ES Modules 無法從 `file://` 直接載入（瀏覽器 CORS 限制），所以需要透過
> `npm start` 提供的簡易靜態伺服器來執行，它本身也沒有任何相依套件。

## 操作方式

| 動作 | 鍵盤 | 手把 |
| --- | --- | --- |
| 移動 | `A` `D` / 方向鍵 | 左類比 / 十字鍵 |
| 跳躍 | `Space` / `K` | A |
| 射擊 | `J` / `Z` | X / RT |
| 衝刺 | `Shift` / `L` | B / RB |
| 暫停 | `Esc` / `P` | Start |
| 靜音 | `M` | — |
| 除錯資訊 | `F3` | — |

- **可變跳躍高度**：按住跳得高，輕點跳得低。
- **瞄準**：射擊時同時按住 `W`/`S`（上/下）可改變射擊方向，含八方向斜射。
- **踩踏**：從高處落下踩到敵人可造成傷害並彈起。
- **衝刺**：八方向，帶無敵幀；落地或觸牆後恢復。

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
  main.js             進入點：畫布縮放、事件綁定、啟動迴圈
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
  game/
    constants.js      所有手感與數值調校參數
    body.js           AABB 移動體與圖磚碰撞解析
    player.js         玩家控制器
    player-anims.js   Sprite 版面定義與動畫狀態選擇（純函式）
    enemy.js          敵人：Walker / Flyer / Turret
    bullet.js         彈丸
    level.js          關卡建構 API 與第一關內容
    background.js     多層視差背景
    tilerender.js     圖磚繪製（含視野裁切）
    hud.js            介面疊層
    game.js           世界組裝、更新順序、碰撞、狀態機
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
npm test           # 單元測試（純 Node，無需瀏覽器）
npm run test:browser   # 端對端煙霧測試（需 npm i 安裝 playwright，且伺服器執行中）
```

玩家控制器與關卡都不依賴 DOM，因此整個模擬可在 Node 中無頭執行。
這讓一些在瀏覽器裡很難驗證的問題可以被自動化檢查：

- **關卡可通關性**：以腳本操控的機器人實際模擬跳過缺口、爬上豎井，
  驗證每個障礙在物理上都能通過。一個看起來正確但有一處跳不過去的關卡就是壞掉的遊戲。
- **手感機制回歸**：coyote time、跳躍緩衝、可變跳躍高度、衝刺距離與無敵幀，
  都是調參時最容易默默壞掉、又不會在 diff 中顯現的東西。
- **數值穩定性**：連續 10 秒亂按所有按鍵後，座標與速度不得出現 `NaN` 或 `Infinity`。
- **動畫狀態機**：動畫選擇（`pickPlayerAnimation`）與幀計時（`Animator`）都刻意
  不依賴 DOM，因此可以直接驗證優先順序（衝刺蓋過滯空、受傷蓋過跑步）、
  循環與非循環動畫的行為，以及 sprite 版面是否與圖檔一致。

`npm run test:browser` 若未安裝 playwright 或伺服器未啟動，會直接跳過而非失敗。

## 延伸方向

- 新增關卡：仿照 `buildLevel1()` 寫一個 builder，加進 `LEVELS`。
- 新增敵人：繼承 `enemy.js` 的 `Enemy`，實作 `think()` 與 `draw()`，
  再登記到 `ENEMY_TYPES`。
- 換角色美術：覆蓋 `assets/player.png`（見上方 Sprite Sheet 一節）。
- 敵人目前仍是程式繪製；若也想改用 sprite，同一套 `SpriteSheet` + `Animator`
  可以直接沿用。
- 調整手感：只改 `constants.js`，然後 `npm test` 確認沒有破壞既有機制。

## 授權

MIT
