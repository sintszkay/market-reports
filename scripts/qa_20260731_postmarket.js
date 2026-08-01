#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-31-postmarket.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "reports", "2026-07-31-postmarket-recap.html"), "utf8");
const sharedCss = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-31.json"), "utf8"));
const market = JSON.parse(fs.readFileSync(path.join(workRoot, "market_rsi_longport.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));

const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}
function exactDate(rows, expected) {
  const dates = new Set(rows.map((row) => row.asOf));
  return dates.size === 1 && dates.has(expected);
}

check(snapshot.rows.length === 75 && snapshot.errors.length === 0, "長橋收盤快照必須為 75／75、錯誤 0");
check(market.rows.length === 18 && market.errors.length === 0, "Market 快照必須為 18／18、錯誤 0");
check(thematic.rows.length === 44 && thematic.errors.length === 0, "Thematic Sectors 快照必須為 44／44、錯誤 0");
check(macro.rows.length === 32 && macro.errors.length === 0, "Macro 快照必須為 32／32、錯誤 0");
check(exactDate(snapshot.rows, "2026-07-31"), "長橋收盤快照日期必須全部為 2026-07-31");
check(exactDate(market.rows, "2026-07-31"), "Market 日期必須全部為 2026-07-31");
check(exactDate(thematic.rows, "2026-07-31"), "Thematic Sectors 日期必須全部為 2026-07-31");
check(exactDate(macro.rows, "2026-07-31"), "Macro 日期必須全部為 2026-07-31");

check(JSON.stringify(data.reconciliation_summary) === JSON.stringify({ hit: 5, triggered: 3, miss: 1, not_triggered: 2 }), "對賬統計必須為 5 命中、3 已觸發、1 失誤、2 未觸發");
check(data.reconciliation_rows.length === 11, "盤前規則必須逐行對賬 11 項");
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
  ["SPY", Number(market.rows.find((row) => row.ticker === "SPY")?.rsi14)],
]);
check(data.thematic_rows.every((row) => Math.abs(row.rsi - sourceRsi.get(row.label)) < 0.001), "Thematic Sectors RSI 必須逐檔與本輪長橋快照一致");
check((html.match(/\bbar-row\b/g) || []).length === 8, "板塊動能圖必須為 8 檔代表 ETF");
check(/class="val pos"/.test(html) && /class="val neg"/.test(html), "板塊動能圖必須同時有正負值");
check(/data-source-count="44"/.test(html) && /data-report-count="45"/.test(html), "Thematic Sectors 資料契約列數錯誤");
check(/data-benchmark="SPY"/.test(html) && /data-sort="rsi-desc"/.test(html), "Thematic Sectors 必須聲明 SPY 基準與 RSI 遞減排序");

for (const [label, value] of [
  ["SPX >20MA（7/31）", "53.28"],
  ["SPX >50MA（7/31）", "62.02"],
  ["NDX >20MA（7/31）", "53.39"],
  ["NDX >50MA（7/31）", "47.57"],
  ["IWM >20MA（7/31）", "43.93"],
  ["IWM >50MA（7/31）", "52.88"],
]) {
  const row = data.breadth_rows.find((item) => item.indicator === label);
  check(row && Number(row.latest).toFixed(2) === value, `${label} 必須為 ${value}%`);
}
check(/177\s*\/\s*214/.test(html), "Stockbee 4% 上漲／下跌必須為 177／214");
check(/0\.98/.test(html) && /0\.91/.test(html) && /46\.66/.test(html), "Stockbee 5D、10D、T2108 必須完整");
check(/雙來源綜合/.test(html) && /三大指數/.test(data.breadth_conclusion) && /Stockbee/.test(data.breadth_conclusion), "廣度結論必須綜合三大指數與 Stockbee");

for (const [ticker, close, daily] of [
  ["SPY", 747.03, 0.72], ["QQQ", 687.99, 0.65], ["IWM", 291.20, -0.48], ["DIA", 524.32, 0.54],
  ["AMZN", 271.58, 15.32], ["AAPL", 308.91, -7.35], ["SMH", 540.53, 0.30], ["TLT", 82.25, -0.66], ["USO", 129.17, 1.33],
]) {
  const row = snapshot.rows.find((item) => item.ticker === ticker);
  check(row && Math.abs(row.close - close) < 0.001 && Math.abs(row.dailyPct - daily) < 0.001, `${ticker} 收盤或日變化與長橋快照不一致`);
}

check(/DXY 100\.38/.test(html) && /USDU \+0\.15%/.test(html), "Macro 必須保留 DXY 與 USDU 代理");
check(/美國 10 年債[\s\S]{0,220}約 4\.71%/.test(html), "Macro 必須保留 10 年債約 4.71%");
check(/VIX 現貨／VIXY[\s\S]{0,380}15\.99／20\.51[\s\S]{0,480}0\/5/.test(html), "VIX 必須使用現貨、VIXY 與五項 0/5 判定");
check(/SHY／IEF／TLT[\s\S]{0,420}-0\.01%／-0\.28%／-0\.66%/.test(html), "Macro 必須有短、中、長債比較");

for (const [event, actual, forecast, previous] of [
  ["Q2 就業成本指數 QoQ", "0.9%", "0.8%", "0.9%"],
  ["Chicago PMI", "57.6", "56.0", "56.7"],
  ["密大消費者信心終值", "55.2", "54.0", "49.5"],
]) {
  const anchor = html.indexOf(`<td>${event}</td>`);
  const fragment = anchor >= 0 ? html.slice(anchor, anchor + 700) : "";
  check([actual, forecast, previous].every((value) => fragment.includes(value)), `${event} 必須含 Actual／Forecast／Previous`);
}
for (const [ticker, epsActual, epsForecast, revenueActual, revenueForecast, result, reaction] of [
  ["Apple（AAPL）", "$2.02", "$1.89", "$109.42B", "$109.00B", "Beat / Beat", "-7.35%"],
  ["Amazon（AMZN）", "$5.75", "$1.82", "$200.60B", "$197.03B", "Beat / Beat", "+15.32%"],
]) {
  const anchor = html.indexOf(ticker);
  const fragment = anchor >= 0 ? html.slice(anchor, anchor + 1000) : "";
  check([epsActual, epsForecast, revenueActual, revenueForecast, result, reaction].every((value) => fragment.includes(value)), `${ticker} 必須包含 EPS、營收、Beat／Miss 與收盤反應`);
}

for (const [ticker, status] of [
  ["AMZN", "突破 +2SD"], ["GOOGL", "突破 +2SD"], ["CRM", "突破 +2SD"], ["AAPL", "跌破 -1SD"], ["CAT", "跌破 -1SD"], ["GS", "略破 -1SD"],
]) {
  const anchor = html.indexOf(`<td>${ticker}</td>`);
  const fragment = anchor >= 0 ? html.slice(anchor, anchor + 500) : "";
  check(fragment.includes(status), `Weekly Expected Move 必須標示 ${ticker} ${status}`);
}
check(/下週必須重新計算 Expected Move/.test(html), "週度區間在週末後必須明示重算");

check(/report-shared\.css\?v=/.test(html), "報告必須掛載 report-shared.css");
check(/report-runtime\.js\?v=/.test(html), "報告必須掛載 report-runtime.js");
check(!/<!-- DATA:/.test(html), "報告不得殘留未解析資料標記");
check(!/[这没发后里为与报数时个从风会间该开动当对写读进体价过还]/.test(html), "報告不得混入常見簡體字");
check(/\.macro-review-table td:first-child\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss), "宏觀項目欄不得把中文詞拆成單字換行");
check(/\.result-badge\{white-space:nowrap;overflow-wrap:normal;word-break:keep-all\}/.test(sharedCss), "對賬徽章不得拆成多行");
check(/\.recon-table td:nth-child\(4\)\{text-align:center;white-space:nowrap\}/.test(sharedCss), "對賬欄必須禁止換行");

if (errors.length) {
  console.error("FAIL 2026-07-31 postmarket custom QA");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("PASS 2026-07-31 postmarket custom QA：日期、筆數、RSI、廣度、VIX、財報、週度邊界與排版規則均通過");
