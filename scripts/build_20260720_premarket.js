#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.join(root, "..");
const base = require(path.join(root, "data", "2026-07-17-premarket.json"));
const fullQuotes = require(path.join(work, "premarket_quotes_0720.json"));
const scanQuotes = require(path.join(work, "premarket_movers_0720.json"));
const snapshot = require(path.join(work, "postmarket_snapshot_2026-07-17.json")).rows;
const thematic = require(path.join(work, "thematic_rsi_longport.json")).rows;

const quoteMap = new Map([...scanQuotes, ...fullQuotes].map((row) => [row.ticker, row]));
const snapMap = new Map(snapshot.map((row) => [row.ticker, row]));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function n(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function signed(value, suffix = "%", digits = 2) {
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${n(number, digits)}${suffix}`;
}

function trendClass(value) {
  return Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
}

function volume(value) {
  const number = Number(value || 0);
  if (number >= 10000) return `${n(number / 10000, 1)}萬股`;
  return `${Math.round(number).toLocaleString("en-US")}股`;
}

function maCell(row) {
  const states = [
    ["20MA", row.above20 ?? row.aboveMa20],
    ["50MA", row.above50 ?? row.aboveMa50],
    ["200MA", row.above200 ?? row.aboveMa200],
  ];
  return `<td class="ma-cell">${states.map(([period, above]) => `<span class="ma-state ${above ? "ma-up" : "ma-down"}"><span class="ma-period">${period}</span><span class="ma-arrow">${above ? "▲" : "▼"}</span></span>`).join("")}</td>`;
}

function technicalJudgment(row) {
  const above = [row.above20 ?? row.aboveMa20, row.above50 ?? row.aboveMa50, row.above200 ?? row.aboveMa200];
  if (row.rsi14 >= 70) return "RSI 過熱，持有不追價。";
  if (row.rsi14 <= 30) return "RSI 進入超賣區，先等止跌確認。";
  if (above.every(Boolean)) return "三均線之上，結構完整。";
  if (!above[0] && !above[1] && above[2]) return "失守 20/50MA，但長期趨勢尚存。";
  if (!above.some(Boolean)) return "三均線全失守，維持弱勢。";
  if (!above[0]) return "短線低於 20MA，中期結構仍可。";
  return "均線訊號分化，等待方向確認。";
}

function etfTable(rows, heading) {
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.ticker)}</td><td class="num ${trendClass(row.dailyPct)}">${signed(row.dailyPct)}</td><td class="num ${trendClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${trendClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>${maCell(row)}<td class="num" data-rsi="${n(row.rsi14)}">${n(row.rsi14)}</td><td>${technicalJudgment(row)}</td></tr>`).join("\n");
  return `<h3>${heading}</h3><div class="table-scroll"><table class="ma-table report-data-table report-cols-7"><thead><tr><th>ETF</th><th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function majorRow(row, note) {
  return `<tr><td>${row.ticker}</td><td class="num">${n(row.close)}</td><td class="num ${trendClass(row.dailyPct)}">${signed(row.dailyPct)}</td><td class="num ${trendClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${trendClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>${maCell(row)}<td class="num" data-rsi="${n(row.rsi14)}">${n(row.rsi14)}</td><td>${note || technicalJudgment(row)}</td></tr>`;
}

function chartRows(rows) {
  const maxPositive = Math.max(...rows.map((row) => Math.max(0, row.value)));
  const maxNegative = Math.max(...rows.map((row) => Math.max(0, -row.value)));
  const zero = maxNegative / (maxPositive + maxNegative) * 100;
  return rows.map((row) => {
    const width = Math.abs(row.value) / (row.value >= 0 ? maxPositive : maxNegative) * (row.value >= 0 ? 100 - zero : zero);
    return `<div class="bar-row"><span class="lbl">${row.ticker}</span><span class="val ${row.value >= 0 ? "pos" : "neg"}">${signed(row.value)}</span><span class="bar-track" style="--zero:${n(zero)}%"><span class="b ${row.value >= 0 ? "pos" : "neg"}" style="width:${n(width)}%"></span></span></div>`;
  }).join("\n");
}

const sectorTickers = ["SPY", "XLF", "XLI", "XLV", "XLY", "XLK", "XLU", "XLC", "XLRE", "XLP", "XLE", "XLB"];
const sectorRows = sectorTickers
  .map((ticker) => snapMap.get(ticker))
  .sort((a, b) => Number(b.rsi14) - Number(a.rsi14));
const thematicTickers = ["KIE", "XOP", "KRE", "IAK", "XRT", "CIBR", "IBB", "XSW", "PPH", "XBI", "KWEB", "IGV", "MAGS", "IHI", "SPY", "IBIT", "SMH", "ARKK", "AIQ", "QTUM", "BOTZ", "UFO", "URA", "SLV", "REMX", "WGMI"];
const thematicMap = new Map(thematic.map((row) => [row.ticker, row]));
thematicMap.set("SPY", snapMap.get("SPY"));
const thematicRows = thematicTickers.map((ticker) => thematicMap.get(ticker));

const chartSelection = ["XBI", "IBB", "KIE", "CIBR", "SMH", "QTUM", "SLV", "WGMI"].map((ticker) => ({ ticker, value: thematicMap.get(ticker).oneMonthPct }));

const moverSpecs = [
  ["DPZ", "EPS $4.07 低於 $4.17 預期；營收 $1.194B 高於 $1.18B 預期", "餐飲股財報反應正面", "營收 Beat、EPS Miss，但同店銷售與訂單敘事獲承接。"],
  ["MU", "記憶體股上週急跌後技術性反彈", "帶動 SMH 與設備鏈修復", "未見新公司公告；先當超跌反彈，觀察能否守住盤前 VWAP。"],
  ["SNDK", "記憶體／儲存股超跌反彈", "高 beta 記憶體情緒回暖", "一個月仍深度回撤，不把盤前上漲直接視為趨勢反轉。"],
  ["KLAC", "半導體設備鏈同步修復", "設備股確認晶片反彈有擴散", "若 SMH 回落，設備鏈也可能快速吐回。"],
  ["LRCX", "半導體設備鏈同步修復", "晶圓設備 beta 回升", "確認開盤後成交量與 VWAP。"],
  ["AMD", "AI 晶片上週急跌後反彈", "支撐 QQQ／SMH", "仍低於週度上方邊界，先視為修復。"],
  ["MRVL", "AI／網通晶片 beta 修復", "網通半導體跟漲", "若漲幅只靠盤前薄量，不追價。"],
  ["AMAT", "設備鏈普遍反彈", "晶片廣度改善", "需與 MU、SMH 同步守住 VWAP。"],
  ["NOW", "大型軟體延續相對弱勢", "XSW／IGV 可能落後晶片", "科技反彈內部仍分化，避免把晶片修復外推到軟體。"],
  ["CRM", "企業軟體承壓", "軟體弱於半導體", "若無法收回昨收，維持低配軟體。"],
  ["PLTR", "高 beta 軟體回吐", "AI 應用層未同步修復", "盤前跌幅不大但相對強弱偏弱。"],
  ["ADBE", "大型軟體賣壓延續", "拖累 IGV／XSW", "等待板塊重新站回 20MA。"],
  ["CVX", "原油盤前偏弱", "能源股與上週強勢分化", "XLE 強勢可能降溫，避免追價。"],
  ["XOM", "油價回吐帶動能源權重回落", "XLE 盤前相對落後", "能源仍有月線優勢，但短線先看油價。"],
  ["MSFT", "權重軟體未跟隨晶片反彈", "限制 QQQ 上行斜率", "QQQ 上漲若只靠晶片，延續性需再確認。"],
  ["AAPL", "大型科技小幅承壓", "限制 SPY／QQQ 廣度", "盤前弱勢不大，但不支持全面 risk-on。"],
];

const preMarketMovers = moverSpecs.map(([ticker, catalyst, readThrough, judgment]) => {
  const row = quoteMap.get(ticker);
  return {
    ticker,
    price: n(row.price, row.price < 100 ? 3 : 2),
    premarket_change: signed(row.changePct),
    catalyst: `${catalyst}；${volume(row.volume)}`,
    read_through: readThrough,
    judgment,
  };
});

const spyQ = quoteMap.get("SPY");
const qqqQ = quoteMap.get("QQQ");
const smhQ = quoteMap.get("SMH");
const usoQ = quoteMap.get("USO");
const dpzQ = quoteMap.get("DPZ");

const majorNotes = {
  SPY: `昨收略低於 20MA、守住 50/200MA；盤前 ${signed(spyQ.changePct)}，仍在週度區間內。`,
  QQQ: `低於 20/50MA；盤前 ${n(qqqQ.price)}，尚未收回 717.68（+1SD）與 718.30（20MA）。`,
  QQQE: "等權 Nasdaq 同樣失守 20/50MA，弱勢不只集中於巨型股。",
  RSP: "仍在三均線上方，等權大盤比 QQQ 健康。",
  IWM: "低於 20MA、守 50/200MA；小型股中期廣度仍優於 NDX。",
  DIA: "低於 20MA、守 50/200MA，防守風格尚未轉空。",
  SMH: `低於 20/50MA；盤前 ${n(smhQ.price)}，反彈但仍離 598.44（+1SD）很遠。`,
  VIX: "VIX 7/17 收 18.77；均線、5日／1月與 RSI 採 VIXY 代理，波動未破 20。",
};
const vixProxy = { ...snapMap.get("VIXY"), ticker: "VIX", close: 18.77, dailyPct: 12.19 };
const majorTickers = ["SPY", "VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA", "SMH", "VIX"];
const majorBody = majorTickers.map((ticker) => majorRow(ticker === "VIX" ? vixProxy : snapMap.get(ticker), majorNotes[ticker])).join("\n");

const atrTickers = ["VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA"];
const atrBody = atrTickers.map((ticker) => {
  const row = snapMap.get(ticker);
  const extension = row.extension50Atr;
  const judgment = Math.abs(extension) >= 2.5 ? "延伸偏高，持有不追價。" : extension < -0.5 ? "低於 50MA，先等趨勢修復。" : "距 50MA 不極端，以均線方向判斷。";
  return `<tr><td>${ticker}</td><td class="num">${n(row.close)}</td><td class="num">${n(row.ma50)}</td><td class="num">${n(row.atr14)}</td><td class="num ${trendClass(extension)}">${signed(extension, "", 2)}</td><td>${judgment}</td></tr>`;
}).join("\n");

const data = { ...base };

Object.assign(data, {
  report_type: "premarket",
  report_title: "2026-07-20｜美股盤前監控",
  report_eyebrow: "2026-07-20｜盤前更新",
  report_heading: "晶片超跌反彈，但科技廣度尚未修復",
  data_timestamp_note: "盤前價格：長橋 OpenAPI 08:03 ET；RSI／均線／ATR：長橋 2026-07-17 完整日線；市場廣度與 Stockbee：使用者 Google Sheets 2026-07-17；本週預期波幅：7月20日至24日。",
  risk_badge: "中等風險｜反彈確認中",
  qqq_reengage_20ma: "718.30",
  qqq_breakout_add_1sd: "717.68",
  summary_cards: `<div class="card"><span>QQQ 盤前</span><strong class="up">${signed(qqqQ.changePct)}</strong><small>${n(qqqQ.price)}，仍低於 20MA 718.30。</small></div><div class="card"><span>SMH 盤前</span><strong class="up">${signed(smhQ.changePct)}</strong><small>${n(smhQ.price)}，晶片領先反彈但仍低於 20/50MA。</small></div><div class="card"><span>DPZ 財報</span><strong class="up">${signed(dpzQ.changePct)}</strong><small>營收 Beat、EPS Miss，市場先交易訂單與同店銷售。</small></div><div class="card"><span>NDX &gt;20MA / 5D ratio</span><strong class="dn">44.66% / 0.70</strong><small>科技廣度與短線強股擴散仍偏弱。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才成立：價格、波動與廣度至少兩項同步改善，才由防守轉中性。",
  upgrade_trigger_1: "QQQ 收回 717.68（週度 +1SD）並站回 718.30（20MA）。",
  upgrade_trigger_2: "SMH 收回 598.44（週度 +1SD），且 MU／SNDK／AMD 守住 VWAP。",
  upgrade_trigger_3: "NDX &gt;20MA 回到 50% 以上，Stockbee 5D ratio 重返 1。",
  downgrade_trigger_rule: "滿足 1/3 即成立：反彈失敗並重新跌破週度下方邊界，風險由修復轉回去槓桿。",
  downgrade_trigger_1: "QQQ 跌破 672.99（週度 -1SD），科技修正重新擴張。",
  downgrade_trigger_2: "SMH 跌破 514.63（週度 -1SD），半導體反彈失效。",
  downgrade_trigger_3: "VIX 升破 20，且 SPX / IWM &gt;20MA 同步跌破 50%。",
  core_conclusions: `<ol><li><strong>盤前反彈由半導體主導。</strong>QQQ ${signed(qqqQ.changePct)}、SMH ${signed(smhQ.changePct)}，MU、SNDK、AMD 與設備鏈同步上漲；但大型軟體與 AAPL／MSFT 未全面跟上。</li><li><strong>這仍是修復，不是趨勢反轉。</strong>QQQ、SMH、XLK 均低於 20/50MA，且 QQQ 尚未收回 717.68（週度 +1SD）與 718.30（20MA）。</li><li><strong>廣度確認仍不足。</strong>NDX &gt;20MA 只有 44.66%，明顯弱於 SPX 58.05% 與 IWM 54.56%；Stockbee 5D / 10D ratio 0.70 / 0.75，短線擴散仍偏空。</li><li><strong>DPZ 財報反應正面但數字分化。</strong>營收 $1.194B 高於 $1.18B 預期，EPS $4.07 低於 $4.17 預期；盤前 ${signed(dpzQ.changePct)}，市場更重視訂單與同店銷售韌性。</li><li><strong>今日宏觀日曆清淡。</strong>10:00 ET 公布 6月領先指標，預期 -0.1%、前值 +0.1%；開盤初段更可能由技術修復與本週大型科技財報預期主導。</li><li><strong>操作保持中性偏防守。</strong>可參與確認後的晶片修復，但不追盤前高點；軟體仍弱，能源上週強勢也因油價回吐而降溫。</li></ol><p class="section-summary"><strong>本段結論：</strong>半導體提供反彈火種，但價格、均線與廣度尚未同步翻多。先交易修復，等 QQQ 站回 20MA、NDX 廣度重返 50% 再提高科技曝險。</p>`,
  positioning_primary: "主線：盤前以晶片超跌修復處理，不把單日上漲視為新升勢。",
  positioning_secondary: "次線：保留金融、醫療與等權大盤，作為科技廣度不足時的緩衝。",
  positioning_watch: "觀察：717.68 / 718.30、598.44、VIX 20、NDX &gt;20MA 50%。",
  positioning_invalidation: "若 QQQ 收回 718.30 且 NDX &gt;20MA 回到 50% 上方 → 中性偏防守定位失效，可逐步提高科技曝險。",
  pre_market_movers: preMarketMovers,
  pre_market_movers_note: `<div class="callout"><strong>長橋盤前快照：</strong>89/89 檔取得盤前價；異動表使用 08:03 ET 最新成交。MU／SNDK 目前未查到新的公司級公告，暫按上週急跌後的技術性反彈解讀。</div><p class="section-summary"><strong>本段結論：</strong>上漲集中在晶片與 DPZ，跌幅集中在軟體和少數能源權重；反彈內部仍分化，不是全面 risk-on。</p>`,
  section_pre_market_movers_primary_action: "主線：只做守住 VWAP 的晶片強者，優先 MU／SMH，不追離 VWAP 過遠的盤前高點。",
  section_pre_market_movers_condition_action: "條件：若 MSFT／AAPL／NOW 轉強，才確認 QQQ 反彈由晶片擴散至大型科技。",
  section_pre_market_movers_avoid_action: "避免：把 MU／SNDK 的超跌反彈誤判為一個月下降趨勢已結束。",
  premarket_movers_invalidation: "若 SMH 跌回昨收 556.53 下方且 MU／SNDK 失守 VWAP → 晶片修復失敗。",
  correction_checklist_dashboard: `<div class="checks"><div class="check low"><span>S&amp;P 500 overextension / 標普過度延伸</span><strong><span class="badge green">Low</span> SPY 距 50MA 約 +0.01 ATR，並未過熱。</strong></div><div class="check mid"><span>Increasing downward momentum / 下跌動能增加</span><strong><span class="badge amber">Intermediate</span> 上週賣壓仍在，但盤前晶片轉為反彈。</strong></div><div class="check mid"><span>Top range formation &amp; breakdown / 高位區間跌破</span><strong><span class="badge amber">Intermediate</span> QQQ 低於 20/50MA，但仍在週度 ±1SD 內。</strong></div><div class="check high"><span>Technical indicators deteriorating / 技術指標惡化</span><strong><span class="badge red">High</span> QQQ、SMH、XLK 仍低於 20/50MA。</strong></div><div class="check high"><span>Market breadth worsening / 市場廣度惡化</span><strong><span class="badge red">High</span> NDX &gt;20MA 44.66%，5D / 10D ratio 0.70 / 0.75。</strong></div><div class="check low"><span>VIX &gt;20 / VIX spike / 波動升溫</span><strong><span class="badge green">Low</span> VIX 7/17 收 18.77，尚未突破 20。</strong></div><div class="check mid"><span>Breakout win rate down / breakdown rate up / 突破勝率下降</span><strong><span class="badge amber">Intermediate</span> 4% 上漲 / 下跌 138 / 166，賣壓略佔優。</strong></div><div class="check high"><span>Theme stocks momentum weakening / 主題股動能轉弱</span><strong><span class="badge red">High</span> SMH、AIQ、QTUM、WGMI 仍處弱勢均線結構。</strong></div></div><div class="callout warn"><strong>Checklist Score：</strong>3/8 High = Intermediate Risk。盤前反彈降低即時風險，但科技均線與廣度尚未修復。</div><p class="section-summary"><strong>本段結論：</strong>風險由上週高位回落至中等，尚未降至低風險。真正降級要看到 QQQ 站回 20MA、NDX 廣度回到 50% 上方。</p>`,
  section_correction_checklist_primary_action: "主線：保持中性倉位，讓價格先證明反彈延續。",
  section_correction_checklist_condition_action: "條件：3 項 High 降至 1 項以下，再恢復標準科技配置。",
  section_correction_checklist_avoid_action: "避免：只看 VIX 未破 20 就忽略 NDX 廣度與均線惡化。",
  checklist_invalidation: "若 VIX >20 且 QQQ <672.99 → 中等風險判斷失效，升級為高風險。",
  macro_premarket_background_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>宏觀數據</th><th class="num">Actual</th><th class="num">Forecast</th><th class="num">Previous</th><th>判斷</th></tr></thead><tbody><tr><td>美國領先指標 MoM（6月，10:00 ET）</td><td class="num">待公布</td><td class="num">-0.10%</td><td class="num">+0.10%</td><td><span class="badge blue">待公布</span> 若再轉負，顯示下半年動能降溫。</td></tr><tr><td>中國 1年期 LPR（7月）</td><td class="num">3.00%</td><td class="num">3.00%</td><td class="num">3.00%</td><td><span class="badge green">符合預期</span> 連續維持不變。</td></tr><tr><td>中國 5年期 LPR（7月）</td><td class="num">3.50%</td><td class="num">3.50%</td><td class="num">3.50%</td><td><span class="badge green">符合預期</span> 對美股影響有限。</td></tr></tbody></table></div><div class="table-scroll"><table class="report-data-table"><thead><tr><th>財報</th><th class="num">EPS Actual / Forecast</th><th class="num">Revenue Actual / Forecast</th><th>Beat / Miss</th><th>盤前含義</th></tr></thead><tbody><tr><td>DPZ</td><td class="num">$4.07 / $4.17</td><td class="num">$1.194B / $1.18B</td><td><span class="badge amber">EPS Miss / Revenue Beat</span></td><td>美國同店銷售 +0.1%，盤前 ${signed(dpzQ.changePct)}。</td></tr><tr><td>GOOGL（週三盤後）</td><td class="num">待公布 / $2.90</td><td class="num">待公布 / $116.9B</td><td><span class="badge blue">待公布</span></td><td>雲端、廣告與 AI 資本支出是本週 QQQ 主觸發。</td></tr><tr><td>TSLA（週三盤後）</td><td class="num">待公布 / $0.36 GAAP</td><td class="num">待公布 / $27.584B</td><td><span class="badge blue">待公布</span></td><td>公司彙整共識；毛利率、自由現金流與機器人計畫最重要。</td></tr><tr><td>INTC（週四盤後）</td><td class="num">待公布 / $0.22</td><td class="num">待公布 / $14.4B</td><td><span class="badge blue">待公布</span></td><td>資料中心成長與 Foundry 虧損決定晶片反彈延續性。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>今日開盤前只有 DPZ 已公布重大財報，且呈現營收 Beat、EPS Miss；10:00 ET 的領先指標是今日主要宏觀數據，本週真正的科技方向由 GOOGL、TSLA 與 INTC 財報決定。</p>`,
  section_macro_premarket_background_primary_action: "主線：10:00 ET 前不因單一領先指標預期值提前押注。",
  section_macro_premarket_background_condition_action: "條件：LEI 若低於 -0.1% 且 US10Y 下行，偏利多長久期但偏空景氣循環。",
  section_macro_premarket_background_avoid_action: "避免：把 DPZ 股價上漲簡單解釋為 EPS Beat；實際是 EPS Miss、營收 Beat。",
  macro_invalidation: "若 LEI 大幅高於預期且長端利率同步上升 → 利率敏感科技反彈可能受壓。",
  sector_momentum_chart: chartRows(chartSelection),
  sector_thematic_etf_tables: `${etfTable(sectorRows, "S&amp;P 500 Sector ETF")}<p class="section-summary"><strong>板塊結論：</strong>XLE 5日 +4.72%，XLF／XLV／XLRE 結構相對完整；XLK 5日 -5.48%、低於 20/50MA，是大盤主要弱點。</p>${etfTable(thematicRows, "Thematic Sector ETF")}<div class="callout ok"><strong>長橋核對：</strong>44/44 檔主題 ETF 取數成功；表內精選 25 檔並加入 SPY 基準，RSI／MA 均使用 2026-07-17 完整日線，未使用 Google RSI 公式。</div><p class="section-summary"><strong>主題結論：</strong>生技、保險與能源月線領先；半導體、AI、量子、白銀與礦業仍偏弱。盤前晶片反彈尚未改變月線排序。</p>`,
  section_sector_thematic_etf_primary_action: "主線：保留 XLE／XLF／XLV 等相對強勢，晶片只做確認後修復。",
  section_sector_thematic_etf_condition_action: "條件：SMH 站回 20MA 且 RSI 回到 50 上方，才把晶片由反彈交易升級為趨勢配置。",
  section_sector_thematic_etf_avoid_action: "避免：追逐 REMX／SLV／WGMI 等低 RSI 標的的無確認反彈。",
  sector_etf_invalidation: "若 SPY 跌破 50MA 且 XLE／XLF／XLV 同步轉弱 → 板塊輪動緩衝失效。",
  major_etf_technical_table: `<div class="table-scroll"><table class="ma-table report-data-table report-cols-8"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>${majorBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>SPY、RSP、DIA 的中期結構优於 QQQ／SMH；盤前晶片反彈尚未收回关键均線，仍按修復行情管理。</p>`.replaceAll("结构优於", "結構優於").replaceAll("关键", "關鍵"),
  section_major_etf_technical_primary_action: "主線：QQQ 未站回 718.30 前，科技維持低於標準配置。",
  section_major_etf_technical_condition_action: "條件：QQQ 與 QQQE 同步收回 20MA，才確認修復不只靠巨型權重。",
  section_major_etf_technical_avoid_action: "避免：在 SMH 仍低於 20/50MA 時加槓桿半導體。",
  major_etf_invalidation: "若 QQQ >718.30（20MA）且 SMH >598.44（週度 +1SD）→ 技術防守判斷失效。",
  fifty_ma_atr_extension_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">昨收</th><th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距50MA ATR</th><th>判斷</th></tr></thead><tbody>${atrBody}</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>QQQ 低於 50MA 1.52 ATR，屬趨勢破壞而非過度延伸；RSP 距 50MA +2.09 ATR，等權大盤較強但也不宜追價。</p>`,
  section_50ma_atr_extension_primary_action: "主線：以 50MA 作為風格切換線，持有強者、不追延伸。",
  section_50ma_atr_extension_condition_action: "條件：QQQ 距 50MA ATR 回到 0 以上，再提高成長股曝險。",
  section_50ma_atr_extension_avoid_action: "避免：把低於 50MA 解讀成單純超賣。",
  atr_extension_invalidation: "若 RSP 跌回 50MA 且 QQQ 續弱 → 等權輪動優勢失效。",
  market_breadth_table: `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr><th>指標</th><th class="num">最新</th><th>5日趨勢</th><th>約1月趨勢</th><th>判斷</th></tr></thead><tbody><tr><td>SPX &gt;20MA</td><td class="num">58.05%</td><td>63.02% → 58.05%</td><td>由 60% 上方回落</td><td>大盤短線廣度降溫但仍高於 50%。</td></tr><tr><td>SPX &gt;50MA</td><td class="num">63.61%</td><td>65.00% → 63.61%</td><td>維持 60% 上方</td><td>中期大盤結構仍有緩衝。</td></tr><tr><td>NDX &gt;20MA</td><td class="num">44.66%</td><td>54.36% → 44.66%</td><td>跌破 50%</td><td>科技短線廣度是三大指數最弱。</td></tr><tr><td>NDX &gt;50MA</td><td class="num">43.68%</td><td>52.42% → 43.68%</td><td>跌破 50%</td><td>科技中期廣度也轉弱。</td></tr><tr><td>IWM &gt;20MA</td><td class="num">54.56%</td><td>56.30% → 54.56%</td><td>仍高於 50%</td><td>小型股短線結構優於 NDX。</td></tr><tr><td>IWM &gt;50MA</td><td class="num">62.27%</td><td>62.84% → 62.27%</td><td>維持 60% 上方</td><td>小型股中期結構未壞。</td></tr><tr><td>T2108</td><td class="num">53.50%</td><td>53.83% → 53.50%</td><td>維持 50% 上方</td><td>全市場長線廣度仍可。</td></tr><tr><td>5D ratio</td><td class="num">0.70</td><td>0.93 → 0.70</td><td>持續低於 1</td><td>短線強股擴散偏空。</td></tr><tr><td>10D ratio</td><td class="num">0.75</td><td>0.87 → 0.75</td><td>持續低於 1</td><td>中短線動能尚未修復。</td></tr><tr><td>4%+ 上漲／下跌</td><td class="num">138 / 166</td><td>235 / 205 → 138 / 166</td><td>下跌略多</td><td>高波動個股賣壓仍在，但較前日收斂。</td></tr><tr><td>季度 +25%／-25%</td><td class="num">1269 / 1225</td><td>1360 / 1137 → 1269 / 1225</td><td>優勢縮至 44 檔</td><td>中期強弱接近平衡。</td></tr></tbody></table></div>`,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>綜合廣度：</strong>SPX／IWM 的 20MA、50MA 廣度仍高於 50%，提供大盤緩衝；NDX 兩項廣度已降至 44.66% / 43.68%，確認科技最弱。Stockbee 5D / 10D ratio 0.70 / 0.75、4% 上漲 / 下跌 138 / 166，補充顯示短線個股擴散仍偏空；T2108 53.50% 則表示尚非全面崩壞。</div><p class="section-summary"><strong>小結：</strong>三大指數與 Stockbee 指向同一結論：市場不是全面熊市，但科技與高 beta 的短中期廣度都未修復。盤前反彈需由 NDX 廣度確認。</p>`,
  section_market_breadth_primary_action: "主線：以 SPX／IWM 保留核心，科技曝險等待 NDX 廣度回到 50%。",
  section_market_breadth_condition_action: "條件：5D ratio >1 且 NDX &gt;20MA >50% 才提高高 beta。",
  section_market_breadth_avoid_action: "避免：只引用 Stockbee 或只看 SPX，忽略 NDX 與 IWM 的分化。",
  breadth_invalidation: "若 SPX / IWM &gt;20MA 同跌破 50%，且 T2108 <50% → 市場由科技弱勢擴散為全面風險。",
  fx_commodities_table: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">最新</th><th class="num">日變化</th><th class="num">5日</th><th class="num">1月</th><th>對美股含義</th></tr></thead><tbody><tr><td>DXY</td><td class="num">100.59</td><td class="num dn">約 -0.17%</td><td class="num dn">-0.51%</td><td class="num up">+1.23%</td><td>美元由 7/17 的 100.76 小幅回落，未形成新的科技壓力；DXY &gt;102 才升級為減科技觸發。</td></tr><tr><td>USO</td><td class="num">${n(usoQ.price)}</td><td class="num ${trendClass(usoQ.changePct)}">${signed(usoQ.changePct)}</td><td class="num ${trendClass(snapMap.get("USO").fiveDayPct)}">${signed(snapMap.get("USO").fiveDayPct)}</td><td class="num ${trendClass(snapMap.get("USO").oneMonthPct)}">${signed(snapMap.get("USO").oneMonthPct)}</td><td>油價盤前回吐，上週能源強勢降溫；有利通膨預期但拖累 XLE。</td></tr><tr><td>GLD</td><td class="num">${n(quoteMap.get("GLD").price)}</td><td class="num ${trendClass(quoteMap.get("GLD").changePct)}">${signed(quoteMap.get("GLD").changePct)}</td><td class="num ${trendClass(snapMap.get("GLD").fiveDayPct)}">${signed(snapMap.get("GLD").fiveDayPct)}</td><td class="num ${trendClass(snapMap.get("GLD").oneMonthPct)}">${signed(snapMap.get("GLD").oneMonthPct)}</td><td>黃金接近平盤，避險需求未顯著擴張。</td></tr><tr><td>SLV</td><td class="num">${n(quoteMap.get("SLV").price)}</td><td class="num ${trendClass(quoteMap.get("SLV").changePct)}">${signed(quoteMap.get("SLV").changePct)}</td><td class="num ${trendClass(snapMap.get("SLV").fiveDayPct)}">${signed(snapMap.get("SLV").fiveDayPct)}</td><td class="num ${trendClass(snapMap.get("SLV").oneMonthPct)}">${signed(snapMap.get("SLV").oneMonthPct)}</td><td>白銀超跌反彈，但三均線弱勢與低 RSI 尚未扭轉。</td></tr><tr><td>CPER</td><td class="num">${n(quoteMap.get("CPER").price)}</td><td class="num ${trendClass(quoteMap.get("CPER").changePct)}">${signed(quoteMap.get("CPER").changePct)}</td><td class="num ${trendClass(snapMap.get("CPER").fiveDayPct)}">${signed(snapMap.get("CPER").fiveDayPct)}</td><td class="num ${trendClass(snapMap.get("CPER").oneMonthPct)}">${signed(snapMap.get("CPER").oneMonthPct)}</td><td>銅價小幅反彈，但月線仍偏弱，未確認景氣循環重啟。</td></tr><tr><td>IBIT</td><td class="num">${n(quoteMap.get("IBIT").price)}</td><td class="num ${trendClass(quoteMap.get("IBIT").changePct)}">${signed(quoteMap.get("IBIT").changePct)}</td><td class="num ${trendClass(snapMap.get("IBIT").fiveDayPct)}">${signed(snapMap.get("IBIT").fiveDayPct)}</td><td class="num ${trendClass(snapMap.get("IBIT").oneMonthPct)}">${signed(snapMap.get("IBIT").oneMonthPct)}</td><td>加密代理跟隨高 beta 修復，但趨勢仍中性偏弱。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>DXY 小幅回落、油價回吐，宏觀價格環境對科技反彈略有利；但商品內部多數仍在月線弱勢，不能據此確認全面 risk-on。</p>`,
  section_fx_commodities_primary_action: "主線：保留 DXY 监控，100.59 尚未触发减科技。".replaceAll("监控", "監控").replaceAll("触发减", "觸發減"),
  section_fx_commodities_condition_action: "條件：DXY >102 或 USO 再突破 132.41（週度 +1SD），降低長久期科技。",
  section_fx_commodities_avoid_action: "避免：追逐 SLV 超跌反彈或在油價回吐時追高能源。",
  forex_commodity_invalidation: "若 DXY 跌破 100 且油價續降、QQQ 同時站回 20MA → 宏觀價格壓力判斷失效。",
  treasury_fed_economic_data_table: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>項目</th><th class="num">最新 / Actual</th><th class="num">Forecast</th><th class="num">Previous</th><th>政策與市場含義</th></tr></thead><tbody><tr><td>US2Y（7/17 官方收盤）</td><td class="num">4.18%</td><td class="num" data-allow-missing>—</td><td class="num">4.16%</td><td>短端 +2bp，Fed 路徑仍偏緊。</td></tr><tr><td>US10Y（7/17 官方收盤）</td><td class="num">4.55%</td><td class="num" data-allow-missing>—</td><td class="num">4.57%</td><td>長端 -2bp，盤前 TLT -0.30% 顯示債市略回吐。</td></tr><tr><td>US20Y（7/17 官方收盤）</td><td class="num">5.07%</td><td class="num" data-allow-missing>—</td><td class="num">5.09%</td><td>長端仍高於 5%，限制高估值擴張。</td></tr><tr><td>美國領先指標（10:00 ET）</td><td class="num">待公布</td><td class="num">-0.10%</td><td class="num">+0.10%</td><td>今日唯一主要美國數據，重點看殖利率與景氣股同步反應。</td></tr><tr><td>FOMC 背景</td><td class="num">7月28至29日會議</td><td class="num" data-allow-missing>—</td><td class="num">目標利率 3.50%–3.75%</td><td>本週數據清淡，市場更受財報與油價驅動。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>官方殖利率曲線仍偏高，2年期 4.18%、20年期 5.07%；今日若 LEI 偏弱但長端不降，科技估值仍難獲得完整支撐。</p>`,
  section_treasury_fed_primary_action: "主線：10:00 ET 同看 LEI、US10Y 與 QQQ，不單看數據方向。",
  section_treasury_fed_condition_action: "條件：US10Y 下行且 QQQ 站回 718.30，才確認利率支持科技。",
  section_treasury_fed_avoid_action: "避免：忽略 20年期仍高於 5% 的估值約束。",
  treasury_invalidation: "若 US10Y 快速升破 4.60% 且 QQQ 跌回昨收 → 盤前修復判斷失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">週度 -1SD</th><th class="num">週度 +1SD</th><th>狀態</th><th>行動</th></tr></thead><tbody><tr><td>SPY</td><td class="num up">${n(spyQ.price)}</td><td class="num">730.03</td><td class="num">756.55</td><td><span class="badge blue">區間內</span></td><td>守住昨收與 50MA，維持核心倉。</td></tr><tr><td>QQQ</td><td class="num up">${n(qqqQ.price)}</td><td class="num">672.99</td><td class="num">717.68</td><td><span class="badge amber">反彈未確認</span></td><td>站回 717.68 / 718.30 才提高科技 beta。</td></tr><tr><td>SMH</td><td class="num up">${n(smhQ.price)}</td><td class="num">514.63</td><td class="num">598.44</td><td><span class="badge amber">超跌反彈</span></td><td>守 VWAP 可做修復，跌回 556.53 下方降倉。</td></tr><tr><td>XLK</td><td class="num up">${n(quoteMap.get("XLK").price)}</td><td class="num">168.26</td><td class="num">182.92</td><td><span class="badge amber">區間內偏弱</span></td><td>未收回 20/50MA 前不追。</td></tr><tr><td>IWM</td><td class="num up">${n(quoteMap.get("IWM").price)}</td><td class="num">287.51</td><td class="num">300.57</td><td><span class="badge blue">區間內</span></td><td>若廣度守 50%，可保留小型股分散。</td></tr><tr><td>USO</td><td class="num ${trendClass(usoQ.changePct)}">${n(usoQ.price)}</td><td class="num">115.51</td><td class="num">132.41</td><td><span class="badge blue">區間內</span></td><td>上週強勢後回吐，不追能源。</td></tr></tbody></table></div><p class="section-summary"><strong>本段結論：</strong>主要 ETF 都在本週 ±1SD 內；盤前沒有極端突破。交易重点是 QQQ 717.68 / 718.30 與 SMH 556.53，而不是追逐开盘缺口。</p><div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>晶片反彈守 VWAP 才參與，QQQ 未站回 20MA 前不恢復標準配置。</li><li class="ad-secondary"><strong>次線：</strong>保留 RSP／XLF／XLV 作為科技廣度不足的緩衝。</li><li class="ad-watch"><strong>觀察：</strong>717.68、718.30、598.44、VIX 20、NDX &gt;20MA 50%。</li><li class="ad-avoid"><strong>避免：</strong>追 MU／SNDK 盤前高點、抄底弱勢軟體與白銀。</li><li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：若 QQQ&gt;718.30 且 NDX &gt;20MA&gt;50% → 防守失效，逐步提高科技曝險。</strong></li></ul></div>`.replaceAll("重点", "重點").replaceAll("开盘", "開盤"),
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "SMH 守住 556.53 並站上 VWAP", interpretation: "晶片修復延續", action: "小倉參與 MU／SMH，止損放在 VWAP 下方。" },
    { time_slot: "09:30 ORB", trigger_event: "SMH 跌回 556.53 下方", interpretation: "盤前反彈失敗", action: "撤高 beta，保留 RSP／防守板塊。" },
    { time_slot: "10:00", trigger_event: "LEI Actual vs -0.1%", interpretation: "判斷景氣與利率", action: "同步看 US10Y 與 QQQ，不只看數據正負。" },
    { time_slot: "11:00", trigger_event: "AAPL／MSFT／NOW 轉強", interpretation: "反彈由晶片擴散", action: "若 QQQ 同時接近 717.68，可撤部分對沖。" },
    { time_slot: "14:00", trigger_event: "VIX >20 或 QQQ 失守昨收", interpretation: "風險重新升級", action: "降低科技與槓桿 ETF。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ / RSP 相對強弱", interpretation: "確認科技是否接棒", action: "QQQ 未改善則保留等權與防守配置。" },
  ],
  cross_validation_summary: `<div class="callout ok"><strong>確認訊號：</strong>長橋盤前顯示 QQQ／SMH 與晶片股同步反彈；DXY 小幅回落、油價回吐，價格環境不再加重科技壓力。</div><div class="callout warn"><strong>分歧訊號：</strong>QQQ／SMH／XLK 仍低於 20/50MA，NDX &gt;20MA / &gt;50MA 只有 44.66% / 43.68%，Stockbee ratio 仍低於 1；大型軟體與 AAPL／MSFT 也未同步轉強。</div><div class="callout"><strong>主導結論：</strong>今日是「晶片領先的修復行情」，不是全面 risk-on。站回 QQQ 20MA 並取得廣度確認前，維持中性偏防守。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：08:03 ET 盤前價格、成交量與 2026-07-17 完整日線 RSI / MA / ATR；使用者 Google Sheets：Market、Thematic Sectors、Macro、Maket breath、Weekly Expected Move 與 Stockbee（更新至 7/17）；<a href="https://ir.dominos.com/news-releases/news-release-details/dominos-pizza-announces-second-quarter-2026-financial-results">Domino's 官方 Q2 財報</a>；<a href="https://ir.tesla.com/press-release/earnings-consensus-second-quarter-2026">Tesla 官方 Q2 共識</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&amp;field_tdr_date_value=2026">美國財政部殖利率</a>；<a href="https://www.conference-board.org/topics/us-leading-indicators/index.cfm">Conference Board 領先指標</a>；<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">本週財報日曆</a>；<a href="https://www.kiplinger.com/investing/economy/this-weeks-economic-calendar">本週經濟日曆</a>。</p><p class="source-note">本報告為本地盤前草稿，不構成投資建議。盤前價格可能快速變動；未公布的 Actual 明確標示「待公布」，未作估算。</p>`,
});

const output = path.join(root, "data", "2026-07-20-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
