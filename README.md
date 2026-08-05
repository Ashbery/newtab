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
├── index.html          # 主頁（樣式與邏輯內嵌）
├── favicon.ico
├── .nojekyll           # GitHub Pages 略過 Jekyll
├── assets/
│   └── nachoneko/      # Elgato × Nachoneko 圖標與壁紙（MIT）
│       ├── icons/      # PNG 圖標（144×144）
│       ├── wallpaper.png
│       ├── LICENSE.txt
│       ├── README.md
│       └── manifest.json
├── script.js           # 舊版拆分（主頁未引用）
└── styles.css          # 舊版拆分（主頁未引用）
```

資源路徑皆為**相對路徑**（如 `assets/nachoneko/icons/on_icon_01.png`），推上 GitHub 後可直接被 Pages 讀取。

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
git add index.html assets/ .gitattributes .gitignore README.md
git status
git commit -m "Add Nachoneko assets and responsive new tab UI"
git push origin master
```

### 注意

| 項目 | 說明 |
|------|------|
| 圖檔 | `.png` / `.ico` 已在 `.gitattributes` 標為 `binary`，避免換行破壞檔案 |
| 體積 | 圖標合計很小；`wallpaper.png` 約 660KB，無需 Git LFS |
| Pages | 根目錄需有 `.nojekyll`（已包含） |
| 路徑 | 請勿改成 Windows 絕對路徑 |

## 功能摘要

- 時鐘／日期（zh-TW）
- Google 搜尋與建議
- 快捷連結與應用九宮格
- 背景：預設影片、本機影片（≤500MB）／圖片、網址
- 響應式排版（`clamp` + 媒體查詢）
