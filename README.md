# tw_doujin_event data

[`dekkmarsvin/tw_doujin_event`](https://github.com/dekkmarsvin/tw_doujin_event) 使用的活動與 reference 資料。

```text
references/        跨活動共用的主辦、主辦分類目錄、場館與場館空間
events/<eventId>/  單一活動的定義、官方攤位、地圖與 reference 選擇
```

## 採用方式

程式 repo 不追蹤 `main`。每個活動在程式 repo 保存一份 `data/event-data-pins/<eventId>.json`，內含完整 40 字元 commit SHA 與每個實際讀取檔案的 SHA-256，涵蓋該活動的 `events/<eventId>/` 與其使用的 `references/`。commit 或 hash 不符時，採用端必須停止建置。

逐活動 pin 表示一場活動的更新不會把其他活動自上次 pin 以來的變更帶進部署。reference 修正不會自動改變既有活動；活動必須以可審閱的 pin update 選擇採用。

## 內容邊界

只收可再發布的主辦活動事實、本站產物、裁決紀錄與 provenance。第三方工作簿、主辦原始配置圖與其他第三方位元組不進入本儲存庫。

`references/` 的每筆記錄自帶 `sources` 與 `provenance`，來源只接受活動主辦或場館的官方說明頁。

儲存庫根目錄的條款不概括涵蓋 `events/` 底下的活動資料；逐活動的權利與來源說明見各自的 `events/<eventId>/NOTICE`。

## 驗證

```sh
node scripts/check.mjs
node --test scripts/check.test.mjs
```

這道 gate 只檢查 JSON 可解析、路徑落在 `references/` 與 `events/<eventId>/`、沒有二進位位元組，以及每個活動資料夾都有 `NOTICE`。完整 schema、reference selection 與 SHA-256 authority 在程式 repo 的 pin pull request。

活動保留 `event.json`、`official-booths.json`、`reference-selection.json` 與 `NOTICE`。地圖使用 `map.json`，或 `map-manifest.json` 搭配 `maps/<dayId>/<venueSpaceId>.json`；兩種形式都沿用程式 repo 的載入與完整驗證。新發布可附 `circle-identity-groups.json`，既有活動無此檔案仍可通過。

`main` 只接受經 pull request 且通過 `data / check` 的變更。
