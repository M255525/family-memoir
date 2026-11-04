# family-memoir — 家庭回憶錄

每天問長輩一題，把故事、照片、錄音留下來，整理成回憶盒、人生年表、家族樹，最後排成可列印的 A5 書（預設直排線裝風）。純前端靜態網頁，2026-11-04 建立。

- 檔案：`index.html`（版面＋CSS）、`app.js`（全部邏輯）、`data.js`（12 章節、120 題、宜忌、台灣大事 `EVENTS`、虛構範例 `SAMPLE`、範例自繪 SVG `ART`）、`manual.html`（由 `node tools/build_manual.js` 用 `tools/manual_body.html` 產生，創作者區塊取自 `互動遊戲/taiwan-bird-atlas/tools/manual_tpl.html`）、`tools/make_icons.py`。
- 本機預覽 port **8851**（`.claude/launch.json` 的 `family-memoir`；8850 是 ai-senior-learning-coach）。
- 上線：公開 repo <https://github.com/M255525/family-memoir>，GitHub Pages（Actions workflow，master）<https://m255525.github.io/family-memoir/>。visitor-badge `m255525.familymemoir`。
- **隱私是這個工具的核心**：公開網站不可放任何真實家人資料，範例全部虛構。資料只存瀏覽器，不串 AI 金鑰（只有「複製潤稿提示詞」），不要加雲端同步或把內容送到第三方，除非使用者明確要求並同步改警語。「用說的輸入」會經瀏覽器語音服務，警語已說明。
- 標準配備：創作者資訊、操作手冊、使用警語（warnbar＋首訪跳出，`fm_warned`）、PWA、訪客計數器、跑馬燈（必備、不提供關閉）、⚙ 常用設定（收合式 `.set-sec`）。沒有序號、沒有 PDF 浮水印（家人的書不放講師標誌，使用者要求才加）。改 shell 檔後要升 `service-worker.js` 的 `CACHE_NAME`。

## 資料
- 文字：localStorage `fm_books`（`{cur, books[]}`）；設定 `fm_set`；首訪 `fm_warned`；今日撕頁數 `fm_tear`；未存草稿 `fm_draft`。
- 照片（縮到長邊 1600 JPEG）、錄音：IndexedDB `family-memoir` 的 `media` store，回憶只存 id。`hydrate()` 把 `[data-media]` 換成 objectURL。
- 備份 JSON：`{app:'family-memoir', v:1, book, media:{id:dataURL}}`。匯入同 id 的書用 `mergeList` 依 `updatedAt` 合併，刪除不同步。

## 成書排版（改動時注意）
- `buildBook()` 在隱藏的 `#printBook` 以真實 A5 尺寸逐塊加入並量測溢出（直排看 scrollWidth、橫排看 scrollHeight），段落用二分搜尋切開、避開行首標點；預覽 `#spread` 是 clone＋`zoom`，列印直接印 `#printBook`。不要靠瀏覽器自動分頁，直排 block 在 Chrome 不會正常斷頁。
- 目錄先放佔位頁碼（可跨頁），全書排完回填。家族樹頁用 `.flat` 改回橫排。
- 直排時 `vtext()` 把阿拉伯數字換國字：4 位以上或 0 開頭逐字（二〇二〇），其他念法（十八）。
- 列印需 `@page{size:148mm 210mm;margin:0}`，手冊有提醒勾「背景圖形」。

## 驗證紀錄（2026-11-04，Python Playwright）
首訪警語、填主角（民國 37→1948）、撕日曆、回答存檔、範例載入、五分頁；直排／橫排 × 中／大字無頁面溢出；2,000 字以上長文跨頁無掉字；照片實際上傳；新增家人；匯出→刪書→匯入→重整後圖片仍在；PDF 24 頁 A5、封面底色有印出；360／375／414／768／1024 無水平捲動；無 console 錯誤。麥克風錄音與語音輸入未用真實裝置測。
