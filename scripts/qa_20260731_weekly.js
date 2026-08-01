#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const file = process.argv[2] || "reports/2026-07-31-weekly.html";
const html = fs.readFileSync(file, "utf8");
const failures = [];
const need = (pattern, message) => { if (!pattern.test(html)) failures.push(message); };
const count = (pattern) => (html.match(pattern) || []).length;
const text = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

need(/data-report-type="weekly"/, "週報類型缺失");
need(/價格修復但廣度未跟/, "主標題未呈現本週核心敘事");
need(/1 命中/, "上週對賬命中數缺失");
need(/1 部分命中/, "上週對賬部分命中數缺失");
need(/7 未觸發/, "上週對賬未觸發數缺失");
need(/本週五大強勢股/, "五大強勢股缺失");
need(/本週五大弱勢股/, "五大弱勢股缺失");
need(/NVDA 補充/, "NVDA 週變化與均線補充缺失");
need(/三大指數廣度/, "三大指數廣度綜合分析缺失");
need(/與 Stockbee 交叉驗證/, "Stockbee 交叉驗證缺失");
need(/2 年期下降 5bp/, "長短債比較缺失");
need(/DXY[^<]{0,80}99\.79/, "DXY 正式收盤缺失");
need(/10s2s[^<]{0,100}\+47bp/, "殖利率曲線分析缺失");
need(/VIX[^<]{0,100}0\/5/, "VIX 五項分數缺失");
need(/FOMC 目標區間/, "FOMC 目標區間缺失");
need(/9\/16 FOMC 市場定價/, "下次會議市場定價缺失");
need(/8\/7 08:30/, "非農事件缺失");
need(/四種情境與主觀概率/, "下週計畫缺少情境概率表");
need(/基準：局部輪動延續/, "下週計畫缺少基準情境");
need(/偏多：軟著陸與廣度擴散/, "下週計畫缺少偏多情境");
need(/偏空：通膨／長端再定價/, "下週計畫缺少長端利率偏空情境");
need(/尾端：成長失速/, "下週計畫缺少成長失速情境");
for (const moduleName of ["大盤 ETF", "市場廣度", "S&P 500 Sector", "Thematic／財報", "長短債／DXY", "商品與防守資產"]) need(new RegExp(moduleName.replace("/", "\\/")), `下週聯動預測缺少 ${moduleName}`);
need(/四大 ETF 技術/, "市場量化總分缺少技術明細");
need(/市場廣度[\s\S]{0,180}9\/10/, "市場量化總分缺少廣度明細");
need(/VIX 波動[\s\S]{0,180}0\/5/, "市場量化總分缺少 VIX 五項明細");
need(/板塊／主題動能[\s\S]{0,180}28\/54/, "市場量化總分缺少板塊／主題明細");
need(/50MA ATR 延伸[\s\S]{0,180}4\/18/, "市場量化總分缺少 ATR 明細");
need(/跨資產壓力[\s\S]{0,180}3\/4/, "市場量化總分缺少跨資產明細");
need(/宏觀／事件風險[\s\S]{0,180}3\/3/, "市場量化總分缺少事件明細");
need(/8 \+ 18 \+ 0 \+ 8 \+ 2 \+ 11 \+ 10 = 57/, "市場量化總分反算式缺失");
need(/DXY (?:&gt;|>)101\.50 且 10Y (?:&gt;|>)4\.80%/, "數值化美元／長端風控缺失");
need(/75 檔收盤快照、18 檔 Sector Dashboard、44 檔 Thematic Sectors、32 檔 Macro，錯誤均為 0/, "長橋完整性聲明缺失");
if (/Weekly Expected Move|週度預期波動|1SD 關鍵位/.test(html)) failures.push("已刪除的 Expected Move 章節重新出現");
if (count(/class="bar-row"/g) !== 8) failures.push("動能圖必須正好 8 列");

for (const heading of ["S&amp;P 500 Sector ETF", "Thematic Sector ETF"]) {
  const start = html.indexOf(`<h3>${heading}</h3>`);
  const end = html.indexOf("</table>", start);
  const fragment = start >= 0 && end >= 0 ? html.slice(start, end + 8) : "";
  if (!fragment) failures.push(`${heading} 表格缺失`);
  if ((fragment.match(/<td>SPY<\/td>/g) || []).length !== 1) failures.push(`${heading} 必須包含且僅包含一列 SPY`);
  const rsi = [...fragment.matchAll(/data-rsi="(-?\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
  if (!rsi.length || rsi.some((value, index) => index > 0 && value > rsi[index - 1])) failures.push(`${heading} RSI 未由高至低排序`);
}

const indexStart = html.indexOf("<h2>美股指數與風格復盤</h2>");
const indexEnd = html.indexOf("</table>", indexStart);
const indexFragment = html.slice(indexStart, indexEnd + 8);
for (const ticker of ["IWM", "DIA", "SPY", "QQQ"]) need(new RegExp(`<td>${ticker}<\\/td>`), `大盤 ETF 表缺少 ${ticker}`);
for (const forbidden of ["RSP", "QQQE", "VIXY", "SMH"]) if (new RegExp(`<td>${forbidden}<\\/td>`).test(indexFragment)) failures.push(`大盤 ETF 表不應包含 ${forbidden}`);

const moverStart = html.indexOf("<h2>強勢股與弱勢股</h2>");
const moverEnd = html.indexOf("</section>", moverStart);
const moverFragment = html.slice(moverStart, moverEnd);
const moverRows = [...moverFragment.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((match) => (match[1].match(/<tr>/g) || []).length);
if (moverRows.length < 2 || moverRows[0] !== 5 || moverRows[1] !== 5) failures.push(`強弱股必須各 5 檔，目前 ${moverRows.join("/")}`);

if (count(/<link rel="stylesheet" href="report-shared\.css/g) !== 1) failures.push("shared CSS 引用數量異常");
if (count(/<script src="report-runtime\.js/g) !== 1) failures.push("runtime 引用數量異常");
if (/font-weight\s*:\s*(?:6|7|8|9)00/.test(html)) failures.push("週報行內樣式出現超過 500 的字重");
if (/box-shadow\s*:|linear-gradient\s*\(/.test(html)) failures.push("週報行內樣式出現陰影或漸變");
if (/<!-- DATA:/.test(html)) failures.push("仍有未解析資料佔位符");

const scoreCells = [...html.matchAll(/data-score="(\d+)"\s+data-max-score="(\d+)"/g)].map((match) => [Number(match[1]), Number(match[2])]);
if (scoreCells.length !== 7) failures.push(`市場量化總分应有 7 個分項，目前 ${scoreCells.length}`);
if (scoreCells.reduce((sum, row) => sum + row[0], 0) !== 57 || scoreCells.reduce((sum, row) => sum + row[1], 0) !== 100) failures.push("市場量化總分無法反算為 57/100");
const scenarioProbabilities = [...html.matchAll(/data-scenario-probability="(\d+)"/g)].map((match) => Number(match[1]));
if (scenarioProbabilities.length !== 4 || scenarioProbabilities.reduce((sum, value) => sum + value, 0) !== 100) failures.push("下週四種情境的主觀概率必須合計 100%");

if (failures.length) {
  console.error(`FAIL ${file}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS ${file}: 週報內容、數據與結構 QA 通過`);
