#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const report = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-21-postmarket.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "reports", "2026-07-21-postmarket-recap.html"), "utf8");
const inputs = [
  ["主快照", "postmarket_snapshot_2026-07-21.json", 65],
  ["主題 RSI", "thematic_rsi_longport.json", 44],
  ["Macro RSI", "macro_rsi_longport.json", 24],
  ["Market RSI", "market_rsi_longport.json", 18],
];

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function isSortedByRsi(rows) {
  return rows.every((row, index) => index === 0 || rows[index - 1].rsi >= row.rsi);
}

for (const [label, file, count] of inputs) {
  const payload = JSON.parse(fs.readFileSync(path.join(workRoot, file), "utf8"));
  check(payload.rows.length === count, `${label} 筆數應為 ${count}，實際 ${payload.rows.length}`);
  check((payload.errors || []).length === 0, `${label} 有取數失敗`);
  check(payload.rows.every((row) => row.asOf === "2026-07-21"), `${label} 含非 7/21 日線`);
}

const summary = report.reconciliation_summary;
check(summary.hit === 4 && summary.triggered === 2 && summary.miss === 0 && summary.not_triggered === 2, "對賬摘要數量不符");
check(report.reconciliation_rows.length === 8, "對賬表應有 8 列");
check(report.sector_rows.length === 12, "產業 ETF 應有 SPY 加 11 個產業");
check(isSortedByRsi(report.sector_rows), "產業 ETF 未按 RSI 降冪排序");
check(report.thematic_rows.length === 26, "主題 ETF 應有 26 列");
check(report.thematic_rows.filter((row) => row.label.startsWith("SPY")).length === 1, "主題 ETF 必須且只能有一列 SPY 基準");
check(isSortedByRsi(report.thematic_rows), "主題 ETF 未按 RSI 降冪排序");
check(report.expected_move_rows.length === 7, "Expected Move 應有 7 列");
check(report.event_review.includes("Actual") && report.event_review.includes("Forecast") && report.event_review.includes("Previous"), "宏觀表缺 Actual／Forecast／Previous");
check((report.event_review.match(/Beat／Beat/g) || []).length === 3, "財報表應有 3 個 Beat／Beat");
check(report.event_review.includes("+16.5K") && report.event_review.includes("+19.8K"), "ADP Actual／Previous 不完整");
check(report.macro_rows.some((row) => row.asset === "DXY"), "Macro 缺 DXY");
check(report.breadth_rows.some((row) => row.indicator === "SPX >20MA" && row.latest === 48.9), "市場廣度缺 7/21 SPX >20MA");
check(html.includes("2026-07-21") && !html.includes("2026-07-20"), "HTML 日期混入舊交易日");
check(!/[兑现领显涨趋状谈准长线险构银矿虽复与数间稳约场转单边资来样报标盖国扩续铜债区缘应随观无调营验账关软这还总发别体获处优时项买卖门点万]/.test(html), "HTML 仍含常見簡體字");

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("PASS 2026-07-21 盤後專項 QA：資料日期、筆數、排序、對賬、事件表、DXY、繁體中文均通過");
