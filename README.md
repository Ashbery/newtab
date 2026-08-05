# Ashbery 新分頁 (newtab)

純前端自訂瀏覽器新分頁頁面：時鐘、Google 搜尋建議、快捷應用、可自訂影片／圖片背景。

## 線上預覽（GitHub Pages）

若倉庫已開啟 Pages（Settings → Pages → Deploy from branch `master` / root）：

`https://ashbery.github.io/newtab/`

本機直接開啟 `index.html` 也可使用（部分 Google 建議 API 受 CORS 限制時，建議用本地靜態伺服器或 Pages）。

```bash
# 簡易本機伺服器（任選其一）
npx --yes serve .
# 或
python -m http.server 8080
```

## 專案結構

```
newtab/
├── index.html              # 主頁（樣式與邏輯內嵌）
├── nachoneko-assets.js     # ★ 圖標+壁紙 base64 內嵌（建議上傳此檔）
├── favicon.ico
├── .nojekyll               # GitHub Pages 略過 Jekyll
├── assets/nachoneko/       # 原始 PNG（可選；本機開發用，不必推 GitHub）
├── script.js               # 舊版拆分（主頁未引用）
└── styles.css              # 舊版拆分（主頁未引用）
```

### 為什麼不用 `assets/` 資料夾？

部分環境（sparse checkout、工具限制等）會導致 **二進位資料夾推不上去**。  
因此改為：

| 方式 | 說明 |
|------|------|
| **推薦** | 只上傳 `nachoneko-assets.js`（約 1MB 文字檔，GitHub 可正常讀） |
| 可選 | 保留本機 `assets/nachoneko/` 方便日後重產 JS |

`index.html` 透過 `data-nacho-icon` + CSS 變數 `--nacho-wallpaper` 使用內嵌圖。

## Nachoneko 素材（授權）

圖標與壁紙取自官方免費包：

- [Nachoneko Icon and Wallpaper Pack（Elgato）](https://www.elgato.com/us/en/s/stream-deck-nachoneko-icon-and-wallpaper-pack)
- 授權：**MIT**（見 `assets/nachoneko/LICENSE.txt`）
- 角色／繪師：甘城なつき / Nachoneko（[@amsrntk3](https://x.com/amsrntk3)）
- 發行：Elgato Systems / Corsair, Inc. and other contributors

頁面內「設定 → 關於此分頁」亦有署名與 MIT 摘要。

## 推送到 GitHub

```bash
git checkout master   # 若目前為 detached HEAD
# 推薦：不依賴 assets/ 資料夾
git add index.html nachoneko-assets.js favicon.ico .nojekyll .gitattributes .gitignore README.md
git status
git commit -m "Embed Nachoneko assets for GitHub-friendly deploy"
git push origin master
```

若本機仍有 `assets/` 且能上傳，可一併 `git add assets/`，但**線上執行不需要**該資料夾。

### 注意

| 項目 | 說明 |
|------|------|
| 圖檔替代 | `nachoneko-assets.js` 為文字，避開 assets 上傳問題 |
| 體積 | `nachoneko-assets.js` 約 1MB（含壁紙 base64） |
| Pages | 根目錄需有 `.nojekyll`（已包含） |
| 重產資源 | 本機有 `assets/nachoneko/` 時可再跑產生腳本更新 JS |

## 功能摘要

- 時鐘／日期（zh-TW）
- Google 搜尋與建議
- 快捷連結與應用九宮格
- 背景：預設影片、本機影片（≤500MB）／圖片、網址
- 響應式排版（`clamp` + 媒體查詢）
