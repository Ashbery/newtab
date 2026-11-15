# Ashbery 新分頁擴充

Brave／Chromium 的原生新分頁外框，載入 `https://ashbery.github.io/newtab/`。網站仍負責搜尋、天氣、背景、版面與 Nacho 對話；擴充提供原生新分頁入口、導覽橋接與可選的背景分頁保護。

## 1.2.0

- 設定面板採 Nacho 的銀灰、冰藍與炭灰配色，可切換三款工具列圖示與面板頭像：藍色日常、暖冬針織、緞帶制服。這些是靜態素材，沒有新增或更換 Live2D。
- 「保留新分頁」使用瀏覽器的 `tabs.autoDiscardable`，只保護 Ashbery 網站與此擴充的原生新分頁。關閉設定或離開該頁後，恢復由本擴充改動的保護狀態；原本已被其他工具保護的頁面不由本擴充解除。
- 不再用週期心跳、重複鬧鐘與儲存寫入維持背景程序。背景程序可以正常休眠，再由瀏覽器事件喚醒。保留分頁不保證背景動畫幀率，也不阻止電腦休眠或使用者關閉分頁。
- 保留既有 `keepAliveEnabled` 選擇、背景媒體和其他儲存資料；舊啟用次數不再當成實際運作時間展示。保護分頁會保留該頁記憶體，可隨時關閉。
- 移除未使用的 `background`、`idle` 及其他 GitHub Pages 網站權限。`alarms` 僅用於清除舊版建立的三個鬧鐘，不建立新週期鬧鐘。

## 安裝與更新

首次使用：在 `brave://extensions/` 開啟開發人員模式，按「載入未封裝項目」，選取本目錄。更新現有安裝時，將此目錄內容更新到原本載入的資料夾，然後按「重新載入」；沿用原資料夾可保留擴充識別與原設定，不需移除重裝。

原生新分頁網址列與 Brave 的「隱藏頁尾」偏好沿用瀏覽器行為。網頁 iframe 的定位、自動播放、本機聊天服務與螢幕識別授權委派保持不變。

## 素材與驗證

三款透明原圖及生成來源位於 [`assets/nacho-wardrobe`](../assets/nacho-wardrobe/README.md)。本目錄的 `icons/` 含 16、32、48、128、512 像素版本；`icon16/48/128.png` 為預設造型。

本機字型 Manrope 來自 Manrope Project Authors，隨附完整 [SIL Open Font License](fonts/OFL-Manrope.txt)。字型不需從第三方網站載入。

`tests/extension-settings.cjs` 使用獨立 Brave 設定檔，檢查新分頁保護、解除、關閉重開瀏覽器、圖示選擇與存量資料。`tests/extension-policy.test.cjs` 覆蓋 API 失敗和過期導覽的處理；`tests/extension-compatibility.cjs` 檢查網站導覽、背景資料、頁內對話與 iframe 權限。測試不使用個人瀏覽器設定檔。

機制依據：[Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#property-Tab-autoDiscardable)、[擴充背景程序生命週期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。
