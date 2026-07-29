#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-28-postmarket.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "reports", "2026-07-28-postmarket-recap.html"), "utf8");
const sharedCss = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-28.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const extended = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_extended_2026-07-28.json"), "utf8"));

const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}

function exactDate(rows, expected) {
  const dates = new Set(rows.map((row) => row.asOf));
  return dates.size === 1 && dates.has(expected);
}

check(snapshot.rows.length === 72 && snapshot.errors.length === 0, "長橋收盤快照必須為 72／72、錯誤 0");
check(thematic.rows.length === 44 && thematic.errors.length === 0, "Thematic Sectors 快照必須為 44／44、錯誤 0");
check(macro.rows.length === 24 && macro.errors.length === 0, "Macro 快照必須為 24／24、錯誤 0");
check(exactDate(snapshot.rows, "2026-07-28"), "長橋收盤快照日期必須全部為 2026-07-28");
check(exactDate(thematic.rows, "2026-07-28"), "Thematic Sectors 日期必須全部為 2026-07-28");
check(exactDate(macro.rows, "2026-07-28"), "Macro 日期必須全部為 2026-07-28");
check(extended.rows.length === 10 && extended.rows.every((row) => row.postmarketAvailable), "盤後即時報價必須為 10／10 可用");

check(JSON.stringify(data.reconciliation_summary) === JSON.stringify({
  hit: 4,
  triggered: 1,
  miss: 1,
  not_triggered: 4,
}), "對賬統計必須為 4 命中、1 已觸發、1 失誤、4 未觸發");
check(data.reconciliation_rows.length === 10, "盤前規則必須逐行對賬 10 項");
check(data.index_rows.map((row) => row.asset).join(",") === "IWM,DIA,SPY,QQQ", "指數表只能保留 IWM、DIA、SPY、QQQ");

check(data.sector_rows.length === 12, "Sector Dashboard 必須為 12 列");
check(data.sector_rows.filter((row) => row.label === "SPY").length === 1, "Sector Dashboard 必須恰有一列 SPY");
check(data.sector_rows.every((row, index, rows) => index === 0 || rows[index - 1].rsi >= row.rsi), "Sector Dashboard 必須按 RSI 遞減排序");

check(data.thematic_rows.length === 45, "Thematic Sectors 必須為長橋完整 44 檔加 SPY，共 45 列");
check(data.thematic_rows.filter((row) => row.label === "SPY").length === 1, "Thematic Sectors 必須恰有一列 SPY");
check(data.thematic_rows.every((row, index, rows) => index === 0 || rows[index - 1].rsi >= row.rsi), "Thematic Sectors 必須按 RSI 遞減排序");
const sourceTickers = [...thematic.rows.map((row) => row.ticker), "SPY"].sort();
const reportTickers = data.thematic_rows.map((row) => row.label).sort();
check(JSON.stringify(reportTickers) === JSON.stringify(sourceTickers), "Thematic Sectors 報告 ticker 必須與長橋 44 檔加 SPY 完全一致");
const sourceRsi = new Map([
  ...thematic.rows.map((row) => [row.ticker, Number(row.rsi14)]),
  ["SPY", Number(snapshot.rows.find((row) => row.ticker === "SPY")?.rsi14)],
]);
check(
  data.thematic_rows.every((row) => Math.abs(row.rsi - sourceRsi.get(row.label)) < 0.001),
  "Thematic Sectors RSI 必須逐檔與本輪長橋快照一致"
);

check(/data-etf-universe="thematic-complete"/.test(html), "Thematic Sectors 缺少完整資料契約");
check(/data-source-count="44"/.test(html) && /data-report-count="45"/.test(html), "Thematic Sectors 資料契約列數錯誤");
check(/data-benchmark="SPY"/.test(html) && /data-sort="rsi-desc"/.test(html), "Thematic Sectors 必須聲明 SPY 基準與 RSI 遞減排序");
check((html.match(/\betf-momentum\b/g) || []).length >= 57, "Sector 與 Thematic 表必須完整使用三格動能布局");
check((html.match(/\bma-state-group\b/g) || []).length >= 57, "Sector 與 Thematic 表必須完整使用三等分 MA 狀態");
check((html.match(/\bbar-row\b/g) || []).length === 8, "板塊動能圖必須為 8 檔代表 ETF");
check(/class="val pos"/.test(html) && /class="val neg"/.test(html), "板塊動能圖必須同時有正負值");

check(/SPX &gt;20MA（7\/28）[\s\S]{0,260}69\.18/.test(html), "SPX >20MA 必須為 69.18%");
check(/NDX &gt;50MA（7\/28）[\s\S]{0,260}51\.45/.test(html), "NDX >50MA 必須為 51.45%");
check(/IWM &gt;20MA（7\/28）[\s\S]{0,260}52\.57/.test(html), "IWM >20MA 必須為 52.57%");
check(/341\s*\/\s*388/.test(html), "Stockbee 4% 上漲／下跌必須為 341／388");
check(/0\.78/.test(html) && /0\.88/.test(html) && /55\.33/.test(html), "Stockbee 5D、10D、T2108 必須完整");
check(/雙來源分歧/.test(html) && /大中型成分的均線廣度改善/.test(html), "廣度必須綜合三大指數與 Stockbee，不得只單獨總結 Stockbee");

check(/<td>DXY<\/td>[\s\S]{0,180}101\.43/.test(html), "Macro 必須保留 DXY 101.43");
check(/<td>VIX<\/td>[\s\S]{0,220}19\.08[\s\S]{0,280}3\/5/.test(html), "VIX 必須使用 19.08 與五項 3/5 Intermediate 判定");
check(/AMD[\s\S]{0,300}跌破 -1SD/.test(html), "Weekly Expected Move 必須標示 AMD 跌破 -1SD");
check(/CRM[\s\S]{0,300}突破 \+2SD/.test(html), "Weekly Expected Move 必須標示 CRM 突破 +2SD");

check(/Case-Shiller[\s\S]{0,260}\+1\.6%[\s\S]{0,160}\+1\.2%/.test(html), "Case-Shiller 必須有 Actual／Forecast／Previous");
check(/美國消費者信心[\s\S]{0,260}90\.8[\s\S]{0,160}92\.65[\s\S]{0,180}92\.2/.test(html), "消費者信心必須有 Actual／Forecast／修正 Previous");
check(/Richmond Fed[\s\S]{0,260}>5<[\s\S]{0,160}>6<[\s\S]{0,160}>4</.test(html), "Richmond Fed 必須有 Actual／Forecast／Previous");
check(/class=['"][^'"]*\bmacro-review-table\b/.test(html), "宏觀數據表必須使用專用欄寬規則");
check(
  /\.macro-review-table td:first-child\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss),
  "宏觀數據項目欄不得把中文詞拆成單字換行"
);
check(
  /\.result-badge\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss),
  "對賬徽章不得把「已觸發／未觸發」拆成多行"
);
check(
  /\.recon-table th:nth-child\(4\)\{width:8%\}/.test(sharedCss) &&
    /\.recon-table td:nth-child\(4\)\{text-align:center;white-space:nowrap\}/.test(sharedCss),
  "對賬欄必須保留足夠寬度並禁止換行"
);

for (const [ticker, epsActual, epsForecast, revenueActual, revenueForecast] of [
  ["Visa（V）", "$3.32", "$3.23", "$11.63B", "$11.40B"],
  ["Ford（F）", "$0.42", "$0.35", "$48.30B", "$47.51B"],
  ["Seagate（STX）", "$5.71", "$5.10", "$3.63B", "$3.50B"],
  ["NXP（NXPI）", "$3.61", "$3.46", "$3.50B", "$3.46B"],
  ["KLA（KLAC）", "$1.05", "$1.00", "$3.66B", "$3.60B"],
]) {
  const anchor = html.indexOf(ticker);
  const fragment = anchor >= 0 ? html.slice(anchor, anchor + 800) : "";
  check(
    [epsActual, epsForecast, revenueActual, revenueForecast, "Beat / Beat"].every((value) => fragment.includes(value)),
    `${ticker} 必須包含 EPS、營收與 Beat／Miss`
  );
}
check(/Visa（V）[\s\S]{0,700}-1\.12%/.test(html), "Visa 盤後反應必須為 -1.12%");
check(/Ford（F）[\s\S]{0,700}\+5\.41%/.test(html), "Ford 盤後反應必須為 +5.41%");
check(/Seagate（STX）[\s\S]{0,700}\+6\.60%/.test(html), "Seagate 盤後反應必須為 +6.60%");
check(/NXP（NXPI）[\s\S]{0,700}-3\.52%/.test(html), "NXP 盤後反應必須為 -3.52%");
check(/KLA（KLAC）[\s\S]{0,700}-8\.33%/.test(html), "KLA 盤後反應必須為 -8.33%");

if (errors.length) {
  console.error("FAIL 2026-07-28 postmarket custom QA");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("PASS 2026-07-28 postmarket custom QA");
