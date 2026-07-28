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
  return [
    ["20", row.above20],
    ["50", row.above50],
    ["200", row.above200],
  ].map(([period, isUp]) => {
    const stateClass = isUp ? "ma-up" : "ma-down";
    const arrow = isUp ? "▲" : "▼";
    return `<span class="ma-state ${stateClass}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${arrow}</span></span>`;
  }).join("");
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

const base = readJson(path.join(root, "data", "2026-07-27-premarket.json"));
const snapshot = readJson(path.join(work, "postmarket_snapshot_2026-07-27.json"));
const thematicSnapshot = readJson(path.join(work, "thematic_rsi_longport.json"));
const macroSnapshot = readJson(path.join(work, "macro_rsi_longport.json"));
const quotes = readJson(path.join(work, "premarket_quotes_0728.json"));
const scan = readJson(path.join(work, "premarket_movers_0728.json"));

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
const thematicRows = [
  ...thematicTickers.map((ticker) => thematic.get(ticker)).filter(Boolean),
  technical.get("SPY"),
].filter(Boolean);

if (sectorRows.length !== 12) throw new Error(`Sector Dashboard 應有 12 檔，實際 ${sectorRows.length}`);
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.ticker === "SPY").length !== 1) {
  throw new Error(`Thematic Sectors 應完整讀入 44 檔並加入一筆 SPY，實際 ${thematicRows.length}`);
}
if (![...sectorRows, ...thematicRows].every((row) => row.asOf === "2026-07-27")) {
  throw new Error("ETF 技術資料不是 2026-07-27 完整日線");
}

const moverSpecs = [
  ["KO", "財報 EPS 0.97、營收 13.38B，雙雙高於預期並上調全年指引。", "防禦消費與道指相對承接。", "開盤守住 VWAP 才保留財報溢價。"],
  ["NOW", "軟體權重反彈，未見同級公司特定新催化。", "軟體內部仍分化。", "只作相對強勢，不外推成整個軟體翻多。"],
  ["WMT", "防禦零售獲資金承接。", "低 beta 風格優於晶片。", "若跌回昨收，防禦輪動訊號失效。"],
  ["JNJ", "醫療防禦股盤前走強。", "XLV 可望提供指數緩衝。", "成交擴大且守 VWAP 才視為板塊訊號。"],
  ["CRM", "企業軟體反彈，無單一已確認公司催化。", "軟體 beta 有承接但弱於防禦。", "仍以昨收與 VWAP 為界。"],
  ["SNDK", "CXMT 上市與亞洲記憶體股急跌，引發供給競爭擔憂。", "記憶體鏈是今日最弱核心。", "未收回 VWAP 前不抄底。"],
  ["MU", "亞洲記憶體股重挫，競爭與估值壓力同步升高。", "記憶體壓力向美股半導體擴散。", "若跌幅仍大於 SMH，維持低配。"],
  ["INTC", "中國晶片供給與亞洲科技賣壓外溢。", "晶圓製造與設備鏈同步承壓。", "成交量最大，先等 ORB 止跌。"],
  ["ARM", "AI／晶片估值壓縮，亞洲半導體賣壓外溢。", "高估值晶片 beta 率先去風險。", "不在開盤前追空，等反抽失敗。"],
  ["MRVL", "AI 晶片鏈隨 SMH 下挫。", "網通與客製晶片未能隔離。", "站回 VWAP 才撤銷弱勢判斷。"],
  ["AMD", "晶片板塊系統性賣壓。", "AI 加速器風險溢價擴大。", "若跌破週度 -1SD 472.55，減碼。"],
  ["AMAT", "設備鏈受中國本土 DUV 量產消息壓制。", "半導體設備同步轉弱。", "需與 LRCX／KLAC 同步止跌。"],
  ["LRCX", "設備鏈跟隨亞洲晶片急跌。", "設備股未提供防禦。", "未收回 VWAP 前維持觀望。"],
  ["PLTR", "高 beta AI 軟體隨風險偏好降溫。", "賣壓已由晶片擴散至 AI 軟體。", "126 附近失守則提高對沖。"],
  ["TSM", "亞洲半導體急跌與中國競爭敘事衝擊。", "晶圓代工也未能免疫。", "若開盤守住盤前低點，才觀察修復。"],
  ["AVGO", "晶片與 AI 基建權重同步回落。", "大型權重拖累 QQQ。", "未收回 VWAP 前不提高科技 beta。"],
].map(([ticker, catalyst, readThrough, call]) => ({
  ticker,
  price: fixed(price(ticker), 3),
  premarket_change: signed(move(ticker)),
  catalyst: `${catalyst} 長橋盤前量 ${compactVolume(volume(ticker))}。`,
  read_through: readThrough,
  judgment: call,
}));

const checklist = `<div class="risk-check-grid">` +
  riskRow("low", "S&amp;P 500 overextension／標普過度延伸", `SPY 距 50MA ${fixed(technical.get("SPY").extension50Atr)} ATR`, "未處於向上過度延伸，風險不來自追高。") +
  riskRow("high", "Increasing downward momentum／下行動能增加", `QQQ 5日 ${signed(technical.get("QQQ").fiveDayPct)}；盤前 ${signed(move("QQQ"))}`, "半導體與記憶體同步加速下跌。") +
  riskRow("high", "Top range breakdown／高位區間破位", `QQQ、SMH 低於 20／50MA`, "反彈尚未收復主要均線。") +
  riskRow("high", "Technical deterioration／技術惡化", "四大 ETF 技術惡化 10/16", "SPY／QQQ 低於 20／50MA；IWM／DIA 低於 20MA。") +
  riskRow("high", "Market breadth worsening／市場廣度惡化", "NDX >20MA 32.03%", "三大指數廣度截至 7/24；科技仍是最弱環。") +
  riskRow("mid", "VIX &gt;20／波動升溫", "VIX 波動分數 3/5", ">20 0/1、5日>0 1/1、1月>0 0/1、20MA 1/1、50MA 1/1。") +
  riskRow("high", "Breakout win rate down／突破勝率下降", "Stockbee 10D ratio 0.90", "短線 5D ratio 回到 1.05，但中短線仍未完全翻多。") +
  riskRow("high", "Theme momentum weakening／主題動能轉弱", `SMH 1月 ${signed(technical.get("SMH").oneMonthPct)}`, "記憶體、設備、AI 軟體盤前同步承壓。") +
  `</div><div class="callout risk"><strong>Checklist Score：6/8 High＝High Risk。</strong>風險集中在科技技術、廣度與主題動能，不是 VIX 單一門檻機械判定。</div>`;

const macroRows = [
  macroRow("S&amp;P Case-Shiller 20城房價 YoY", "09:00 ET", "待公布", "+1.2%", "+1.1%", "待公布", "blue", "高於預期會限制寬鬆想像。", "先看 DXY 與長端殖利率反應。", true),
  macroRow("美國消費者信心", "10:00 ET", "待公布", "92.65", "91.2", "待公布", "blue", "強於預期偏利率上行；弱於預期偏成長降溫。", "需要與 TLT／QQQ 同向確認。", true),
  macroRow("Richmond Fed 製造業指數", "10:00 ET", "待公布", "6", "4", "待公布", "blue", "正值維持擴張訊號。", "若明顯 Miss，週四 GDP 前景轉弱。", true),
  macroRow("KO 財報", "盤前已公布", "EPS 0.97<br>營收 13.38B", "EPS 0.93<br>營收 13.16B", "EPS 0.87<br>營收 12.54B", "Beat／Beat", "green", "全年指引上調，防禦消費基本面改善。", `KO 盤前 ${signed(move("KO"))}，但仍需開盤成交確認。`, false, true),
  macroRow("UPS 財報", "盤前已公布", "EPS 1.76<br>營收 22.80B", "EPS 1.66<br>營收 21.84B", "EPS 1.55<br>營收 21.22B", "Beat／Beat", "green", "全年營收與調整後 EPS 指引上調。", "物流需求訊號改善，但長橋掃描未取得有效盤前成交。", false, true),
  macroRow("BA 財報", "盤前已公布", "EPS -0.76<br>營收 24.56B", "EPS -0.28<br>營收 24.26B", "EPS -1.24<br>營收 22.75B", "Mixed", "amber", "營收高於預期，但核心虧損大於預期。", `BA 盤前 ${signed(move("BA"))}，市場先交易交付與現金流改善。`, false, true),
  macroRow("V 財報", "盤後", "待公布", "EPS 3.23<br>營收 11.38B", "EPS 2.98<br>營收 10.17B", "待公布", "blue", "支付量與跨境交易是主要觀察。", "盤後事件，日內不預先標示 Beat／Miss。", true, true),
].join("");

const macroTable = `<div class="table-scroll"><table class="macro-policy-table report-data-table report-cols-5"><thead><tr>` +
  `<th>宏觀／財報事件</th><th>Actual／Forecast／Previous</th><th>訊號</th><th>政策／利率判讀</th><th>市場含義</th></tr></thead><tbody>${macroRows}</tbody></table></div>`;

const expectedSpecs = [
  ["SPY", 724.53, 753.33],
  ["QQQ", 661.66, 706.80],
  ["IWM", 283.91, 298.43],
  ["DIA", 509.91, 527.61],
  ["XLK", 168.76, 183.01],
  ["SMH", 518.82, 603.56],
  ["USO", 125.57, 146.87],
  ["TLT", 82.25, 84.25],
  ["NVDA", 196.58, 214.22],
  ["NOW", 84.37, 105.51],
  ["CRM", 154.83, 172.37],
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
  `<th>ETF</th><th class="num">昨收</th><th class="num">盤前</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td><strong>${row.ticker}</strong></td><td class="num">${fixed(row.close)}</td>` +
    `<td class="num ${moveClass(move(row.ticker))}">${fixed(price(row.ticker))}／${signed(move(row.ticker))}</td>` +
    `<td class="num ${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>` +
    `<td class="ma-cell">${maStates(row)}</td><td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td><td>${judgment(row)}</td></tr>`).join("") +
  `</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>DIA 盤前領先，QQQ 明顯落後；四大 ETF 不是同步 risk-off，但科技權重仍是主要拖累。</p>`;

const atrTable = `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">昨收</th>` +
  `<th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td>${row.ticker}</td><td class="num">${fixed(row.close)}</td><td class="num">${fixed(row.ma50)}</td>` +
    `<td class="num">${fixed(row.atr14)}</td><td class="num ${moveClass(row.extension50Atr)}">${row.extension50Atr > 0 ? "+" : ""}${fixed(row.extension50Atr)}</td>` +
    `<td>${row.extension50Atr <= -2 ? "低於 50MA 超過 2 ATR，等待止跌。" : row.extension50Atr < 0 ? "低於 50MA，尚未過度延伸。" : "高於 50MA，仍在正常區間。"}</td></tr>`).join("") +
  `</tbody></table></div>`;

const breadthTable = `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>近期變化</th><th>中期結構</th><th>綜合判斷</th></tr></thead><tbody>` +
  `<tr><td>SPX >20MA（7/24）</td><td class="num">55.06%</td><td>仍高於半數</td><td>SPX >50MA 65.20%</td><td>大盤中期底盤仍在，短線未擴散。</td></tr>` +
  `<tr><td>NDX >20MA（7/24）</td><td class="num dn">32.03%</td><td>低於四成</td><td>NDX >50MA 39.80%</td><td>科技是三大指數最弱環。</td></tr>` +
  `<tr><td>IWM >20MA（7/24）</td><td class="num dn">39.79%</td><td>短線參與不足</td><td>IWM >50MA 56.51%</td><td>小盤中期仍過半，短線需驗證。</td></tr>` +
  `<tr><td>T2108（Stockbee 7/27）</td><td class="num">53.38%</td><td>50.95% → 53.38%</td><td>回到中性上方</td><td>全市場長期廣度改善。</td></tr>` +
  `<tr><td>5D／10D ratio（7/27）</td><td class="num">1.05／0.90</td><td>5D 升破 1</td><td>10D 仍低於 1</td><td>短線改善，中短線尚未完全翻多。</td></tr>` +
  `<tr><td>4%+ 上漲／下跌（7/27）</td><td class="num up">380／195</td><td>單日明顯改善</td><td>季度 +25%／-25% 1186／1199</td><td>強勢擴散，但中期仍近乎平衡。</td></tr>` +
  `</tbody></table></div>`;

const macroAssets = ["EWJ", "EWY", "EWG", "FXI", "EWT", "XAU", "XAG", "COPPER", "CL", "BTC"];
const macroLabels = {
  EWJ: "EWJ（日本）", EWY: "EWY（韓國）", EWG: "EWG（德國）", FXI: "FXI（中國）", EWT: "EWT（台灣）",
  XAU: "GLD（黃金代理）", XAG: "SLV（白銀代理）", COPPER: "CPER（銅代理）", CL: "USO（原油代理）", BTC: "IBIT（比特幣代理）",
};
const macroAssetRows = macroAssets.map((key) => {
  const row = macro.get(key);
  const ticker = row.ticker;
  const preTicker = { XAU: "GLD", XAG: "SLV", COPPER: "CPER", CL: "USO", BTC: "IBIT" }[key];
  const pre = preTicker ? move(preTicker) : null;
  const meaning = key === "EWY" ? "韓國科技月線與今日現貨同步急跌，晶片風險核心。" :
    key === "CL" ? "油價續跌降低通膨壓力，但能源相對弱。" :
    key === "XAU" || key === "XAG" ? "貴金屬盤前回落，避險需求未全面升溫。" :
    key === "COPPER" ? "銅價回落，週期交易降溫。" :
    "用作跨市場風險確認，不單獨決定倉位。";
  return `<tr><td>${macroLabels[key]}</td><td class="num">${fixed(row.close)}</td><td class="num ${moveClass(row.dailyPct)}">${signed(row.dailyPct)}</td>` +
    `<td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td><td class="num ${moveClass(pre)}">${Number.isFinite(pre) ? signed(pre) : "無盤前成交"}</td><td>${meaning}</td></tr>`;
}).join("");

const ratesRows = [
  `<tr><td><strong>FOMC 利率決議</strong><small class="table-note">7/29 14:00 ET</small></td><td class="num" data-allow-missing>Actual 待公布</td><td class="num">Forecast 3.50%–3.75%</td><td><span class="badge amber">事件風險</span></td><td>會前不擴大無保護科技 beta。</td></tr>`,
  `<tr><td><strong>7年期美債標售</strong><small class="table-note">13:00 ET</small></td><td class="num" data-allow-missing>Actual 待公布</td><td class="num">Previous 4.260%</td><td><span class="badge amber">盤中驗證</span></td><td>需求弱且 TLT 轉跌，將放大科技估值壓力。</td></tr>`,
  `<tr><td><strong>TLT</strong></td><td class="num ${moveClass(move("TLT"))}">${fixed(price("TLT"))}／${signed(move("TLT"))}</td><td class="num">${fixed(technical.get("TLT").ma50)}（50MA）</td><td><span class="badge blue">低於50MA</span></td><td>盤前小升，但尚未形成長端技術修復。</td></tr>`,
  `<tr><td><strong>DXY</strong></td><td class="num">101.50</td><td class="num">102</td><td><span class="badge blue">門檻下方</span></td><td>接近一個月高位；升破 102 才觸發進一步減科技。</td></tr>`,
  `<tr><td><strong>美國10年期殖利率</strong></td><td class="num">4.65%（7/27 收盤）</td><td class="num">4.65%</td><td><span class="badge amber">壓力門檻</span></td><td>今日以 TLT 與 7年期標售作即時代理。</td></tr>`,
].join("");

const tradeTickers = ["IWM", "DIA", "SPY", "QQQ", "SMH", "XLK", "USO", "TLT"];
const tradeRows = tradeTickers.map((ticker) => {
  const row = technical.get(ticker);
  const current = price(ticker);
  const state = current >= row.ma20 ? "高於20MA" : current >= row.ma50 ? "介於20／50MA" : "低於20／50MA";
  const color = current >= row.ma20 ? "green" : current >= row.ma50 ? "amber" : "red";
  const action = ticker === "USO" ? "已低於週度 -1SD，不追空；收回 125.57 才撤銷破位。" :
    ticker === "QQQ" || ticker === "SMH" || ticker === "XLK" ? "未收回 VWAP 與 20MA 前低於基準。" :
    ticker === "TLT" ? "守 83.75 才保留利率緩衝。" : "以 VWAP 與盤前低點管理倉位。";
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
  report_title: "2026-07-28｜美股盤前監控",
  report_eyebrow: "2026-07-28｜盤前更新",
  report_heading: "晶片風險擴散拖累 QQQ，道指與防禦股承接",
  technical_as_of: "2026-07-27",
  vix_volatility_score: 3,
  vix_volatility_level: "Intermediate",
  vix_volatility_components: vixComponents,
  data_timestamp_note: "長橋盤前快照截至 08:19 ET；RSI／MA／ATR 截至 7/27 完整日線。Sector Dashboard、Thematic Sectors、Macro 為三個主資料表；三大指數廣度截至 7/24，Stockbee 截至 7/27。",
  risk_badge: "高風險｜Checklist 6/8、VIX 3/5",
  qqq_reengage_20ma: fixed(qqq.ma20),
  qqq_breakout_add_1sd: "706.80",
  summary_cards: `<div class="card"><span>SPY／QQQ 盤前</span><strong><span class="${moveClass(move("SPY"))}">${signed(move("SPY"))}</span>／<span class="${moveClass(move("QQQ"))}">${signed(move("QQQ"))}</span></strong><small>權重科技明顯落後。</small></div>` +
    `<div class="card"><span>DIA／IWM 盤前</span><strong><span class="${moveClass(move("DIA"))}">${signed(move("DIA"))}</span>／<span class="${moveClass(move("IWM"))}">${signed(move("IWM"))}</span></strong><small>道指承接，小盤接近平盤。</small></div>` +
    `<div class="card"><span>SMH／XLK</span><strong class="dn">${signed(move("SMH"))}／${signed(move("XLK"))}</strong><small>晶片跌幅高於大盤科技。</small></div>` +
    `<div class="card"><span>DXY／VIX 分數</span><strong>DXY 101.50／VIX 3／5</strong><small>美元近月高；波動為 Intermediate。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才由高風險降為中性：科技止跌、廣度擴散、利率條件改善。",
  upgrade_trigger_1: `QQQ 收回盤前 VWAP 且收盤站回 ${fixed(qqq.ma20)}（20MA）。`,
  upgrade_trigger_2: `SMH 收回盤前 VWAP，且 SNDK／MU／INTC 至少兩檔收窄至 -3% 內。`,
  upgrade_trigger_3: "上漲家數領先，TLT 守 83.75，DXY 維持 102 下方。",
  downgrade_trigger_rule: "任一觸發即維持／加強防守：晶片破位、美元利率上行、廣度不擴散。",
  downgrade_trigger_1: "QQQ 跌破 672，SMH 跌破 518.82（週度 -1SD）。",
  downgrade_trigger_2: "AMD 跌破 472.55（週度 -1SD），NVDA 跌破 196.58 後無法收回。",
  downgrade_trigger_3: "DXY 升破 102、TLT 跌破 83.75，或 VIX 升破 20。",
  core_conclusions: `<ol><li><strong>今天不是全面同步下跌，而是明確的科技／晶片去風險。</strong>SPY ${signed(move("SPY"))}、QQQ ${signed(move("QQQ"))}、DIA ${signed(move("DIA"))}、IWM ${signed(move("IWM"))}；DIA 領先而 QQQ 落後。</li>` +
    `<li><strong>記憶體與設備鏈是壓力核心。</strong>SNDK ${signed(move("SNDK"))}、MU ${signed(move("MU"))}、INTC ${signed(move("INTC"))}、SMH ${signed(move("SMH"))}；CXMT 上市、亞洲晶片股重挫與中國 DUV 量產敘事共同壓低估值。</li>` +
    `<li><strong>防禦股與財報提供局部承接。</strong>KO EPS／營收 Beat 並上調指引，盤前 ${signed(move("KO"))}；WMT、JNJ 與 DIA 亦相對強。</li>` +
    `<li><strong>技術面仍支持防守。</strong>QQQ 7/27 收盤低於 20／50MA，距 50MA ${fixed(qqq.extension50Atr)} ATR；SMH 1月 ${signed(smh.oneMonthPct)}，盤前再跌 ${signed(move("SMH"))}。</li>` +
    `<li><strong>廣度呈現「全市場短線改善、科技持續偏弱」。</strong>Stockbee 5D ratio 回到 1.05、4%+ 上漲／下跌 380／195；但 NDX >20／50MA 只有 32.03%／39.80%（7/24，來源尚未更新）。</li>` +
    `<li><strong>今日事件密集。</strong>10:00 ET 消費者信心與 Richmond Fed、13:00 ET 7年期標售；Visa 盤後，FOMC 決議在明日 14:00 ET。</li></ol>` +
    `<p class="section-summary"><strong>本段結論：</strong>先把今日視為晶片風險擴散與防禦輪動，而不是全市場崩跌；QQQ／SMH 未收回 VWAP 前，科技 beta 維持低於基準。</p>`,
  positioning_primary: "主線：DIA／防禦股相對強，QQQ／SMH／記憶體低於基準。",
  positioning_secondary: "次線：KO 財報強、BA／UPS 基本面混合偏正；只交易開盤後確認的相對強勢。",
  positioning_watch: `觀察：QQQ ${fixed(qqq.ma20)}（20MA）、SMH ${fixed(smh.ma20)}（20MA）、AMD 472.55、NVDA 196.58、DXY 102、VIX 20。`,
  positioning_invalidation: "若 QQQ／SMH 收回 VWAP、記憶體跌幅收窄，且上漲家數領先，晶片風險擴散主線失效。",
  pre_market_movers: moverSpecs,
  pre_market_movers_note: `<p class="section-summary"><strong>本段結論：</strong>異動高度集中在晶片下跌與防禦股承接，具板塊共因；以長橋盤前成交量和開盤 VWAP 再驗證。</p>`,
  section_pre_market_movers_primary_action: "主線：晶片不抄底，防禦股不追高；先等 09:30 ORB。",
  section_pre_market_movers_condition_action: "條件：SNDK／MU／INTC 至少兩檔收回 VWAP，才降低晶片對沖。",
  section_pre_market_movers_avoid_action: "避免：把所有個股異動都歸因於公司消息；今日多數是板塊共振。",
  premarket_movers_invalidation: "若 SMH 收回 VWAP、QQQ 轉正且晶片跌幅普遍收窄至 -2% 內，弱勢判斷失效。",
  correction_checklist_dashboard: checklist,
  section_correction_checklist_primary_action: "主線：6/8 High，總 beta 維持低於基準。",
  section_correction_checklist_condition_action: "條件：High 項降至 2 項以下，才把風險降為 Low。",
  section_correction_checklist_avoid_action: "避免：只用 VIX 是否高於 20 做機械性判定。",
  checklist_invalidation: "若 QQQ／SMH 收回 20MA、NDX 廣度回到 50%，Checklist 才可明顯降級。",
  macro_premarket_background_table: `${macroTable}<p class="section-summary"><strong>本段結論：</strong>已公布財報以 KO／UPS 偏正、BA 混合；宏觀 Actual 尚未公布，必須等待 09:00／10:00 ET 後更新，不能預判 Beat／Miss。</p>${expectedTable}`,
  section_macro_premarket_background_primary_action: "主線：宏觀 Actual 公布後同看 TLT、DXY、QQQ，不用單一數字交易。",
  section_macro_premarket_background_condition_action: "條件：數據溫和、TLT 守漲且 QQQ 收回 VWAP，才提高成長曝險。",
  section_macro_premarket_background_avoid_action: "避免：把財報 EPS Beat 與股價反應混為同一件事。",
  macro_invalidation: "若 Actual 強於預期但 TLT 不跌，或 Actual 弱於預期但 QQQ 不漲，立即服從價格而非敘事。",
  sector_momentum_chart: momentumChart(thematicRows),
  sector_thematic_etf_tables: `${etfTable("S&amp;P 500 Sector ETF", sectorRows)}${etfTable(
    "Thematic Sector ETF（含 SPY 基準）",
    thematicRows,
    'data-etf-universe="thematic-complete" data-source-count="44" data-report-count="45" data-benchmark="SPY" data-sort="rsi-desc"'
  )}` +
    `<p class="section-summary"><strong>本段結論：</strong>完整讀入 Thematic Sectors 的 44 檔 ETF，再加入 SPY 基準，共 45 檔按 RSI 由高至低排列；今日盤前則由 SMH／AIQ 等科技主題主導下跌。</p>`,
  section_sector_thematic_etf_primary_action: "主線：用 RSI 排序看相對結構，但以盤前價格判斷今日方向。",
  section_sector_thematic_etf_condition_action: "條件：SMH／XLK 收回 VWAP 與 20MA，才把跌深修復升級為輪動。",
  section_sector_thematic_etf_avoid_action: "避免：用單日盤前漲跌覆蓋 7/27 完整日線 RSI／MA。",
  sector_etf_invalidation: "若 SPY 轉弱而防禦板塊同步失守 VWAP，風格輪動判斷失效。",
  major_etf_technical_table: majorTable,
  section_major_etf_technical_primary_action: "主線：四大 ETF 只看 IWM／DIA／SPY／QQQ；DIA 相對強、QQQ 最弱。",
  section_major_etf_technical_condition_action: `條件：QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SPY 收回 ${fixed(spy.ma20)}（20MA）再提高指數倉位。`,
  section_major_etf_technical_avoid_action: "避免：加入 VOO／RSP／QQQE 稀釋四大指數判斷。",
  major_etf_invalidation: "若 QQQ 轉正並收回 VWAP、DIA 轉負，早盤風格分化判斷失效。",
  fifty_ma_atr_extension_table: atrTable,
  section_50ma_atr_extension_primary_action: "主線：QQQ 距 50MA -2.45 ATR，等止跌而不是直接抄底。",
  section_50ma_atr_extension_condition_action: "條件：QQQ 回到 -2 ATR 內且 RSI 回升，再降低技術防守。",
  section_50ma_atr_extension_avoid_action: "避免：把負 ATR 延伸直接等同超賣買點。",
  atr_extension_invalidation: "若 SPY／QQQ 同收回 50MA，ATR 防守訊號失效。",
  market_breadth_table: breadthTable,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>綜合廣度：</strong>三大指數廣度（SPX／NDX／IWM）來源最新只到 7/24；Stockbee 已到 7/27。全市場短線改善，但 NDX 20／50MA 廣度仍低於四成，不能只用 Stockbee 宣告全面 risk-on。</div>` +
    `<p class="section-summary"><strong>小結：</strong>SPX 中期底盤、IWM 中期廣度尚在，NDX 明顯偏弱；今天的晶片賣壓需要開盤後成分股廣度再確認。</p>`,
  section_market_breadth_primary_action: "主線：用三大指數廣度與 Stockbee 交叉判讀，科技維持低配。",
  section_market_breadth_condition_action: "條件：NDX >20MA 回到 50%，且 Stockbee 5D／10D ratio 同高於 1。",
  section_market_breadth_avoid_action: "避免：忽略三大指數廣度的 7/24 時點限制。",
  breadth_invalidation: "若今日上漲家數領先、QQQ 轉正且晶片收窄跌幅，廣度防守可下調。",
  fx_commodities_table: `<div class="macro-policy-overview"><div><span>DXY</span><strong>101.50</strong><small>接近一個月高，低於 102 觸發線</small></div>` +
    `<div><span>原油代理</span><strong class="dn">USO ${signed(move("USO"))}</strong><small>7/27 已跌 8.73%</small></div>` +
    `<div><span>韓國科技</span><strong class="dn">EWY 1月 ${signed(macro.get("EWY").oneMonthPct)}</strong><small>今日現貨市場再重挫</small></div></div>` +
    `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">7/27 收盤</th><th class="num">1日</th><th class="num">1月</th><th class="num">盤前</th><th>對美股含義</th></tr></thead><tbody>${macroAssetRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>DXY 沒有消失：目前約 101.50、仍低於 102 觸發線；美元偏強與韓國科技急跌共同壓制成長股，油價下跌則緩和通膨但不抵消晶片壓力。</p>`,
  section_fx_commodities_primary_action: "主線：DXY、EWY／EWT、USO 與貴金屬共同判斷跨市場風險。",
  section_fx_commodities_condition_action: "條件：DXY 低於 101.5、EWY 止跌、QQQ 收回 VWAP，才降低科技對沖。",
  section_fx_commodities_avoid_action: "避免：用長橋沒有 DXY 靜態列作為刪除外匯段落的理由。",
  forex_commodity_invalidation: "若 DXY 升破 102 或 EWY／EWT 續創低，風險緩和假設失效。",
  treasury_fed_economic_data_table: `<div class="macro-policy-overview"><div><span>FOMC</span><strong>7/29 14:00 ET</strong><small>Forecast 3.50%–3.75%</small></div>` +
    `<div><span>7年期標售</span><strong>今日 13:00 ET</strong><small>規模 440 億美元</small></div>` +
    `<div><span>TLT 盤前</span><strong class="${moveClass(move("TLT"))}">${signed(move("TLT"))}</strong><small>尚低於 50MA</small></div></div>` +
    `<div class="table-scroll"><table class="rates-monitor-table report-data-table report-cols-5"><thead><tr><th>利率／政策觀察</th><th class="num">Actual／最新</th><th class="num">Forecast／門檻</th><th>狀態</th><th>對美股含義</th></tr></thead><tbody>${ratesRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>這一段只處理美債、Fed 與 DXY，不重複宏觀數據表；今日關鍵是 7年期標售能否讓 TLT 守住盤前反彈。</p>`,
  section_treasury_fed_primary_action: "主線：13:00 ET 前保留事件現金，TLT／DXY 是科技估值的即時門檻。",
  section_treasury_fed_condition_action: `條件：TLT 站回 ${fixed(technical.get("TLT").ma50)}（50MA）、DXY 低於 101.5，再提高核心科技。`,
  section_treasury_fed_avoid_action: "避免：FOMC 前以單次盤前報價推導完整政策路徑。",
  treasury_invalidation: "若 7年期標售需求弱、TLT 跌破 83.75 或 DXY 升破 102，利率緩衝失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">20MA</th><th class="num">50MA</th><th>狀態</th><th>行動</th></tr></thead><tbody>${tradeRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>DIA 提供風格緩衝，QQQ／SMH／XLK 仍是弱環；USO 已低於週度 -1SD，能源不追空。</p>` +
    `<div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>DIA／防禦相對強，科技低於基準。</li>` +
    `<li class="ad-secondary"><strong>次線：</strong>KO 財報強只做開盤確認；BA／UPS 不用財報標題追價。</li>` +
    `<li class="ad-watch"><strong>觀察：</strong>10:00 消費者信心、13:00 7年期標售、QQQ／SMH VWAP、DXY 102。</li>` +
    `<li class="ad-avoid"><strong>避免：</strong>FOMC 前擴大無保護隔夜科技 beta。</li>` +
    `<li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：QQQ／SMH 收回 VWAP且晶片跌幅普遍收窄。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "QQQ／SMH 低開後無法收回 VWAP", interpretation: "晶片賣壓獲開盤成交確認", action: "維持科技低配，對沖 QQQ／SMH。" },
    { time_slot: "09:30 ORB", trigger_event: "SNDK／MU／INTC 至少兩檔收回 VWAP", interpretation: "最弱鏈條開始止跌", action: "降低追空，仍不立即轉多。" },
    { time_slot: "10:00 數據", trigger_event: "信心／Richmond 低於預期、TLT 上漲", interpretation: "成長降溫被解讀為利率利多", action: "只回補核心 SPY／QQQ，不追高 beta。" },
    { time_slot: "10:00 數據", trigger_event: "數據強、DXY 升向 102、TLT 轉跌", interpretation: "金融條件重新收緊", action: "降低長久期科技，保留 DIA／防禦。" },
    { time_slot: "13:00 7年期標售", trigger_event: "需求佳、TLT 守 83.75", interpretation: "長端供給壓力可控", action: "科技倉位由低配調至接近中性。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ／SMH 仍低於 VWAP", interpretation: "FOMC 前風險未修復", action: "降低隔夜 beta，保留 Visa 事件現金。" },
  ],
  cross_validation_summary: `<div class="callout risk"><strong>長橋盤前：</strong>QQQ ${signed(move("QQQ"))}、SMH ${signed(move("SMH"))}、SNDK ${signed(move("SNDK"))}、MU ${signed(move("MU"))}；DIA ${signed(move("DIA"))}、KO ${signed(move("KO"))}。</div>` +
    `<div class="callout warn"><strong>廣度交叉：</strong>Stockbee 7/27 已改善，但三大指數廣度最新只到 7/24；NDX >20／50MA 仍只有 32.03%／39.80%。</div>` +
    `<div class="callout"><strong>主導結論：</strong>晶片風險擴散、道指與防禦承接。除非 QQQ／SMH 收回 VWAP且晶片跌幅明顯收窄，否則高風險定位不變。</div>` +
    `<h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-07-28 08:19 ET 盤前價格與成交量、截至 2026-07-27 的 RSI／MA／ATR；` +
    `<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard／Thematic Sectors／Macro、Market Breath、Weekly Expected Move</a>；` +
    `<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee Market Monitor 2026</a>；` +
    `<a href="https://apnews.com/article/stock-markets-ai-chips-oil-a880057323bd065c325ad19b23de0cf3">AP：亞洲晶片股、CXMT 與美股期貨</a>；` +
    `<a href="https://investors.ups.com/news-events/press-releases/detail/2164/ups-releases-2q-2026-earnings">UPS：2026 Q2 財報</a>；` +
    `<a href="https://investors.coca-colacompany.com/news-events/press-releases/detail/1163/the-coca-cola-company-announces-timing-of-second-quarter-2026-earnings-release">Coca-Cola：Q2 財報活動</a>；` +
    `<a href="https://visa.gcs-web.com/news-releases/news-release-details/visa-announce-fiscal-third-quarter-2026-financial-results-july">Visa：財報時間</a>；` +
    `<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Federal Reserve：FOMC 日曆</a>；` +
    `<a href="https://home.treasury.gov/system/files/221/Tentative-Auction-Schedule.pdf">U.S. Treasury：標售時程</a>；` +
    `<a href="https://www.investing.com/news/economy-news/dollar-hits-onemonth-high-on-lingering-chances-of-fed-hike-4815347">Reuters：DXY 與 Fed 會前市場</a>。</p>` +
    `<p class="source-note">本報告為 2026-07-28 美股盤前本地草稿，不構成投資建議。所有待公布 Actual 均明確標示，未預先判定 Beat／Miss。</p>`,
};

const output = path.join(root, "data", "2026-07-28-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
console.log(JSON.stringify({
  movers: moverSpecs.length,
  sectorRows: sectorRows.length,
  thematicRows: thematicRows.length,
  majorRows: majorRows.length,
  riskScore: "6/8",
  vixScore: "3/5",
}, null, 2));
