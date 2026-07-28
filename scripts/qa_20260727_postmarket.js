#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const data = JSON.parse(
  fs.readFileSync(path.join(root, "data", "2026-07-27-postmarket.json"), "utf8")
);
const html = fs.readFileSync(
  path.join(root, "reports", "2026-07-27-postmarket-recap.html"),
  "utf8"
);
const snapshot = JSON.parse(
  fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-27.json"), "utf8")
);
const thematic = JSON.parse(
  fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8")
);
const macro = JSON.parse(
  fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8")
);

const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}

check(snapshot.rows.length === 72 && snapshot.errors.length === 0, "長橋收盤快照必須為 72／72、錯誤 0");
check(thematic.rows.length === 44 && thematic.errors.length === 0, "Thematic Sectors 快照必須為 44／44、錯誤 0");
check(macro.rows.length === 24 && macro.errors.length === 0, "Macro 快照必須為 24／24、錯誤 0");
for (const [label, rows] of [
  ["長橋收盤", snapshot.rows],
  ["Thematic Sectors", thematic.rows],
  ["Macro", macro.rows],
]) {
  const dates = new Set(rows.map((row) => row.asOf));
  check(dates.size === 1 && dates.has("2026-07-27"), `${label} 日線日期必須全部為 2026-07-27`);
}

check(JSON.stringify(data.reconciliation_summary) === JSON.stringify({
  hit: 4,
  triggered: 2,
  miss: 1,
  not_triggered: 2,
}), "對賬統計必須為 4 命中、2 已觸發、1 失誤、2 未觸發");
check(data.reconciliation_rows.length === 9, "盤前規則必須逐行對賬 9 項");
check(data.index_rows.map((row) => row.asset).join(",") === "IWM,DIA,SPY,QQQ", "指數表只能保留 IWM、DIA、SPY、QQQ");
check(data.sector_rows.length === 12, "Sector Dashboard 必須為 12 列");
check(data.thematic_rows.length === 20, "Thematic Sectors 必須為 20 列");
check(data.sector_rows.filter((row) => row.label.startsWith("SPY")).length === 1, "Sector Dashboard 必須恰有一列 SPY");
check(data.thematic_rows.filter((row) => row.label.startsWith("SPY")).length === 1, "Thematic Sectors 必須恰有一列 SPY");
check(data.sector_rows.every((row, index, rows) => index === 0 || rows[index - 1].rsi >= row.rsi), "Sector Dashboard 必須按 RSI 遞減排序");
check(data.thematic_rows.every((row, index, rows) => index === 0 || rows[index - 1].rsi >= row.rsi), "Thematic Sectors 必須按 RSI 遞減排序");

check(/<h3>Sector Dashboard<\/h3>/.test(html), "缺少 Sector Dashboard 標題");
check(/<h3>Thematic Sectors（含 SPY 基準）<\/h3>/.test(html), "缺少 Thematic Sectors 標題");
check(!/<h3>\s*Market\s*<\/h3>/i.test(html), "不得恢復舊 Market 主表");
check(!/Market\s+18\s*[／/]\s*18/i.test(html), "不得把舊 Market 工作表列為主表來源");
check((html.match(/\betf-momentum\b/g) || []).length >= 32, "兩張 ETF 表必須使用三格動能布局");
check((html.match(/\bma-state-group\b/g) || []).length >= 32, "兩張 ETF 表必須使用三等分 MA 狀態");

check(/<td>DXY<\/td>/.test(html) && /101\.48/.test(html), "Macro 必須保留 DXY 101.48");
check(/VIX[\s\S]{0,300}3\/5[\s\S]{0,120}Intermediate/i.test(html), "VIX 必須使用五項 3/5 Intermediate 判定");
check(/USO[\s\S]{0,300}跌破 -1SD/.test(html), "Weekly Expected Move 必須標示 USO 跌破 -1SD");
check(/380\s*\/\s*195/.test(html), "Stockbee 4% 上漲／下跌必須為 380／195");
check(/1\.05/.test(html) && /0\.90/.test(html) && /53\.38/.test(html), "Stockbee 5D、10D、T2108 必須完整");
check(/三大指數 20／50MA 廣度工作表最新只到 7\/24/.test(html), "廣度必須明示 7/24 時點限制");

check(/耐久財訂單（6月）[\s\S]{0,300}\+0\.3%[\s\S]{0,160}\+2\.5%[\s\S]{0,160}-4\.0%/.test(html), "耐久財必須有 Actual／Forecast／Previous");
check(/NUE[\s\S]{0,300}\$4\.84[\s\S]{0,160}\$4\.38[\s\S]{0,300}Beat \/ Beat/.test(html), "NUE 必須有 EPS、營收與 Beat／Miss");
check(/RMBS[\s\S]{0,300}\$0\.77[\s\S]{0,160}\$0\.72[\s\S]{0,300}Beat \/ Beat/.test(html), "RMBS 必須有 EPS、營收與 Beat／Miss");

if (errors.length) {
  console.error("FAIL 2026-07-27 postmarket custom QA");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("PASS 2026-07-27 postmarket custom QA");
