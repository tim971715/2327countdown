# 國巨 2327 千元倒數看板

即時股價、還差幾 %、還要漲停幾次、照近 5 日走勢推估幾天到 1000。

## 結構

```
public/index.html        前端（整頁單檔）
functions/api/quote.js   Cloudflare Pages Function：代理證交所 MIS 即時報價
functions/api/history.js Cloudflare Pages Function：代理證交所 STOCK_DAY 日線
lib/twse.js              抓證交所的共用邏輯（Functions 與本機 server.js 共用）
lib/edge.js              Cloudflare 邊緣快取
server.js / start.bat    本機版（雙擊 start.bat 即可，不需 Cloudflare）
wrangler.toml            Pages 設定（輸出目錄 public）
```

為什麼要 Functions：證交所 MIS 即時報價不給 CORS，瀏覽器無法直接抓，必須有後端代理。

## 部署到 Cloudflare Pages

> ⚠️ 不能用 Cloudflare 後台的「拖曳上傳資料夾」——那種方式不會部署 `functions/`，頁面會打開但抓不到股價。請用下面兩種方式之一。

### 方式 A：wrangler 指令（最快）

```bash
npm install
npx wrangler login
npx wrangler pages deploy
```

第一次會問專案名稱，用預設 `yageo-countdown` 即可，完成後網址為 `https://yageo-countdown.pages.dev`。

### 方式 B：連 GitHub 自動部署

1. 把整個資料夾推到 GitHub（`node_modules/` 已在 .gitignore）
2. Cloudflare 後台 → Workers & Pages → 建立 → Pages → 連接 Git
3. 建置設定：Framework 選 None、Build command 留空、Build output directory 填 `public`
4. 之後每次 push 自動重新部署

## 本機測試

```bash
npm run dev
```

用 wrangler 模擬 Cloudflare 環境（http://localhost:8788）。不想裝 wrangler 就直接雙擊 `start.bat`（http://localhost:8327）。

## 更新頻率與負載

- 前端：盤中每 5 秒、盤後每 60 秒、分頁在背景時暫停
- 後端：即時報價快取 5 秒（盤後 60 秒）、日線快取 30 分鐘；同一個 Cloudflare 機房的所有訪客共用同一份快取，證交所看到的請求量不會隨人數增加
- 證交所 MIS 本身約 5 秒撮合一次，更新得比 5 秒快沒有意義，且短時間大量請求可能被暫時封鎖 IP
