# 想問就問

給國高中生用的對話練習引擎，參考主流戀愛對話遊戲（Galgame/乙女遊戲）的呈現方式：
會呼吸、說話時會有反應的**可動立繪**，搭配分支選項的對話劇本——但目的不是戀愛
劇情，而是讓學生在一個有回饋、有進度感的介面裡反覆練習「開口提問」與其他
對話情境。

角色立繪是拆成部件的**剪紙木偶**：軀幹呼吸、頭部微傾、頭髮延遲跟隨、
眨眼、講話時的嘴型——用剛體變形做出主流遊戲動態立繪的簡化版，不需要
Live2D 那類函式庫或授權。素材怎麼拆見下方「動態立繪：素材拆分規格」，
**沒提供的部件會自動跳過**，可以只上三張圖先跑起來。

使用純 HTML5 Canvas + 原生 ES Modules 開發，**執行時零相依套件**、不需要建置步驟。
目前內建的對話腳本（`src/vn/content/`）只是一個示範模板——引擎本身不綁定任何學科，
真正的教學內容與美術素材由使用者自行填入（見下方「撰寫新對話內容」與「美術素材」）。

## 快速開始

```bash
npm start          # 啟動本機伺服器，開啟 http://localhost:8080
```

> ES Modules 無法從 `file://` 直接載入（瀏覽器 CORS 限制），所以需要透過
> `npm start` 提供的簡易靜態伺服器來執行，它本身也沒有任何相依套件。

### 在真的手機上測試

`npm start` 只會在你執行它的那台機器上開一個本機伺服器（預設
`http://localhost:8080`），手機沒辦法直接連進去，需要：

1. **電腦和手機連同一個 WiFi**，手機瀏覽器開
   `http://<電腦的區網IP>:8080`（電腦 IP 可用 `ipconfig`（Windows）或
   `ifconfig`/`ip addr`（Mac/Linux）查，通常長得像 `192.168.x.x`）。
2. 或是部署成公開網址（例如 GitHub Pages）——純靜態網站、零建置步驟，
   直接把整個 repo 內容當靜態檔案託管即可，不需要 `npm start`。

## 手機／畫面比例

`VIEW`（`src/vn/constants.js`）是 540×960，**直向 9:16**——設計成手機直握
時剛好塞滿螢幕寬度的比例，不需要橫向手機。`src/main.js` 會依視窗大小自動
等比縮放 canvas；現代手機（更窄更長，例如 19.5:9）縮放後上下會留一點小
黑邊，這是預期的，不是 bug。

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
  characters/<id>/<部件>/<變體>.png        角色部件圖（需自行提供，最少 3 張即可跑）
  backgrounds/<檔名>                       場景背景圖（需自行提供，jpg/png/webp 皆可）
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
    character.js          角色由哪些部件組成、每個部件顯示哪個變體（純資料）
    spring.js              阻尼彈簧：頭髮/衣袖延遲跟隨的那條方程式（純數學）
    rig.js                 剪紙木偶：部件階層、關節、把動態訊號變成各部件的變形（純數學）
    portrait-motion.js     待機動態的時鐘：呼吸/微傾/搖擺/眨眼/嘴型訊號
    portrait-renderer.js   依 Rig 算出的姿勢把各部件畫到 canvas，含缺圖時的退化處理
    stage.js               目前場上有誰、站哪裡、背景是什麼——腳本 action 操作的物件
    app.js                 頂層容器：canvas/input/audio/story/scene stack
    scenes/
      title-scene.js       標題畫面
      dialogue-scene.js    對話框、立繪、選項的渲染與輸入處理
      end-scene.js          一段劇本結束後的畫面（含分數摘要、重玩）
    content/
      demo-characters.js    示範角色與它們的 RIG 定義（同時是素材拆分規格的範例）
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
      speaker: 'hero',                 // 對應 characters 裡的角色 id
      lines: ['有問題想問我嗎？'],
      choices: [
        { text: '有，我想問……', next: 'good', flag: 'asked' },
        { text: '沒事。', next: 'shy' },
      ],
    },
    good: {
      speaker: 'hero',
      action: (stage, app) => {
        app.story.addVar('score', 1);   // 加分
        app.audio.correct();             // 回饋音
      },
      lines: ['很好，你問吧！'],
    },
    shy: { speaker: 'hero', lines: ['沒關係，想到再說。'] },
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
  （如果某個部件有多個變體，也可以在這裡用 `stage.equip()` 換裝、
  `stage.setExpression()` 換表情——見下方「換裝與換表情」。）
- `flag`：節點或選項進入時在 `StoryState` 標記一個布林旗標（例如用來記錄
  「這段有沒有練習過」）。
- 沒有 `next` 也沒有 `choices` 的節點，會在播完最後一行後結束對話，
  進入結束畫面（`EndScene`）。

## 動態立繪：素材拆分規格

角色不是一張圖，而是一具**剪紙木偶（cut-out puppet）**：拆成好幾個部件，
每個部件有自己的關節（pivot）、自己的父部件，以及自己對「待機動態」的
反應強度。這是主流遊戲動態立繪的簡化版——真正的 Live2D／Spine 是
**網格變形**（部件可以被拉彎、擠壓），我們用的是**剛體變形**（部件只能
平移/旋轉/縮放，不會變形）。剛體做不到轉頭和柔體起伏，但呼吸、點頭、
頭髮延遲擺動、眨眼、講話嘴型都做得到，而且不需要任何額外的函式庫或授權。

### 每張圖的通用規則

- **同一個角色的每張部件圖，畫布尺寸必須完全一樣**，而且是「整張立繪的
  畫布」——不是把部件裁切出來。該部件以外的區域留透明。這樣所有部件天生
  對齊，程式只需要知道關節位置。
- 去背 PNG（RGBA）。建議整體寬高比接近 300:540（約 9:16）。
- ⚠️ **被遮住的地方要補畫**：手臂從身體上分離出來之後，手臂原本蓋住的那塊
  身體會露出破洞，必須把被擋住的部分補完整。同理，瀏海後面的額頭、頭髮
  後面的背部都要補。這是拆分素材最花工夫的地方，程式無法代勞。

### 部件清單

由後往前的疊圖順序。`assets/characters/<角色id>/<部件>/<變體>.png`：

| 部件 | 內容 | 關節（pivot） | 動態 |
| --- | --- | --- | --- |
| `hair_back` | 後腦的頭髮（長髮、馬尾尾端） | 頭頂 | 彈簧跟隨頭部，延遲最明顯 |
| `lower` | 腰以下：臀、腿、鞋 | — | **完全不動**（其他部件的動態才有對比） |
| `torso` | 腰到肩：軀幹＋衣服（**不含手臂、不含頭**） | 腰線 | 呼吸（垂直縮放）、輕微左右擺 |
| `arm_l` / `arm_r` | 左右整隻手臂（肩到手） | 肩關節 | 彈簧跟隨軀幹，小幅延遲 |
| `head` | 頭：臉底、耳、脖子（**不含五官、不含瀏海**） | 脖子根部 | 微傾、隨呼吸上下 |
| `eyes` | 眼睛，需要 `open.png` 與 `closed.png` 兩張 | 跟著頭 | 眨眼時自動切換 |
| `mouth` | 嘴，需要 `closed.png` / `half.png` / `open.png` 三張 | 跟著頭 | 說話時輪替＝嘴型 |
| `hair_front` | 瀏海（蓋在臉前面） | 頭頂 | 彈簧跟隨頭部，比後髮硬一點 |
| `accessory` | 眼鏡、髮飾等（可省略） | 跟著頭 | 剛性跟著頭 |

**最小可行組合**是 `lower` / `torso` / `head` 三張——這三張是純橫向切割，
不會產生破洞，可以直接用工具從現成的整張立繪切出來：

```bash
python3 tools/split-parts.py 原始立繪.png assets/characters/hero \
    head:0:0.25 torso:0.19:0.47 lower:0.43:1
```

⚠️ **切片要互相重疊，不能剛好對接。** 上面關節在脖子 0.21、腰 0.43，但每塊
都往關節外多切約 20px。因為這些切片來自壓平的完稿，背後什麼都沒有——一旦
兩塊之間有任何相對位移，對接的邊緣就會露出背景成一條很明顯的直線。有重疊、
再依「後面的先畫」的順序疊上去，小幅度的動作就永遠發生在重疊區內，不會露餡。

目前 repo 裡示範角色的 `head`/`torso`/`lower` 就是這樣切出來的，另外
`arm_l`/`arm_r`/`hair_front` 是美術另外提供的分層；`eyes`/`mouth` 還沒有，
所以眨眼跟嘴型目前是關著的。**沒提供的部件會自動跳過**，可以一張一張補，
程式完全不用改。

> ⚠️ 示範角色的 `全身` 完稿把手臂和頭髮也烙在裡面了（分層是額外提供的複本，
> 而不是把它們從本體挖掉）。分層疊在自己的複本正上方，靜止時完全蓋住，
> 小幅擺動時露出來的也是同一隻手臂，所以看不出破綻。搭配上面的重疊切法，
> 實測把幅度放大到 4 倍，脖子和腰的接縫都還是乾淨的。
> 真的要做大動作（揮手之類），才需要請美術把本體被遮住的部分補畫出來。

### 關節位置要對得上你的構圖

`demo-characters.js` 裡的 `RIG` 定義了每個關節在畫面高度的哪個比例
（`neck: 0.21`、`waist: 0.43` 等，每個角色各自量）。那組數字是給**全身站姿**用的；
如果改成半身構圖，關節會落在完全不同的比例上，要跟著調整——關節位置
錯了（例如頭的關節設在脖子上方）會變成不倒翁那樣搖頭。

### 動態是怎麼組出來的

`PortraitMotion`（`src/vn/portrait-motion.js`）只負責產生**正規化的訊號**
（-1..1），不決定任何部件移動多少：

- **breathe**：呼吸週期（4.2 秒），值域 **0～1**——0 是靜止、1 是吸飽。
  刻意**不是**正弦波：吸氣快（32%）、吐氣慢（48%）、然後在底部停一下
  （20%）。這個不對稱就是「在呼吸」和「在震盪」的差別，對稱波形不管幅度
  調多小都會像機器。
- **tilt**：待機姿勢漂移（7.5 秒）
- **sway**：第二條獨立漂移（5.6 秒）
- **blinking** / **mouthIndex**：眨眼與嘴型的切換

待機週期**刻意不成整數倍**，否則它們會週期性地同時對齊，角色就會以一個
固定節拍「一起一伏」，那是動畫在跑迴圈的破綻。每個角色的起始相位也是
隨機的，所以同時站兩個人不會像同一個木偶播兩次。

**兩個通道都只驅動「繞關節旋轉」，沒有任何橫向平移。** 平移會讓部件從它
掛著的那個部件上滑開，腰或脖子就會看到錯位；繞關節轉才是身體真正在做的
事，而且不可能散開。

**沒有「說話彈跳」這個通道。** 早期版本在角色說話時讓全身以約 4Hz 彈跳，
但單角色劇本裡永遠有人在說話，結果就是角色從頭抖到尾。說話是嘴巴的事；
誰在說話已經靠「其他人變暗」表達了。

### 父部件的縮放會「移動」子部件，但不會「拉長」它

軀幹呼吸時會垂直縮放，頭和手臂掛在軀幹下面——如果直接繼承這個縮放，
**整個上半身（包含臉）會跟著抽長**，看起來像橡皮而不是呼吸。所以
`Rig` 會記錄每個部件繼承到的縮放（`parentScaleY`），`PortraitRenderer`
在畫該部件時把它除回去：胸口撐開會把頭「抬起來」，但頭本身維持原本的
比例。

實際位移多少由 `Rig`（`src/vn/rig.js`）裡每個部件的權重決定，例如 `torso`
的 `breathe: 1`、`head` 的 `tilt: 1`。而 `spring`（`src/vn/spring.js`）是
讓這套看起來像現代遊戲的關鍵：頭髮不是跟著頭一起轉，而是**延遲、然後
稍微甩過頭再回正**。這個跟隨感（follow-through）是剛體木偶最強的「活著」
訊號，而且只靠一條阻尼彈簧方程式。

### 背景圖

放在 `assets/backgrounds/<檔名>`（例如 `assets/backgrounds/classroom.jpg`，
`stage.setBackground('classroom.jpg')` 裡的字串就是完整檔名含副檔名，
jpg/png/webp 都可以——背景不需要透明底，用 jpg 檔案小很多）。任意尺寸都
可以，畫面會用「置中裁切鋪滿」（CSS `background-size: cover` 的效果）畫進
`VIEW`（540×960，直向 9:16），不會被拉伸變形，但長寬比跟 9:16 差太多的圖
上下或左右會被裁掉一些。

**任何部件圖還沒畫好、載入失敗、或根本沒提供，都會自動跳過**；全部都沒有
時會退化成一個標示角色名字的色塊，不會白畫面、不會丟例外——所以整個系統
在美術完成之前就可以完整測試與展示。

### 換裝與換表情

每個部件可以有多個**變體**，換裝就是換掉某個部件目前顯示的變體，不需要
改任何程式碼。例如軀幹多畫一套體育服：

```
assets/characters/hero/torso/default.png
assets/characters/hero/torso/gym.png
```

對話腳本裡：

```js
action: (stage) => stage.equip('hero', { torso: 'gym' })
```

表情同理——如果 RIG 裡有 `face` 部件，`stage.setExpression(id, 'happy')`
就是把 `face` 換成 `happy.png`（跟直接 `equip` 是同一件事，只是讀起來
比較直覺）。

因為部件是分開的，換裝只要重畫被換掉的那個部件，臉和頭髮不必跟著重畫——
這正是拆分素材除了做動態以外的第二個好處。

## Stage：一段對話的舞台

`Stage`（`src/vn/stage.js`）記錄目前背景是什麼、哪些角色在場上的哪個位置
（`left`/`center`/`right`）、誰在說話。這是傳給 `DialogueRunner` 的
`world` context，對話腳本的 `action` 透過它操縱畫面：

```js
b => {
  stage.setBackground('classroom');
  stage.show('hero', 'center');
  stage.show('mei', 'right');   // 多角色時
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
   （沿用那份 `RIG`，只換 `id`/`name` 即可），仿照 `demo-script.js`
   寫節點圖劇本。
2. 在 `src/main.js` 把 `charactersFactory`/`script` 換成你自己的。
3. 有美術素材時，依「動態立繪：素材拆分規格」把部件圖放進
   `assets/characters/<id>/<部件>/`，不需要改任何程式碼——`PortraitRenderer`
   會自動偵測到並開始顯示，還沒畫好的部件自動跳過。若構圖不是全身站姿，
   記得調整 `RIG` 裡的關節比例。
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
| `character.test.mjs` | 部件變體：get/set/equip、換表情、slots 由 rig 推導、clone 不互相污染 |
| `rig.test.mjs` | 部件階層的變形累加、各通道權重、更新順序先父後子、彈簧跟隨、壞資料（缺父、循環）不當掉 |
| `spring.test.mjs` | 彈簧的延遲與過衝、最終收斂、超大 dt（分頁喚醒）不爆炸 |
| `portrait-motion.test.mjs` | 各通道值域、三個待機週期不同步、兩個角色不同相位、眨眼計時（含長跑不卡死）、嘴型只在說話時輪替 |
| `stage.test.mjs` | 上場/下場/移動角色、換裝/換表情轉發、誰在說話的判定、每個角色有自己的 rig 且不同步 |
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
- 想要立繪有更豐富的動作：先試著**把部件拆得更細**（例如把手臂拆成
  上臂/前臂/手三段，各自給 `spring`），這是不動程式碼就能做到的；`RIG`
  的欄位與權重都是資料。
- 想要新的動態「種類」（例如點頭、視線跟隨滑鼠）：在 `PortraitMotion`
  加一個新訊號，在 `rig.js` 加一個對應的權重欄位，兩邊都是純數學、可以
  離線測試。視線跟隨還需要把瞳孔獨立成一個部件。
- 想要真正的 Live2D 等級（轉頭、柔體變形）：那需要換成網格變形，也就是
  導入 Live2D Cubism Web SDK 或 Spine 的 runtime（會失去目前零相依套件
  的特性，商用還要確認授權），而且美術要拆到 50～150 層並用 Cubism
  Editor 綁定。目前這套剛體木偶是不走那條路的情況下能做到的上限。

## 授權

MIT
