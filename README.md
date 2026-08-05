# Ashbery 新分頁

自訂瀏覽器起始頁：時鐘、Google 搜尋、捷徑、可換影片／圖片背景。

**Demo：** https://ashbery.github.io/newtab/

---

## 功能

- 時鐘／日期（zh-TW）
- Google 搜尋與建議（可輸入網址直達）
- 右上捷徑：圖片、Gmail、應用
- 自訂背景：本機 MP4／WebM（≤1000MB）、圖片，或媒體 URL
- 本機背景以 IndexedDB 保存；URL 背景寫入 localStorage
- 雙緩衝循環播放，減少 loop 接縫
- 響應式排版

---

## 使用

線上直接開啟 Demo，或下載後開 `index.html`。

Chrome 設為啟動頁：設定 → 啟動時 → 開啟特定網頁 → 填入 Demo URL。

換背景：右下設定 → 上傳背景。授權說明見設定 → 關於此分頁。

---

## 結構

```
index.html              # 主頁
nachoneko-assets.js     # 圖標／壁紙（data URI，部署用）
favicon.ico
.nojekyll
assets/nachoneko/       # 原始素材（可選，非部署必要）
```

---

## 開發

```bash
npx --yes serve .
# 或：python -m http.server 8080
```

GitHub Pages：倉庫 Settings → Pages → 分支 root。

---

## 素材

UI 圖標與面板壁紙取自 [Nachoneko Icon and Wallpaper Pack](https://www.elgato.com/us/en/s/stream-deck-nachoneko-icon-and-wallpaper-pack)（Elgato × 甘城なつき／[Nachoneko](https://x.com/amsrntk3)），**MIT**。頁內「關於此分頁」含署名與授權摘要。

---

## 授權

- 本倉庫：依 repo 授權為準  
- Nachoneko × Elgato 素材：MIT，保留署名  
