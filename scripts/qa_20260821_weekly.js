#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const file = process.argv[2] || "reports/2026-08-21-weekly.html";
const html = fs.readFileSync(file, "utf8");
const failures = [];
const need = (pattern, message) => { if (!pattern.test(html)) failures.push(message); };
const count = (pattern, value = html) => (value.match(pattern) || []).length;
const rowsIn = (fragment) => count(/<tr\b/g, (fragment.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || "");
const tableAfter = (heading) => {
  const start = html.indexOf(`<h3>${heading}</h3>`);
  const end = html.indexOf("</table>", start);
  return start >= 0 && end >= 0 ? html.slice(start, end + 8) : "";
};
const assertRsiDescending = (fragment, label) => {
  const values = [...fragment.matchAll(/data-rsi="(-?\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
  if (!values.length || values.some((value, index) => index > 0 && value > values[index - 1])) failures.push(`${label} RSI 未由高至低排序`);
};

need(/data-report-type="weekly"/, "週報類型缺失");
need(/指數回撤、廣度全面降溫/, "主標題未呈現本週核心敘事");
need(/58<small>\/100<\/small>/, "市場總分 58/100 缺失");
need(/Intermediate Risk/, "Intermediate Risk 分類缺失");
need(/0 命中/, "上週對賬命中數缺失");
need(/1 已觸發/, "上週對賬已觸發數缺失");
need(/8 未觸發/, "上週對賬未觸發數缺失");
need(/本週五大強勢股/, "五大強勢股缺失");
need(/本週五大弱勢股/, "五大弱勢股缺失");
need(/NVDA 財報前/, "NVDA 週變化與均線補充缺失");
need(/三大指數廣度/, "三大指數廣度綜合分析缺失");
need(/與 Stockbee 交叉驗證/, "Stockbee 交叉驗證缺失");
need(/5日惡化 8\/8/, "五日廣度量化分數缺失");
need(/技術 0\/12/, "三大指數技術分數缺失");
need(/VIX 1\/5/, "VIX 五項分數缺失");
need(/DXY[\s\S]{0,220}98\.66/, "DXY 8/21 收盤缺失");
need(/2Y／10Y／20Y／30Y 一週 \+7／\+6／0／\+2bp/, "美債週變化缺失");
need(/7月新屋開工／許可/, "本週房屋復盤缺失");
need(/7月工業生產／產能利用/, "本週工業生產復盤缺失");
need(/初領／續領失業金/, "本週就業復盤缺失");
need(/Walmart Q2 FY27/, "本週 Walmart 財報復盤缺失");
need(/8月美國綜合 PMI 初值/, "本週 PMI 復盤缺失");
need(/實際／最新/, "宏觀與 Fed 表的實際值表頭缺失");
need(/預期／門檻/, "宏觀與 Fed 表的預期表頭缺失");
need(/8\/25 10:00/, "下週新屋銷售事件缺失");
need(/8\/26 08:30/, "下週 GDP／PCE／耐用品事件缺失");
need(/NVIDIA Q2 FY27 財報/, "下週 NVIDIA 財報事件缺失");
need(/Salesforce Q2 FY27 財報/, "下週 Salesforce 財報事件缺失");
need(/8\/27–8\/29/, "下週 Jackson Hole 事件缺失");
need(/四種情境與主觀概率/, "下週四情境缺失");
need(/10Y (?:&gt;|>)4\.80%[^。]{0,40}DXY (?:&gt;|>)100/, "美元／長端數值風控缺失");
need(/139／139 標的成功/, "長橋完整性聲明缺失");
need(/Market Watch Google Sheet/, "Google Sheets 來源缺失");
need(/Stockbee 2026/, "Stockbee 來源缺失");
if (/Weekly Expected Move|週度預期波動|Polymarket|預測市場事件風險/.test(html)) failures.push("已刪除的 Expected Move／Polymarket 章節重新出現");
if (count(/class="bar-row"/g) !== 8) failures.push("動能圖必須正好 8 列");

const sector = tableAfter("S&amp;P 500 Sector ETF");
if (!sector) failures.push("S&P 500 Sector ETF 表格缺失");
if (rowsIn(sector) !== 12) failures.push(`Sector ETF 必須 12 列，目前 ${rowsIn(sector)}`);
if (count(/<td>SPY<\/td>/g, sector) !== 1) failures.push("Sector ETF 必須包含且僅包含一列 SPY");
if (count(/<th\b/g, sector) !== 7 || !/report-cols-7/.test(sector)) failures.push("Sector ETF 必須使用共用七欄排版");
assertRsiDescending(sector, "Sector ETF");

const thematic = tableAfter("Thematic Sector ETF");
if (!thematic) failures.push("Thematic Sector ETF 表格缺失");
if (rowsIn(thematic) !== 45) failures.push(`Thematic ETF 必須 45 列，目前 ${rowsIn(thematic)}`);
if (count(/<td>VOO<\/td>/g, thematic) !== 1) failures.push("Thematic ETF 必須包含且僅包含一列 VOO 基準");
for (const ticker of ["BUG", "PAVE"]) if (!new RegExp(`<td>${ticker}<\\/td>`).test(thematic)) failures.push(`Thematic ETF 缺少 ${ticker}`);
if (count(/<th\b/g, thematic) !== 7 || !/report-cols-7/.test(thematic)) failures.push("Thematic ETF 必須使用共用七欄排版");
assertRsiDescending(thematic, "Thematic ETF");

const macroStart = html.indexOf("<h2>宏觀與 Fed 路徑</h2>");
const macroEnd = html.indexOf("</table>", macroStart);
const macroFedTable = macroStart >= 0 && macroEnd >= 0 ? html.slice(macroStart, macroEnd + 8) : "";
if (!/weekly-macro-fed-table/.test(macroFedTable)) failures.push("宏觀與 Fed 表缺少專用排版類別");
if (rowsIn(macroFedTable) !== 8) failures.push(`宏觀與 Fed 表必須 8 列，目前 ${rowsIn(macroFedTable)}`);
if (count(/<th\b/g, macroFedTable) !== 5) failures.push("宏觀與 Fed 表必須使用五欄排版");

const thematicGainers = tableAfter("Thematic 週漲幅前 5 點評");
const thematicLosers = tableAfter("Thematic 週跌幅前 5 點評");
if (rowsIn(thematicGainers) !== 5) failures.push(`Thematic 週漲幅點評必須 5 列，目前 ${rowsIn(thematicGainers)}`);
if (rowsIn(thematicLosers) !== 5) failures.push(`Thematic 週跌幅點評必須 5 列，目前 ${rowsIn(thematicLosers)}`);
if (count(/<th\b/g, thematicGainers) !== 6 || !/theme-mover-table/.test(thematicGainers)) failures.push("Thematic 週漲幅點評必須使用六欄固定排版");
if (count(/<th\b/g, thematicLosers) !== 6 || !/theme-mover-table/.test(thematicLosers)) failures.push("Thematic 週跌幅點評必須使用六欄固定排版");
for (const ticker of ["IBIT", "COPX", "IBB", "SLV", "ARKK"]) if (!new RegExp(`<td>${ticker}<\\/td>`).test(thematicGainers)) failures.push(`Thematic 週漲幅前五缺少 ${ticker}`);
for (const ticker of ["XAR", "AIRR", "JETS", "ITA", "WGMI"]) if (!new RegExp(`<td>${ticker}<\\/td>`).test(thematicLosers)) failures.push(`Thematic 週跌幅前五缺少 ${ticker}`);
const gainerReturns = [...thematicGainers.matchAll(/data-five-day="(-?\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
const loserReturns = [...thematicLosers.matchAll(/data-five-day="(-?\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
if (gainerReturns.length !== 5 || gainerReturns.some((value, index) => value <= 0 || (index > 0 && value > gainerReturns[index - 1]))) failures.push("Thematic 週漲幅前五未按 5 日報酬由高至低排序");
if (loserReturns.length !== 5 || loserReturns.some((value, index) => value >= 0 || (index > 0 && value < loserReturns[index - 1]))) failures.push("Thematic 週跌幅前五未按 5 日報酬由低至高排序");
need(/加重燃油成本壓力/, "JETS 與油價成本連動點評缺失");
need(/現貨資產 beta、沒有同步買入營運槓桿/, "IBIT／WGMI 分歧點評缺失");

const indexStart = html.indexOf("<h2>美股指數與風格復盤</h2>");
const indexEnd = html.indexOf("</table>", indexStart);
const indexTable = html.slice(indexStart, indexEnd + 8);
if (rowsIn(indexTable) !== 4) failures.push(`大盤 ETF 表必須 4 列，目前 ${rowsIn(indexTable)}`);
for (const ticker of ["SPY", "DIA", "IWM", "QQQ"]) if (!new RegExp(`<td>${ticker}<\\/td>`).test(indexTable)) failures.push(`大盤 ETF 表缺少 ${ticker}`);
for (const ticker of ["RSP", "QQQE", "SMH", "VIXY"]) if (new RegExp(`<td>${ticker}<\\/td>`).test(indexTable)) failures.push(`大盤 ETF 表不應包含 ${ticker}`);
assertRsiDescending(indexTable, "大盤 ETF");

const moverStart = html.indexOf("<h2>強勢股與弱勢股</h2>");
const moverEnd = html.indexOf("</section>", moverStart);
const mover = html.slice(moverStart, moverEnd);
const moverTables = [...mover.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g)].map((match) => count(/<tr\b/g, match[1]));
if (moverTables.length < 2 || moverTables[0] !== 5 || moverTables[1] !== 5) failures.push(`強弱股必須各 5 檔，目前 ${moverTables.join("/")}`);
for (const ticker of ["RCEL", "COIN", "CRCL", "HOOD", "ELF", "ARM", "INTC", "ONTO", "CRWD", "ALAB"]) if (!new RegExp(`<td>${ticker}<\\/td>`).test(mover)) failures.push(`強弱股表缺少 ${ticker}`);

const scoreCells = [...html.matchAll(/data-score="(\d+)"\s+data-max-score="(\d+)"/g)].map((match) => [Number(match[1]), Number(match[2])]);
if (scoreCells.length !== 7) failures.push(`市場總分應有 7 個分項，目前 ${scoreCells.length}`);
if (scoreCells.reduce((sum, row) => sum + row[0], 0) !== 58 || scoreCells.reduce((sum, row) => sum + row[1], 0) !== 100) failures.push("市場分項無法反算為 58/100");
const probabilities = [...html.matchAll(/data-scenario-probability="(\d+)"/g)].map((match) => Number(match[1]));
if (probabilities.length !== 4 || probabilities.reduce((sum, value) => sum + value, 0) !== 100) failures.push("下週四情境概率必須合計 100%");

if (count(/<link rel="stylesheet" href="report-shared\.css/g) !== 1) failures.push("shared CSS 引用數量異常");
if (count(/<script src="report-runtime\.js/g) !== 1) failures.push("runtime 引用數量異常");
if (/<!-- DATA:/.test(html)) failures.push("仍有未解析資料佔位符");
if (/font-weight\s*:\s*(?:6|7|8|9)00/.test(html)) failures.push("週報行內樣式出現超過 500 的字重");
if (/box-shadow\s*:|linear-gradient\s*\(/.test(html)) failures.push("週報行內樣式出現陰影或漸變");

if (failures.length) {
  console.error(`FAIL ${file}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS ${file}: 週報內容、數據、排序與結構 QA 通過`);
