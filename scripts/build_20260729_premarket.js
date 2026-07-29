"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.resolve(root, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fixed(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "待更新";
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return "待更新";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function moveClass(value) {
  return value > 0 ? "up" : value < 0 ? "dn" : "";
}

function compactVolume(value) {
  if (!Number.isFinite(value)) return "待更新";
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}億股`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}萬股`;
  return `${Math.round(value).toLocaleString("en-US")}股`;
}

function normalize(row) {
  if (!row) return null;
  return {
    ticker: row.ticker || row.key,
    asOf: row.asOf,
    close: n(row.close),
    dailyPct: n(row.dailyPct),
    fiveDayPct: n(row.fiveDayPct),
    oneMonthPct: n(row.oneMonthPct),
    ma20: n(row.ma20),
    ma50: n(row.ma50),
    ma200: n(row.ma200),
    above20: row.above20 ?? row.aboveMa20,
    above50: row.above50 ?? row.aboveMa50,
    above200: row.above200 ?? row.aboveMa200,
    rsi14: n(row.rsi14),
    atr14: n(row.atr14),
    extension50Atr: n(row.extension50Atr ?? row.distance50Atr),
  };
}

function mapRows(rows) {
  return new Map(rows.map((row) => [row.ticker || row.key, row]));
}

function maStates(row) {
  return [["20", row.above20], ["50", row.above50], ["200", row.above200]]
    .map(([period, isUp]) => `<span class="ma-state ${isUp ? "ma-up" : "ma-down"}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${isUp ? "▲" : "▼"}</span></span>`)
    .join("");
}

function judgment(row) {
  if (row.rsi14 >= 70) return "RSI 過熱，避免追價。";
  if (row.rsi14 <= 30) return "RSI 超賣，等待止跌確認。";
  if (row.above20 && row.above50 && row.above200) return "均線完整，回落守 20MA。";
  if (!row.above20 && row.above50 && row.above200) return "短線轉弱，中期結構仍在。";
  if (!row.above20 && !row.above50 && row.above200) return "低於 20／50MA，屬修復區。";
  if (!row.above200) return "低於 200MA，維持防守。";
  return "訊號混合，等待價格確認。";
}

function etfTable(title, rows, tableAttributes = "") {
  const sorted = [...rows].sort((a, b) => b.rsi14 - a.rsi14);
  const leader = [...rows].sort((a, b) => b.oneMonthPct - a.oneMonthPct)[0];
  const laggard = [...rows].sort((a, b) => a.oneMonthPct - b.oneMonthPct)[0];
  const above20 = rows.filter((row) => row.above20).length;
  const body = sorted.map((row) =>
    `<tr><td class="etf-symbol"><strong>${row.ticker}</strong></td>` +
    `<td class="etf-momentum-cell"><div class="etf-momentum">` +
    `<span><strong class="${moveClass(row.dailyPct)}">${signed(row.dailyPct)}</strong></span>` +
    `<span><strong class="${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</strong></span>` +
    `<span><strong class="${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</strong></span>` +
    `</div></td><td class="ma-cell">${maStates(row)}</td>` +
    `<td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td>` +
    `<td class="etf-judgment">${judgment(row)}</td></tr>`
  ).join("");
  return `<div class="etf-group"><div class="etf-group-head"><div class="etf-group-title"><small>${rows.length} 檔 ETF</small><h3>${title}</h3></div>` +
    `<div class="etf-group-stats"><div><span>1月領先</span><strong class="up">${leader.ticker} ${signed(leader.oneMonthPct)}</strong></div>` +
    `<div><span>1月落後</span><strong class="dn">${laggard.ticker} ${signed(laggard.oneMonthPct)}</strong></div>` +
    `<div><span>20MA 上方</span><strong>${above20}／${rows.length} 檔</strong></div></div></div>` +
    `<div class="table-scroll etf-table-scroll"><table class="etf-overview-table report-data-table report-cols-5"${tableAttributes ? ` ${tableAttributes}` : ""}><thead><tr>` +
    `<th>ETF</th><th class="etf-momentum-head"><span>動能</span><div><small>1日</small><small>5日</small><small>1月</small></div></th>` +
    `<th class="ma-heading">20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function momentumChart(rows) {
  const ordered = [...rows].sort((a, b) => b.oneMonthPct - a.oneMonthPct);
  const chosen = [...ordered.slice(0, 4), ...ordered.slice(-4)];
  const maxPositive = Math.max(0, ...chosen.map((row) => row.oneMonthPct));
  const maxNegative = Math.max(0, ...chosen.map((row) => -row.oneMonthPct));
  const total = maxPositive + maxNegative || 1;
  const zero = (maxNegative / total) * 100;
  return chosen.map((row) => {
    const positive = row.oneMonthPct >= 0;
    const width = Math.abs(row.oneMonthPct) / total * 100;
    return `<div class="bar-row"><span class="lbl">${row.ticker}</span><span class="val ${positive ? "pos" : "neg"}">${signed(row.oneMonthPct)}</span>` +
      `<span class="bar-track" style="--zero:${zero.toFixed(2)}%"><span class="b ${positive ? "pos" : "neg"}" style="width:${width.toFixed(2)}%"></span></span></div>`;
  }).join("");
}

function riskRow(level, name, reading, note) {
  const label = level === "high" ? "High" : level === "mid" ? "Intermediate" : "Low";
  const color = level === "high" ? "red" : level === "mid" ? "amber" : "blue";
  return `<div class="risk-check-row ${level}"><div class="risk-check-name">${name}</div>` +
    `<div class="risk-check-level"><span class="badge ${color}">${label}</span></div>` +
    `<div class="risk-check-reading"><strong>${reading}</strong><small>${note}</small></div></div>`;
}

function macroRow(event, time, actual, forecast, previous, signal, color, policy, meaning, pending = false, earnings = false) {
  return `<tr><td class="macro-event"><strong>${event}</strong><small>${time}</small></td>` +
    `<td><div class="macro-data-grid${earnings ? " macro-data-grid--earnings" : ""}"><span${pending ? " data-allow-missing" : ""}><small>Actual</small><strong>${actual}</strong></span>` +
    `<span><small>Forecast</small><strong>${forecast}</strong></span><span><small>Previous</small><strong>${previous}</strong></span></div></td>` +
    `<td class="macro-signal"><span class="badge ${color}">${signal}</span></td><td class="macro-policy-copy">${policy}</td><td class="macro-market-copy">${meaning}</td></tr>`;
}

const base = readJson(path.join(root, "data", "2026-07-28-premarket.json"));
const snapshot = readJson(path.join(work, "postmarket_snapshot_2026-07-28.json"));
const thematicSnapshot = readJson(path.join(work, "thematic_rsi_longport.json"));
const macroSnapshot = readJson(path.join(work, "macro_rsi_longport.json"));
const quotes = readJson(path.join(work, "premarket_quotes_0729.json"));
const scan = readJson(path.join(work, "premarket_movers_0729.json"));

const technical = mapRows(snapshot.rows.map(normalize));
const thematic = mapRows(thematicSnapshot.rows.map(normalize));
const macro = mapRows(macroSnapshot.rows.map(normalize));
const quoteMap = mapRows([...quotes, ...scan]);
const q = (ticker) => quoteMap.get(ticker);
const price = (ticker) => n(q(ticker)?.price);
const move = (ticker) => n(q(ticker)?.changePct);
const volume = (ticker) => n(q(ticker)?.volume);

const sectorTickers = ["XLE", "XLV", "XLF", "XLRE", "XLU", "XLP", "XLI", "XLC", "XLB", "XLY", "XLK", "SPY"];
const thematicTickers = thematicSnapshot.rows.map((row) => row.ticker).filter((ticker) => ticker !== "SPY");
const sectorRows = sectorTickers.map((ticker) => technical.get(ticker)).filter(Boolean);
const thematicRows = [...thematicTickers.map((ticker) => thematic.get(ticker)).filter(Boolean), technical.get("SPY")].filter(Boolean);

if (sectorRows.length !== 12) throw new Error(`Sector Dashboard 應有 12 檔，實際 ${sectorRows.length}`);
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.ticker === "SPY").length !== 1) {
  throw new Error(`Thematic Sectors 應完整讀入 44 檔並加入一筆 SPY，實際 ${thematicRows.length}`);
}
if (![...sectorRows, ...thematicRows].every((row) => row.asOf === "2026-07-28")) {
  throw new Error("ETF 技術資料不是 2026-07-28 完整日線");
}

const moverSpecs = [
  ["JCI", "盤前走強，市場先交易訂單與資料中心冷卻需求。", "工業與資料中心基建相對承接。", "守住 VWAP 才保留盤前溢價。"],
  ["COP", "USO 盤前急升帶動油氣生產商反彈。", "能源重新提供道指與價值風格支撐。", "油價若回吐一半升幅，降低追價。"],
  ["XOM", "油價代理 USO 盤前上漲，綜合能源同步受惠。", "XLE 有望改善前一日弱勢。", "只在 USO 守住 VWAP 時保留。"],
  ["CVX", "油價反彈帶動大型綜合能源股。", "能源強度不是全面 risk-on。", "開盤後與 XOM／COP 同步確認。"],
  ["INTC", "昨日急跌後出現高成交量反彈。", "記憶體與設備鏈仍弱，屬個別修復。", "未站回 VWAP 與昨收前不升級為反轉。"],
  ["GOOGL", "大型科技盤前小幅承接。", "QQQ 整體接近平盤，尚未形成廣泛科技領先。", "FOMC 前只作相對強弱觀察。"],
  ["QCOM", "通訊晶片盤前小幅回升。", "尚不足抵消 SMH 與設備鏈弱勢。", "需與 SMH 同步轉正才提高可信度。"],
  ["META", "盤後財報前的事件倉位調整。", "盤後將與 MSFT 一起重塑 QQQ 權重風險。", "日內不以盤前小漲預判財報結果。"],
  ["KLAC", "設備鏈賣壓延續，盤前跌幅居前。", "半導體設備仍是科技最弱鏈條。", "未收回 VWAP 前不抄底。"],
  ["CAT", "工業權重盤前受壓，尚未確認單一新催化。", "DIA 盤前走弱，工業承接不如前一日。", "避免用單一個股外推整個工業板塊。"],
  ["AMAT", "晶片設備鏈續跌。", "與 KLAC／LRCX 共振，板塊訊號可信度較高。", "至少兩檔收回 VWAP 才降低對沖。"],
  ["ARM", "半導體設計股跟隨晶片鏈偏弱。", "科技反彈仍缺少高 beta 確認。", "未收回 VWAP 前不把下跌視為完成。"],
  ["LRCX", "設備鏈延續去風險。", "SMH 反彈仍受設備股拖累。", "未收回 VWAP 前維持低配。"],
  ["V", "EPS 3.32、營收 11.60B，均高於預期，但盤前股價走弱。", "支付基本面與價格反應分歧。", "不要把 Beat 直接等同買進訊號。"],
  ["TSM", "晶圓代工隨設備與亞洲科技偏弱。", "SMH 的反彈仍缺乏代工鏈確認。", "若開盤守住盤前低點，再觀察修復。"],
  ["MRVL", "AI／網通晶片盤前偏弱。", "高 beta 晶片仍未脫離去風險。", "站回 VWAP 才撤銷弱勢判斷。"],
].map(([ticker, catalyst, readThrough, call]) => ({
  ticker,
  price: fixed(price(ticker), 3),
  premarket_change: signed(move(ticker)),
  catalyst: `${catalyst} 長橋盤前量 ${compactVolume(volume(ticker))}。`,
  read_through: readThrough,
  judgment: call,
}));

const checklist = `<div class="risk-check-grid">` +
  riskRow("low", "S&amp;P 500 overextension／標普過度延伸", `SPY 距 50MA ${fixed(technical.get("SPY").extension50Atr)} ATR`, "未處於向上過度延伸，風險來自科技破位與事件。") +
  riskRow("high", "Increasing downward momentum／下行動能增加", `QQQ 5日 ${signed(technical.get("QQQ").fiveDayPct)}；SMH ${signed(technical.get("SMH").fiveDayPct)}`, "科技與半導體下行速度仍快。") +
  riskRow("high", "Top range breakdown／高位區間破位", "QQQ、SMH 低於 20／50MA", "反彈尚未收復主要均線。") +
  riskRow("high", "Technical deterioration／技術惡化", "四大 ETF 技術惡化 7/16", "SPY／QQQ 低於 20／50MA；IWM 低於 20MA；DIA 均線完整。") +
  riskRow("mid", "Market breadth worsening／市場廣度惡化", "NDX >20MA 48.54%", "指數廣度改善，但 Stockbee 5D／10D ratio 仍低於 1。") +
  riskRow("mid", "VIX &gt;20／波動升溫", "VIX 19.08；波動分數 3/5", ">20 0/1、5日>0 1/1、1月>0 0/1、20MA 1/1、50MA 1/1。") +
  riskRow("high", "Breakout win rate down／突破勝率下降", "Stockbee 5D／10D ratio 0.78／0.88", "短線與中短線強弱比都低於 1。") +
  riskRow("high", "Theme momentum weakening／主題動能轉弱", `SMH 1月 ${signed(technical.get("SMH").oneMonthPct)}`, "設備、記憶體與 AI 鏈仍未同步止跌。") +
  `</div><div class="callout risk"><strong>Checklist Score：5/8 High＝High Risk。</strong>FOMC 與盤後大型科技財報另屬事件風險；VIX 仍按五項規則評為 3/5，不能只看是否高於 20。</div>`;

const macroRows = [
  macroRow("FOMC 利率決議", "14:00 ET", "待公布", "3.50%–3.75%（維持）", "3.50%–3.75%", "高風險事件", "amber", "CME 定價偏向維持，但升息尾端風險不可忽略。", "聲明與 14:30 記者會分兩段判讀。", true),
  macroRow("HUM 財報", "盤前已公布", "EPS 7.61<br>營收 40.87B", "EPS 7.25<br>營收 40.57B", "EPS 6.27<br>營收 32.39B", "Beat／Beat", "green", "維持全年調整後 EPS 至少 9.00。", "醫療防禦需由開盤價格與 VWAP 確認。", false, true),
  macroRow("BSX 財報", "盤前已公布", "EPS 0.86<br>營收 5.44B", "EPS 0.83<br>營收 5.39B", "EPS 0.75<br>營收 5.06B", "Beat／Beat", "green", "醫療器材成長維持，基本面支撐 XLV。", "Beat 後仍需觀察開盤能否守住 VWAP。", false, true),
  macroRow("V 財報", "昨晚已公布", "EPS 3.32<br>營收 11.60B", "EPS 3.23<br>營收 11.39B", "EPS 2.98<br>營收 10.17B", "Beat／Beat", "green", "支付數據仍強，但市場反應偏弱。", `V 盤前 ${signed(move("V"))}，價格與基本面分歧。`, false, true),
  macroRow("MSFT 財報", "盤後", "待公布", "EPS 4.24<br>營收 87.67B", "EPS 3.65<br>營收 76.44B", "待公布", "blue", "Azure、AI 資本支出與 FY27 指引最重要。", "FOMC 後還有第二層 QQQ 事件風險。", true, true),
  macroRow("META 財報", "盤後", "待公布", "EPS 7.18<br>營收 60.19B", "EPS 7.14<br>營收 47.52B", "待公布", "blue", "廣告成長之外，更重視資本支出與利潤率。", "盤後波動不可歸因於 FOMC 單一事件。", true, true),
].join("");

const macroTable = `<div class="table-scroll"><table class="macro-policy-table report-data-table report-cols-5"><thead><tr>` +
  `<th>宏觀／財報事件</th><th>Actual／Forecast／Previous</th><th>訊號</th><th>政策／利率判讀</th><th>市場含義</th></tr></thead><tbody>${macroRows}</tbody></table></div>`;

const expectedSpecs = [
  ["SPY", 724.53, 753.33], ["QQQ", 661.66, 706.80], ["IWM", 283.91, 298.43], ["DIA", 509.91, 527.61],
  ["XLK", 168.76, 183.01], ["SMH", 518.82, 603.56], ["USO", 125.57, 146.87], ["TLT", 82.25, 84.25],
  ["AMD", 472.55, 571.35], ["MSFT", 369.30, 411.24], ["META", 537.76, 655.20],
].map(([ticker, lower, upper]) => {
  const current = price(ticker);
  const status = current < lower ? "低於 -1SD" : current > upper ? "高於 +1SD" :
    Math.min(current - lower, upper - current) / (upper - lower) < 0.12 ? "接近邊界" : "區間內";
  const color = current < lower || current > upper ? "red" : status === "接近邊界" ? "amber" : "blue";
  return `<tr><td>${ticker}</td><td class="num">${fixed(current)}</td><td class="num">${fixed(lower)}</td><td class="num">${fixed(upper)}</td>` +
    `<td><span class="badge ${color}">${status}</span></td><td>${current < lower ? "等待收回 -1SD，避免追空。" : current > upper ? "不追價，等待回測。" : "仍在本週定價區間。"}</td></tr>`;
}).join("");
const expectedTable = `<h3>本週 Expected Move 位置</h3><div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr>` +
  `<th>標的</th><th class="num">盤前</th><th class="num">-1SD</th><th class="num">+1SD</th><th>狀態</th><th>行動</th></tr></thead><tbody>${expectedSpecs}</tbody></table></div>`;

const majorRows = ["IWM", "DIA", "SPY", "QQQ"].map((ticker) => technical.get(ticker));
const majorTable = `<div class="table-scroll"><table class="report-data-table report-cols-8" data-major-universe="indices-4"><thead><tr>` +
  `<th>ETF</th><th class="num">昨收</th><th class="num">盤前</th><th class="num">5日</th><th class="num">1月</th><th class="ma-heading">20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td><strong>${row.ticker}</strong></td><td class="num">${fixed(row.close)}</td>` +
    `<td class="num ${moveClass(move(row.ticker))}">${fixed(price(row.ticker))}／${signed(move(row.ticker))}</td>` +
    `<td class="num ${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>` +
    `<td class="ma-cell">${maStates(row)}</td><td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td><td>${judgment(row)}</td></tr>`).join("") +
  `</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>盤前四大 ETF 接近平盤至小跌；DIA 由前一日領先轉為盤前落後，FOMC 前風格分化正在收斂。</p>`;

const atrTable = `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">昨收</th>` +
  `<th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td>${row.ticker}</td><td class="num">${fixed(row.close)}</td><td class="num">${fixed(row.ma50)}</td>` +
    `<td class="num">${fixed(row.atr14)}</td><td class="num ${moveClass(row.extension50Atr)}">${row.extension50Atr > 0 ? "+" : ""}${fixed(row.extension50Atr)}</td>` +
    `<td>${row.extension50Atr <= -2 ? "低於 50MA 超過 2 ATR，等待止跌。" : row.extension50Atr < 0 ? "低於 50MA，尚未過度延伸。" : "高於 50MA，仍在正常區間。"}</td></tr>`).join("") +
  `</tbody></table></div>`;

const breadthTable = `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>前一日</th><th>中期結構</th><th>綜合判斷</th></tr></thead><tbody>` +
  `<tr><td>SPX >20MA（7/28）</td><td class="num up">69.18%</td><td>63.22%</td><td>SPX >50MA 71.57%</td><td>大型股廣度明顯改善。</td></tr>` +
  `<tr><td>NDX >20MA（7/28）</td><td class="num up">48.54%</td><td>44.36%</td><td>NDX >50MA 51.45%</td><td>科技回到中性附近，但尚未全面轉強。</td></tr>` +
  `<tr><td>IWM >20MA（7/28）</td><td class="num up">52.57%</td><td>47.14%</td><td>IWM >50MA 61.07%</td><td>小盤短中線都回到半數上方。</td></tr>` +
  `<tr><td>T2108（Stockbee 7/28）</td><td class="num">55.33%</td><td>53.38%</td><td>維持中性上方</td><td>全市場長期廣度續改善。</td></tr>` +
  `<tr><td>5D／10D ratio（7/28）</td><td class="num dn">0.78／0.88</td><td>1.05／0.90</td><td>兩者均低於 1</td><td>短線強弱比再次轉弱。</td></tr>` +
  `<tr><td>4%+ 上漲／下跌（7/28）</td><td class="num dn">341／388</td><td>380／195</td><td>季度 +25%／-25% 1261／1231</td><td>指數廣度改善，但極端個股分布偏空。</td></tr>` +
  `</tbody></table></div>`;

const macroAssets = ["EWJ", "EWY", "EWG", "FXI", "EWT", "XAU", "XAG", "COPPER", "CL", "BTC"];
const macroLabels = {
  EWJ: "EWJ", EWY: "EWY", EWG: "EWG", FXI: "FXI", EWT: "EWT",
  XAU: "GLD", XAG: "SLV", COPPER: "CPER", CL: "USO", BTC: "IBIT",
};
const macroAssetRows = macroAssets.map((key) => {
  const row = macro.get(key);
  const preTicker = { XAU: "GLD", XAG: "SLV", COPPER: "CPER", CL: "USO", BTC: "IBIT" }[key];
  const pre = preTicker ? move(preTicker) : null;
  const meaning = key === "CL" ? "USO 盤前急升，通膨與能源股風險同時回來。" :
    key === "XAU" || key === "XAG" ? "貴金屬接近平盤，避險訊號不強。" :
    key === "COPPER" ? "銅價代理回升，週期交易略有承接。" :
    key === "BTC" ? "加密資產小幅上漲，未見廣泛去風險。" :
    "用作跨市場風險確認，不單獨決定倉位。";
  return `<tr><td>${macroLabels[key]}</td><td class="num">${fixed(row.close)}</td><td class="num ${moveClass(row.dailyPct)}">${signed(row.dailyPct)}</td>` +
    `<td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td><td class="num ${moveClass(pre)}">${Number.isFinite(pre) ? signed(pre) : "無盤前成交"}</td><td>${meaning}</td></tr>`;
}).join("");

const fedWatchTable = `<div class="table-scroll"><table class="report-data-table report-cols-5" data-fedwatch-asof="2026-07-29 08:05 ET"><thead><tr>` +
  `<th>會議／目標區間</th><th class="num">目前</th><th class="num">前一日</th><th class="num">前一週</th><th>判讀</th></tr></thead><tbody>` +
  `<tr><td>7/29 維持 3.50%–3.75%</td><td class="num">64.6%</td><td class="num">69.0%</td><td class="num">72.3%</td><td>基準情境仍是按兵不動。</td></tr>` +
  `<tr><td>7/29 升至 3.75%–4.00%</td><td class="num amber">35.4%</td><td class="num">31.0%</td><td class="num">27.7%</td><td>升息尾端風險持續增加，不能忽略。</td></tr>` +
  `<tr><td>9/16 維持 3.50%–3.75%</td><td class="num">20.8%</td><td class="num">22.2%</td><td class="num">30.3%</td><td>九月維持現區間已非主流。</td></tr>` +
  `<tr><td>9/16 位於 3.75%–4.00%</td><td class="num">55.2%</td><td class="num">56.8%</td><td class="num">53.6%</td><td>九月機率最高的目標區間。</td></tr>` +
  `<tr><td>9/16 位於 4.00%–4.25%</td><td class="num">24.0%</td><td class="num">21.0%</td><td class="num">16.1%</td><td>更鷹派路徑的機率亦在上升。</td></tr>` +
  `</tbody></table></div>`;

const fomcScenarios = `<h3>FOMC 情境與交易反應</h3><div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr>` +
  `<th>情境</th><th>政策訊號</th><th>跨市場確認</th><th>QQQ／SMH 關鍵位</th><th>行動</th></tr></thead><tbody>` +
  `<tr><td><span class="badge green">維持＋偏鴿</span></td><td>強調雙向風險，能源衝擊被視為暫時。</td><td>DXY 回落、TLT 站回 84.25。</td><td>QQQ 收復 708.06（20MA）；SMH 收復 585.88（20MA）。</td><td>只在價格確認後逐步回補核心科技。</td></tr>` +
  `<tr><td><span class="badge amber">維持＋偏鷹</span></td><td>不升息，但保留升息選項並強調通膨風險。</td><td>DXY 向 102、TLT 失守 83.75。</td><td>QQQ／SMH 仍低於 VWAP 與 20MA。</td><td>科技維持低配；不把「維持」當利多。</td></tr>` +
  `<tr><td><span class="badge red">升息 25bp</span></td><td>目標升至 3.75%–4.00%，對應 35.4% 尾端風險。</td><td>DXY 升破 102、TLT 加速下跌。</td><td>QQQ 失守 661.66（週度 -1SD）；SMH 失守 518.82（週度 -1SD）。</td><td>降低高 beta 約 1/3，保留對沖。</td></tr>` +
  `<tr><td><span class="badge blue">升息但一次性</span></td><td>聲明升息，記者會暗示暫停觀察。</td><td>最初利率上行後快速回吐。</td><td>QQQ／SMH 收回 VWAP 才確認反轉。</td><td>不追第一段波動，等 14:30 後再決策。</td></tr>` +
  `</tbody></table></div>`;

const ratesRows = [
  `<tr><td><strong>FOMC 聲明</strong><small class="table-note">14:00 ET</small></td><td class="num" data-allow-missing>Actual 待公布</td><td class="num">維持 3.50%–3.75%</td><td><span class="badge amber">64.6%</span></td><td>先看決議與措辭，不急著判斷整段行情。</td></tr>`,
  `<tr><td><strong>Warsh 記者會</strong><small class="table-note">14:30 ET</small></td><td class="num" data-allow-missing>待開始</td><td class="num">無 SEP</td><td><span class="badge amber">第二波</span></td><td>沒有新點陣圖，記者會語氣權重更高。</td></tr>`,
  `<tr><td><strong>CME FedWatch</strong><small class="table-note">08:05 ET</small></td><td class="num">維持 64.6%</td><td class="num">升息 35.4%</td><td><span class="badge red">尾端風險</span></td><td>升息機率較前一日與前一週都上升。</td></tr>`,
  `<tr><td><strong>TLT</strong></td><td class="num ${moveClass(move("TLT"))}">${fixed(price("TLT"))}／${signed(move("TLT"))}</td><td class="num">${fixed(technical.get("TLT").ma50)}（50MA）</td><td><span class="badge amber">事件門檻</span></td><td>84.25 上方有利科技；83.75 下方偏鷹。</td></tr>`,
  `<tr><td><strong>DXY</strong></td><td class="num">約 101.49（7/28）</td><td class="num">102</td><td><span class="badge blue">門檻下方</span></td><td>升破 102 才觸發進一步減科技。</td></tr>`,
].join("");

const tradeTickers = ["IWM", "DIA", "SPY", "QQQ", "SMH", "XLK", "USO", "TLT"];
const tradeRows = tradeTickers.map((ticker) => {
  const row = technical.get(ticker);
  const current = price(ticker);
  const state = current >= row.ma20 ? "高於20MA" : current >= row.ma50 ? "介於20／50MA" : "低於20／50MA";
  const color = current >= row.ma20 ? "green" : current >= row.ma50 ? "amber" : "red";
  const action = ticker === "USO" ? "盤前已收回週度 -1SD 125.57；守住才保留能源反彈。" :
    ticker === "QQQ" || ticker === "SMH" || ticker === "XLK" ? "FOMC 前低於基準；收回 VWAP 才減少對沖。" :
    ticker === "TLT" ? "84.25 上方偏鴿、83.75 下方偏鷹。" : "以 VWAP 與盤前低點管理倉位。";
  return `<tr><td>${ticker}</td><td class="num ${moveClass(move(ticker))}">${fixed(current)}／${signed(move(ticker))}</td>` +
    `<td class="num">${fixed(row.ma20)}</td><td class="num">${fixed(row.ma50)}</td><td><span class="badge ${color}">${state}</span></td><td>${action}</td></tr>`;
}).join("");

const spy = technical.get("SPY");
const qqq = technical.get("QQQ");
const smh = technical.get("SMH");
const vixComponents = ">20 0/1、5日>0 1/1、1月>0 0/1、20MA 1/1、50MA 1/1";

const data = {
  ...base,
  report_type: "premarket",
  report_title: "2026-07-29｜美股盤前監控",
  report_eyebrow: "2026-07-29｜盤前更新",
  report_heading: "FOMC 定價偏向維持，但升息尾端風險與盤後大型科技財報疊加",
  technical_as_of: "2026-07-28",
  vix_volatility_score: 3,
  vix_volatility_level: "Intermediate",
  vix_volatility_components: vixComponents,
  data_timestamp_note: "長橋盤前快照截至 08:51 ET；RSI／MA／ATR、三大指數廣度與 Stockbee 截至 7/28 完整日線。Sector Dashboard、Thematic Sectors、Macro 為三個主資料表；CME FedWatch 截至 08:05 ET。",
  risk_badge: "高風險｜Checklist 5/8、VIX 3/5、FOMC",
  qqq_reengage_20ma: fixed(qqq.ma20),
  qqq_breakout_add_1sd: "706.80",
  summary_cards: `<div class="card"><span>SPY／QQQ 盤前</span><strong><span class="${moveClass(move("SPY"))}">${signed(move("SPY"))}</span>／<span class="${moveClass(move("QQQ"))}">${signed(move("QQQ"))}</span></strong><small>FOMC 前接近平盤。</small></div>` +
    `<div class="card"><span>CME 維持／升息</span><strong><span>64.6%</span>／<span class="dn">35.4%</span></strong><small>升息尾端風險較前日上升。</small></div>` +
    `<div class="card"><span>USO／SMH</span><strong><span class="up">${signed(move("USO"))}</span>／<span class="${moveClass(move("SMH"))}">${signed(move("SMH"))}</span></strong><small>能源反彈，晶片仍弱。</small></div>` +
    `<div class="card"><span>VIX／事件</span><strong>19.08／3/5</strong><small>14:00 聲明、14:30 記者會。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才由高風險降為中性：政策偏鴿、科技收復、利率條件改善。",
  upgrade_trigger_1: `FOMC 維持利率，TLT 站回 84.25 且 DXY 回落。`,
  upgrade_trigger_2: `QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SMH 收回 ${fixed(smh.ma20)}（20MA）。`,
  upgrade_trigger_3: "14:30 後上漲家數領先，MSFT／META 財報前 QQQ 仍守 VWAP。",
  downgrade_trigger_rule: "任一觸發即維持／加強防守：意外升息、美元利率上行、科技破位。",
  downgrade_trigger_1: "FOMC 升息 25bp，或維持但 Warsh 明確保留近期升息選項。",
  downgrade_trigger_2: "QQQ 跌破 661.66（週度 -1SD），SMH 跌破 518.82（週度 -1SD）。",
  downgrade_trigger_3: "DXY 升破 102、TLT 跌破 83.75，或 VIX 波動分數升至 4/5。",
  core_conclusions: `<ol><li><strong>今日核心不是單純猜升不升息，而是處理 35.4% 的升息尾端風險。</strong>CME FedWatch 截至 08:05 ET：維持 64.6%、升息 35.4%；升息機率高於前一日 31.0% 與前一週 27.7%。</li>` +
    `<li><strong>「維持」不自動等於利多。</strong>若聲明保留升息選項、Warsh 強調通膨與能源風險，DXY／TLT 仍可能形成偏鷹反應。</li>` +
    `<li><strong>盤前指數沒有先押單邊。</strong>SPY ${signed(move("SPY"))}、QQQ ${signed(move("QQQ"))}、DIA ${signed(move("DIA"))}、IWM ${signed(move("IWM"))}；主要分化是 USO ${signed(move("USO"))} 對 SMH ${signed(move("SMH"))}。</li>` +
    `<li><strong>科技技術仍弱。</strong>QQQ 低於 20／50MA，5日 ${signed(qqq.fiveDayPct)}；SMH 5日 ${signed(smh.fiveDayPct)}、1月 ${signed(smh.oneMonthPct)}。</li>` +
    `<li><strong>廣度不是單向崩壞。</strong>SPX／NDX／IWM >20MA 升至 69.18%／48.54%／52.57%，但 Stockbee 5D／10D ratio 為 0.78／0.88，極端個股分布仍偏空。</li>` +
    `<li><strong>FOMC 後還有第二層風險。</strong>MSFT 與 META 盤後公布財報；16:00 後波動不能全部歸因於 Fed。</li></ol>` +
    `<p class="section-summary"><strong>本段結論：</strong>14:00 先看決議與聲明，14:30 再看 Warsh；在 TLT／DXY 與 QQQ／SMH 同向確認前，不追第一段波動。</p>`,
  positioning_primary: "主線：FOMC 前保留事件現金；能源相對強，科技設備鏈低於基準。",
  positioning_secondary: "次線：HUM／BSX 基本面偏正；Visa Beat 但股價走弱，服從價格。",
  positioning_watch: `觀察：CME 維持 64.6%、TLT 84.25／83.75、DXY 102、QQQ ${fixed(qqq.ma20)}、SMH ${fixed(smh.ma20)}。`,
  positioning_invalidation: "若 FOMC 偏鴿、TLT 站回 84.25、DXY 回落且 QQQ／SMH 收回 VWAP，防守主線失效。",
  pre_market_movers: moverSpecs,
  pre_market_movers_note: `<p class="section-summary"><strong>本段結論：</strong>盤前異動集中在油價反彈、財報反應與設備鏈續弱；以長橋盤前成交量和開盤 VWAP 再驗證。</p>`,
  section_pre_market_movers_primary_action: "主線：能源不追高、設備鏈不抄底；先等 09:30 ORB。",
  section_pre_market_movers_condition_action: "條件：USO 守 VWAP、XOM／COP／CVX 同步強，才保留能源相對多；KLAC／AMAT／LRCX 至少兩檔收回 VWAP，才降低科技對沖。",
  section_pre_market_movers_avoid_action: "避免：把財報 Beat 直接等同股價上漲；Visa 已提供反例。",
  premarket_movers_invalidation: "若 USO 跌回昨收且 SMH 轉正，能源強、晶片弱的盤前分化失效。",
  correction_checklist_dashboard: checklist,
  section_correction_checklist_primary_action: "主線：5/8 High，總 beta 維持低於基準。",
  section_correction_checklist_condition_action: "條件：High 項降至 2 項以下，才把風險降為 Low。",
  section_correction_checklist_avoid_action: "避免：只用 VIX 是否高於 20 做機械性判定。",
  checklist_invalidation: "若 QQQ／SMH 收回 20MA、Stockbee 5D／10D ratio 同高於 1，Checklist 才可明顯降級。",
  macro_premarket_background_table: `${macroTable}<p class="section-summary"><strong>本段結論：</strong>HUM／BSX／Visa 的 Actual 與 Forecast 已逐項列示；MSFT／META 尚未公布，不預先標示 Beat／Miss。FOMC 將由利率決議與記者會分兩段判讀。</p>${expectedTable}`,
  section_macro_premarket_background_primary_action: "主線：14:00 看決議，14:30 看記者會；16:00 後再處理 MSFT／META。",
  section_macro_premarket_background_condition_action: "條件：政策偏鴿、TLT 上漲且 QQQ 收回 VWAP，才提高成長曝險。",
  section_macro_premarket_background_avoid_action: "避免：把維持利率直接當作 dovish，也不要把財報 Beat 與股價反應混為同一件事。",
  macro_invalidation: "若決議偏鷹但 TLT 不跌、QQQ 不弱，立即服從價格而非敘事。",
  sector_momentum_chart: momentumChart(thematicRows),
  sector_thematic_etf_tables: `${etfTable("S&amp;P 500 Sector ETF", sectorRows)}${etfTable(
    "Thematic Sector ETF（含 SPY 基準）",
    thematicRows,
    'data-etf-universe="thematic-complete" data-source-count="44" data-report-count="45" data-benchmark="SPY" data-sort="rsi-desc"'
  )}<p class="section-summary"><strong>本段結論：</strong>完整讀入 Thematic Sectors 的 44 檔 ETF，再加入 SPY 基準，共 45 檔按 RSI 由高至低排列；盤前方向則由能源反彈與設備鏈續弱主導。</p>`,
  section_sector_thematic_etf_primary_action: "主線：用 RSI 排序看相對結構，但以盤前價格與 FOMC 後反應判斷今日方向。",
  section_sector_thematic_etf_condition_action: "條件：SMH／XLK 收回 VWAP 與 20MA，才把跌深修復升級為輪動。",
  section_sector_thematic_etf_avoid_action: "避免：用單日盤前漲跌覆蓋 7/28 完整日線 RSI／MA。",
  sector_etf_invalidation: "若 XLE 盤中轉弱、SMH 同步轉強，能源對科技的相對分化失效。",
  major_etf_technical_table: majorTable,
  section_major_etf_technical_primary_action: "主線：四大 ETF 只看 IWM／DIA／SPY／QQQ；FOMC 前均未形成單邊。",
  section_major_etf_technical_condition_action: `條件：QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SPY 收回 ${fixed(spy.ma20)}（20MA）再提高指數倉位。`,
  section_major_etf_technical_avoid_action: "避免：加入 VOO／RSP／QQQE 稀釋四大指數判斷。",
  major_etf_invalidation: "若 DIA 收回盤前跌幅而 QQQ 轉弱，早盤風格分化重新擴大。",
  fifty_ma_atr_extension_table: atrTable,
  section_50ma_atr_extension_primary_action: `主線：QQQ 距 50MA ${fixed(qqq.extension50Atr)} ATR，等政策與價格雙確認，不直接抄底。`,
  section_50ma_atr_extension_condition_action: "條件：QQQ 回到 -2 ATR 內且 RSI 回升，再降低技術防守。",
  section_50ma_atr_extension_avoid_action: "避免：把負 ATR 延伸直接等同超賣買點。",
  atr_extension_invalidation: "若 SPY／QQQ 同收回 50MA，ATR 防守訊號失效。",
  market_breadth_table: breadthTable,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>綜合廣度：</strong>SPX／NDX／IWM 20MA 與 50MA 廣度均較前一日改善；但 Stockbee 5D／10D ratio 為 0.78／0.88、4%+ 上漲／下跌為 341／388。指數成分修復與全市場短線弱化同時存在。</div>` +
    `<p class="section-summary"><strong>小結：</strong>不能只用 Stockbee 宣告全面偏空，也不能只用三大指數廣度宣告全面 risk-on；FOMC 後上漲家數與 NDX 成分股參與度是確認點。</p>`,
  section_market_breadth_primary_action: "主線：用三大指數廣度與 Stockbee 交叉判讀，不做單一來源結論。",
  section_market_breadth_condition_action: "條件：NDX >20MA 維持 50% 上方，且 Stockbee 5D／10D ratio 同高於 1。",
  section_market_breadth_avoid_action: "避免：忽略指數成分廣度改善與極端個股分布偏空的分歧。",
  breadth_invalidation: "若 FOMC 後上漲家數領先、QQQ 轉正且設備鏈收窄跌幅，廣度防守可下調。",
  fx_commodities_table: `<div class="macro-policy-overview"><div><span>DXY</span><strong>約 101.49</strong><small>7/28 近五週高位，低於 102 觸發線</small></div>` +
    `<div><span>原油代理</span><strong class="up">USO ${signed(move("USO"))}</strong><small>已收回週度 -1SD 125.57</small></div>` +
    `<div><span>長債代理</span><strong class="${moveClass(move("TLT"))}">TLT ${signed(move("TLT"))}</strong><small>FOMC 前偏弱</small></div></div>` +
    `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">7/28 收盤</th><th class="num">1日</th><th class="num">1月</th><th class="num">盤前</th><th>對美股含義</th></tr></thead><tbody>${macroAssetRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>DXY 仍在報告內：7/28 約 101.49、接近五週高位但低於 102；USO 盤前急升重新帶回通膨尾端風險，TLT 未提供明顯緩衝。</p>`,
  section_fx_commodities_primary_action: "主線：DXY、TLT、USO 與貴金屬共同判斷 FOMC 的跨市場反應。",
  section_fx_commodities_condition_action: "條件：DXY 回落、TLT 站回 84.25、QQQ 收回 VWAP，才降低科技對沖。",
  section_fx_commodities_avoid_action: "避免：只看股指期貨，忽略美元、長債與原油對政策訊號的驗證。",
  forex_commodity_invalidation: "若 DXY 升破 102 或 TLT 跌破 83.75，政策緩和假設失效。",
  treasury_fed_economic_data_table: `<div class="macro-policy-overview"><div><span>CME 維持</span><strong>64.6%</strong><small>前日 69.0%／前週 72.3%</small></div>` +
    `<div><span>CME 升息</span><strong class="dn">35.4%</strong><small>前日 31.0%／前週 27.7%</small></div>` +
    `<div><span>時間</span><strong>14:00／14:30 ET</strong><small>聲明／Warsh 記者會</small></div></div>` +
    `${fedWatchTable}<div class="table-scroll"><table class="rates-monitor-table report-data-table report-cols-5"><thead><tr><th>利率／政策觀察</th><th class="num">Actual／最新</th><th class="num">Forecast／門檻</th><th>狀態</th><th>對美股含義</th></tr></thead><tbody>${ratesRows}</tbody></table></div>` +
    `${fomcScenarios}<div class="callout warn"><strong>關鍵：</strong>本次沒有新的經濟預測摘要（SEP）；因此 14:00 聲明文字與 14:30 Warsh 回答的邊際變化，比單看利率結果更重要。盤後 MSFT／META 會形成第三段波動。</div>`,
  section_treasury_fed_primary_action: "主線：14:00 不追第一段，14:30 後用 TLT／DXY／QQQ 三者同向確認。",
  section_treasury_fed_condition_action: "條件：TLT 站回 84.25、DXY 回落、QQQ 收回 VWAP，三項至少兩項成立才提高核心科技。",
  section_treasury_fed_avoid_action: "避免：把 64.6% 維持機率理解為 64.6% 利多；市場真正交易的是政策路徑與措辭。",
  treasury_invalidation: "若 TLT 跌破 83.75、DXY 升破 102 或 QQQ 跌破 661.66（週度 -1SD），偏鴿交易失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">20MA</th><th class="num">50MA</th><th>狀態</th><th>行動</th></tr></thead><tbody>${tradeRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>FOMC 前指數近乎平盤，USO 是最強事件資產；QQQ／SMH／XLK 技術仍弱，TLT 是政策反應的首要代理。</p>` +
    `<div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>保留事件現金，能源相對強、科技設備鏈低於基準。</li>` +
    `<li class="ad-secondary"><strong>次線：</strong>HUM／BSX 財報強只做開盤確認；Visa Beat 但股價弱，不反向合理化。</li>` +
    `<li class="ad-watch"><strong>觀察：</strong>14:00 決議、14:30 記者會、TLT 84.25／83.75、DXY 102、QQQ／SMH VWAP。</li>` +
    `<li class="ad-avoid"><strong>避免：</strong>在聲明與記者會之間擴大無保護科技 beta。</li>` +
    `<li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：政策偏鴿且 QQQ／SMH 收回 VWAP，能源升幅同時收窄。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "USO 守 VWAP，XOM／COP／CVX 同步強", interpretation: "油價反彈獲現貨成交確認", action: "保留能源相對多，但不擴大總 beta。" },
    { time_slot: "09:30 ORB", trigger_event: "KLAC／AMAT／LRCX 至少兩檔收回 VWAP", interpretation: "設備鏈開始止跌", action: "降低追空，仍等待 FOMC。" },
    { time_slot: "14:00 聲明", trigger_event: "維持利率，但措辭保留升息選項", interpretation: "偏鷹維持，不是利多", action: "看 DXY／TLT 確認，科技維持低配。" },
    { time_slot: "14:00 聲明", trigger_event: "升息 25bp 至 3.75%–4.00%", interpretation: "35.4% 尾端情境落地", action: "降低高 beta 約 1/3，保留對沖。" },
    { time_slot: "14:30 記者會", trigger_event: "Warsh 淡化後續升息、TLT 轉強", interpretation: "一次性升息／偏鴿路徑", action: "QQQ 收回 VWAP 後才逐步回補。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ／SMH 仍低於 VWAP", interpretation: "政策後風險未修復", action: "降低隔夜 beta，保留 MSFT／META 事件現金。" },
  ],
  cross_validation_summary: `<div class="callout risk"><strong>政策定價：</strong>CME 維持 64.6%、升息 35.4%；升息機率較前一日與前一週都上升。</div>` +
    `<div class="callout warn"><strong>價格交叉：</strong>SPY ${signed(move("SPY"))}、QQQ ${signed(move("QQQ"))}；USO ${signed(move("USO"))}、SMH ${signed(move("SMH"))}、TLT ${signed(move("TLT"))}。</div>` +
    `<div class="callout"><strong>廣度交叉：</strong>三大指數 20／50MA 廣度改善，但 Stockbee 5D／10D ratio 仍低於 1；結論是結構修復、短線分化。</div>` +
    `<h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-07-29 08:51 ET 盤前價格與成交量、截至 2026-07-28 的 RSI／MA／ATR；` +
    `<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard／Thematic Sectors／Macro、Market Breath、Weekly Expected Move</a>；` +
    `<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee Market Monitor 2026</a>；` +
    `<a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html">CME FedWatch：方法與官方工具</a>；` +
    `<a href="https://www.investing.com/central-banks/fed-rate-monitor?entry=header_strip">CME FedWatch 機率快照：2026-07-29 08:05 ET</a>；` +
    `<a href="https://www.federalreserve.gov/newsevents/2026-july.htm">Federal Reserve：7/28–7/29 FOMC 與 14:00／14:30 時程</a>；` +
    `<a href="https://www.kiplinger.com/investing/economy/this-weeks-economic-calendar">Kiplinger：FOMC 預覽與本次無 SEP</a>；` +
    `<a href="https://humana.gcs-web.com/news-releases/news-release-details/humana-reports-second-quarter-2026-financial-results-affirms">Humana：Q2 2026 財報</a>；` +
    `<a href="https://news.bostonscientific.com/2026-07-29-Boston-Scientific-announces-results-for-second-quarter-2026">Boston Scientific：Q2 2026 財報</a>；` +
    `<a href="https://visa.gcs-web.com/news-releases/news-release-details/visa-announce-fiscal-third-quarter-2026-financial-results-july">Visa：Q3 2026 財報活動</a>；` +
    `<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">Kiplinger：MSFT 共識預期</a>；` +
    `<a href="https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-to-Announce-Second-Quarter-2026-Results/default.aspx">Meta：Q2 2026 財報時間</a>；` +
    `<a href="https://ca.marketscreener.com/news/dollar-holds-near-recent-high-as-markets-await-fed-decision-ce7f51ddde81f325">Reuters：7/28 DXY 與 FOMC 會前美元</a>。</p>` +
    `<p class="source-note">本報告為 2026-07-29 美股盤前更新，不構成投資建議。所有待公布 Actual 均明確標示，未預先判定 Beat／Miss。</p>`,
};

const output = path.join(root, "data", "2026-07-29-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
console.log(JSON.stringify({
  movers: moverSpecs.length,
  sectorRows: sectorRows.length,
  thematicRows: thematicRows.length,
  majorRows: majorRows.length,
  riskScore: "5/8",
  vixScore: "3/5",
  fedWatch: "64.6%／35.4%",
}, null, 2));
