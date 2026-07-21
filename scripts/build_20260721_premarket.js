#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.join(root, "..");
const base = require(path.join(root, "data", "2026-07-20-premarket.json"));
const fullQuotes = require(path.join(work, "premarket_quotes_0721.json"));
const scanQuotes = require(path.join(work, "premarket_movers_0721.json"));
const snapshot = require(path.join(work, "postmarket_snapshot_2026-07-20.json")).rows;
const thematic = require(path.join(work, "thematic_rsi_longport.json")).rows;

const quoteMap = new Map([...fullQuotes, ...scanQuotes].map((row) => [row.ticker, row]));
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
  const valueNumber = Number(value);
  return `${valueNumber > 0 ? "+" : ""}${num(valueNumber, digits)}${suffix}`;
}

function trendClass(value) {
  return Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
}

function volume(value) {
  const valueNumber = Number(value || 0);
  return valueNumber >= 10000
    ? `${num(valueNumber / 10000, 1)} 萬股`
    : `${Math.round(valueNumber).toLocaleString("zh-Hant")} 股`;
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
  if (Number(row.rsi14) >= 70) return "RSI 過熱，持有不追價。";
  if (Number(row.rsi14) <= 30) return "RSI 超賣，先等止跌確認。";
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

function q(ticker) {
  const row = quoteMap.get(ticker);
  if (!row) throw new Error(`缺少長橋盤前行情：${ticker}`);
  return row;
}

function s(ticker) {
  const row = snapMap.get(ticker);
  if (!row) throw new Error(`缺少完整交易日行情：${ticker}`);
  return row;
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

const chartSelection = ["XBI", "IBB", "KIE", "CIBR", "SMH", "QTUM", "SLV", "WGMI"]
  .map((ticker) => ({ ticker, value: thematicMap.get(ticker).oneMonthPct }));

const moverSpecs = [
  ["SNDK", "記憶體／儲存族群延續全球反彈", "記憶體鏈風險偏好回升", "漲幅領先但已離盤前低點較遠，開盤不追高。"],
  ["MU", "記憶體供需與價格前景獲券商正面解讀", "帶動記憶體與半導體設備鏈", "成交量充足；守住 VWAP 才視為有效延續。"],
  ["LRCX", "晶圓設備跟隨記憶體鏈修復", "設備股參與令反彈廣度改善", "仍低於 SMH 關鍵均線，先按修復行情處理。"],
  ["AMAT", "半導體設備同步上漲", "確認反彈不只集中在記憶體個股", "開盤若設備鏈失守 VWAP，降低追價意願。"],
  ["MRVL", "AI／網通晶片高 beta 修復", "網通半導體加入反彈", "盤前量能較高，但仍須觀察開盤承接。"],
  ["INTC", "晶片板塊普遍回升", "成熟製程亦有資金回補", "公司趨勢未因單日上漲改變。"],
  ["ARM", "AI 晶片授權鏈跟隨反彈", "高 beta 科技情緒改善", "波動高，只適合確認後的小倉位。"],
  ["KLAC", "半導體檢測設備同步修復", "設備鏈反彈進一步擴散", "若 SMH 回落，設備股也可能快速吐回。"],
  ["AMD", "AI 晶片延續技術反彈", "支撐 QQQ 與 SMH", "仍低於本週上方壓力，先視為修復。"],
  ["TSM", "亞洲晶片股上漲後 ADR 跟進", "全球晶片反彈獲供應鏈確認", "留意開盤後是否維持相對強勢。"],
  ["COIN", "加密資產風險偏好回升", "高 beta 交易活躍", "與晶片同漲但驅動不同，不作板塊確認。"],
  ["CRCL", "加密支付概念跟隨反彈", "風險偏好邊際改善", "波動高，僅觀察不追盤前高點。"],
  ["MMM", "EPS 2.40 美元高於 2.25；營收 65.0 億高於 64.0 億", "工業股財報 Beat 並上調全年 EPS 指引", "業績與指引同向，屬今天較乾淨的財報反應。"],
  ["ADBE", "Morgan Stanley 對軟體覆蓋持審慎看法", "拖累 IGV／XSW 與軟體估值", "與晶片反向，顯示科技內部仍明顯分化。"],
  ["CRM", "企業軟體跟隨 ADBE 承壓", "大型軟體未接棒晶片反彈", "未收回 VWAP 前不抄底。"],
  ["NOW", "大型軟體延續相對弱勢", "軟體板塊落後半導體", "科技反彈不能外推至整個軟體板塊。"],
  ["MSFT", "權重軟體未跟隨晶片上漲", "限制 QQQ 上行斜率", "若轉強才算大型科技接棒。"],
  ["PLTR", "高 beta 軟體小幅回吐", "AI 應用層未同步修復", "跌幅有限但相對弱勢仍在。"],
];

const preMarketMovers = moverSpecs.map(([ticker, catalyst, readThrough, judgment]) => {
  const row = q(ticker);
  return {
    ticker,
    price: num(row.price, row.price < 100 ? 3 : 2),
    premarket_change: signed(row.changePct),
    catalyst: `${catalyst}；成交 ${volume(row.volume)}`,
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
const sndkQ = q("SNDK");
const muQ = q("MU");

const majorNotes = {
  SPY: `昨收低於 20/50MA；盤前 ${num(spyQ.price)} 已回到兩條均線附近，仍需收盤確認。`,
  VOO: "與 SPY 同步，昨收仍略低於 20/50MA。",
  QQQ: `低於 20/50MA；盤前 ${num(qqqQ.price)}，尚未收回 716.12／718.54。`,
  QQQE: "等權 Nasdaq 同樣失守 20/50MA，弱勢不只集中於巨型股。",
  RSP: "低於 20MA、仍高於 50/200MA；等權結構優於 QQQ。",
  IWM: "低於 20MA、仍高於 50/200MA；小型股中期結構尚可。",
  DIA: "低於 20MA、仍高於 50/200MA；防守風格未破壞。",
  SMH: `低於 20/50MA；盤前 ${num(smhQ.price)}，仍未收回 597.52／605.87。`,
  VIX: "現貨 VIX 盤前約 17.89；5日／1月與 RSI 以 VIXY 代理。",
};

const vixProxy = { ...s("VIXY"), ticker: "VIX", close: 18.65, dailyPct: -4.08 };
const majorBody = ["SPY", "VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA", "SMH", "VIX"]
  .map((ticker) => majorRow(ticker === "VIX" ? vixProxy : s(ticker), majorNotes[ticker]))
  .join("\n");

const atrBody = ["VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA"].map((ticker) => {
  const row = s(ticker);
  const extension = Number(row.extension50Atr);
  const judgment = Math.abs(extension) >= 2.5
    ? "延伸偏大，持有不追價。"
    : extension < -0.5
      ? "低於 50MA，先等趨勢修復。"
      : "距 50MA 不極端，以均線方向判斷。";
  return `<tr><td>${ticker}</td><td class="num">${num(row.close)}</td><td class="num">${num(row.ma50)}</td><td class="num">${num(row.atr14)}</td><td class="num ${trendClass(extension)}">${signed(extension, "", 2)}</td><td>${judgment}</td></tr>`;
}).join("\n");

const data = { ...base };

Object.assign(data, {
  report_type: "premarket",
  report_title: "2026-07-21｜美股盤前監控",
  report_eyebrow: "2026-07-21｜盤前更新",
  report_heading: "全球晶片反彈加速，但廣度與軟體仍未接棒",
  data_timestamp_note: "盤前價格：長橋 OpenAPI 08:52 ET；RSI／均線／ATR：長橋 2026-07-20 完整日線；市場廣度與 Stockbee：使用者 Google Sheets 更新至 2026-07-20；本週預期波幅：7月20日至24日。",
  risk_badge: "中等風險｜晶片修復擴散",
  qqq_reengage_20ma: "716.12",
  qqq_breakout_add_1sd: "717.68",
  summary_cards: `<div class="card"><span>QQQ 盤前</span><strong class="up">${signed(qqqQ.changePct)}</strong><small>${num(qqqQ.price)}，仍低於 20/50MA。</small></div><div class="card"><span>SMH 盤前</span><strong class="up">${signed(smhQ.changePct)}</strong><small>${num(smhQ.price)}，設備與記憶體同步修復。</small></div><div class="card"><span>SNDK／MU</span><strong class="up">${signed(sndkQ.changePct)}／${signed(muQ.changePct)}</strong><small>記憶體鏈領漲，成交量同步放大。</small></div><div class="card"><span>NDX &gt;20MA／T2108</span><strong class="dn">41.74%／49.35%</strong><small>晶片反彈尚未扭轉整體廣度。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才成立：價格、板塊擴散與市場廣度至少兩項同步改善，才由防守轉中性。",
  upgrade_trigger_1: "QQQ 收回 716.12（20MA）並站上 717.68（週度 +1SD）／718.54（50MA）。",
  upgrade_trigger_2: "SMH 收回 597.52（50MA）再挑戰 605.87（20MA），設備鏈守住 VWAP。",
  upgrade_trigger_3: "NDX >20MA 回到 50% 以上、T2108 >50%，且 Stockbee 5D ratio 重返 1。",
  downgrade_trigger_rule: "滿足 1/3 即成立：反彈失效並重新跌破前收或廣度惡化，風險回升。",
  downgrade_trigger_1: "SMH 跌回 558.83 前收下方，SNDK／MU／設備鏈同步失守 VWAP。",
  downgrade_trigger_2: "QQQ 跌破 696.06 前收，且 VIX 重新升破 20。",
  downgrade_trigger_3: "SPX 與 IWM >20MA 同跌破 50%，Stockbee 5D ratio 降至 0.60 以下。",
  core_conclusions: `<ol><li><strong>晶片反彈由記憶體擴散至設備鏈。</strong>QQQ 盤前 ${signed(qqqQ.changePct)}、SMH ${signed(smhQ.changePct)}；SNDK、MU、LRCX、AMAT、KLAC 與 TSM 同步上漲，廣度較昨天更完整。</li><li><strong>但科技並非全面 risk-on。</strong>ADBE、CRM、NOW、MSFT 仍跌，晶片與大型軟體方向相反；若軟體不接棒，QQQ 的上行斜率仍受限制。</li><li><strong>完整日線技術仍偏弱。</strong>QQQ 昨收 696.06，低於 20MA 716.12 與 50MA 718.54；SMH 昨收 558.83，低於 20MA 605.87 與 50MA 597.52。盤前急彈尚未等於趨勢反轉。</li><li><strong>三大指數與 Stockbee 的廣度都未確認。</strong>NDX >20MA 只有 41.74%，IWM >20MA 46.84%，T2108 49.35%，5D／10D ratio 0.77／0.69；領漲仍集中於少數主題。</li><li><strong>今天沒有一級美國宏觀數據。</strong>已公布的 MMM、DHI、GM 財報均為 EPS 與營收 Beat；市場主線由財報與全球晶片修復主導。</li><li><strong>商品同步上漲，並非利率下降型科技行情。</strong>DXY 約 100.85、US10Y 約 4.60%；油、白銀與銅上漲，價格訊號偏再通膨，不能把晶片反彈解讀為估值環境全面轉鬆。</li></ol><p class="section-summary"><strong>本段結論：</strong>今天可交易晶片修復，但需把「晶片強、軟體弱、廣度未修復」視為同一套訊號。QQQ／SMH 收回均線與 NDX 廣度回到 50% 之前，維持中性偏防守。</p>`,
  positioning_primary: "主線：只參與守住 VWAP 的晶片與設備鏈強者，不把盤前高開直接視為趨勢反轉。",
  positioning_secondary: "次線：保留金融、能源與等權大盤，對沖科技廣度不足。",
  positioning_watch: "觀察：QQQ 716.12／717.68／718.54、SMH 597.52／605.87、VIX 20、NDX >20MA 50%。",
  positioning_invalidation: "若 QQQ 與 SMH 同步收回 20/50MA，且 NDX >20MA 回到 50% 上方 → 中性偏防守定位失效，可逐步提高科技曝險。",
  pre_market_movers: preMarketMovers,
  pre_market_movers_note: `<div class="callout"><strong>長橋盤前快照：</strong>89／89 檔取得盤前價格，異動表使用 08:52 ET 最新成交。晶片領漲有全球供應鏈與記憶體供需敘事支持；軟體下跌則主要反映估值與 AI 商業化疑慮。</div><p class="section-summary"><strong>本段結論：</strong>上漲集中在晶片、記憶體、設備、加密與 MMM 財報；下跌集中在大型軟體。板塊內部分化仍大，不是全面 risk-on。</p>`,
  section_pre_market_movers_primary_action: "主線：只做守住 VWAP 的 SNDK／MU／設備鏈，優先成交量充足者。",
  section_pre_market_movers_condition_action: "條件：若 MSFT、ADBE、CRM、NOW 轉強，才確認反彈由晶片擴散至大型軟體。",
  section_pre_market_movers_avoid_action: "避免：追逐盤前已大幅偏離 VWAP 的 SNDK／MU，或把所有科技股視作同一交易。",
  premarket_movers_invalidation: "若 SMH 跌回 558.83 下方，且 SNDK／MU／LRCX 失守 VWAP → 晶片修復失效。",
  correction_checklist_dashboard: `<div class="checks"><div class="check low"><span>S&amp;P 500 overextension／大盤過度延伸</span><strong><span class="badge green">Low</span> SPY 距 50MA -0.16 ATR，沒有過熱。</strong></div><div class="check mid"><span>Increasing downward momentum／下跌動能增加</span><strong><span class="badge amber">Intermediate</span> 完整日線偏弱，但盤前晶片反彈減輕壓力。</strong></div><div class="check mid"><span>Top range formation &amp; breakdown／高位區間跌破</span><strong><span class="badge amber">Intermediate</span> QQQ 仍低於 20/50MA，但位於週度 ±1SD 內。</strong></div><div class="check high"><span>Technical indicators deteriorating／技術指標惡化</span><strong><span class="badge red">High</span> QQQ、SMH、XLK 仍低於 20/50MA。</strong></div><div class="check high"><span>Market breadth worsening／市場廣度惡化</span><strong><span class="badge red">High</span> NDX／IWM >20MA 均低於 50%，T2108 49.35%。</strong></div><div class="check low"><span>VIX &gt;20／波動升溫</span><strong><span class="badge green">Low</span> VIX 約 17.89，盤前回落。</strong></div><div class="check mid"><span>Breakout win rate down／breakdown rate up</span><strong><span class="badge amber">Intermediate</span> 4% 上漲／下跌 132／215，跌幅擴散仍佔優。</strong></div><div class="check high"><span>Theme stocks momentum weakening／主題動能轉弱</span><strong><span class="badge red">High</span> SMH、AIQ、QTUM、SLV 等仍在弱勢均線結構。</strong></div></div><div class="callout warn"><strong>Checklist Score：</strong>3／8 High = Intermediate Risk。盤前晶片反彈降低即時風險，但技術與廣度仍未同步修復。</div><p class="section-summary"><strong>本段結論：</strong>風險仍是中等，不因 VIX 回落或單一主題高開直接降級。真正降至低風險需要均線與廣度一起改善。</p>`,
  section_correction_checklist_primary_action: "主線：維持中性倉位，讓價格先證明晶片反彈能延續。",
  section_correction_checklist_condition_action: "條件：3 項 High 降至 1 項以下，再恢復基準科技配置。",
  section_correction_checklist_avoid_action: "避免：只看 VIX 低於 20，忽略 NDX／IWM 廣度與軟體弱勢。",
  checklist_invalidation: "若 VIX >20 且 QQQ <696.06 → 中等風險判斷失效，升級為高風險。",
  macro_premarket_background_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>宏觀／財報事件</th><th class="num">Actual</th><th class="num">Forecast</th><th class="num">Previous</th><th>Beat／Miss</th><th>市場含義</th></tr></thead><tbody><tr><td>美國 LEI（6月，7/20）</td><td class="num dn">-0.20%</td><td class="num">-0.10%</td><td class="num">+0.10%</td><td><span class="badge red">Miss</span></td><td>昨天數據略弱；今天沒有一級美國宏觀發布。</td></tr><tr><td>ADP 周度就業（7/21 08:15 ET）</td><td class="num" data-allow-missing>官方頁面未更新</td><td class="num" data-allow-missing>無一致預期</td><td class="num">19.8K</td><td><span class="badge gray">未確認</span></td><td>非一級數據，不用未核實數字改變主線。</td></tr><tr><td>費城 Fed 非製造業（7月）</td><td class="num" data-allow-missing>官方頁面未更新</td><td class="num" data-allow-missing>無一致預期</td><td class="num">2.4</td><td><span class="badge gray">未確認</span></td><td>區域調查；截至 08:52 ET 官方頁面仍顯示 6 月報告。</td></tr><tr><td>MMM Q2</td><td class="num">EPS 2.40／營收 65.0億</td><td class="num">2.25／64.0億</td><td class="num" data-allow-missing>—</td><td><span class="badge green">Beat／Beat</span></td><td>並上調全年調整後 EPS 指引；盤前 ${signed(q("MMM").changePct)}。</td></tr><tr><td>DHI Q3</td><td class="num">EPS 3.20／營收 92.27億</td><td class="num">2.97／91.4億</td><td class="num" data-allow-missing>—</td><td><span class="badge green">Beat／Beat</span></td><td>業績優於預期，但全年營收指引低於市場共識。</td></tr><tr><td>GM Q2</td><td class="num">EPS 3.57／營收 480.3億</td><td class="num">3.19／470.9億</td><td class="num" data-allow-missing>—</td><td><span class="badge green">Beat／Beat</span></td><td>EPS 與營收均超預期，公司提高全年指引。</td></tr><tr><td>GOOGL Q2（7/22盤後）</td><td class="num" data-allow-missing>待公布</td><td class="num">EPS 2.90／營收 1,169億</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">未觸發</span></td><td>明日權重科技主要事件。</td></tr><tr><td>TSLA Q2（7/22盤後）</td><td class="num" data-allow-missing>待公布</td><td class="num">EPS 0.36／營收 275.84億</td><td class="num" data-allow-missing>—</td><td><span class="badge gray">未觸發</span></td><td>明日高 beta 主要事件。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>今天宏觀日程清淡，三份主要早盤財報均為 EPS／營收 Beat；但財報只支持個股與工業／汽車，不足以替代市場廣度確認。</p>`,
  section_macro_premarket_background_primary_action: "主線：以 MMM、DHI、GM 的財報反應與晶片板塊承接為主，不交易未核實的宏觀數字。",
  section_macro_premarket_background_condition_action: "條件：若財報 Beat 個股守住開盤 VWAP，視為基本面買盤延續。",
  section_macro_premarket_background_avoid_action: "避免：把待更新的 ADP／費城 Fed 數字當作已公布 Actual。",
  macro_invalidation: "若 MMM／DHI／GM 高開低走且 SPY 失守 742.09 → 財報正面訊號失效。",
  sector_momentum_chart: chartRows(chartSelection),
  sector_thematic_etf_tables: `${etfTable(sectorRows, "S&amp;P 500 Sector ETF（按 RSI 排序）")}${etfTable(thematicRows, "Thematic Sector ETF（含 SPY 基準，按 RSI 排序）")}<div class="callout"><strong>資料口徑：</strong>全部 RSI、MA 與完整日線漲跌均由長橋取得，更新至 2026-07-20；沒有使用 Google RSI 公式。</div><p class="section-summary"><strong>本段結論：</strong>能源、金融與部分防守板塊的 RSI 仍領先；半導體盤前大漲但完整日線 RSI 與均線尚未翻多，需等待收盤資料確認。</p>`,
  section_sector_thematic_etf_primary_action: "主線：保留 XLE／XLF 等完整日線相對強勢；晶片只做確認後修復。",
  section_sector_thematic_etf_condition_action: "條件：SMH 站回 50MA 且 RSI 回到 50 上方，才把晶片由反彈交易升級為趨勢配置。",
  section_sector_thematic_etf_avoid_action: "避免：用盤前漲幅覆蓋完整日線仍偏弱的 RSI 與均線結構。",
  sector_etf_invalidation: "若 XLE／XLF 轉弱而 SMH 收回 20/50MA → 防守板塊優先配置失效，改看科技輪動。",
  major_etf_technical_table: `<div class="table-scroll"><table class="ma-table report-data-table report-cols-8"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${majorBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>SPY 盤前已回到 20/50MA 附近，但 QQQ／SMH 仍有明顯距離；技術修復的關鍵不是高開，而是收盤能否收回均線。</p>`,
  section_major_etf_technical_primary_action: "主線：QQQ 未站回 716.12 前，科技維持低於基準配置。",
  section_major_etf_technical_condition_action: "條件：QQQ 與 QQQE 同步收回 20MA，才確認修復不只靠少數權重。",
  section_major_etf_technical_avoid_action: "避免：在 SMH 仍低於 20/50MA 時加槓桿半導體。",
  major_etf_invalidation: "若 QQQ >718.54（50MA）且 SMH >605.87（20MA）→ 技術防守判斷失效。",
  fifty_ma_atr_extension_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>${atrBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>QQQ 低於 50MA 1.50 ATR，屬趨勢破壞而非過度延伸；RSP 高於 50MA 1.61 ATR，等權結構仍優於科技。</p>`,
  section_50ma_atr_extension_primary_action: "主線：以 50MA 作風格切換線，持有強者、不追延伸。",
  section_50ma_atr_extension_condition_action: "條件：QQQ 距 50MA ATR 回到 0 以上，再提高成長股曝險。",
  section_50ma_atr_extension_avoid_action: "避免：把低於 50MA 解讀成單純超賣。",
  atr_extension_invalidation: "若 RSP 跌回 50MA 下方、QQQ 繼續弱勢 → 等權輪動優勢失效。",
  market_breadth_table: `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>近期變化</th><th>約1月趨勢</th><th>判斷</th></tr></thead><tbody><tr><td>SPX &gt;20MA</td><td class="num">52.08%</td><td>58.05% → 52.08%</td><td>快速接近 50%</td><td>大盤短線廣度明顯降溫。</td></tr><tr><td>SPX &gt;50MA</td><td class="num">60.63%</td><td>63.61% → 60.63%</td><td>仍在 60% 上方</td><td>中期大盤尚有緩衝。</td></tr><tr><td>NDX &gt;20MA</td><td class="num">41.74%</td><td>44.66% → 41.74%</td><td>持續低於 50%</td><td>科技短線廣度最弱。</td></tr><tr><td>NDX &gt;50MA</td><td class="num">43.68%</td><td>43.68% → 43.68%</td><td>持續低於 50%</td><td>科技中期廣度亦未修復。</td></tr><tr><td>IWM &gt;20MA</td><td class="num">46.84%</td><td>54.56% → 46.84%</td><td>跌破 50%</td><td>小型股短線緩衝消失。</td></tr><tr><td>IWM &gt;50MA</td><td class="num">59.15%</td><td>62.27% → 59.15%</td><td>仍接近 60%</td><td>小型股中期結構尚可。</td></tr><tr><td>T2108</td><td class="num">49.35%</td><td>53.50% → 49.35%</td><td>跌破 50%</td><td>全市場長線廣度轉為中性偏弱。</td></tr><tr><td>5D ratio</td><td class="num">0.77</td><td>0.70 → 0.77</td><td>持續低於 1</td><td>短線擴散略改善但仍偏空。</td></tr><tr><td>10D ratio</td><td class="num">0.69</td><td>0.75 → 0.69</td><td>持續低於 1</td><td>中短線動能繼續惡化。</td></tr><tr><td>4%+ 上漲／下跌</td><td class="num">132／215</td><td>138／166 → 132／215</td><td>下跌明顯較多</td><td>高波動弱股擴散。</td></tr><tr><td>季度 +25%／-25%</td><td class="num">1189／1244</td><td>1269／1225 → 1189／1244</td><td>轉為弱股略多</td><td>中期強弱平衡已向下傾斜。</td></tr></tbody></table></div>`,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>綜合廣度：</strong>SPX >20MA 尚在 52.08%，但 NDX 41.74%、IWM 46.84% 均低於 50%；兩者的 >50MA 也只在 43.68%／59.15%。Stockbee 同時顯示 T2108 49.35%、5D／10D ratio 0.77／0.69、4% 上漲／下跌 132／215。三大指數與 Stockbee 一致指出：中期尚未全面破壞，但短線廣度偏弱，晶片反彈仍是主題修復。</div><p class="section-summary"><strong>小結：</strong>市場不是全面風險崩壞，卻也不是健康的全面 risk-on。今天若晶片上漲但 NDX／IWM 廣度不跟，應視為主題反抽。</p>`,
  section_market_breadth_primary_action: "主線：以 SPX 中期廣度作核心緩衝，科技曝險等待 NDX >20MA 回到 50%。",
  section_market_breadth_condition_action: "條件：5D ratio >1 且 NDX／IWM >20MA 同回 50%，才提高高 beta。",
  section_market_breadth_avoid_action: "避免：只引用 Stockbee 或只看 SPX，忽略 NDX 與 IWM 同步跌破短線廣度門檻。",
  breadth_invalidation: "若 SPX >20MA 跌破 50%、T2108 維持 <50%，且 5D ratio <0.60 → 升級為全面廣度風險。",
  fx_commodities_table: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">最新</th><th class="num">日變化</th><th class="num">5日</th><th class="num">1月</th><th>對美股含義</th></tr></thead><tbody><tr><td>DXY</td><td class="num">100.85</td><td class="num up">約 +0.07%</td><td class="num" data-allow-missing>—</td><td class="num" data-allow-missing>—</td><td>美元持穩，DXY >102 才觸發「減科技」條件。</td></tr><tr><td>US10Y</td><td class="num">約 4.60%</td><td class="num up">約 +1bp</td><td class="num" data-allow-missing>—</td><td class="num" data-allow-missing>—</td><td>長端未下降，科技上漲不是利率寬鬆交易。</td></tr><tr><td>USO</td><td class="num">${num(usoQ.price)}</td><td class="num ${trendClass(usoQ.changePct)}">${signed(usoQ.changePct)}</td><td class="num ${trendClass(s("USO").fiveDayPct)}">${signed(s("USO").fiveDayPct)}</td><td class="num ${trendClass(s("USO").oneMonthPct)}">${signed(s("USO").oneMonthPct)}</td><td>油價續強，支持能源但提高再通膨風險。</td></tr><tr><td>GLD</td><td class="num">${num(q("GLD").price)}</td><td class="num ${trendClass(q("GLD").changePct)}">${signed(q("GLD").changePct)}</td><td class="num ${trendClass(s("GLD").fiveDayPct)}">${signed(s("GLD").fiveDayPct)}</td><td class="num ${trendClass(s("GLD").oneMonthPct)}">${signed(s("GLD").oneMonthPct)}</td><td>黃金與風險資產同漲，反映商品與避險需求並存。</td></tr><tr><td>SLV</td><td class="num">${num(q("SLV").price)}</td><td class="num ${trendClass(q("SLV").changePct)}">${signed(q("SLV").changePct)}</td><td class="num ${trendClass(s("SLV").fiveDayPct)}">${signed(s("SLV").fiveDayPct)}</td><td class="num ${trendClass(s("SLV").oneMonthPct)}">${signed(s("SLV").oneMonthPct)}</td><td>白銀盤前急彈，但完整日線技術仍弱。</td></tr><tr><td>CPER</td><td class="num">${num(q("CPER").price)}</td><td class="num ${trendClass(q("CPER").changePct)}">${signed(q("CPER").changePct)}</td><td class="num ${trendClass(s("CPER").fiveDayPct)}">${signed(s("CPER").fiveDayPct)}</td><td class="num ${trendClass(s("CPER").oneMonthPct)}">${signed(s("CPER").oneMonthPct)}</td><td>銅價上漲配合商品廣度，價格環境偏再通膨。</td></tr><tr><td>IBIT</td><td class="num">${num(q("IBIT").price)}</td><td class="num ${trendClass(q("IBIT").changePct)}">${signed(q("IBIT").changePct)}</td><td class="num ${trendClass(s("IBIT").fiveDayPct)}">${signed(s("IBIT").fiveDayPct)}</td><td class="num ${trendClass(s("IBIT").oneMonthPct)}">${signed(s("IBIT").oneMonthPct)}</td><td>加密代理回升，風險偏好邊際改善。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>DXY 仍低於 102 觸發線，但 US10Y 約 4.60%；油、白銀與銅同步上漲，說明今天是晶片與商品共同反彈，不是低利率驅動的全面科技行情。</p>`,
  section_fx_commodities_primary_action: "主線：保留 DXY 與 US10Y 監控；目前未觸發減科技，但也沒有利率支持。",
  section_fx_commodities_condition_action: "條件：DXY >102 或 US10Y 快速升破 4.65%，降低長久期科技。",
  section_fx_commodities_avoid_action: "避免：追逐 SLV／CPER 盤前急彈，或忽略油價對通膨預期的影響。",
  forex_commodity_invalidation: "若 DXY 跌破 100、US10Y 下行且 QQQ 收回 20MA → 再通膨壓力判斷失效。",
  treasury_fed_economic_data_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>項目</th><th class="num">Actual／最新</th><th class="num">Forecast</th><th class="num">Previous</th><th>政策與市場含義</th></tr></thead><tbody><tr><td>US10Y（盤前）</td><td class="num">約 4.60%</td><td class="num" data-allow-missing>—</td><td class="num">約 4.59%</td><td>長端持高，仍限制高估值擴張。</td></tr><tr><td>美國 LEI（6月，7/20）</td><td class="num dn">-0.20%</td><td class="num">-0.10%</td><td class="num">+0.10%</td><td>低於預期，但沒有帶動長端利率明顯下行。</td></tr><tr><td>ADP 周度就業</td><td class="num" data-allow-missing>官方頁面未更新</td><td class="num" data-allow-missing>無一致預期</td><td class="num">19.8K</td><td>非一級發布，未確認前不作交易訊號。</td></tr><tr><td>費城 Fed 非製造業</td><td class="num" data-allow-missing>官方頁面未更新</td><td class="num" data-allow-missing>無一致預期</td><td class="num">2.4</td><td>區域調查，不改變今天主線。</td></tr><tr><td>FOMC 背景</td><td class="num">7月28至29日會議</td><td class="num" data-allow-missing>—</td><td class="num">目標利率 3.50%–3.75%</td><td>Fed 靜默期內，市場由財報、油價與長端利率主導。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>今天沒有一級美國宏觀發布，US10Y 約 4.60% 仍是科技估值的主要宏觀約束；不得用未核實的區域或私營數據補空白。</p>`,
  section_treasury_fed_primary_action: "主線：同看 US10Y 與 QQQ／SMH，財報日不單靠宏觀表交易。",
  section_treasury_fed_condition_action: "條件：US10Y 下行且 QQQ 站回 716.12，才確認利率開始支持科技。",
  section_treasury_fed_avoid_action: "避免：把今天清淡日程寫成重大宏觀催化。",
  treasury_invalidation: "若 US10Y 快速升破 4.65% 且 QQQ 跌回前收 → 盤前修復判斷失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">週度 -1SD</th><th class="num">週度 +1SD</th><th>狀態</th><th>行動</th></tr></thead><tbody><tr><td>SPY</td><td class="num up">${num(spyQ.price)}</td><td class="num">730.03</td><td class="num">756.55</td><td><span class="badge blue">均線測試</span></td><td>收盤站回 744.79／743.42 才確認修復。</td></tr><tr><td>QQQ</td><td class="num up">${num(qqqQ.price)}</td><td class="num">672.99</td><td class="num">717.68</td><td><span class="badge amber">接近上方壓力</span></td><td>716.12／717.68／718.54 為連續壓力帶。</td></tr><tr><td>SMH</td><td class="num up">${num(smhQ.price)}</td><td class="num">514.63</td><td class="num">598.44</td><td><span class="badge amber">急彈未復位</span></td><td>守 VWAP 可交易，未收回 597.52 不升級趨勢。</td></tr><tr><td>XLK</td><td class="num up">${num(xlkQ.price)}</td><td class="num">168.26</td><td class="num">182.92</td><td><span class="badge amber">晶片強、軟體弱</span></td><td>觀察軟體能否接棒，不只看晶片。</td></tr><tr><td>IWM</td><td class="num up">${num(iwmQ.price)}</td><td class="num">287.51</td><td class="num">300.57</td><td><span class="badge blue">區間內</span></td><td>廣度回到 50% 才提高小型股曝險。</td></tr><tr><td>USO</td><td class="num up">${num(usoQ.price)}</td><td class="num">115.51</td><td class="num">132.41</td><td><span class="badge amber">上半區</span></td><td>油價續強但接近上方邊界，不追高。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>QQQ 已逼近週度 +1SD 與兩條均線壓力；今天的核心不是是否高開，而是晶片能否守住 VWAP、軟體是否接棒、收盤能否站回均線。</p><div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>晶片與設備鏈守 VWAP 才參與；QQQ 未站回均線前不恢復基準科技配置。</li><li class="ad-secondary"><strong>次線：</strong>保留 XLE／XLF／RSP 作晶片修復失敗時的緩衝。</li><li class="ad-watch"><strong>觀察：</strong>716.12、717.68、718.54、597.52、605.87、VIX 20、NDX >20MA 50%。</li><li class="ad-avoid"><strong>避免：</strong>追 SNDK／MU 盤前高點、抄底 ADBE／CRM、用未核實宏觀數字交易。</li><li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：若 QQQ >718.54、SMH >605.87 且 NDX >20MA >50% → 防守失效，逐步提高科技曝險。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "SMH 守住 VWAP，SNDK／MU／LRCX 同步強", interpretation: "晶片修復有板塊擴散", action: "小倉參與成交量較大的領先股，止損放在 VWAP 下方。" },
    { time_slot: "09:30 ORB", trigger_event: "SMH 跌回 558.83 下方", interpretation: "盤前反彈失效", action: "撤出高 beta，保留等權與防守板塊。" },
    { time_slot: "10:00", trigger_event: "QQQ 測試 716.12／717.68", interpretation: "進入均線與週度壓力帶", action: "只有放量站穩才加倉；受阻則減少追價。" },
    { time_slot: "11:00", trigger_event: "ADBE／CRM／NOW／MSFT 轉強", interpretation: "科技由晶片擴散至軟體", action: "若 QQQ 同時站穩 716.12，可提高科技 beta。" },
    { time_slot: "14:00", trigger_event: "US10Y >4.65% 或 VIX >20", interpretation: "宏觀壓力重新升級", action: "降低長久期科技與高 beta。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ／SMH 收盤相對 20/50MA", interpretation: "確認修復或高開低走", action: "未收回均線則隔夜維持中性偏防守。" },
  ],
  cross_validation_summary: `<div class="callout ok"><strong>確認訊號：</strong>長橋盤前顯示 QQQ、SMH、SNDK、MU 與設備鏈同步上漲；亞洲晶片市場亦普遍反彈。MMM、DHI、GM 的 EPS／營收均 Beat。</div><div class="callout warn"><strong>分歧訊號：</strong>ADBE、CRM、NOW、MSFT 仍跌；QQQ／SMH／XLK 完整日線仍低於 20/50MA；NDX／IWM >20MA 與 Stockbee ratio 均偏弱；US10Y 約 4.60% 未給科技估值支持。</div><div class="callout"><strong>主導結論：</strong>今天是「全球晶片修復擴散」，不是「全面科技 risk-on」。在 QQQ／SMH 收回均線、軟體接棒與廣度回到 50% 前，維持中等風險與條件式參與。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：08:52 ET 盤前價格、成交量，以及 2026-07-20 完整日線 RSI／MA／ATR；使用者 Google Sheets：Market breadth 與 Stockbee 更新至 7/20；<a href="https://www.investing.com/news/stock-market-news/chip-stocks-extend-global-rebound-following-last-weeks-rout-4802366">全球晶片反彈</a>；<a href="https://www.investing.com/news/stock-market-news/selloff-of-us-memory-stocks-creates-a-compelling-entry-point-analyst-4800689">記憶體供需與券商觀點</a>；<a href="https://investors.3m.com/">3M 投資者關係</a>；<a href="https://investor.drhorton.com/news-and-events/press-releases/2026/07-21-2026-113055285">D.R. Horton 官方財報</a>；<a href="https://investor.gm.com/news-releases/news-release-details/gm-releases-2026-second-quarter-results">GM 官方財報</a>；<a href="https://www.kiplinger.com/investing/economy/this-weeks-economic-calendar">本週經濟日程</a>；<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">本週財報日程</a>；<a href="https://www.philadelphiafed.org/surveys-and-data/regional-economic-analysis/nonmanufacturing-business-outlook-survey">費城 Fed 非製造業調查</a>；<a href="https://www.federalreserve.gov/newsevents/2026-july.htm">Federal Reserve 7月日程</a>。</p><p class="source-note">本報告為本地盤前草稿，不構成投資建議。盤前價格可能快速變動；尚未由官方頁面確認的 Actual 明確標示「未更新」，沒有估算或沿用舊值。</p>`,
});

const output = path.join(root, "data", "2026-07-21-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
