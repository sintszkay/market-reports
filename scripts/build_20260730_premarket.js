"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.resolve(root, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const fixed = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "待更新";
const signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(digits)}%` : "待更新";
const moveClass = (value) => value > 0 ? "up" : value < 0 ? "dn" : "";

function compactVolume(value) {
  if (!Number.isFinite(value)) return "待更新";
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}億股`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}萬股`;
  return `${Math.round(value).toLocaleString("en-US")}股`;
}

function normalize(row) {
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

const mapRows = (rows) => new Map(rows.map((row) => [row.ticker || row.key, row]));

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
  const zero = maxNegative / total * 100;
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

const base = readJson(path.join(root, "data", "2026-07-29-premarket.json"));
const snapshot = readJson(path.join(work, "postmarket_snapshot_2026-07-29.json"));
const thematicSnapshot = readJson(path.join(work, "thematic_rsi_longport.json"));
const macroSnapshot = readJson(path.join(work, "macro_rsi_longport.json"));
const quotes = readJson(path.join(work, "premarket_quotes_0730.json"));
const scan = readJson(path.join(work, "premarket_movers_0730.json"));

const technical = mapRows(snapshot.rows.map(normalize));
const thematic = mapRows(thematicSnapshot.rows.map(normalize));
const macro = mapRows(macroSnapshot.rows.map(normalize));
const quoteMap = mapRows([...scan, ...quotes]);
const q = (ticker) => quoteMap.get(ticker);
const price = (ticker) => n(q(ticker)?.price);
const move = (ticker) => n(q(ticker)?.changePct);
const volume = (ticker) => n(q(ticker)?.volume);

const sectorTickers = ["XLE", "XLV", "XLF", "XLRE", "XLU", "XLP", "XLI", "XLC", "XLB", "XLY", "XLK", "SPY"];
const sectorRows = sectorTickers.map((ticker) => technical.get(ticker)).filter(Boolean);
const thematicTickers = thematicSnapshot.rows.map((row) => row.ticker).filter((ticker) => ticker !== "SPY");
const thematicRows = [...thematicTickers.map((ticker) => thematic.get(ticker)).filter(Boolean), technical.get("SPY")].filter(Boolean);
const allTechnicalRows = [...sectorRows, ...thematicRows];

if (sectorRows.length !== 12) throw new Error(`Sector Dashboard 應有 12 檔，實際 ${sectorRows.length}`);
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.ticker === "SPY").length !== 1) {
  throw new Error(`Thematic Sectors 應完整讀入 44 檔並加入一筆 SPY，實際 ${thematicRows.length}`);
}
if (!allTechnicalRows.every((row) => row.asOf === "2026-07-29")) {
  throw new Error("ETF 技術資料不是 2026-07-29 完整日線");
}

const moverNotes = {
  LRCX: ["昨日設備鏈急跌後高成交反彈。", "與 AMAT／KLAC 同步，半導體修復具板塊性。", "開盤守住 VWAP 才視為修復延續。"],
  MSFT: ["EPS 4.81、營收 90.00B，均高於預期。", "Azure 與 AI 需求帶動 QQQ 盤前反彈。", "盤前缺口過大，不追第一段。"],
  ARM: ["高 beta 晶片跟隨設備鏈反彈。", "科技風險偏好改善，但仍是跌深修復。", "未守 VWAP 就撤銷反轉判斷。"],
  AMAT: ["設備鏈由前一日賣壓轉為盤前修復。", "與 LRCX／KLAC 共振，提高訊號可信度。", "收盤仍需確認 20MA 與週度區間。"],
  SNDK: ["記憶體鏈高成交反彈。", "與 MU／INTC 同步，修復不再是單一個股。", "開盤量價背離時不追價。"],
  KLAC: ["晶片設備鏈盤前回補。", "與 LRCX／AMAT 同步支撐 SMH。", "守住 VWAP 才保留溢價。"],
  MRVL: ["AI／網通晶片盤前反彈。", "高 beta 科技參與度改善。", "若 QQQ 回落而 MRVL 失守 VWAP，降低曝險。"],
  AMD: ["由週度 -2SD 附近出現反彈。", "晶片修復擴散至設計鏈。", "收回週度 -1SD 472.55 前仍屬修復。"],
  META: ["EPS 6.18 低於 7.19 預期，營收 60.80B 高於 60.22B。", "大型科技財報分化，抵消 MSFT 部分利多。", "未形成止跌前不因跌幅大而抄底。"],
  QCOM: ["通訊晶片逆勢下跌。", "顯示半導體反彈內部仍不一致。", "未收回 VWAP 前不納入晶片多頭。"],
  CRM: ["大型軟體盤前賣壓延續。", "MSFT 利多未全面擴散至軟體。", "需與 NOW／ADBE 同步止跌才降低對沖。"],
  NOW: ["企業軟體盤前跌幅居前。", "與 CRM／ADBE 共振，軟體明顯落後硬體。", "未收回 VWAP 前維持低配。"],
  ADBE: ["大型軟體同步走弱。", "科技反彈集中於晶片與 MSFT，不是全面 risk-on。", "反彈無量時不追。"],
  NFLX: ["大型成長股盤前承壓。", "權重科技分化仍高。", "未收回盤前高點前維持觀察。"],
  MRK: ["醫療防禦股盤前偏弱。", "資金由防禦轉向晶片，但尚未全面確認。", "觀察 XLV 是否守住前一日強勢。"],
  IBM: ["企業科技盤前偏弱。", "MSFT 財報利多未外溢至所有大型科技。", "未收回 VWAP 前不做相對強勢。"],
};

const moverTickers = ["LRCX", "MSFT", "ARM", "AMAT", "SNDK", "KLAC", "MRVL", "AMD", "META", "QCOM", "CRM", "NOW", "ADBE", "NFLX", "MRK", "IBM"];
const moverSpecs = moverTickers.map((ticker) => ({
  ticker,
  price: fixed(price(ticker), 3),
  premarket_change: signed(move(ticker)),
  catalyst: `${moverNotes[ticker][0]} 長橋盤前量 ${compactVolume(volume(ticker))}。`,
  read_through: moverNotes[ticker][1],
  judgment: moverNotes[ticker][2],
}));

const spy = technical.get("SPY");
const qqq = technical.get("QQQ");
const smh = technical.get("SMH");
const vixy = technical.get("VIXY");
const majorRows = ["IWM", "DIA", "SPY", "QQQ"].map((ticker) => technical.get(ticker));
const vixComponents = ">20 0/1、5日>0 1/1、1月>0 1/1、20MA 1/1、50MA 0/1";

const checklist = `<div class="risk-check-grid">` +
  riskRow("low", "S&amp;P 500 overextension／標普過度延伸", `SPY 距 50MA ${fixed(spy.extension50Atr)} ATR`, "沒有向上過度延伸，風險來自科技破位與宏觀定價。") +
  riskRow("high", "Increasing downward momentum／下行動能增加", `QQQ 5日 ${signed(qqq.fiveDayPct)}；SMH ${signed(smh.fiveDayPct)}`, "盤前反彈尚未改變完整日線的下行速度。") +
  riskRow("high", "Top range breakdown／高位區間破位", "QQQ、SMH 低於 20／50MA", "盤前反彈仍未收復主要均線。") +
  riskRow("high", "Technical deterioration／技術惡化", "四大 ETF 技術惡化 10/16", "四大 ETF 均低於 20MA，QQQ／IWM 低於 50MA。") +
  riskRow("high", "Market breadth worsening／市場廣度惡化", "SPX／NDX／IWM >20MA 同步回落", "三大指數與 Stockbee 均轉弱，並非單一來源雜訊。") +
  riskRow("mid", "VIX &gt;20／波動升溫", "VIX 18.21；波動分數 3/5", vixComponents) +
  riskRow("high", "Breakout win rate down／突破勝率下降", "Stockbee 5D／10D ratio 0.65／0.76", "短線與中短線強弱比同步低於 1。") +
  riskRow("high", "Theme momentum weakening／主題動能轉弱", `SMH 1月 ${signed(smh.oneMonthPct)}`, "盤前晶片修復尚未扭轉月線弱勢。") +
  `</div><div class="callout risk"><strong>Checklist Score：6/8 High＝High Risk。</strong>盤前 QQQ／SMH 反彈由 MSFT 與晶片修復帶動，但廣度、均線與 5日動能仍未完成反轉。</div>`;

const macroRows = [
  macroRow("美國 Q2 GDP（年化）", "08:30 ET｜已公布", "+1.5%", "+2.1%", "+2.1%", "Miss", "red", "Headline 降溫，但私人國內最終銷售增長 3.9%。", "不是衰退訊號；需求仍強，Fed 難以只看 headline 轉鴿。"),
  macroRow("GDP 價格指數", "08:30 ET｜已公布", "+6.3%", "+3.6%", "+3.6%", "高於預期", "red", "BEA 的國內購買價格指數亦升 5.7%。", "季度價格壓力偏高，抵消 GDP headline 偏弱。"),
  macroRow("核心 PCE（六月 MoM／YoY）", "08:30 ET｜已公布", "+0.1%／+3.3%", "+0.2%／+3.3%", "+0.3%／+3.4%", "低於／符合", "green", "月度核心通脹降溫，年率僅小幅回落。", "支持不立即升息，但尚不足宣告通脹問題結束。"),
  macroRow("PCE（六月 MoM／YoY）", "08:30 ET｜已公布", "-0.1%／+3.7%", "-0.1%／+3.7%", "+0.5%／+4.1%", "符合", "blue", "能源回落壓低 headline，核心更能代表政策含義。", "減少即時通脹驚嚇，但油價再升仍是七月尾端風險。"),
  macroRow("初領／續領失業金", "08:30 ET｜已公布", "19.7萬／178.2萬", "20.0萬／180.0萬", "18.8萬／178.9萬", "優於預期", "green", "勞動市場未出現明顯斷裂。", "與私人需求 3.9% 一起限制 Fed 轉鴿空間。"),
  macroRow("MSFT 財報", "昨晚盤後已公布", "EPS 4.81<br>營收 90.00B", "EPS 4.24<br>營收 87.62B", "EPS 3.65<br>營收 76.44B", "Beat／Beat", "green", "Azure 與 AI 需求支撐，但估值仍受利率約束。", `MSFT 盤前 ${signed(move("MSFT"))}，是 QQQ 反彈主因。`, false, true),
  macroRow("META 財報", "昨晚盤後已公布", "EPS 6.18<br>營收 60.80B", "EPS 7.19<br>營收 60.22B", "EPS 7.14<br>營收 47.52B", "Miss／Beat", "red", "營收仍成長，但盈利與支出擔憂壓過 revenue beat。", `META 盤前 ${signed(move("META"))}，大型科技分化延續。`, false, true),
  macroRow("AAPL 財報", "今日盤後", "待公布", "EPS 1.89<br>營收 108.89B", "EPS 2.01<br>營收 111.18B", "待公布", "blue", "零瑕疵預期較高，重點是 iPhone、服務與 AI 路徑。", "今日收盤後仍有第二層指數權重風險。", true, true),
  macroRow("AMZN 財報", "今日盤後", "待公布", "EPS 1.81<br>營收 196.51B", "EPS 2.78<br>營收 181.50B", "待公布", "blue", "AWS 增速、資本支出與自由現金流最重要。", "盤後結果將決定 MSFT 帶動的 AI 反彈能否擴散。", true, true),
].join("");

const macroTable = `<div class="table-scroll"><table class="macro-policy-table report-data-table report-cols-5"><thead><tr>` +
  `<th>宏觀／財報事件</th><th>Actual／Forecast／Previous</th><th>訊號</th><th>政策／利率判讀</th><th>市場含義</th></tr></thead><tbody>${macroRows}</tbody></table></div>`;

const expectedSpecs = [
  ["SPY", 724.53, 753.33], ["QQQ", 661.66, 706.80], ["IWM", 283.91, 298.43], ["DIA", 509.91, 527.61],
  ["XLK", 168.76, 183.01], ["SMH", 518.82, 603.56], ["USO", 125.57, 146.87], ["TLT", 82.25, 84.25],
  ["AMD", 472.55, 571.35], ["MSFT", 369.30, 411.24], ["META", 537.76, 655.20], ["NVDA", 196.58, 226.16],
].map(([ticker, lower, upper]) => {
  const current = price(ticker);
  const status = current < lower ? "低於 -1SD" : current > upper ? "高於 +1SD" :
    Math.min(current - lower, upper - current) / (upper - lower) < 0.12 ? "接近邊界" : "區間內";
  const color = current < lower || current > upper ? "red" : status === "接近邊界" ? "amber" : "blue";
  const action = current < lower ? "等待收回 -1SD，避免把跌深當止跌。" :
    current > upper ? "已越過 +1SD，不追價，等待開盤確認。" : "仍在本週定價區間。";
  return `<tr><td>${ticker}</td><td class="num">${fixed(current)}</td><td class="num">${fixed(lower)}</td><td class="num">${fixed(upper)}</td>` +
    `<td><span class="badge ${color}">${status}</span></td><td>${action}</td></tr>`;
}).join("");
const expectedTable = `<h3>本週 Expected Move 位置</h3><div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr>` +
  `<th>標的</th><th class="num">盤前</th><th class="num">-1SD</th><th class="num">+1SD</th><th>狀態</th><th>行動</th></tr></thead><tbody>${expectedSpecs}</tbody></table></div>`;

const majorTable = `<div class="table-scroll"><table class="report-data-table report-cols-8" data-major-universe="indices-4"><thead><tr>` +
  `<th>ETF</th><th class="num">昨收</th><th class="num">盤前</th><th class="num">5日</th><th class="num">1月</th><th class="ma-heading">20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td><strong>${row.ticker}</strong></td><td class="num">${fixed(row.close)}</td>` +
    `<td class="num ${moveClass(move(row.ticker))}">${fixed(price(row.ticker))}／${signed(move(row.ticker))}</td>` +
    `<td class="num ${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>` +
    `<td class="ma-cell">${maStates(row)}</td><td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td><td>${judgment(row)}</td></tr>`).join("") +
  `</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>四大 ETF 盤前全數反彈，但完整日線仍全低於 20MA；QQQ 的反彈主要由 MSFT 與晶片帶動，不能視為全面風險修復。</p>`;

const atrTable = `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">昨收</th>` +
  `<th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => `<tr><td>${row.ticker}</td><td class="num">${fixed(row.close)}</td><td class="num">${fixed(row.ma50)}</td>` +
    `<td class="num">${fixed(row.atr14)}</td><td class="num ${moveClass(row.extension50Atr)}">${row.extension50Atr > 0 ? "+" : ""}${fixed(row.extension50Atr)}</td>` +
    `<td>${row.extension50Atr <= -2 ? "低於 50MA 超過 2 ATR，等待止跌。" : row.extension50Atr < 0 ? "低於 50MA，尚未過度延伸。" : "高於 50MA，仍在正常區間。"}</td></tr>`).join("") +
  `</tbody></table></div>`;

const breadthTable = `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>前一日</th><th>中期結構</th><th>綜合判斷</th></tr></thead><tbody>` +
  `<tr><td>SPX >20MA（7/29）</td><td class="num dn">63.02%</td><td>69.18%</td><td>SPX >50MA 65.80%</td><td>大型股短中線廣度同步降溫。</td></tr>` +
  `<tr><td>NDX >20MA（7/29）</td><td class="num dn">47.57%</td><td>48.54%</td><td>NDX >50MA 49.51%</td><td>科技成分低於半數，反彈仍窄。</td></tr>` +
  `<tr><td>IWM >20MA（7/29）</td><td class="num dn">45.14%</td><td>52.57%</td><td>IWM >50MA 55.00%</td><td>小盤短線重新跌回半數下方。</td></tr>` +
  `<tr><td>T2108（Stockbee 7/29）</td><td class="num dn">48.33%</td><td>55.33%</td><td>回到 50% 下方</td><td>全市場長期廣度同步轉弱。</td></tr>` +
  `<tr><td>5D／10D ratio（7/29）</td><td class="num dn">0.65／0.76</td><td>0.78／0.88</td><td>兩者均進一步低於 1</td><td>短線與中短線弱勢加速。</td></tr>` +
  `<tr><td>4%+ 上漲／下跌（7/29）</td><td class="num dn">165／552</td><td>341／388</td><td>季度 +25%／-25% 1172／1304</td><td>極端下跌家數明顯佔優。</td></tr>` +
  `</tbody></table></div>`;

const macroAssetSpecs = [
  ["EWJ", "EWJ"], ["EWY", "EWY"], ["EWG", "EWG"], ["FXI", "FXI"], ["EWT", "EWT"],
  ["XAU", "GLD"], ["XAG", "SLV"], ["COPPER", "CPER"], ["CL", "USO"], ["BTC", "IBIT"],
];
const macroAssetRows = macroAssetSpecs.map(([key, preTicker]) => {
  const row = macro.get(key);
  const preMove = move(preTicker);
  const implication = preTicker === "TLT" ? "長端利率驗證" :
    preTicker === "USO" ? "七月通脹尾端風險" :
    preTicker === "GLD" || preTicker === "SLV" ? "政策與地緣避險" :
    preTicker === "CPER" ? "增長與中國需求代理" :
    preTicker === "IBIT" ? "高 beta 流動性代理" : "區域風險偏好";
  const preCell = Number.isFinite(preMove)
    ? `<td class="num ${moveClass(preMove)}">${signed(preMove)}</td>`
    : '<td class="num" data-allow-missing>—</td>';
  return `<tr><td>${preTicker}</td><td class="num">${fixed(row?.close)}</td><td class="num ${moveClass(row?.dailyPct)}">${signed(row?.dailyPct)}</td>` +
    `<td class="num ${moveClass(row?.oneMonthPct)}">${signed(row?.oneMonthPct)}</td>${preCell}<td>${implication}</td></tr>`;
}).join("");

const tradeTickers = ["IWM", "DIA", "SPY", "QQQ", "SMH", "XLK", "USO", "TLT"];
const tradeRows = tradeTickers.map((ticker) => {
  const row = technical.get(ticker);
  const current = price(ticker);
  const state = current >= row.ma20 ? "高於20MA" : current >= row.ma50 ? "介於20／50MA" : "低於20／50MA";
  const color = current >= row.ma20 ? "green" : current >= row.ma50 ? "amber" : "red";
  const action = ticker === "SMH" ? "盤前已收回週度 -1SD 518.82；收盤確認才升級。" :
    ticker === "QQQ" ? "守 661.66，收回 VWAP 後再看 20MA 704.33。" :
    ticker === "USO" ? "守住 125.57 才保留能源風險溢價。" :
    ticker === "TLT" ? "82.25 是週度 -1SD；下破代表利率壓力升級。" : "以 VWAP 與盤前低點管理倉位。";
  return `<tr><td>${ticker}</td><td class="num ${moveClass(move(ticker))}">${fixed(current)}／${signed(move(ticker))}</td>` +
    `<td class="num">${fixed(row.ma20)}</td><td class="num">${fixed(row.ma50)}</td><td><span class="badge ${color}">${state}</span></td><td>${action}</td></tr>`;
}).join("");

const fomcScenarios = `<h3>昨晚 FOMC 後的四情景</h3><div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr>` +
  `<th>情景</th><th>數據組合</th><th>機率／狀態</th><th>跨資產確認</th><th>行動</th></tr></thead><tbody>` +
  `<tr><td><strong>1｜需求韌性＋月度通脹降溫</strong></td><td>私人最終銷售 3.9%、核心 PCE MoM 0.1%、Claims 19.7萬</td><td><span class="badge green">目前最接近</span></td><td>QQQ／SMH 反彈，但 TLT 未走強</td><td>可交易科技修復，但不把它當 Fed 已轉鴿。</td></tr>` +
  `<tr><td><strong>2｜增長弱＋季度通脹高</strong></td><td>GDP 1.5% Miss、GDP 價格指數 6.3%</td><td><span class="badge amber">尾端風險</span></td><td>DXY／殖利率上升、TLT 跌破 82.25</td><td>最差的停滯性組合；降低高 beta 與長久期。</td></tr>` +
  `<tr><td><strong>3｜全面降溫</strong></td><td>後續核心通脹、勞動與私人需求同步走弱</td><td><span class="badge blue">尚未成立</span></td><td>TLT 上漲、DXY 回落、廣度擴散</td><td>QQQ 收回 20MA 後才提高核心科技。</td></tr>` +
  `<tr><td><strong>4｜財報主導、宏觀次要</strong></td><td>MSFT 大漲、META 大跌；AAPL／AMZN 今晚接棒</td><td><span class="badge amber">今日現實</span></td><td>QQQ 上漲但軟體與 META 不跟</td><td>做相對強弱，不把 QQQ 上漲解讀為全面 risk-on。</td></tr>` +
  `</tbody></table></div>`;

const bondCurveTable = `<h3>短債／中債／長債比較</h3><div class="table-scroll"><table class="report-data-table report-cols-6" data-bond-curve="shy-ief-tlt"><thead><tr>` +
  `<th>期限代理</th><th class="num">盤前</th><th class="num">盤前變化</th><th>主要定價</th><th>今日訊號</th><th>行動含義</th></tr></thead><tbody>` +
  `<tr><td><strong>SHY｜1–3年短債</strong></td><td class="num">${fixed(price("SHY"))}</td><td class="num ${moveClass(move("SHY"))}">${signed(move("SHY"))}</td><td>Fed 未來數次會議路徑</td><td><span class="badge blue">近乎持平</span></td><td>核心 PCE 偏軟壓低立即升息急迫性。</td></tr>` +
  `<tr><td><strong>IEF｜7–10年中債</strong></td><td class="num">${fixed(price("IEF"))}</td><td class="num ${moveClass(move("IEF"))}">${signed(move("IEF"))}</td><td>政策、增長與中期通脹</td><td><span class="badge amber">小幅轉弱</span></td><td>GDP headline 偏弱仍被需求韌性抵消。</td></tr>` +
  `<tr><td><strong>TLT｜20年以上長債</strong></td><td class="num">${fixed(price("TLT"))}</td><td class="num ${moveClass(move("TLT"))}">${signed(move("TLT"))}</td><td>長期通脹、期限溢價與財政</td><td><span class="badge red">三者最弱</span></td><td>季度價格壓力與期限溢價仍壓制長端。</td></tr>` +
  `</tbody></table></div><div class="callout warn"><strong>期限判讀：</strong>SHY ${signed(move("SHY"))}、IEF ${signed(move("IEF"))}、TLT ${signed(move("TLT"))}，期限越長跌幅越大，顯示長久期相對承壓；但 ETF 久期不同，不能只憑跌幅確認殖利率曲線已熊陡，仍須用 2Y／10Y 殖利率變動驗證。政策含義仍不是「核心 PCE 低於預期＝全面鴿派」：短債主要交易較低的即時升息急迫性，長債仍交易 6.3% GDP 價格指數、期限溢價與財政供給。</div>`;

const data = {
  ...base,
  report_type: "premarket",
  report_title: "2026-07-30｜美股盤前監控",
  report_eyebrow: "2026-07-30｜盤前更新",
  report_heading: "GDP 降溫但私人需求仍強；核心 PCE 放緩，MSFT 與 META 財報分化",
  technical_as_of: "2026-07-29",
  vix_volatility_score: 3,
  vix_volatility_level: "Intermediate",
  vix_volatility_components: vixComponents,
  data_timestamp_note: "長橋盤前快照截至 08:45 ET；GDP／PCE／初領失業金截至 08:30 ET；RSI／MA／ATR、三大指數廣度與 Stockbee 截至 7/29 完整日線。Sector Dashboard、Thematic Sectors、Macro 為三個主資料表。",
  risk_badge: "高風險｜Checklist 6/8、VIX 3/5、財報分化",
  qqq_reengage_20ma: fixed(qqq.ma20),
  qqq_breakout_add_1sd: "706.80",
  summary_cards: `<div class="card"><span>SPY／QQQ 盤前</span><strong><span class="up">${signed(move("SPY"))}</span>／<span class="up">${signed(move("QQQ"))}</span></strong><small>MSFT 與晶片推動反彈。</small></div>` +
    `<div class="card"><span>GDP／核心 PCE MoM</span><strong><span class="dn">1.5%</span>／<span class="up">0.1%</span></strong><small>增長 Miss，月度通脹低於預期。</small></div>` +
    `<div class="card"><span>MSFT／META</span><strong><span class="up">${signed(move("MSFT"))}</span>／<span class="dn">${signed(move("META"))}</span></strong><small>同屬大型科技，反應完全分化。</small></div>` +
    `<div class="card"><span>SHY／IEF／TLT</span><strong><span>${signed(move("SHY"))}</span>／<span class="dn">${signed(move("IEF"))}</span>／<span class="dn">${signed(move("TLT"))}</span></strong><small>期限越長越弱，長端未轉鴿。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才由高風險降為中性：科技修復、廣度擴散、利率條件改善。",
  upgrade_trigger_1: `QQQ 收回 VWAP，SMH 守住 518.82（週度 -1SD）。`,
  upgrade_trigger_2: "上漲家數領先，NDX >20MA 重新回到 50% 上方。",
  upgrade_trigger_3: "TLT 守住 82.25、DXY 維持 102 下方，長端殖利率不再上行。",
  downgrade_trigger_rule: "任一觸發即維持／加強防守：科技反彈失敗、利率上行、廣度續弱。",
  downgrade_trigger_1: "QQQ 跌回 661.66（週度 -1SD）下方，或 SMH 再失守 518.82（週度 -1SD）。",
  downgrade_trigger_2: "TLT 跌破 82.25、DXY 升破 102，季度價格壓力成為主交易。",
  downgrade_trigger_3: "MSFT 跌回缺口內且 META 續創盤前低點，AAPL／AMZN 前資金再去風險。",
  core_conclusions: `<ol><li><strong>今日 GDP 不是單純的「經濟轉弱」。</strong>Q2 headline 1.5% 低於 2.1% 預期，但私人國內最終銷售增長 3.9%，消費與投資仍有韌性。</li>` +
    `<li><strong>通脹訊號分成兩層。</strong>六月核心 PCE 月增 0.1% 低於 0.2% 預期、年增 3.3% 符合；但 GDP 價格指數 6.3% 明顯高於 3.6% 預期，Fed 不會因單月改善立即轉鴿。</li>` +
    `<li><strong>勞動市場未斷裂。</strong>初領 19.7 萬、續領 178.2 萬，均優於預期；與私人需求 3.9% 一起削弱衰退敘事。</li>` +
    `<li><strong>盤前科技反彈是「財報＋跌深修復」。</strong>QQQ ${signed(move("QQQ"))}、SMH ${signed(move("SMH"))}，但 MSFT ${signed(move("MSFT"))} 對 META ${signed(move("META"))}，並非全面風險偏好。</li>` +
    `<li><strong>長短債給出關鍵分歧。</strong>SHY ${signed(move("SHY"))}、IEF ${signed(move("IEF"))}、TLT ${signed(move("TLT"))}；短債近乎持平、長債最弱，代表即時升息急迫性下降，但長期通脹與期限溢價仍高。</li>` +
    `<li><strong>昨晚 FOMC 的偏鷹框架仍未解除。</strong>9–3 維持利率、三位委員主張升息；Warsh 堅持 2% 目標且不提供前瞻指引。今日數據更像「可延後、不能排除」的升息路徑。</li>` +
    `<li><strong>完整日線仍防守。</strong>QQQ／SMH 低於 20／50MA，Stockbee 5D／10D ratio 降至 0.65／0.76；今日必須等 VWAP 與廣度確認。</li></ol>` +
    `<p class="section-summary"><strong>本段結論：</strong>GDP headline 偏弱、月度核心 PCE 偏軟，但私人需求與勞動仍強、季度價格壓力偏高；交易上做科技修復，不提前宣告 Fed 轉鴿。</p>`,
  positioning_primary: "主線：MSFT 與晶片修復可交易，但只在 QQQ／SMH 守 VWAP 時保留。",
  positioning_secondary: "次線：META 與大型軟體仍弱；AAPL／AMZN 盤後前保留事件現金。",
  positioning_watch: "觀察：QQQ 661.66、SMH 518.82、TLT 82.25、DXY 102、NDX >20MA 50%。",
  positioning_invalidation: "若 QQQ／SMH 失守 VWAP、TLT 跌破 82.25且美元走強，科技修復主線失效。",
  pre_market_movers: moverSpecs,
  pre_market_movers_note: `<p class="section-summary"><strong>本段結論：</strong>上漲榜由 MSFT 與晶片設備／記憶體鏈主導；下跌榜集中 META 與企業軟體。所有漲跌及成交量均來自長橋 08:45 ET 盤前快照。</p>`,
  section_pre_market_movers_primary_action: "主線：做晶片修復與 MSFT 財報反應，不追開盤第一段缺口。",
  section_pre_market_movers_condition_action: "條件：SMH 守 518.82、LRCX／AMAT／KLAC 至少兩檔守 VWAP，才保留晶片多頭。",
  section_pre_market_movers_avoid_action: "避免：把 QQQ 上漲外推為 META／CRM／NOW／ADBE 也已轉強。",
  premarket_movers_invalidation: "若 SMH 跌回 518.82 下方且 MSFT 失守 VWAP，盤前科技修復失效。",
  correction_checklist_dashboard: checklist,
  section_correction_checklist_primary_action: "主線：6/8 High，盤前反彈不改變總 beta 低於基準。",
  section_correction_checklist_condition_action: "條件：High 項降至 3 項以下，才把風險降為 Intermediate。",
  section_correction_checklist_avoid_action: "避免：只看 VIX 是否低於 20，忽略廣度與科技均線。",
  checklist_invalidation: "若 QQQ／SMH 收回 20MA、Stockbee 5D／10D ratio 同高於 1，Checklist 才可顯著降級。",
  macro_premarket_background_table: `${macroTable}<p class="section-summary"><strong>本段結論：</strong>GDP、PCE、Claims 與 MSFT／META Actual 均已列出並逐項對 Forecast；AAPL／AMZN 尚未公布，沒有預先判定 Beat／Miss。</p>${expectedTable}`,
  section_macro_premarket_background_primary_action: "主線：先交易已公布的 GDP／PCE 與 MSFT／META，收盤前降低 AAPL／AMZN 事件曝險。",
  section_macro_premarket_background_condition_action: "條件：核心 PCE 偏軟要配合 TLT 上漲與 DXY 回落，才算政策條件改善。",
  section_macro_premarket_background_avoid_action: "避免：只看 GDP 1.5% 就交易衰退；私人需求 3.9% 與 Claims 並不支持。",
  macro_invalidation: "若長端殖利率回落、TLT 上漲且廣度擴散，季度價格壓力主導的偏鷹假設失效。",
  sector_momentum_chart: momentumChart(thematicRows),
  sector_thematic_etf_tables: `${etfTable("S&amp;P 500 Sector ETF", sectorRows)}${etfTable(
    "Thematic Sector ETF（含 SPY 基準）",
    thematicRows,
    'data-etf-universe="thematic-complete" data-source-count="44" data-report-count="45" data-benchmark="SPY" data-sort="rsi-desc"'
  )}<p class="section-summary"><strong>本段結論：</strong>完整讀入 Thematic Sectors 44 檔 ETF 並加入 SPY，共 45 檔；S&amp;P 500 Sector 與 Thematic 均按 7/29 RSI 由高至低排列。</p>`,
  section_sector_thematic_etf_primary_action: "主線：用 RSI 看結構，用盤前價格與 VWAP 判斷今日修復。",
  section_sector_thematic_etf_condition_action: "條件：SMH／XLK 收回 VWAP，且 NDX 廣度回到 50% 上方。",
  section_sector_thematic_etf_avoid_action: "避免：用單日盤前漲跌覆蓋 7/29 完整日線 RSI／MA。",
  sector_etf_invalidation: "若晶片與軟體同步轉強，科技內部分化才算真正收斂。",
  major_etf_technical_table: majorTable,
  section_major_etf_technical_primary_action: "主線：四大 ETF 只看 IWM／DIA／SPY／QQQ；盤前全漲但完整日線仍弱。",
  section_major_etf_technical_condition_action: `條件：QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SPY 收回 ${fixed(spy.ma20)}（20MA）再提高指數倉位。`,
  section_major_etf_technical_avoid_action: "避免：加入 VOO／RSP／QQQE 稀釋四大指數判斷。",
  major_etf_invalidation: "若 QQQ 跌回 661.66 下方，盤前領先失效。",
  fifty_ma_atr_extension_table: atrTable,
  section_50ma_atr_extension_primary_action: `主線：QQQ 距 50MA ${fixed(qqq.extension50Atr)} ATR，仍屬技術修復而非趨勢重啟。`,
  section_50ma_atr_extension_condition_action: "條件：QQQ 回到 -2 ATR 內且 RSI 回升，再降低技術防守。",
  section_50ma_atr_extension_avoid_action: "避免：把負 ATR 延伸直接等同超賣買點。",
  atr_extension_invalidation: "若 SPY／QQQ 同收回 50MA，ATR 防守訊號失效。",
  market_breadth_table: breadthTable,
  stockbee_breadth_interpretation: `<div class="callout risk"><strong>綜合廣度：</strong>SPX／NDX／IWM >20MA 與 T2108 同步回落；Stockbee 5D／10D ratio 降至 0.65／0.76，4%+ 上漲／下跌惡化至 165／552。兩組來源方向一致，確認前一日賣壓具廣泛性。</div>` +
    `<p class="section-summary"><strong>小結：</strong>今日 QQQ／SMH 盤前反彈若沒有 NDX >20MA 回到 50% 上方與上漲家數擴散，只能視為權重財報帶動的窄反彈。</p>`,
  section_market_breadth_primary_action: "主線：用三大指數廣度與 Stockbee 交叉判讀；今日必須看到共同修復。",
  section_market_breadth_condition_action: "條件：NDX >20MA 回到 50% 上方，Stockbee 5D／10D ratio 同向回升。",
  section_market_breadth_avoid_action: "避免：用 MSFT 一檔大漲替代全市場參與度。",
  breadth_invalidation: "若開盤後上漲家數領先、QQQ 守 VWAP且設備鏈維持強勢，廣度防守可下調。",
  fx_commodities_table: `<div class="macro-policy-overview"><div><span>DXY</span><strong>約 100.8</strong><small>昨晚 FOMC 後回落，仍低於 102 觸發線</small></div>` +
    `<div><span>長債代理</span><strong class="${moveClass(move("TLT"))}">TLT ${signed(move("TLT"))}</strong><small>核心 PCE 偏軟但未明顯上漲</small></div>` +
    `<div><span>原油代理</span><strong class="${moveClass(move("USO"))}">USO ${signed(move("USO"))}</strong><small>今日回吐，七月通脹風險仍在</small></div></div>` +
    `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">7/29 收盤</th><th class="num">1日</th><th class="num">1月</th><th class="num">盤前</th><th>對美股含義</th></tr></thead><tbody>${macroAssetRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>DXY 沒有消失：昨晚 FOMC 後約 100.8、仍低於 102；但 TLT 盤前未因核心 PCE 偏軟而明顯上漲，顯示私人需求與季度價格壓力仍制約長端。</p>`,
  section_fx_commodities_primary_action: "主線：DXY、TLT、USO 與貴金屬共同驗證數據與 FOMC 後路徑。",
  section_fx_commodities_condition_action: "條件：DXY 維持 102 下方、TLT 守 82.25、QQQ 守 VWAP，才保留科技修復。",
  section_fx_commodities_avoid_action: "避免：只看核心 PCE 0.1%，忽略 GDP 價格指數 6.3% 與私人需求 3.9%。",
  forex_commodity_invalidation: "若 DXY 升破 102 或 TLT 跌破 82.25，政策條件改善假設失效。",
  treasury_fed_economic_data_table: `<div class="macro-policy-overview"><div><span>FOMC 結果</span><strong>9–3 維持</strong><small>三位委員主張升息 25bp</small></div>` +
    `<div><span>核心 PCE MoM</span><strong class="up">0.1%</strong><small>低於 0.2% 預期</small></div>` +
    `<div><span>私人最終銷售</span><strong>3.9%</strong><small>需求韌性高於 GDP headline</small></div></div>` +
    `${bondCurveTable}${fomcScenarios}<div class="table-scroll"><table class="rates-monitor-table report-data-table report-cols-5"><thead><tr><th>利率／政策觀察</th><th class="num">Actual／最新</th><th class="num">Forecast／門檻</th><th>狀態</th><th>對美股含義</th></tr></thead><tbody>` +
    `<tr><td>Fed funds target</td><td class="num">3.50%–3.75%</td><td class="num">維持</td><td><span class="badge amber">偏鷹維持</span></td><td>9–3 表決與三位升息異議保留九月尾端風險。</td></tr>` +
    `<tr><td>十年期美債</td><td class="num">約 4.65%</td><td class="num">4.60%</td><td><span class="badge red">高位</span></td><td>估值壓力仍在，科技反彈需盈利支撐。</td></tr>` +
    `<tr><td>TLT</td><td class="num">${fixed(price("TLT"))}／${signed(move("TLT"))}</td><td class="num">82.25（週度 -1SD）</td><td><span class="badge amber">接近下界</span></td><td>失守 82.25 代表長端利率壓力升級。</td></tr>` +
    `<tr><td>DXY</td><td class="num">約 100.8</td><td class="num">102</td><td><span class="badge blue">門檻下方</span></td><td>升破 102 才觸發進一步減科技。</td></tr>` +
    `</tbody></table></div><div class="callout warn"><strong>記者會重點：</strong>Warsh 拒絕提供前瞻指引、重申 2% 是唯一目標；因此今日數據不能直接換算成「下一次一定升／不升」。以 TLT、DXY、QQQ／SMH 的同向反應確認市場正在交易哪個情景。</div>`,
  section_treasury_fed_primary_action: "主線：短債近乎持平、長債最弱，先採短久期優於長久期；科技可修復但估值壓力未解除。",
  section_treasury_fed_condition_action: "條件：TLT 的表現至少追上 IEF、DXY 維持 102 下方、QQQ／SMH 守 VWAP，才視為政策條件全面改善。",
  section_treasury_fed_avoid_action: "避免：只看 SHY 穩定就宣告 Fed 轉鴿；長端仍在交易通脹與期限溢價。",
  treasury_invalidation: "若 TLT 跌破 82.25、DXY 升破 102 或 QQQ 跌破 661.66，偏軟數據交易失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">20MA</th><th class="num">50MA</th><th>狀態</th><th>行動</th></tr></thead><tbody>${tradeRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>QQQ／SMH 由 MSFT 與晶片修復帶動，但軟體、META 與廣度未同步；今天做相對強弱，收盤前保留 AAPL／AMZN 事件現金。</p>` +
    `<div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>QQQ／SMH 守 VWAP 才保留科技修復，總 beta 仍低於基準。</li>` +
    `<li class="ad-secondary"><strong>次線：</strong>MSFT 與設備／記憶體鏈相對強；META 與 CRM／NOW／ADBE 相對弱。</li>` +
    `<li class="ad-watch"><strong>觀察：</strong>QQQ 661.66、SMH 518.82、TLT 82.25、DXY 102、NDX >20MA 50%。</li>` +
    `<li class="ad-avoid"><strong>避免：</strong>把單月核心 PCE 降溫等同 Fed 已經轉鴿。</li>` +
    `<li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：QQQ／SMH 失守 VWAP且 TLT 跌破 82.25。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "QQQ／SMH 守 VWAP，MSFT 不回補缺口", interpretation: "財報與晶片修復獲現貨確認", action: "保留相對多，但不擴大總 beta。" },
    { time_slot: "09:30 ORB", trigger_event: "META／CRM／NOW／ADBE 續弱", interpretation: "科技內部分化未收斂", action: "多晶片／MSFT、低配軟體與 META。" },
    { time_slot: "10:00 ET", trigger_event: "NDX >20MA 回到 50% 上方且上漲家數領先", interpretation: "反彈開始擴散", action: "小幅降低指數對沖。" },
    { time_slot: "10:00 ET", trigger_event: "TLT 跌破 82.25、DXY 走向 102", interpretation: "季度價格壓力成為主交易", action: "降低長久期與高估值科技。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ／SMH 仍守 VWAP，但 AAPL／AMZN 未公布", interpretation: "日內修復成立、隔夜事件仍高", action: "獲利留現金，不把日內多頭全留隔夜。" },
    { time_slot: "盤後", trigger_event: "AAPL／AMZN Actual 與指引公布", interpretation: "決定 AI／消費權重能否接棒", action: "逐項對 EPS、營收、指引，禁止只看 Beat／Miss 標籤。" },
  ],
  cross_validation_summary: `<div class="callout warn"><strong>宏觀交叉：</strong>GDP 1.5% Miss，但私人最終銷售 3.9%；核心 PCE MoM 0.1% 偏軟，但 GDP 價格指數 6.3% 偏高。結論是混合，不是單向鴿派。</div>` +
    `<div class="callout risk"><strong>價格交叉：</strong>QQQ ${signed(move("QQQ"))}、SMH ${signed(move("SMH"))}、MSFT ${signed(move("MSFT"))}；但 META ${signed(move("META"))}、NOW ${signed(move("NOW"))}，科技內部分化極大。</div>` +
    `<div class="callout"><strong>債券交叉：</strong>SHY ${signed(move("SHY"))}、IEF ${signed(move("IEF"))}、TLT ${signed(move("TLT"))}；短端穩、長端弱，確認市場沒有把核心 PCE 低於預期解讀成全面鴿派。</div>` +
    `<div class="callout"><strong>廣度交叉：</strong>三大指數與 Stockbee 同步惡化；今日盤前反彈仍需要 NDX 廣度與上漲家數確認。</div>` +
    `<h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-07-30 08:45 ET 盤前價格與成交量、截至 2026-07-29 的 RSI／MA／ATR；` +
    `<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard／Thematic Sectors／Macro、Market Breath、Weekly Expected Move</a>；` +
    `<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee Market Monitor 2026</a>；` +
    `<a href="https://www.bea.gov/news/2026/gdp-advance-estimate-2nd-quarter-2026">BEA：Q2 GDP advance estimate</a>；` +
    `<a href="https://www.bea.gov/news/2026/personal-income-and-outlays-june-2026">BEA：六月 Personal Income and Outlays／PCE</a>；` +
    `<a href="https://tradingeconomics.com/calendar?country=united-states">Trading Economics：GDP 價格指數、Claims 共識與即時值</a>；` +
    `<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Federal Reserve：7/29 FOMC 聲明與記者會</a>；` +
    `<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">Kiplinger：MSFT／AAPL 共識預期</a>；` +
    `<a href="https://www.investing.com/equities/amazon-com-inc-earnings">Investing.com：AMZN 財報共識</a>。</p>` +
    `<p class="source-note">本報告為 2026-07-30 美股盤前監控，不構成投資建議。SHY／IEF／TLT 盤前數據均來自長橋；AAPL／AMZN 尚未公布，Actual 明確標示待公布，未預先判定 Beat／Miss。</p>`,
};

const output = path.join(root, "data", "2026-07-30-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
console.log(JSON.stringify({
  movers: moverSpecs.length,
  sectorRows: sectorRows.length,
  thematicRows: thematicRows.length,
  majorRows: majorRows.length,
  riskScore: "6/8",
  vixScore: "3/5",
  macroActuals: "GDP／PCE／Claims 已公布",
}, null, 2));
