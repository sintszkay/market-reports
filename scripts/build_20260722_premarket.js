#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.join(root, "..");
const base = require(path.join(root, "data", "2026-07-21-premarket.json"));
const fullQuotes = require(path.join(work, "premarket_quotes_0722.json"));
const scanQuotes = require(path.join(work, "premarket_movers_0722.json"));
const snapshot = require(path.join(work, "postmarket_snapshot_2026-07-21.json")).rows;
const thematic = require(path.join(work, "thematic_rsi_longport.json")).rows;

const quoteMap = new Map();
for (const row of [...scanQuotes, ...fullQuotes]) {
  const current = quoteMap.get(row.ticker);
  const rowTime = Date.parse(row.timestamp || 0);
  const currentTime = Date.parse(current?.timestamp || 0);
  if (!current || rowTime > currentTime || (rowTime === currentTime && Number(row.volume || 0) > Number(current.volume || 0))) {
    quoteMap.set(row.ticker, row);
  }
}
const snapMap = new Map(snapshot.map((row) => [row.ticker, row]));
const thematicMap = new Map(thematic.map((row) => [row.ticker, row]));
thematicMap.set("SPY", snapMap.get("SPY"));

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function num(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function signed(value, suffix = "%", digits = 2) {
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${num(n, digits)}${suffix}`;
}

function trendClass(value) {
  return Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
}

function volume(value) {
  const n = Number(value || 0);
  if (n >= 10000) return `${num(n / 10000, 1)}萬股`;
  return `${Math.round(n).toLocaleString("zh-Hant")}股`;
}

function q(ticker) {
  const row = quoteMap.get(ticker);
  if (!row || !Number.isFinite(Number(row.price))) throw new Error(`缺少長橋盤前行情：${ticker}`);
  return row;
}

function s(ticker) {
  const row = snapMap.get(ticker);
  if (!row) throw new Error(`缺少長橋完整日線：${ticker}`);
  return row;
}

function maValue(row, period) {
  return row[`above${period}`] ?? row[`aboveMa${period}`];
}

function maCell(row) {
  return `<td class="ma-cell">${[20, 50, 200].map((period) => {
    const above = Boolean(maValue(row, period));
    return `<span class="ma-state ${above ? "ma-up" : "ma-down"}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${above ? "▲" : "▼"}</span></span>`;
  }).join("")}</td>`;
}

function technicalJudgment(row) {
  const states = [20, 50, 200].map((period) => Boolean(maValue(row, period)));
  if (Number(row.rsi14) >= 70) return "RSI 過熱，持有但不追價。";
  if (Number(row.rsi14) <= 30) return "RSI 超賣，先等待止跌確認。";
  if (states.every(Boolean)) return "三條均線之上，結構完整。";
  if (!states[0] && !states[1] && states[2]) return "失守 20/50MA，長期趨勢尚存。";
  if (!states.some(Boolean)) return "三條均線全失守，維持弱勢。";
  if (!states[0]) return "短線低於 20MA，中期結構仍可。";
  return "均線訊號分化，等待方向確認。";
}

function etfTable(rows, heading) {
  const body = rows.map((row) => `<tr><td>${esc(row.ticker)}</td><td class="num ${trendClass(row.dailyPct)}">${signed(row.dailyPct)}</td><td class="num ${trendClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${trendClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>${maCell(row)}<td class="num" data-rsi="${num(row.rsi14)}">${num(row.rsi14)}</td><td>${technicalJudgment(row)}</td></tr>`).join("\n");
  return `<h3>${heading}</h3><div class="table-scroll"><table class="ma-table report-data-table report-cols-7"><thead><tr><th>ETF</th><th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function majorRow(row, note) {
  return `<tr><td>${row.ticker}</td><td class="num">${num(row.close)}</td><td class="num ${trendClass(row.dailyPct)}">${signed(row.dailyPct)}</td><td class="num ${trendClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${trendClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>${maCell(row)}<td class="num" data-rsi="${num(row.rsi14)}">${num(row.rsi14)}</td><td>${note || technicalJudgment(row)}</td></tr>`;
}

function chartRows(rows) {
  const maxPositive = Math.max(...rows.map((row) => Math.max(0, row.value)));
  const maxNegative = Math.max(...rows.map((row) => Math.max(0, -row.value)));
  const zero = maxNegative / (maxPositive + maxNegative) * 100;
  return rows.map((row) => {
    const sideWidth = row.value >= 0 ? 100 - zero : zero;
    const extreme = row.value >= 0 ? maxPositive : maxNegative;
    const width = extreme ? Math.abs(row.value) / extreme * sideWidth : 0;
    return `<div class="bar-row"><span class="lbl">${row.ticker}</span><span class="val ${row.value >= 0 ? "pos" : "neg"}">${signed(row.value)}</span><span class="bar-track" style="--zero:${num(zero)}%"><span class="b ${row.value >= 0 ? "pos" : "neg"}" style="width:${num(width)}%"></span></span></div>`;
  }).join("\n");
}

const sectorRows = ["SPY", "XLF", "XLI", "XLV", "XLY", "XLK", "XLU", "XLC", "XLRE", "XLP", "XLE", "XLB"]
  .map(s)
  .sort((a, b) => Number(b.rsi14) - Number(a.rsi14));

const thematicTickers = ["KIE", "XOP", "KRE", "IAK", "XRT", "CIBR", "IBB", "XSW", "PPH", "XBI", "KWEB", "IGV", "MAGS", "IHI", "SPY", "IBIT", "SMH", "ARKK", "AIQ", "QTUM", "BOTZ", "UFO", "URA", "SLV", "REMX", "WGMI"];
const thematicRows = thematicTickers
  .map((ticker) => thematicMap.get(ticker))
  .filter(Boolean)
  .sort((a, b) => Number(b.rsi14) - Number(a.rsi14));

if (thematicRows.length < 20 || !thematicRows.some((row) => row.ticker === "SPY")) {
  throw new Error("Thematic Sector ETF 必須至少 20 檔並包含 SPY 基準。");
}

const chartSelection = ["USO", "XBI", "IBB", "XLE", "XLF", "AIQ", "SMH", "SLV"]
  .map((ticker) => {
    const row = thematicMap.get(ticker) || snapMap.get(ticker);
    if (!row) throw new Error(`缺少圖表 ETF：${ticker}`);
    return { ticker, value: Number(row.oneMonthPct) };
  });

const moverSpecs = [
  ["GEV", "Q2 營收 111 億美元高於 107.7 億預期，但 EPS 2.47 低於 3.17；公司上調全年展望", "大型電力設備股財報反應偏負面", "營收 Beat 未抵銷 EPS Miss；盤前缺口未收窄前不抄底。"],
  ["T", "Q2 調整後 EPS 0.65 高於 0.59，營收 316 億低於 320.4 億預期", "電訊防守股財報反應正面", "EPS Beat 與維持指引支撐，但營收仍是 Miss。"],
  ["LRCX", "昨日晶片急彈後獲利回吐，大型科技財報前降風險", "半導體設備鏈同步轉弱", "成交量足夠；未收回 VWAP 前按反彈失敗處理。"],
  ["INTC", "晶片板塊普遍回吐，市場等待本週後段財報", "成熟製程與 AI 鏈同跌", "跌幅與成交量同步放大，不能視為個股雜訊。"],
  ["MU", "記憶體昨日領漲後回吐", "拖累 SNDK 與設備鏈", "盤前成交最活躍；若未能迅速收復 VWAP，代表追價盤被套。"],
  ["KLAC", "設備鏈隨 SMH 回吐", "量測設備未能延續昨日修復", "與 LRCX／AMAT 同向，屬板塊訊號。"],
  ["AMAT", "設備鏈隨晶片風險偏好降溫", "確認賣壓並非單一記憶體股", "未收回 VWAP 前不逆勢承接。"],
  ["SNDK", "記憶體鏈昨日急升後回吐", "高 beta 記憶體再度放大波動", "盤前成交活躍；先看 1,500 整數位與 VWAP。"],
  ["CRCL", "高 beta 風險資產回吐", "加密支付與交易鏈承壓", "與 IBIT／COIN 同弱，風險偏好未全面修復。"],
  ["ARM", "AI 晶片授權鏈跟隨半導體回吐", "高 beta 科技降溫", "波動高，不宜把昨日反彈當趨勢反轉。"],
  ["MRVL", "AI／網通晶片同步回吐", "擴大晶片下跌廣度", "成交量足夠，留意開盤是否續弱。"],
  ["TSM", "全球晶片鏈在大型科技財報前轉為防守", "晶圓代工 ADR 未能獨強", "若 TSM 不能率先收復 VWAP，晶片修復可信度偏低。"],
  ["AMD", "AI 晶片跟隨 SMH 回落", "壓低 QQQ 與 XLK", "仍在本週預期波幅內，但短線方向轉弱。"],
  ["QCOM", "手機與邊緣晶片跟隨板塊回吐", "半導體賣壓擴散至非 AI 主線", "板塊廣度偏弱，等待止跌而非猜底。"],
  ["AVGO", "權重晶片在財報事件前降風險", "對 QQQ／SMH 形成權重壓力", "跌幅較設備股小，但仍未提供支撐。"],
  ["CAT", "油價上升同時長端利率偏高，工業權重回吐", "工業並未完全接棒能源", "不把商品上漲等同整個週期板塊走強。"],
  ["XOM", "原油因美伊衝突升溫而急漲", "支持能源股與再通膨交易", "能源相對強，但 USO 已突破週度上緣，避免追高。"],
  ["CVX", "原油盤前急漲", "大型能源權重相對抗跌", "可作對沖，但開盤若油價回吐需同步降風險。"],
  ["GOOGL", "盤後公布 Q2；市場預期 EPS 2.90、營收 1,169 億美元", "今晚將重新定價搜尋、雲端與 AI 資本支出", "盤前幅度有限，真正風險在盤後缺口。"],
  ["IBM", "盤後公布 Q2；市場預期 EPS 2.91", "企業科技與 AI 服務事件風險", "盤前走強不代表財報已被確認。"],
];

const preMarketMovers = moverSpecs.map(([ticker, catalyst, readThrough, judgment]) => {
  const row = q(ticker);
  return {
    ticker,
    price: num(row.price, Number(row.price) < 100 ? 3 : 2),
    premarket_change: signed(row.changePct),
    catalyst: `${catalyst}；${volume(row.volume)}`,
    read_through: readThrough,
    judgment,
  };
});

const spyQ = q("SPY");
const qqqQ = q("QQQ");
const smhQ = q("SMH");
const xlkQ = q("XLK");
const iwmQ = q("IWM");
const usoQ = q("USO");
const gldQ = q("GLD");
const slvQ = q("SLV");
const ibitQ = q("IBIT");
const gevQ = q("GEV");
const tQ = q("T");
const muQ = q("MU");
const sndkQ = q("SNDK");

const latestQuoteTime = [...quoteMap.values()]
  .map((row) => Date.parse(row.timestamp || 0))
  .filter(Number.isFinite)
  .sort((a, b) => b - a)[0];
const quoteTimeEt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(latestQuoteTime));

const majorNotes = {
  SPY: `昨收站上 20/50MA；盤前 ${num(spyQ.price)} 仍略高於 744.98／743.80，緩衝很薄。`,
  VOO: "與 SPY 同步，昨收三條均線全在下方，盤前小幅回吐。",
  QQQ: `低於 20/50MA；盤前 ${num(qqqQ.price)}，未收回 714.67／718.83。`,
  QQQE: "等權 Nasdaq 低於 20MA、略高於 50MA，廣度修復仍不完整。",
  RSP: "低於 20MA、仍高於 50/200MA；等權結構優於科技。",
  IWM: `昨收貼近 20MA；盤前 ${num(iwmQ.price)}，但廣度仍高於 60%。`,
  DIA: "低於 20MA、仍高於 50/200MA，偏防守但不是無條件避風港。",
  SMH: `低於 20/50MA；盤前 ${num(smhQ.price)}，昨日反彈被明顯回吐。`,
  VIX: "VIX 盤前約 17；RSI／均線欄使用 VIXY 代理，波動未恐慌但事件風險集中。",
};
const vixProxy = { ...s("VIXY"), ticker: "VIX", close: 17.00, dailyPct: -8.85 };
const majorBody = ["SPY", "VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA", "SMH", "VIX"]
  .map((ticker) => majorRow(ticker === "VIX" ? vixProxy : s(ticker), majorNotes[ticker]))
  .join("\n");

const atrBody = ["VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA"].map((ticker) => {
  const row = s(ticker);
  const extension = Number(row.extension50Atr);
  const judgment = Math.abs(extension) >= 2.5
    ? "延伸偏大，持有但不追價。"
    : extension < -0.5
      ? "低於 50MA，先等待趨勢修復。"
      : "距 50MA 不極端，以均線方向判斷。";
  return `<tr><td>${ticker}</td><td class="num">${num(row.close)}</td><td class="num">${num(row.ma50)}</td><td class="num">${num(row.atr14)}</td><td class="num ${trendClass(extension)}">${signed(extension, "", 2)}</td><td>${judgment}</td></tr>`;
}).join("\n");

const data = { ...base };
Object.assign(data, {
  report_type: "premarket",
  report_title: "2026-07-22｜美股盤前監控",
  report_eyebrow: "2026-07-22｜盤前更新",
  report_heading: "晶片反彈隔夜回吐，油價突破週度上緣；大型科技財報前先守風險",
  data_timestamp_note: `盤前價格：長橋 OpenAPI ${quoteTimeEt} ET；RSI／均線／ATR：長橋 2026-07-21 完整日線；市場廣度與 Stockbee：使用者 Google Sheets 更新至 2026-07-21；本週預期波幅：7月20日至24日。`,
  risk_badge: "中等風險｜晶片回吐、油價突破",
  qqq_reengage_20ma: "714.67",
  qqq_breakout_add_1sd: "717.68",
  summary_cards: `<div class="card"><span>QQQ 盤前</span><strong class="dn">${signed(qqqQ.changePct)}</strong><small>${num(qqqQ.price)}，仍低於 20/50MA。</small></div><div class="card"><span>SMH 盤前</span><strong class="dn">${signed(smhQ.changePct)}</strong><small>${num(smhQ.price)}，昨日 +4.52% 後回吐。</small></div><div class="card"><span>USO 盤前</span><strong class="up">${signed(usoQ.changePct)}</strong><small>${num(usoQ.price)}，突破週度 +1SD 132.41。</small></div><div class="card"><span>IWM &gt;20MA／5D ratio</span><strong class="up">60.63%／1.00</strong><small>小型股改善，但科技廣度仍低於 50%。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才成立：價格、晶片擴散與市場廣度至少兩項同步改善，才由防守轉中性。",
  upgrade_trigger_1: "SPY 守住 744.98／743.80；QQQ 收回 714.67（20MA）再站上 717.68／718.83。",
  upgrade_trigger_2: "SMH 收回 598.40／601.63，MU／SNDK／設備鏈至少三項同步站回 VWAP。",
  upgrade_trigger_3: "NDX >20MA 與 >50MA 同回 50% 以上，Stockbee 5D ratio 嚴格高於 1。",
  downgrade_trigger_rule: "滿足 1/3 即成立：大盤失守均線、晶片再破低點，或再通膨訊號加速，風險升級。",
  downgrade_trigger_1: "SPY 跌破 743.80，且 QQQ 跌破 696.06 的本週起點。",
  downgrade_trigger_2: "SMH 跌破 556.53，MU／SNDK／設備鏈再度擴大跌幅。",
  downgrade_trigger_3: "USO 持續站上 132.41，並伴隨 US10Y >4.65% 或 DXY >102。",
  core_conclusions: `<ol><li><strong>昨日晶片急彈正在被全面回吐。</strong>QQQ 盤前 ${signed(qqqQ.changePct)}、SMH ${signed(smhQ.changePct)}；LRCX、MU、INTC、KLAC、AMAT、SNDK、ARM、MRVL、TSM、AMD 與 AVGO 同跌，且多數成交量具代表性。</li><li><strong>大盤仍有均線緩衝，但科技沒有完成復位。</strong>SPY 盤前 ${num(spyQ.price)}，略高於 20MA 744.98 與 50MA 743.80；QQQ／SMH 仍低於 20/50MA，昨日修復不足以確認反轉。</li><li><strong>能源與避險資產成為相對強勢。</strong>USO 盤前 ${signed(usoQ.changePct)} 並升破週度 +1SD 132.41；GLD ${signed(gldQ.changePct)}、SLV ${signed(slvQ.changePct)}。原油上漲來自美伊衝突升溫，對能源有利、對通膨與長久期科技不利。</li><li><strong>市場廣度較前一日改善，但科技仍是缺口。</strong>IWM >20MA／>50MA 升至 60.63%／62.68%，Stockbee 4% 上漲／下跌 473／132、T2108 50.88%；但 NDX >20MA／>50MA 只有 47.54%／43.68%，5D ratio 只是 1.00、10D ratio 仍為 0.91。</li><li><strong>今天沒有一級美國宏觀發布，EIA 原油庫存是次級重點。</strong>預期減少 150 萬桶，前值減少 169.2 萬桶；Actual 尚未公布，不能用預估冒充結果。</li><li><strong>盤後財報是主要二元事件。</strong>GOOGL 預期 EPS 2.90／營收 1,169 億美元，TSLA 預期 EPS 0.54／營收 264 億美元；IBM、NOW、TXN 亦於盤後公布，日內不宜在收盤前無條件放大事件曝險。</li></ol><p class="section-summary"><strong>本段結論：</strong>今天不是單純的指數小幅低開，而是「晶片反彈失去延續、能源突破、重大財報集中」的組合。大盤尚未全面轉空，但科技升級條件未成立，維持中性偏防守。</p>`,
  positioning_primary: "主線：降低未收回 VWAP 的晶片與高 beta 曝險；能源只保留相對強勢倉，不追逐突破後的盤前高點。",
  positioning_secondary: "次線：以 SPY／RSP／XLF／XLV 作大盤緩衝，保留 GOOGL／TSLA 盤後事件所需現金。",
  positioning_watch: "觀察：SPY 744.98／743.80、QQQ 714.67／718.83、SMH 598.40／601.63、USO 132.41、DXY 102、US10Y 4.65%。",
  positioning_invalidation: "若 QQQ 與 SMH 同步收回 20/50MA、NDX 兩項廣度回到 50% 且油價回落至 132.41 下方 → 中性偏防守定位失效，可提高科技曝險。",
  pre_market_movers: preMarketMovers,
  pre_market_movers_note: `<div class="callout warn"><strong>長橋盤前快照：</strong>本表使用 ${quoteTimeEt} ET 最新成交；只保留有實際盤前成交與可解釋催化的股票。GEV、T 的財報 Actual／Forecast 已逐項核對；晶片股的共同催化是昨日急彈後獲利回吐及大型科技財報前降風險。</div><p class="section-summary"><strong>本段結論：</strong>下跌榜由 GEV 與晶片鏈主導，上漲榜以 T 與能源股為主。這是明確的板塊輪動，不是個別股票雜訊。</p>`,
  section_pre_market_movers_primary_action: "主線：晶片先看能否收回 VWAP；未收回前不逆勢抄底。",
  section_pre_market_movers_condition_action: "條件：GEV 只有重新站回 1,030 且量價改善才視為財報跌幅收斂；T 守住 VWAP 才保留 Beat 交易。",
  section_pre_market_movers_avoid_action: "避免：把 GEV 的營收 Beat 忽略 EPS Miss，或把晶片全面回吐解讀成單一公司消息。",
  premarket_movers_invalidation: "若 SMH、MU、SNDK、LRCX 同步收回 VWAP，且 QQQ 回到 708.97 昨收上方 → 晶片回吐主線失效。",
  correction_checklist_dashboard: `<div class="checks"><div class="check low"><span>S&amp;P 500 overextension／大盤過度延伸</span><strong><span class="badge green">Low</span> SPY 距 50MA 只有 +0.54 ATR，沒有過熱。</strong></div><div class="check high"><span>Increasing downward momentum／下跌動能增加</span><strong><span class="badge red">High</span> 晶片昨日急彈後，盤前多檔同步回吐 2%–3%。</strong></div><div class="check mid"><span>Top range formation &amp; breakdown／高位區間跌破</span><strong><span class="badge amber">Intermediate</span> QQQ／SMH 仍低於 20/50MA，但尚在週度 ±1SD 內。</strong></div><div class="check high"><span>Technical indicators deteriorating／技術指標惡化</span><strong><span class="badge red">High</span> QQQ、SMH、XLK 完整日線仍低於 20/50MA。</strong></div><div class="check mid"><span>Market breadth worsening／市場廣度惡化</span><strong><span class="badge amber">Intermediate</span> IWM 與 Stockbee 改善，但 NDX 兩項廣度仍低於 50%。</strong></div><div class="check low"><span>VIX &gt;20／波動升溫</span><strong><span class="badge green">Low</span> VIX 盤前約 17，尚未出現恐慌訊號。</strong></div><div class="check mid"><span>Breakout win rate down／breakdown rate up</span><strong><span class="badge amber">Intermediate</span> MU 昨日突破後回到週度區間；USO、GLD 則向上突破。</strong></div><div class="check high"><span>Theme stocks momentum weakening／主題動能轉弱</span><strong><span class="badge red">High</span> 半導體、AI 與加密高 beta 同步偏弱。</strong></div></div><div class="callout warn"><strong>Checklist Score：</strong>3／8 High = Intermediate Risk。大盤未全面破壞，但科技回吐與油價突破令風險分布不利。</div><p class="section-summary"><strong>本段結論：</strong>風險不是恐慌，而是科技尚未修復、商品再通膨升溫；倉位應比指數跌幅看起來更保守。</p>`,
  section_correction_checklist_primary_action: "主線：維持中性倉位，讓開盤價格先證明晶片是否止跌。",
  section_correction_checklist_condition_action: "條件：3 項 High 降至 1 項以下，再恢復基準科技配置。",
  section_correction_checklist_avoid_action: "避免：因 VIX 低於 20 就忽略晶片、油價與財報的集中風險。",
  checklist_invalidation: "若 VIX >20、SPY <743.80 或 5D ratio <0.80 任一成立 → 中等風險判斷失效，升級為高風險。",
  macro_premarket_background_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>宏觀／財報事件</th><th class="num">Actual</th><th class="num">Forecast</th><th class="num">Previous</th><th>Beat／Miss</th><th>市場含義</th></tr></thead><tbody><tr><td>美國一級宏觀數據</td><td class="num" data-allow-missing>今天無發布</td><td class="num" data-allow-missing>—</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">無事件</span></td><td>宏觀日程清淡，財報與油價主導盤前。</td></tr><tr><td>EIA 原油庫存（10:30 ET）</td><td class="num" data-allow-missing>待公布</td><td class="num">-1.500M</td><td class="num">-1.692M</td><td><span class="badge gray">未公布</span></td><td>USO 已突破週度上緣，庫存結果可能放大油價波動。</td></tr><tr><td>T Q2</td><td class="num">EPS 0.65／營收 316億</td><td class="num">0.59／320.4億</td><td class="num">0.54／308億</td><td><span class="badge amber">Beat／Miss</span></td><td>EPS 高 0.06、營收低 4.4 億；維持全年指引，盤前 ${signed(tQ.changePct)}。</td></tr><tr><td>GEV Q2</td><td class="num">EPS 2.47／營收 111億</td><td class="num">3.17／107.7億</td><td class="num">1.86／91億</td><td><span class="badge amber">Miss／Beat</span></td><td>EPS 低 0.70、營收高 3.3 億；雖上調指引，盤前 ${signed(gevQ.changePct)}。</td></tr><tr><td>GOOGL Q2（盤後）</td><td class="num" data-allow-missing>待公布</td><td class="num">EPS 2.90／營收 1,169億</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">未公布</span></td><td>搜尋、雲端與 AI 資本支出將重定價 QQQ。</td></tr><tr><td>TSLA Q2（盤後）</td><td class="num" data-allow-missing>待公布</td><td class="num">EPS 0.54／營收 264億</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">未公布</span></td><td>焦點是 robotaxi 擴張與汽車毛利率。</td></tr><tr><td>IBM／NOW／TXN（盤後）</td><td class="num" data-allow-missing>待公布</td><td class="num">EPS 2.91／0.86／1.92</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">未公布</span></td><td>企業科技、軟體與類比晶片同時面臨事件風險。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>早盤已公布財報呈現分化：T 為 EPS Beat／營收 Miss，GEV 為 EPS Miss／營收 Beat；盤後五家公司將把事件風險集中到大型科技與企業軟體。</p>`,
  section_macro_premarket_background_primary_action: "主線：已公布財報按 Actual 對 Forecast 逐項交易；盤後事件前不擴大隔夜科技曝險。",
  section_macro_premarket_background_condition_action: "條件：T、GEV 只有守住開盤區間與 VWAP，財報訊號才具延續性。",
  section_macro_premarket_background_avoid_action: "避免：把尚未公布的 EIA、GOOGL、TSLA、IBM、NOW、TXN 預期寫成 Actual。",
  macro_invalidation: "若 EIA 庫存意外增加且 USO 跌回 132.41 下方 → 油價突破與再通膨主線失效。",
  sector_momentum_chart: chartRows(chartSelection),
  sector_thematic_etf_tables: `${etfTable(sectorRows, "S&amp;P 500 Sector ETF（按 RSI 排序）")}${etfTable(thematicRows, "Thematic Sector ETF（含 SPY 基準，按 RSI 排序）")}<div class="callout"><strong>資料口徑：</strong>全部 RSI、MA 與完整日線漲跌均由長橋取得，更新至 2026-07-21；Thematic 表共 ${thematicRows.length} 檔並包含 SPY，沒有使用 Google RSI 公式。</div><p class="section-summary"><strong>本段結論：</strong>能源、金融與醫療 RSI 領先，半導體與 AI 仍低於關鍵均線；盤前能源續強、晶片回吐，與完整日線輪動方向一致。</p>`,
  section_sector_thematic_etf_primary_action: "主線：保留 XLE／XLF／XLV 等完整日線相對強勢；晶片只在收回均線後升級。",
  section_sector_thematic_etf_condition_action: "條件：SMH 與 XLK 同時站回 50MA、RSI 回到 50 上方，才由反彈交易升級為趨勢配置。",
  section_sector_thematic_etf_avoid_action: "避免：只按盤前漲跌排序而忽略 RSI、均線與 SPY 基準。",
  sector_etf_invalidation: "若 XLE 跌回 50MA 下方、USO 失守 132.41，而 SMH 收回 20/50MA → 能源優先配置失效，轉看科技輪動。",
  major_etf_technical_table: `<div class="table-scroll"><table class="ma-table report-data-table report-cols-8"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${majorBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>SPY 昨收剛回到 20/50MA 上方，但 QQQ／SMH／XLK 仍低於兩條均線。大盤有緩衝，科技沒有升級。</p>`,
  section_major_etf_technical_primary_action: "主線：SPY 守 744.98／743.80，QQQ 未站回 714.67 前科技低於基準配置。",
  section_major_etf_technical_condition_action: "條件：QQQ／QQQE 同回 20MA、SMH 收回 598.40，才確認科技廣度改善。",
  section_major_etf_technical_avoid_action: "避免：用 SPY 站回均線替代 QQQ／SMH 的技術確認。",
  major_etf_invalidation: "若 QQQ >718.83（50MA）且 SMH >601.63（20MA）→ 技術防守判斷失效。",
  fifty_ma_atr_extension_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>${atrBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>主要指數距 50MA 都不極端；QQQ 低於 50MA 0.66 ATR，屬趨勢未修復，而不是深度超賣。RSP／DIA 仍保有正延伸。</p>`,
  section_50ma_atr_extension_primary_action: "主線：以 50MA 作風格切換線，保留 RSP／DIA 緩衝。",
  section_50ma_atr_extension_condition_action: "條件：QQQ 距 50MA ATR 回到 0 以上，再提高成長股曝險。",
  section_50ma_atr_extension_avoid_action: "避免：把低於 50MA 0.66 ATR 解讀成必然反彈。",
  atr_extension_invalidation: "若 RSP／DIA 跌回 50MA 下方、QQQ 同時續弱 → 等權與防守緩衝失效。",
  market_breadth_table: `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>近期變化</th><th>約1月趨勢</th><th>判斷</th></tr></thead><tbody><tr><td>SPX &gt;20MA</td><td class="num">48.90%</td><td>52.08% → 48.90%</td><td>跌破 50%</td><td>與 SPY 上漲形成分歧，需留意資料時間差。</td></tr><tr><td>SPX &gt;50MA</td><td class="num">59.24%</td><td>60.63% → 59.24%</td><td>仍接近 60%</td><td>中期大盤尚有緩衝。</td></tr><tr><td>NDX &gt;20MA</td><td class="num">47.54%</td><td>41.74% → 47.54%</td><td>改善但仍低於 50%</td><td>科技短線廣度未確認。</td></tr><tr><td>NDX &gt;50MA</td><td class="num">43.68%</td><td>43.68% → 43.68%</td><td>持續低於 50%</td><td>科技中期廣度仍弱。</td></tr><tr><td>IWM &gt;20MA</td><td class="num">60.63%</td><td>46.84% → 60.63%</td><td>快速回到 60%</td><td>小型股短線廣度明顯改善。</td></tr><tr><td>IWM &gt;50MA</td><td class="num">62.68%</td><td>59.15% → 62.68%</td><td>站穩 60% 上方</td><td>小型股中期結構較健康。</td></tr><tr><td>T2108</td><td class="num">50.88%</td><td>49.35% → 50.88%</td><td>重返 50%</td><td>全市場長線廣度轉中性。</td></tr><tr><td>5D ratio</td><td class="num">1.00</td><td>0.77 → 1.00</td><td>回到中性門檻</td><td>尚未嚴格高於 1，不能視為多頭確認。</td></tr><tr><td>10D ratio</td><td class="num">0.91</td><td>0.69 → 0.91</td><td>仍低於 1</td><td>中短線修復尚未完成。</td></tr><tr><td>4%+ 上漲／下跌</td><td class="num">473／132</td><td>132／215 → 473／132</td><td>單日推進明顯</td><td>昨日風險偏好急升，但需觀察延續。</td></tr><tr><td>季度 +25%／-25%</td><td class="num">1225／1150</td><td>1189／1244 → 1225／1150</td><td>強股略多</td><td>中期結構回到溫和偏多。</td></tr><tr><td>月度 +25%／-25%</td><td class="num">144／181</td><td>142／263 → 144／181</td><td>弱股仍較多</td><td>短線壓力尚未完全解除。</td></tr></tbody></table></div>`,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>綜合廣度：</strong>三大指數顯示小型股最健康、科技最弱：IWM >20/50MA 為 60.63%／62.68%，NDX 只有 47.54%／43.68%。Stockbee 的 473／132、T2108 50.88% 顯示昨日單日推進強，但 5D ratio 只到 1.00、10D 仍為 0.91，月度弱股 181 仍多於強股 144。SPX >20MA 48.90% 與 SPY 上漲分歧，視為資料時間差／成分廣度異常，不能靜默忽略。</div><p class="section-summary"><strong>小結：</strong>廣度已由全面偏弱改善為「小型股偏強、科技偏弱、Stockbee 中性」。中期尚未破壞，但科技反彈缺少廣度確認，今天不宜激進追多。</p>`,
  section_market_breadth_primary_action: "主線：保留 IWM／RSP 的相對強勢，科技曝險等待 NDX 兩項廣度回到 50%。",
  section_market_breadth_condition_action: "條件：5D ratio 嚴格 >1、10D ratio >1、NDX >20/50MA 同回 50%，才提高總 beta。",
  section_market_breadth_avoid_action: "避免：只引用 Stockbee 的 473／132，而忽略 NDX 技術廣度與 SPX 資料分歧。",
  breadth_invalidation: "若 IWM >20MA 跌回 50%、T2108 <50%，且 5D ratio <0.80 → 廣度修復失效。",
  fx_commodities_table: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">最新</th><th class="num">日變化</th><th class="num">5日</th><th class="num">1月</th><th>對美股含義</th></tr></thead><tbody><tr><td>DXY</td><td class="num">約 101.15</td><td class="num" data-allow-missing>亞洲時段</td><td class="num" data-allow-missing>—</td><td class="num" data-allow-missing>—</td><td>仍低於 102 減科技線，但美元未提供明顯寬鬆。</td></tr><tr><td>US10Y</td><td class="num">4.63%（昨收）</td><td class="num dn">TLT ${signed(q("TLT").changePct)}</td><td class="num" data-allow-missing>—</td><td class="num" data-allow-missing>—</td><td>長端仍高，油價上漲增加再通膨壓力。</td></tr><tr><td>USO</td><td class="num">${num(usoQ.price)}</td><td class="num ${trendClass(usoQ.changePct)}">${signed(usoQ.changePct)}</td><td class="num ${trendClass(s("USO").fiveDayPct)}">${signed(s("USO").fiveDayPct)}</td><td class="num ${trendClass(s("USO").oneMonthPct)}">${signed(s("USO").oneMonthPct)}</td><td>突破週度 +1SD 132.41，能源受益、科技估值受壓。</td></tr><tr><td>GLD</td><td class="num">${num(gldQ.price)}</td><td class="num ${trendClass(gldQ.changePct)}">${signed(gldQ.changePct)}</td><td class="num ${trendClass(s("GLD").fiveDayPct)}">${signed(s("GLD").fiveDayPct)}</td><td class="num ${trendClass(s("GLD").oneMonthPct)}">${signed(s("GLD").oneMonthPct)}</td><td>盤前站上週度 +1SD 377.57，避險需求升溫。</td></tr><tr><td>SLV</td><td class="num">${num(slvQ.price)}</td><td class="num ${trendClass(slvQ.changePct)}">${signed(slvQ.changePct)}</td><td class="num ${trendClass(s("SLV").fiveDayPct)}">${signed(s("SLV").fiveDayPct)}</td><td class="num ${trendClass(s("SLV").oneMonthPct)}">${signed(s("SLV").oneMonthPct)}</td><td>盤前續彈，但完整日線仍低於三條均線。</td></tr><tr><td>CPER</td><td class="num">${num(q("CPER").price)}</td><td class="num dn">${signed(q("CPER").changePct)}</td><td class="num ${trendClass(s("CPER").fiveDayPct)}">${signed(s("CPER").fiveDayPct)}</td><td class="num ${trendClass(s("CPER").oneMonthPct)}">${signed(s("CPER").oneMonthPct)}</td><td>盤前只有 ${volume(q("CPER").volume)}，成交不足，不作方向確認。</td></tr><tr><td>IBIT</td><td class="num">${num(ibitQ.price)}</td><td class="num ${trendClass(ibitQ.changePct)}">${signed(ibitQ.changePct)}</td><td class="num ${trendClass(s("IBIT").fiveDayPct)}">${signed(s("IBIT").fiveDayPct)}</td><td class="num ${trendClass(s("IBIT").oneMonthPct)}">${signed(s("IBIT").oneMonthPct)}</td><td>加密代理回吐，與晶片共同反映高 beta 降溫。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>DXY 未觸發 102，但油價已突破風險線、黃金也突破週度上緣；這不是低利率型科技 risk-on，而是地緣風險與再通膨訊號並存。</p>`,
  section_fx_commodities_primary_action: "主線：保留 DXY，並把 USO >132.41 視為已觸發的減長久期訊號。",
  section_fx_commodities_condition_action: "條件：DXY >102 或 US10Y >4.65%，進一步降低高估值科技。",
  section_fx_commodities_avoid_action: "避免：追逐 USO／GLD 盤前突破，或用 CPER 低成交量確認商品全面走強。",
  forex_commodity_invalidation: "若 USO 與 GLD 同跌回週度上緣下方，DXY <101、US10Y 下行 → 再通膨／避險主線失效。",
  treasury_fed_economic_data_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>項目</th><th class="num">Actual／最新</th><th class="num">Forecast</th><th class="num">Previous</th><th>政策與市場含義</th></tr></thead><tbody><tr><td>US10Y</td><td class="num">4.63%（7/21 收盤）</td><td class="num" data-allow-missing>—</td><td class="num">約 4.60%</td><td>長端仍在高位，盤前 TLT ${signed(q("TLT").changePct)}。</td></tr><tr><td>EIA 原油庫存（10:30 ET）</td><td class="num" data-allow-missing>待公布</td><td class="num">-1.500M</td><td class="num">-1.692M</td><td>USO 已突破 132.41，Actual 若小於預期可能延續再通膨壓力。</td></tr><tr><td>10 年期公債標售</td><td class="num" data-allow-missing>待公布</td><td class="num" data-allow-missing>無一致預期</td><td class="num" data-allow-missing>—</td><td>投標需求弱會推升長端殖利率。</td></tr><tr><td>20 年期公債標售</td><td class="num" data-allow-missing>待公布</td><td class="num" data-allow-missing>無一致預期</td><td class="num" data-allow-missing>—</td><td>與大型科技財報共同影響收盤前風險。</td></tr><tr><td>FOMC 背景</td><td class="num">7月28至29日會議</td><td class="num" data-allow-missing>—</td><td class="num">目標利率 3.50%–3.75%</td><td>靜默期內，市場由油價、長端與財報主導。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>今天沒有一級總體數據；EIA 與公債標售雖屬次級事件，但油價已突破、US10Y 高企，使其對科技估值的邊際影響高於平常。</p>`,
  section_treasury_fed_primary_action: "主線：同看 US10Y、USO 與 QQQ／SMH，財報日不單靠宏觀表交易。",
  section_treasury_fed_condition_action: "條件：US10Y 下行、USO 回到 132.41 下方且 QQQ 收回 714.67（20MA），才確認宏觀開始支持科技。",
  section_treasury_fed_avoid_action: "避免：把 EIA Forecast 寫成 Actual，或把清淡日程描述成一級宏觀催化。",
  treasury_invalidation: "若 US10Y >4.65% 且 SPY <743.80 → 中等風險判斷失效，降低總曝險。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">週度 -1SD</th><th class="num">週度 +1SD</th><th>狀態</th><th>行動</th></tr></thead><tbody><tr><td>SPY</td><td class="num dn">${num(spyQ.price)}</td><td class="num">730.03</td><td class="num">756.55</td><td><span class="badge blue">均線上方</span></td><td>守住 744.98／743.80 才維持核心倉。</td></tr><tr><td>QQQ</td><td class="num dn">${num(qqqQ.price)}</td><td class="num">672.99</td><td class="num">717.68</td><td><span class="badge amber">均線下方</span></td><td>先收回 708.97 昨收，再看 714.67／718.83。</td></tr><tr><td>SMH</td><td class="num dn">${num(smhQ.price)}</td><td class="num">514.63</td><td class="num">598.44</td><td><span class="badge amber">反彈回吐</span></td><td>未收回 598.40 前不升級趨勢。</td></tr><tr><td>XLK</td><td class="num dn">${num(xlkQ.price)}</td><td class="num">168.26</td><td class="num">182.92</td><td><span class="badge amber">低於均線</span></td><td>晶片回吐、軟體面臨盤後事件，不追。</td></tr><tr><td>IWM</td><td class="num dn">${num(iwmQ.price)}</td><td class="num">287.51</td><td class="num">300.57</td><td><span class="badge blue">區間內</span></td><td>廣度較健康，可作分散但仍守 290.35。</td></tr><tr><td>USO</td><td class="num up">${num(usoQ.price)}</td><td class="num">115.51</td><td class="num">132.41</td><td><span class="badge red">已突破 +1SD</span></td><td>不追價；持倉以 132.41 作風險線。</td></tr><tr><td>GLD</td><td class="num up">${num(gldQ.price)}</td><td class="num" data-allow-missing>—</td><td class="num">377.57</td><td><span class="badge red">已突破 +1SD</span></td><td>避險突破但勿在盤前高點追。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>USO 與 GLD 已向上突破週度上緣，QQQ／SMH 則仍在區間內且低於均線。今天的核心不是抄科技低開，而是管理再通膨與盤後財報風險。</p><div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>晶片未收回 VWAP 前降倉；SPY 守均線才保留核心部位。</li><li class="ad-secondary"><strong>次線：</strong>能源與黃金只持有不追價，利用 132.41／377.57 管理突破風險。</li><li class="ad-watch"><strong>觀察：</strong>743.80、708.97、714.67、598.40、132.41、4.65%、DXY 102。</li><li class="ad-avoid"><strong>避免：</strong>抄 GEV 缺口、追 USO／GLD、在 GOOGL／TSLA 財報前放大隔夜槓桿。</li><li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：若 QQQ >718.83（50MA）、SMH >601.63（20MA）、NDX 兩項廣度 >50% → 防守失效，逐步提高科技曝險。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "SMH／MU／SNDK／LRCX 均未收回 VWAP", interpretation: "晶片昨日反彈失敗", action: "降低高 beta，保留 SPY／RSP 與現金。" },
    { time_slot: "09:30 ORB", trigger_event: "T 守 VWAP、GEV 持續低於開盤區間", interpretation: "財報反應與 Beat／Miss 結構一致", action: "只做相對強弱，不因單一營收 Beat 抄 GEV。" },
    { time_slot: "10:30", trigger_event: "EIA Actual 小於 -1.500M", interpretation: "庫存降幅大於預期、油價可能續強", action: "持有能源但不追 USO；降低長久期科技。" },
    { time_slot: "10:30", trigger_event: "EIA Actual 高於預期且 USO <132.41", interpretation: "油價突破失敗", action: "減能源突破倉，科技再看均線修復。" },
    { time_slot: "14:00", trigger_event: "US10Y >4.65% 或 VIX >20", interpretation: "宏觀／波動風險升級", action: "降低 QQQ、SMH 與高估值軟體。" },
    { time_slot: "15:30 MOC", trigger_event: "GOOGL／TSLA／IBM／NOW／TXN 財報前", interpretation: "隔夜二元風險集中", action: "未有明確對沖者降低隔夜槓桿與單一股票曝險。" },
  ],
  cross_validation_summary: `<div class="callout ok"><strong>確認訊號：</strong>長橋盤前顯示晶片設備、記憶體與 AI 鏈同步下跌；USO、XOM、CVX 與貴金屬走強。AT&amp;T 官方財報確認調整後 EPS 0.65、營收 316 億美元。</div><div class="callout warn"><strong>分歧訊號：</strong>Stockbee 與 IWM 廣度改善，但 NDX >20/50MA 仍低於 50%；SPX >20MA 48.90% 與 SPY 上漲分歧；VIX 約 17 未恐慌，卻不能抵銷晶片、油價與盤後財報風險。</div><div class="callout"><strong>主導結論：</strong>今天是「晶片回吐、能源突破、財報事件集中」，不是全面風險崩壞。維持中等風險，中性偏防守，等價格與廣度共同確認。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：${quoteTimeEt} ET 盤前價格與成交量，以及 2026-07-21 完整日線 RSI／MA／ATR；使用者 Google Sheets：Market breadth 與 Stockbee 更新至 7/21；<a href="https://apnews.com/article/207dfa55d180fcc565420454178168c5">AP：美股期貨、油價與美伊衝突</a>；<a href="https://www.streetinsider.com/Reuters/Wall%2BSt%2Bfutures%2Bedge%2Blower%2Bas%2Bcaution%2Bbuilds%2Bahead%2Bof%2BBig%2BTech%2Bearnings/26797374.html">Reuters：大型科技財報前風險與晶片回吐</a>；<a href="https://about.att.com/story/2026/2q-earnings.html">AT&amp;T 官方 Q2 財報</a>；<a href="https://www.gevernova.com/news/press-releases/ge-vernova-announce-second-quarter-2026-financial-results-july-22">GE Vernova 財報日程</a>；<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">本週財報日程與一致預期</a>；<a href="https://www.investing.com/economiccalendar/eia-crude-oil-inventories-75">EIA 庫存 Actual／Forecast／Previous</a>；<a href="https://www.fxstreet.com/news/united-states-dollar-index-weakens-to-near-10100-despite-mounting-middle-east-tensions-202607220251">DXY 亞洲時段</a>；<a href="https://www.cboe.com/delayed_quotes/_vix/quote_table/">Cboe VIX</a>。</p><p class="source-note">本報告為本地盤前草稿，不構成投資建議。盤前價格可能快速變動；未公布的 Actual 全部標示「待公布」，沒有用 Forecast 冒充結果。長橋新聞端點本輪連線失敗，因此催化與財報數字以官方來源、AP／Reuters 交叉核對；價格、成交量與技術數據仍全部使用長橋。</p>`,
});

const output = path.join(root, "data", "2026-07-22-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, quoteTimeEt, movers: preMarketMovers.length, sectorRows: sectorRows.length, thematicRows: thematicRows.length }, null, 2));
