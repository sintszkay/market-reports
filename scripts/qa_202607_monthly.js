#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const file = process.argv[2] || path.join(root, "reports", "2026-07-monthly.html");
const html = fs.readFileSync(file, "utf8");
const market = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-monthly-market.json"), "utf8"));
const payload = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-monthly.json"), "utf8"));
const failures = [];
const need = (pattern, message) => { if (!pattern.test(html)) failures.push(message); };
const count = (pattern) => (html.match(pattern) || []).length;

need(/data-report-type="monthly"/, "月報類型缺失");
need(/2026年7月美股月報/, "月報標題缺失");
need(/資料截至 2026-07-31 美股收盤/, "資料截止日缺失");
need(/市場風險分數/, "市場量化總分缺失");
need(/三大指數廣度/, "三大指數廣度綜合分析缺失");
need(/Stockbee 交叉驗證/, "Stockbee 交叉驗證缺失");
need(/VIX 月初／月末/, "VIX 月度分析缺失");
need(/20\.88/, "VIX 月內高點缺失");
need(/10年期美債殖利率/, "10 年期美債缺失");
need(/30年期美債殖利率/, "30 年期美債缺失");
need(/10年－2年曲線/, "長短債曲線分析缺失");
need(/DXY/, "DXY 分析缺失");
need(/八月季節性/, "八月季節性分析缺失");
need(/data-vix-seasonality="true"/, "八月季節性表缺少 VIX");
need(/Cboe 官方日線/, "VIX 季節性資料來源缺失");
need(/基準：分化整理/, "八月基準情境缺失");
need(/偏多：軟著陸擴散/, "八月偏多情境缺失");
need(/偏空：長端再定價/, "八月偏空情境缺失");
need(/尾端：成長失速/, "八月尾端情境缺失");
need(/2011–2025/, "季節性樣本期間缺失");
need(/2026-06-30 最後收盤至 2026-07-31 收盤/, "自然月計算口徑缺失");
need(/8 \+ 18 \+ 0 \+ 8 \+ 2 \+ 11 \+ 10 = 57/, "量化總分反算式缺失");
need(/47 檔 ETF/, "長橋完整性聲明缺失");
need(/錯誤 0/, "長橋零錯誤聲明缺失");

if (market.errors.length !== 0 || market.rows.length !== 47) failures.push(`長橋資料完整性異常：${market.rows.length} 檔／${market.errors.length} 錯誤`);
if (payload.report_type !== "monthly" || payload.data_as_of !== "2026-07-31" || payload.publication_state !== "local-draft") failures.push("月報資料檔日期、類型或草稿狀態異常");

const sectionFragment = (heading) => {
  const start = html.indexOf(`<h3>${heading}</h3>`);
  const end = html.indexOf("</table>", start);
  return start >= 0 && end >= 0 ? html.slice(start, end + 8) : "";
};
for (const [heading, expected] of [["S&amp;P 500 Sector ETF", 12], ["Thematic Sector ETF", 21]]) {
  const fragment = sectionFragment(heading);
  if (!fragment) {
    failures.push(`${heading} 表格缺失`);
    continue;
  }
  const rowCount = countRows(fragment);
  if (rowCount !== expected) failures.push(`${heading} 應有 ${expected} 列，目前 ${rowCount}`);
  if ((fragment.match(/<td>SPY<\/td>/g) || []).length !== 1) failures.push(`${heading} 必須包含且僅包含一列 SPY`);
  const monthlyReturns = [...fragment.matchAll(/data-month-return="(-?\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
  if (monthlyReturns.length !== expected || monthlyReturns.some((value, index) => index > 0 && value > monthlyReturns[index - 1])) failures.push(`${heading} 未按月收益率由高至低排序`);
}

function countRows(fragment) {
  const body = fragment.match(/<tbody>([\s\S]*?)<\/tbody>/);
  return body ? (body[1].match(/<tr(?:\s[^>]*)?>/g) || []).length : 0;
}

const majorStart = html.indexOf("<h2>主要指數月度復盤</h2>");
const majorEnd = html.indexOf("</table>", majorStart);
const majorFragment = majorStart >= 0 && majorEnd >= 0 ? html.slice(majorStart, majorEnd + 8) : "";
for (const ticker of ["SPY", "QQQ", "DIA", "IWM", "RSP", "QQQE"]) {
  if (!new RegExp(`<td>${ticker}<\\/td>`).test(majorFragment)) failures.push(`主要指數表缺少 ${ticker}`);
}
if (countRows(majorFragment) !== 6) failures.push(`主要指數表應有 6 列，目前 ${countRows(majorFragment)}`);

const seasonStart = html.indexOf("<h2>八月季節性統計</h2>");
const seasonEnd = html.indexOf("</table>", seasonStart);
const seasonFragment = seasonStart >= 0 && seasonEnd >= 0 ? html.slice(seasonStart, seasonEnd + 8) : "";
if (countRows(seasonFragment) !== 7) failures.push(`季節性表應有 7 列（含 VIX），目前 ${countRows(seasonFragment)}`);
for (const observations of ["15", "14"]) {
  if (!new RegExp(`<td class="num">${observations}<\\/td>`).test(seasonFragment)) failures.push(`季節性樣本數缺少 ${observations}`);
}

if (count(/class="bar-row"/g) !== 8) failures.push("月度動能圖必須正好 8 列");
if (count(/--zero:50%/g) !== 8) failures.push("月度動能圖零軸必須全部位於 50%");
if (count(/<link rel="stylesheet" href="report-shared\.css/g) !== 1) failures.push("shared CSS 引用數量異常");
if (count(/<script src="report-runtime\.js/g) !== 1) failures.push("runtime 引用數量異常");
if (/font-weight\s*:\s*(?:6|7|8|9)00/.test(html)) failures.push("月報行內樣式出現超過 500 的字重");
if (/box-shadow\s*:|linear-gradient\s*\(/.test(html)) failures.push("月報行內樣式出現陰影或漸變");
if (/<!-- DATA:|\{\{[a-z0-9_]+\}\}/i.test(html)) failures.push("仍有未解析資料佔位符");

const scoreCells = [...html.matchAll(/data-score="(\d+)"\s+data-max-score="(\d+)"/g)].map((match) => [Number(match[1]), Number(match[2])]);
if (scoreCells.length !== 7) failures.push(`市場量化總分應有 7 個分項，目前 ${scoreCells.length}`);
if (scoreCells.reduce((sum, row) => sum + row[0], 0) !== 57 || scoreCells.reduce((sum, row) => sum + row[1], 0) !== 100) failures.push("市場量化總分無法反算為 57/100");
if (!/data-total-score="57"/.test(html)) failures.push("總分資料屬性缺失");
const scenarioProbabilities = [...html.matchAll(/data-scenario-probability="(\d+)"/g)].map((match) => Number(match[1]));
if (scenarioProbabilities.length !== 4 || scenarioProbabilities.reduce((sum, value) => sum + value, 0) !== 100) failures.push("八月四種情境概率必須合計 100%");

const deepHistory = market.rows.filter((row) => ["SPY", "QQQ", "DIA", "IWM", "RSP", "QQQE"].includes(row.ticker));
if (deepHistory.length !== 6 || deepHistory.some((row) => !row.augustSeasonality || row.augustSeasonality.observations < 14)) failures.push("主要指數季節性樣本不足 14 年");
if (!payload.vix_august_seasonality || payload.vix_august_seasonality.observations !== 15) failures.push("VIX 八月季節性樣本必須為 15 年");

if (failures.length) {
  console.error(`FAIL ${file}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS ${file}: 月報資料、排序、分數、季節性與結構 QA 通過`);
