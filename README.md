# 想問就問

給國高中生用的對話練習引擎，參考主流戀愛對話遊戲（Galgame/乙女遊戲）的呈現方式：
會呼吸、說話時會有反應的**可動立繪**，搭配分支選項的對話劇本——但目的不是戀愛
劇情，而是讓學生在一個有回饋、有進度感的介面裡反覆練習「開口提問」與其他
對話情境。

**美術需求刻意壓到最低：每個角色畫一張立繪就能動起來**（見下方
「立繪：最簡單的做法」），換裝/換表情的紙娃娃圖層是完全可選的進階功能，
不需要也能用。

使用純 HTML5 Canvas + 原生 ES Modules 開發，**執行時零相依套件**、不需要建置步驟。
目前內建的對話腳本（`src/vn/content/`）只是一個示範模板——引擎本身不綁定任何學科，
真正的教學內容與美術素材由使用者自行填入（見下方「撰寫新對話內容」與「美術素材」）。

## 快速開始

```bash
npm start          # 啟動本機伺服器，開啟 http://localhost:8080
```

> ES Modules 無法從 `file://` 直接載入（瀏覽器 CORS 限制），所以需要透過
> `npm start` 提供的簡易靜態伺服器來執行，它本身也沒有任何相依套件。

## 操作方式

| 動作 | 鍵盤 | 滑鼠／觸控 |
| --- | --- | --- |
| 推進對話 / 確認選項 | `Enter` `Space` `Z` | 點擊畫面 |
| 切換選項 | `↑` `↓` `W` `S` | 直接點擊該選項 |
| 靜音 | `M` | — |

畫面上沒有虛擬搖桿或按鈕——整個 canvas 就是唯一的互動區域：沒有選項時，
點擊任何地方都會推進對話；出現選項時，點擊某個選項就直接選它，
或用鍵盤上下鍵移到想要的選項再按確認。滑鼠、觸控、鍵盤、手把
（`confirm`/`up`/`down` 對應到手把的 A / 十字鍵）都餵進同一套
`Input`（`src/engine/input.js`），下游完全不知道輸入來源。

## 架構總覽

```
index.html            版面與 canvas 容器
serve.js              零相依靜態伺服器（開發用）
assets/
  characters/<id>/<slot>/<variant>.png   角色立繪圖片（需自行提供，最簡單時每個角色只有一個 slot/variant）
  backgrounds/<id>.png                    場景背景圖（需自行提供）
src/
  main.js              進入點：畫布縮放、指標事件、啟動迴圈、載入哪個劇本
  engine/              與對話內容無關的通用層
    loop.js            固定時間步長主迴圈
    input.js           鍵盤 + 手把 + 觸控/點擊，含按鍵邊緣偵測
    audio.js            WebAudio 即時合成音效（點擊、答對、答錯等回饋音）
    image-cache.js      共用的圖片載入快取（背景、立繪共用）
    scene.js            場景堆疊：Scene 基底類別、SceneStack、pointerTap 掛鉤
    text.js             中文友善的文字換行（逐字斷行 + 行首/行尾禁則）
    math.js             數學工具（clamp/lerp/damp/...）
  vn/
    constants.js         內部渲染解析度、字型
    story-state.js        旗標（flag）+ 數值變數（分數/好感度等）+ 存讀檔
    dialogue-runner.js    對話節點圖狀態機（純函式，可離線測試）
    character.js          單一角色目前顯示哪張／哪些圖層（純資料）
    portrait-motion.js     立繪「活著」的動態：呼吸起伏、眨眼、說話時的彈動
    portrait-renderer.js   把 Character + PortraitMotion 畫到 canvas，含無圖時的預留位置畫法
    stage.js               目前場上有誰、站哪裡、背景是什麼——腳本 action 操作的物件
    app.js                 頂層容器：canvas/input/audio/story/scene stack
    scenes/
      title-scene.js       標題畫面
      dialogue-scene.js    對話框、立繪、選項的渲染與輸入處理
      end-scene.js          一段劇本結束後的畫面（含分數摘要、重玩）
    content/
      demo-characters.js    示範角色（單張圖，無圖時會顯示標籤方塊）
      demo-script.js         示範對話腳本，同時是撰寫新內容的範本
test/                  單元測試（Node 原生，無需瀏覽器）+ 一份瀏覽器煙霧測試
```

## 對話（DialogueRunner）

對話是一個節點圖，每個節點可以有多行文字（逐行打字機效果顯示）、
`next` 接到下一個節點、或是 `choices` 分支成多個選項。這一整套邏輯完全不碰
canvas 或 DOM，可以直接在 Node 裡測試分支是否正確、旗標/變數是否真的被設到、
打字機計時對不對（見 `test/dialogue.test.mjs`）。

```js
{
  start: 'ask',
  nodes: {
    ask: {
      speaker: 'teacher',              // 對應 characters 裡的角色 id
      lines: ['有問題想問我嗎？'],
      choices: [
        { text: '有，我想問……', next: 'good', flag: 'asked' },
        { text: '沒事。', next: 'shy' },
      ],
    },
    good: {
      speaker: 'teacher',
      action: (stage, app) => {
        app.story.addVar('score', 1);   // 加分
        app.audio.correct();             // 回饋音
      },
      lines: ['很好，你問吧！'],
    },
    shy: { speaker: 'teacher', lines: ['沒關係，想到再說。'] },
  },
}
```

- `speaker`：一個角色 id（對應 `charactersFactory()` 回傳物件裡的 key）。
  對話框會顯示該角色的 `name`，並讓它的立繪播放「說話中」的動態；
  若填的字串不是任何角色 id，會直接顯示原字串（適合旁白/無名角色）。
- `action(stage, app)`：節點或選項進入時執行一次的副作用。`stage` 是
  `Stage` 實例（見下方），`app` 是頂層 `App`（可以拿到 `app.story`、
  `app.audio`）。想讓「換背景」「角色上場/下場」「加分/扣分」發生，都是
  在這裡呼叫對應方法，完全不需要修改 `DialogueRunner` 或 `DialogueScene`。
  （如果角色有多張圖，也可以在這裡用 `stage.setExpression()`/
  `stage.equip()` 換表情/換裝——見下方「進階：紙娃娃換裝」。）
- `flag`：節點或選項進入時在 `StoryState` 標記一個布林旗標（例如用來記錄
  「這段有沒有練習過」）。
- 沒有 `next` 也沒有 `choices` 的節點，會在播完最後一行後結束對話，
  進入結束畫面（`EndScene`）。

## 立繪：最簡單的做法

呼吸起伏、說話彈動這些「可動」效果（`PortraitMotion`）是套用在**整張立繪
圖片**上的一個 canvas transform，跟角色是不是拆成好幾個圖層完全無關。
所以最省事的做法、也是示範內容（`demo-characters.js`）實際採用的做法：

**每個角色畫一張完整立繪（半身或全身皆可），存一個檔，結束。**

```js
new Character('teacher', {
  name: '陳老師',
  slots: ['body'],                 // 只有一個槽位
  layers: { body: 'default' },     // 只有一個變體
});
```

對應的圖片放在 `assets/characters/teacher/body/default.png`，圖片尺寸沒有
強制規格（建議寬高比接近 260:460，即約 9:16 的半身/全身構圖），繪製時會
依 `PortraitRenderer.draw()` 的 `width`/`height`（目前為 260×460，錨點在
底部置中）縮放——要換這個尺寸就改 `src/vn/scenes/dialogue-scene.js` 裡的
`PORTRAIT_W`/`PORTRAIT_H`。**圖還沒畫好、載入失敗、或根本沒提供，都會
退化成一個標示角色名字的色塊**，不會白畫面、不會丟例外，所以整個系統
在真的美術素材進來之前就可以完整測試與展示。

背景圖同理：`assets/backgrounds/<backgroundId>.png`，任意尺寸都會被拉伸
鋪滿 `VIEW`（960×540，`src/vn/constants.js`）。

`PortraitMotion`（`src/vn/portrait-motion.js`）只做三種任何單張圖都適用、
不需要額外素材的動態，純計時邏輯，不碰 canvas，可離線測試：

- **呼吸/晃動**：一個緩慢的正弦波垂直位移。
- **說話彈動**：`Stage` 依 `speaker` 決定誰在說話，說話中的角色會有一點點
  縮放脈動，讓玩家一眼看出誰在講話。
- **眨眼**（需要額外一張閉眼圖才會顯示效果，見下方進階段落）。

### 進階（可選）：紙娃娃換裝與換表情

如果之後想要換裝或換表情，不需要改任何程式碼——`Character` 支援多個
「槽位」（slot），對話腳本可以個別替換：

```js
new Character('teacher', {
  name: '陳老師',
  slots: ['body', 'outfit', 'hair', 'eyes', 'face', 'accessory'], // 由下到上疊畫
  layers: { body: 'base', outfit: 'blazer', hair: 'short', eyes: 'calm', face: 'neutral' },
});
```

`slots` 的順序就是疊圖順序（由下到上），對應的圖片放在
`assets/characters/<id>/<slot>/<variant>.png`（例如
`assets/characters/teacher/outfit/blazer.png`）。對話腳本透過
`stage.equip(id, { outfit: 'casual' })` 換裝、`stage.setExpression(id, 'happy')`
換表情（`setExpression` 其實就是把 `face` 槽位換成同名變體，兩者殊途同歸）。
`eyes` 槽位若額外提供 `<variant>_closed.png`（例如
`assets/characters/teacher/eyes/calm_closed.png`），眨眼時就會自動切換過去；
沒提供就是不會眨眼，安全退化。

這條路線的代價完全在美術端：每多一個槽位、每個槽位每多一個變體，就要多畫
一張圖，而且**同一個角色的每張圖層必須共用完全一樣的畫布尺寸與姿勢/位置**
才能疊得整齊。如果只是想要角色會呼吸、說話有反應，**完全不需要走這條路**，
上面「最簡單的做法」就是完整的可動立繪體驗。

## Stage：一段對話的舞台

`Stage`（`src/vn/stage.js`）記錄目前背景是什麼、哪些角色在場上的哪個位置
（`left`/`center`/`right`）、誰在說話。這是傳給 `DialogueRunner` 的
`world` context，對話腳本的 `action` 透過它操縱畫面：

```js
b => {
  stage.setBackground('classroom');
  stage.show('teacher', 'left');
  stage.show('mei', 'right');
  stage.hide('mei');
}
```

純資料/邏輯，不含 canvas，`test/stage.test.mjs` 完整覆蓋（上場/下場/移動、
換裝、換表情、說話中判定）。

## 進度與存讀檔（StoryState）

`StoryState`（`src/vn/story-state.js`）記錄：

- `flags`：布林旗標集合，`setFlag()` 第一次設定時回傳 `true`，之後回傳
  `false`，方便分辨「這是第一次發生」還是「本來就設過了」。
- `vars`：數值變數表（分數、好感度、答對次數……由腳本自行定義用途），
  `addVar(name, delta)` 是最常用的操作。
- 可存讀 `localStorage`（沒有 storage 的環境——純 Node 測試、鎖死的
  webview——會安全地退化成不存檔，不會拋錯）。

`App.startScript()`（重玩時）會呼叫 `story.clear()` 並重建全新的
`Character` 實例，確保上一輪換的裝/表情不會殘留到下一輪。

## 撰寫新對話內容

1. 在 `src/vn/content/` 仿照 `demo-characters.js` 定義自己的角色
   （通常就是 `slots: ['body'], layers: { body: 'default' }`），仿照
   `demo-script.js` 寫節點圖劇本。
2. 在 `src/main.js` 把 `charactersFactory`/`script` 換成你自己的。
3. 有真的美術素材時，把每個角色的一張立繪存成
   `assets/characters/<id>/body/default.png`，不需要改任何程式碼——
   `PortraitRenderer` 會自動偵測到並開始顯示。想要換裝/換表情才需要用到
   「進階：紙娃娃換裝」那條路線。
4. 想要「答對加分」「答錯溫和糾正、可以重試」這類練習機制，參考
   `demo-script.js` 裡 `good_response`/`rude_response`/`silent_response`
   三個節點的寫法：用 `action` 呼叫 `app.story.addVar()` 記分、
   `app.audio.correct()/incorrect()` 給回饋音、用 `choices` 讓玩家可以
   選「再試一次」跳回問題節點。

## 測試

```bash
npm test               # 全部單元測試（純 Node，無需瀏覽器）
npm run test:browser   # 端對端煙霧測試（需 npm i 安裝 playwright，且伺服器執行中）
```

| 測試檔 | 驗證什麼 |
| --- | --- |
| `dialogue.test.mjs` | 對話節點圖：分支、旗標副作用、打字機計時、異常節點的容錯、DialogueScene 的按鍵/點擊輸入 |
| `character.test.mjs` | 紙娃娃圖層：get/set/equip、換表情、clone 不互相污染 |
| `portrait-motion.test.mjs` | 呼吸波形、眨眼計時（含長跑不卡死）、說話彈動只在說話時作用 |
| `stage.test.mjs` | 上場/下場/移動角色、換裝/換表情轉發、誰在說話的判定 |
| `story.test.mjs` | 旗標、數值變數、存讀檔（含毀損存檔、跨版本存檔的處理） |
| `input.test.mjs` | 觸控/點擊輸入與鍵盤/手把共用同一套按下/持續/放開邊緣語意 |
| `text.test.mjs` | 中文換行：行首/行尾禁則、中英混排、超長不可斷詞的強制斷行 |
| `scene.test.mjs` | 場景堆疊的 push/pop/replace 順序與 update/render 派發規則 |

`npm run test:browser` 若未安裝 playwright 或伺服器未啟動，會直接跳過而非失敗。
它額外覆蓋單元測試無法驗證的部分：真的在瀏覽器裡從標題畫面點進對話、
選一個分支、看到分數變數真的變化、跑到結束畫面、重玩會重置進度。

## 延伸方向

- 加入更多角色：在 `characters` 工廠函式裡多加一個 `Character` 實例即可。
- 加入更多對話：在腳本的 `nodes` 物件裡加節點，`next` 接續、`choices`
  分支，`flag`/`action` 掛副作用。不需要碰 `DialogueRunner` 或
  `DialogueScene`。
- 想要「自動播放」「快轉」等 VN 常見功能：`engine/input.js` 已經預留
  `auto`/`skip` 這兩個動作對應的按鍵（`A` / `Ctrl`），目前尚未接上行為，
  可以在 `DialogueScene.update()` 裡讀取 `input.down('skip')` 來加速
  `runner.tick()`，或用 `input.pressed('auto')` 切換一個會自動呼叫
  `confirm()` 的計時器。
- 想要更多場上位置（不只 left/center/right）：改 `stage.js` 的
  `slots` 物件與 `dialogue-scene.js` 的 `POSITION_X`。
- 想要立繪有更豐富的動作（例如點頭、揮手）：`PortraitMotion` 目前只做
  呼吸/眨眼/說話彈動三種最基本、任何角色都適用的動態；角色專屬的動作
  可以另外加欄位到 `PortraitMotion`，或是走「換圖層變體」的路線（例如
  `body` 槽位切換成 `wave` 變體幾幀）。

## 授權

MIT
