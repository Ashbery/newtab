# Ashbery 貓貓新分頁

以 Nachoneko 的銀灰、冰藍、爪印與緞帶細節設計的個人起始頁。純 HTML、CSS、JavaScript，無需建置步驟。

## 功能

- 本機 Manrope Light 纖細數字時鐘，完整時分秒一行、日期獨立排列；Google 搜尋、建議、網址直達。
- `/` 或 Ctrl/Cmd+K 開始搜尋；支援中文輸入法、方向鍵、Enter、Escape。建議服務無法使用時仍可搜尋。
- 可新增、移動、縮放與移除的角色組件，保留圓形銀藍場景與柔化下緣。動畫目標為硬體加速90FPS、備援60FPS，依螢幕更新率呈現；時間式計算維持自然動作速度。可選擇跟隨系統、開啟動畫或靜態角色。點角色開啟頁內 Nacho 對話。
- 九款角色風格應用插畫與一致的組件圖示；懸停浮起、目的地提示及按壓回饋。
- 捷徑、資料夾、待辦、筆記、書籤、天氣與倒數組件；格位吸附、落點預覽、選取後調整大小。
- 桌面與手機分別保留排列；進入編輯時維持當前位置，「完成」儲存，「取消」還原。
- 預設位置與拖移使用相同格線；調整視窗後保留圖示尺寸，切回原解析度還原排列。
- 新項目可吸附至既有項目的列、欄與等距排列；舊版儲存的非格點位置也能對齊，預覽即為實際落點。
- 新增組件以桌面格位決定尺寸；21:9、32:9 的預設構圖保持集中，但可拖移至整個畫面的四邊與角落，保留16px邊距。卡片不會隨螢幕寬度放大，舊排列及自訂尺寸保留。
- 本機圖片／影片或媒體網址背景；影片循環播放，可暫停及靜音。可切回貓貓主題。
- 個人化面板提供圖片／影片背景透明度與模糊百分比；滑桿和數字輸入同步，並可恢復預設。
- 右鍵「自訂組件外觀」調整每個組件的底色、透明度、模糊、圓角、邊框、陰影與文字明暗。一般組件底色預設 70% 透明，時鐘完全透明；圖示下方文字沒有底色。
- 搜尋列的外觀設定另提供「搜尋送出按鈕」：獨立調整背景色、背景透明度百分比、圖示顏色與圓角，即時預覽並儲存。「恢復按鈕預設」只重設按鈕；整體「恢復預設」同時還原搜尋列與按鈕。手機展開搜尋也沿用相同設定。
- 專注模式收起捷徑與角色，按 Escape 或從工具選單返回。
- 天氣提供裝置定位、城市搜尋、網路城市估算、更新與失敗重試；書籤可直接管理名稱、網址與刪除。

## 預覽與使用

在專案目錄啟動靜態伺服器：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

開啟 [本機預覽](http://127.0.0.1:4173/)。也可直接開啟 index.html，建議使用 HTTP 預覽以獲得一致的儲存行為。

[GitHub Pages](https://ashbery.github.io/newtab/) 顯示倉庫已發布的版本。部署需包含 index.html、css/、js/、assets/（包含 fonts/）、nachoneko-assets.js 和圖標檔案。

滑鼠靠近畫面右緣會顯示「工具」，移開後收起；鍵盤聚焦時也會顯示，觸控裝置保留可點的入口。工具內集中組件、應用與個人化設定。

按「新增」放入下一個空位，或按住面板內圖示拖到主畫面。從「個人化 → 排列主畫面」進入編輯，也可長按主畫面的組件。按住約半秒，出現選取提示後再拖曳；即使已在編輯模式，也需要長按才會抓起。點空白處只取消選取，不會移動組件。預覽框就是實際落點，空間不足時留在原位。快速拖到另一個應用上會交換位置；停在中央約 650ms、看到資料夾提示後放開才會收進資料夾。

選取組件後可拖曳邊點縮放，或使用工具列的放大／縮小。鍵盤方向鍵移動一格，Shift＋方向鍵調整組件跨度。按「完成」儲存整次編輯，「取消」放棄變更；編輯中的新增項目也屬於草稿。右鍵或 Shift+F10 開啟組件設定；觸控可先長按選取，再使用編輯工具列的「設定」。每個組件不再顯示三點按鈕。原有本機排列與背景保留。

單點組件不會顯示選取外框，長按約560ms才選取／抓起；鍵盤可用 Enter 或空白鍵選取。拖到螢幕邊緣可直接放置，刻意停留320ms才開始捲動，避免放手前突然改變落點。

## 驗證

```sh
node --test tests/search.test.cjs tests/layout-resize.test.cjs
node --test tests/home-grid.test.cjs tests/clock-menu.test.cjs
node tests/home-editor.cjs
node tests/layout-roundtrip.cjs
node tests/layout-legacy.cjs
node --test tests/layout-alignment.test.cjs
node tests/layout-alignment.cjs
node tests/ultrawide-layout.cjs
node tests/ui-regressions.cjs
node tests/background-playback.cjs
node tests/background-seam.cjs
node tests/background-compatibility.cjs
node tests/extension-compatibility.cjs
node tests/weather-regressions.cjs
node tests/weather-location.cjs
node tests/widget-functionality.cjs
node tests/appearance-controls.cjs
node tests/search-appearance.cjs
node --test tests/companion-browser.test.cjs
node --test tests/context-menu-browser.test.cjs
node tests/full-canvas.cjs
node tests/character-chat.cjs
node --test chat-service/test/*.test.mjs
```

瀏覽器情境測試需要可由 Node 載入的 Playwright，以及 Microsoft Edge；測試前需開啟本機伺服器。可用 PLAYWRIGHT_CHANNEL 改變瀏覽器，NEWTAB_TEST_URL 改變測試網址。測試使用獨立瀏覽器資料，不操作個人資料。

循環接點測試另需 FFmpeg／ffprobe，預設產生測試影片並比較接點與平常播放的畫格間隔。可設定 NEWTAB_BROWSER_PATH 指向 Brave；NEWTAB_SEAM_FILE 指向明確選定的原片，經本機上傳流程唯讀驗證，不修改檔案。預設觀察至少三輪，長影片可用 NEWTAB_SEAM_DURATION_MS 指定觀察時間；不足三個接點時不會判為通過。

設計方向見 [DESIGN.md](DESIGN.md)，參考清單見 [DESIGN_RESOURCES.md](DESIGN_RESOURCES.md)，本次檢查紀錄見 [VALIDATION.md](VALIDATION.md)。

## 既有擴充相容性

既有擴充的永久啟用與統計設定存放於擴充自身，本頁不會更改。舊版的本機影片快取與 `videoUrl` 背景網址會讀取並搬入新版背景儲存，保留舊資料；已明確選擇的新背景或預設主題優先。測試使用隔離資料，沒有改寫個人瀏覽器設定。

擴充 1.1.0 改用本機原生新分頁外框，內部載入原有 GitHub 網站；開啟新分頁時網址列保持空白，不需要額外 Windows 小程式或模擬刪除按鍵。搜尋及捷徑會正常離開外框，開啟整個目的地分頁。外框先完成身分登記才載入網站；新增的導航監聽只處理本擴充已登記外框的直接子頁面。舊版網站也適用，現代網站會跳過過時的影片控制項注入。

若更新已安裝擴充的原始檔，需在 `brave://extensions/` 對「Ashbery 新分頁」重新載入；不需要移除或重裝。一般網站更新由 GitHub Pages 提供，開啟新分頁即可載入；若仍看到快取舊版，可使用 Ctrl+Shift+R。

Brave 可能在原生新分頁底部附加白色頁尾，顯示擴充名稱與「自訂 Brave」。在該白條的空白處按右鍵，選擇「隱藏頁尾 / Hide footer」即可移除，同時保留空白網址列。使用者已確認這個操作成功。這是瀏覽器的頁尾顯示設定，不需要修改網頁高度、啟動旗標或模擬鍵盤輸入。

網站版本由頁面的 `newtab-release` 標記識別。擴充繼續載入 GitHub Pages 網站，既有背景與排列仍存於使用者瀏覽器。[驗證範圍與已知限制](VALIDATION.md)。

角色對話在新分頁內串流顯示回覆，以頭像與 **Nacho** 署名；不再顯示模型選單，服務自動使用帳號提供的預設模型。可停止、重試與清除，支援基本粗體、清單與行內程式碼。首次需安裝 [Windows 本機連線服務](chat-service/README.md)，再從面板使用官方 ChatGPT 登入及授權方案用量；不需要把 API 金鑰放入網頁。登入憑證由 Windows 加密保存在這台電腦；網頁只暫存目前分頁的對話。這不會接入既有 ChatGPT／Dot 的歷史、記憶或工作狀態。未登入或連線失敗時不會產生假回覆。

對話右上角「角色設定」可編輯 Nacho 的個性與說話方式，或匯入UTF-8 `.txt`／`.md` 文字檔，最多8,000字元。按「儲存設定」後從下一則回覆套用，並保留在此瀏覽器；取消不變更原設定。「恢復預設」會載回預設內容，再按儲存即可套用，對話與登入不會被清除。本機服務需1.1.0或更新版本，更新保留原有登入授權。

預設 Nacho 設定以公開角色資料與官方介紹為參考，採用悠緩親近、偶爾俏皮的繁體中文語氣，融入繪畫、遊戲與鳳梨披薩等興趣。來源、讀取限制與原創演繹範圍見 [角色設定說明](CHARACTER_PERSONA.md)。舊版原始預設會自動採用新版，自訂過的提示詞保留。

本機服務已啟動後，Brave 可能詢問是否允許網站連接本機。新分頁外框的 iframe 需保留 `geolocation; autoplay` 並加入 `loopback-network; local-network-access` 委派，更新外框後重新載入擴充一次。這不更動既有背景、永久啟用設定及空白網址列行為。

## 天氣位置

「定位」會請求瀏覽器取得裝置位置；重新定位不使用舊的裝置定位快取。定位與天氣連線分別計時，不再讓天氣服務的8秒逾時提早中止位置權限提示。定位失敗會顯示原因，保留先前有效或手動選過的位置；沒有位置時，不會自動把台北當成定位成功。舊版因失敗而存下的台北備援位置也不再阻止重試。主動點選「先看台北天氣」仍會儲存這個選擇。

點天氣組件左上的城市名稱，可輸入至少兩個字元並按「搜尋城市」，再選取城市／行政區／國家相符的結果。也可主動按「以網路估算城市」：由 GeoJS 依網路IP估算，確認結果後才套用。這是約略位置，VPN或網路業者可能造成偏差；不會在定位被拒絕時自動啟用，也不會儲存服務回傳的IP。城市與天氣座標保留在本機設定，更新天氣時提供給天氣服務；網路估算的位置會持續標示。選定城市、取消搜尋或移除組件後，過期回覆不會蓋掉新設定。

天氣先使用 Open-Meteo；連線或資料失敗時改用 [MET Norway 的 Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation)。組件標示實際來源、資料時間與授權；備援預報不會假造缺少的體感溫度或每日高低溫。MET 座標只送到小數4位，依地點快取至少3小時並遵守服務的 `Expires`，「更新」與切換城市也不會繞過這段快取。資料依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用，來源與[服務規範](https://docs.api.met.no/doc/TermsOfService.html)均保留連結。

地名資料：[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api)；網路城市估算：[GeoJS](https://www.geojs.io/docs/v1/endpoints/geo/)。原生裝置定位仍受瀏覽器與系統權限、定位服務可用性影響，網頁不會擅自更改這些權限。此更新不需要重新安裝新分頁擴充。

## 素材

原圖標／壁紙包：[Nachoneko Icon and Wallpaper Pack](https://www.elgato.com/us/en/s/stream-deck-nachoneko-icon-and-wallpaper-pack)，Elgato × 甘城なつき／[Nachoneko](https://x.com/amsrntk3)，保留包內 MIT 授權與署名。

新增立繪及九款應用插畫依使用者提供的角色參考以 AI 生成，來源見 [assets/character/README.md](assets/character/README.md)。貓標誌、搜尋及組件線條圖示為本頁繪製。新增作品與上述 MIT 素材包分開署名。
