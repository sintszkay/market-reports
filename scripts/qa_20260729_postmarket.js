#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-29-postmarket.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "reports", "2026-07-29-postmarket-recap.html"), "utf8");
const sharedCss = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-29.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const extended = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_extended_2026-07-29.json"), "utf8"));

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
check(exactDate(snapshot.rows, "2026-07-29"), "長橋收盤快照日期必須全部為 2026-07-29");
check(exactDate(thematic.rows, "2026-07-29"), "Thematic Sectors 日期必須全部為 2026-07-29");
check(exactDate(macro.rows, "2026-07-29"), "Macro 日期必須全部為 2026-07-29");
check(extended.rows.length === 10 && extended.rows.every((row) => row.postmarketAvailable), "盤後即時報價必須為 10／10 可用");

check(JSON.stringify(data.reconciliation_summary) === JSON.stringify({
  hit: 4,
  triggered: 3,
  miss: 1,
  not_triggered: 2,
}), "對賬統計必須為 4 命中、3 已觸發、1 失誤、2 未觸發");
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
check(JSON.stringify(reportTickers) === JSON.stringify(sourceTickers), "Thematic Sectors ticker 必須與長橋 44 檔加 SPY 完全一致");
const sourceRsi = new Map([
  ...thematic.rows.map((row) => [row.ticker, Number(row.rsi14)]),
  ["SPY", Number(snapshot.rows.find((row) => row.ticker === "SPY")?.rsi14)],
]);
check(data.thematic_rows.every((row) => Math.abs(row.rsi - sourceRsi.get(row.label)) < 0.001), "Thematic Sectors RSI 必須逐檔與本輪長橋快照一致");

check((html.match(/\bbar-row\b/g) || []).length === 8, "板塊動能圖必須為 8 檔代表 ETF");
check(/class="val pos"/.test(html) && /class="val neg"/.test(html), "板塊動能圖必須同時有正負值");
check(/data-source-count="44"/.test(html) && /data-report-count="45"/.test(html), "Thematic Sectors 資料契約列數錯誤");
check(/data-benchmark="SPY"/.test(html) && /data-sort="rsi-desc"/.test(html), "Thematic Sectors 必須聲明 SPY 基準與 RSI 遞減排序");

for (const [label, value] of [
  ["SPX >20MA（7/29）", "63.02"],
  ["SPX >50MA（7/29）", "65.80"],
  ["NDX >20MA（7/29）", "47.57"],
  ["NDX >50MA（7/29）", "49.51"],
  ["IWM >20MA（7/29）", "45.14"],
  ["IWM >50MA（7/29）", "55.00"],
]) {
  const row = data.breadth_rows.find((item) => item.indicator === label);
  check(row && Number(row.latest).toFixed(2) === value, `${label} 必須為 ${value}%`);
}
check(/165\s*\/\s*552/.test(html), "Stockbee 4% 上漲／下跌必須為 165／552");
check(/0\.65/.test(html) && /0\.76/.test(html) && /48\.33/.test(html), "Stockbee 5D、10D、T2108 必須完整");
check(/雙來源共同轉弱/.test(html) && /三大指數/.test(data.breadth_conclusion) && /Stockbee/.test(data.breadth_conclusion), "廣度結論必須綜合三大指數與 Stockbee");

check(/<td>DXY<\/td>[\s\S]{0,220}約 101\.1/.test(html), "Macro 必須保留 DXY 約 101.1");
check(/<td>VIX／VIXY<\/td>[\s\S]{0,320}18\.21／22\.53[\s\S]{0,400}3\/5/.test(html), "VIX 必須使用現貨、VIXY 與五項 3/5 判定");
check(/<td>美國 10 年債<\/td>[\s\S]{0,220}約 4\.65%/.test(html), "Macro 必須保留 10 年債約 4.65%");

check(/FOMC 決議與 Warsh 記者會/.test(html), "事件段必須有 FOMC 記者會專題");
check(/9–3/.test(html) && /Hammack/.test(html) && /Kashkari/.test(html) && /Logan/.test(html), "FOMC 必須保留 9–3 投票與三名異議者");
check(/前瞻指引/.test(html) && /期限溢價/.test(html), "FOMC 分析必須涵蓋減少前瞻指引與期限溢價");
for (const scenario of ["基準：偏鷹維持", "升級：通膨／能源再加速", "緩和：數據降溫", "分化：財報蓋過 Fed"]) {
  check(html.includes(scenario), `FOMC 情景表缺少「${scenario}」`);
}
check(/TLT 83\.75/.test(html) && /QQQ 661\.66/.test(html) && /SMH 518\.82/.test(html), "FOMC 情景必須有 TLT／QQQ／SMH 數值門檻");

for (const [ticker, epsActual, epsForecast, revenueActual, revenueForecast, result, reaction] of [
  ["Microsoft（MSFT）", "$4.81", "$4.24", "$90.00B", "$87.62B", "Beat / Beat", "+8.83%"],
  ["Meta（META）", "$6.18", "$7.19", "$60.80B", "$60.22B", "Miss / Beat", "-7.36%"],
]) {
  const anchor = html.indexOf(ticker);
  const fragment = anchor >= 0 ? html.slice(anchor, anchor + 1000) : "";
  check([epsActual, epsForecast, revenueActual, revenueForecast, result, reaction].every((value) => fragment.includes(value)), `${ticker} 必須包含 EPS、營收、Beat／Miss 與盤後反應`);
}
check(/不能全部歸因於 Fed/.test(html) && /FOMC、MSFT、META 三項事件分開對賬/.test(html), "必須把 FOMC 與兩份財報分開歸因");

check(/QQQ[\s\S]{0,260}距下界 0\.07/.test(html), "Weekly Expected Move 必須標示 QQQ 距 -1SD 0.07");
check(/SMH[\s\S]{0,300}跌破 -1SD/.test(html), "Weekly Expected Move 必須標示 SMH 跌破 -1SD");
check(/AMD[\s\S]{0,320}逼近 -2SD/.test(html), "Weekly Expected Move 必須標示 AMD 逼近 -2SD");
check(/MSFT 盤後[\s\S]{0,300}突破 \+1SD/.test(html), "Weekly Expected Move 必須納入 MSFT 盤後突破 +1SD");
check(/META 盤後[\s\S]{0,300}跌破 -1SD/.test(html), "Weekly Expected Move 必須納入 META 盤後跌破 -1SD");

check(/report-shared\.css\?v=/.test(html), "報告必須掛載 report-shared.css");
check(/report-runtime\.js\?v=/.test(html), "報告必須掛載 report-runtime.js");
check(!/<!-- DATA:/.test(html), "報告不得殘留未解析資料標記");
check(!/[这没发后里为与报数时个从风会间该开动当对写读进体价过还]/.test(html), "報告不得混入常見簡體字");
check(/\.macro-review-table td:first-child\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss), "宏觀項目欄不得把中文詞拆成單字換行");
check(/\.result-badge\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss), "對賬徽章不得拆成多行");
check(/\.recon-table td:nth-child\(4\)\{text-align:center;white-space:nowrap\}/.test(sharedCss), "對賬欄必須禁止換行");

if (errors.length) {
  console.error("FAIL 2026-07-29 postmarket custom QA");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("PASS 2026-07-29 postmarket custom QA：日期、筆數、RSI、廣度、FOMC 情景、財報、週度邊界與排版規則均通過");
