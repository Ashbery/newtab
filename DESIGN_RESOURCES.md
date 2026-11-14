# 設計資源與使用界線

整理日期：2026-11-14。保留 21 個網站資源及 4 個已安裝技能的來源；未逐站確認目前功能與收費。

## 最終使用原則

**Nachoneko 角色參考決定整體 UI、圖示、按鈕、元件與搜尋的視覺。四個已安裝技能直接指導設計與精修；原始網站清單供動效、互動方式及動態元素參考。** 最新一輪依使用者要求額外檢視實際新分頁網站的時鐘分組與層級；不沿用它們的品牌、色票或行銷版型，也不以中性的服務商圖示取代角色語言。

角色的銀灰、粉藍、白、水色與炭灰，延伸到九枚生成應用圖示、透明人物圖與細緻緞帶／紙飛機搜尋 SVG。搜尋不使用已被否決的黑貓送出按鈕。淺瓷色抽屜與淺紙色表單，以炭灰文字及藍色重點維持清楚層次；具體方向見 [DESIGN.md](DESIGN.md)。

## 已安裝技能與實際用途

| 技能 | 來源 | 本次用途 |
| --- | --- | --- |
| frontend-design | [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | 從角色與新分頁用途建立構圖、字體、色彩與元件語言，檢視是否落入通用模板。 |
| UI UX Pro Max | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 採用焦點可見性、44px 觸控目標及對比指引。 |
| Impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 獨立設計評估與瀏覽器／偵測器評估，依實際畫面精修。 |
| logo-design | [kaankiziltug/logo-design-skill](https://github.com/kaankiziltug/logo-design-skill) | 檢視角色圖示輪廓、小尺寸辨識與 SVG 細節；保留 Ashbery 身分。 |

UI UX Pro Max 以 personal productivity／productivity dashboard 查詢時回傳的行銷模板與青綠色票不符合本案，未採用。角色配色、個人起始頁用途與使用者要求優先。

四個技能的來源版本：

| 技能 | 來源 commit |
| --- | --- |
| UI UX Pro Max | `6ae86f61f520d6ca229d2f40e070410638c908c5` |
| Impeccable | `c4cd1924c389f68d37c687d9c2bbf13f12547c41` |
| frontend-design | `2c5958ecac7cee2b583967a2c4981d0f4a75c579` |
| logo-design | `e9eaddc07895575253d6663320354a708f53e955` |

技能由本機 Codex／共用 agents 技能目錄管理；UI UX Pro Max 搜尋入口已適配本機路徑。它們是開發工具，網站執行不依賴這些技能。

## 已具體採用的互動參考

| 參考 | 轉化方式 |
| --- | --- |
| [BeUI motion tabs](https://beui.dev/components/motion/tabs) | 共用選取底板以 320ms 移動，保留既有原生分頁按鈕及鍵盤操作。 |
| [BeUI collapsible](https://beui.dev/components/motion/collapsible) | 展開／收合的連續性與狀態回饋。 |
| [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/base/dialog) | 對話框焦點、關閉與返回原控制項的互動慣例。 |
| [Kinetics push button](https://kinetics.colorion.co/effects/push-button/) 與 [ripple button](https://kinetics.colorion.co/effects/ripple-button/) | 按壓／釋放回饋的節奏，轉化為克制的位移與色彩反應。 |
| [Kinetics magnetic button](https://kinetics.colorion.co/effects/magnetic-button/) | 僅讓搜尋按鈕內部的圖案跟隨游標，將位移限制在 2px，按鈕位置不變。 |
| [Transitions avatar group hover](https://transitions.dev/studio.html?lib=avatar-group-hover) | 圖示的鄰近懸停回應，採位移／縮放與距離衰減，不改變點擊範圍。 |
| [Transitions tooltip](https://transitions.dev/studio.html?lib=tooltip-open-close) 與 [menu dropdown](https://transitions.dev/studio.html?lib=menu-dropdown) | 目的地提示的初次延遲／連續滑入，以及搜尋建議從控制項位置展開的短過渡。 |
| [BeUI Dock](https://beui.dev/components/motion/dock) | 固定且清楚的操作目標；未將本站未觀察到的圖示放大效果歸因於這個範例。 |
| [Android 主畫面操作](https://support.google.com/android/answer/9450271?hl=en) 與 [Widget sizing](https://developer.android.com/design/ui/mobile/guides/widgets/sizing) | 參考長按移動、放置預覽、資料夾及格位跨度。本案另明確區分快速交換與停留建資料夾，加入整次編輯的完成／取消，並保留桌面與手機各自排列。 |
| [Tabliss 網頁版](https://web.tabliss.io/) 與 [Momentum](https://www.momentumdash.com/) | 本輪實際開啟並檢視數字連續分組、時間與次要文字的層級。依使用者選擇製作纖細 HH:MM:SS 一行、日期獨立的版本，未複製品牌或背景。 |
| [Manrope](https://fonts.google.com/specimen/Manrope) | 時鐘改採本機 Light 300 的數字／冒號子集，字型檔約4.7KB；保留等寬數字與無網路時的備援。上一輪 Outfit 已停用。授權及來源置於 assets/fonts/。 |

應用圖示視覺最多上移 4px／放大至 1.06，鄰近圖示依距離遞減，點擊範圍固定。目的地提示首次滑入延遲 240ms；搜尋圖案位移最多 2px；一般按壓 60–80ms、釋放 140–220ms。減少動態偏好關閉介面動畫。這些是本案的實作界線，不是來源網站的通用規格。

## 原始網站清單

以下保留使用者提供的資源，並不表示每站都已採用。即使資源提供品牌或版面案例，本案也只從中參考可用的互動與動態呈現。

| 類別 | 資源 |
| --- | --- |
| 作品與產品案例 | [Reelfolio](https://reelfolio.io/)、[Inspora](https://inspora.design/)、[Mobbin](https://mobbin.com/)、[Land-book](https://land-book.com/)、[Refero](https://refero.design/)、[Brand Guidelines](https://brandguidelines.net/)、[Collect UI](https://collectui.com/) |
| 互動與動態元件 | [60fps](https://60fps.design/)、[Kobra](https://kobra.systems/)、[UIArc](https://uiarc.dev/)、[Kinetics](https://kinetics.colorion.co/)、[BeUI](https://beui.dev/)、[Transitions](https://transitions.dev/)、[Board UI](https://boardui.com/)、[Reverse UI](https://reverseui.com/)、[Beautiful UI](https://beautifului.dev/)、[Rare UI](https://rareui.com/)、[shadcn/ui](https://ui.shadcn.com/) |
| 圖表動效 | [EvilCharts](https://evilcharts.com/) |
| 背景動態研究 | [Backgrounds Supply](https://backgrounds.supply/)、[Shaders](https://github.com/shader-effects-inc/shaders) |

## 評估如何回到設計

獨立設計與互動評估促成角色圖示一致性、待辦／書籤空白狀態、手機欄位及按鈕尺寸、搜尋焦點、窄螢幕秒數對比，以及背景輸入／套用動作的分組精修。發行版本的驗證範圍見 [VALIDATION.md](VALIDATION.md)，不以技能名稱、評分或獎項名稱代替驗證。

現有 HTML、CSS、JavaScript 保持靜態執行，不因參考 React 範例而加入框架依賴。生成角色素材的來源與處理見 [assets/character/README.md](assets/character/README.md)。

原始分享來源：[UiSavior 的 X 貼文](https://x.com/UiSavior/status/2107836628232257750)。

## 天氣面板（2026.11.14.10）

依使用者提供的 Google 天氣截圖安排城市、目前天氣、三種逐時曲線及七日預報。圖示延續銀藍緞帶雲與貓掌太陽，字體、透明度和文字配色沿用組件外觀設定。

- [BeUI Tabs](https://beui.dev/components/motion/tabs)：採用單一滑動選中指示線、方向鍵切換與減少動態效果；原生 JavaScript 實作 320ms 指示線過渡。
- [EvilCharts](https://evilcharts.com/)：參考互動圖表的數值探查方式；使用本地 SVG 曲線、時間游標及可鍵盤操作的數值提示，未加入 React 圖表套件。
- UI UX Pro Max 的時間序列查詢：採用少量資料以 SVG 呈現、直接數值標示和鍵盤探查。未採用需要歷史基準與信賴區間的金融預測圖建議。
- [Open-Meteo 官方文件](https://open-meteo.com/en/docs)與 [MET JSON 文件](https://docs.api.met.no/doc/ForecastJSON.html)：確認單位、時區與降雨區間語意。缺值保留缺值；備援來源不提供機率時改顯示區間雨量。
