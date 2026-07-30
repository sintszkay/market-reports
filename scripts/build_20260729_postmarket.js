#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-29.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const extended = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_extended_2026-07-29.json"), "utf8"));
const output = path.join(root, "data", "2026-07-29-postmarket.json");

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
const theme = new Map(thematic.rows.map((row) => [row.ticker, row]));
const macroMap = new Map(macro.rows.map((row) => [row.key, row]));
const afterHours = new Map(extended.rows.map((row) => [row.ticker, row]));

function requireRow(map, ticker, sourceName) {
  const row = map.get(ticker);
  if (!row) throw new Error(`${sourceName} 缺少 ${ticker}`);
  return row;
}

function pct(value) {
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function fixed(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function maState(row) {
  return {
    20: Boolean(row.above20 ?? row.aboveMa20),
    50: Boolean(row.above50 ?? row.aboveMa50),
    200: Boolean(row.above200 ?? row.aboveMa200),
  };
}

function strengthNote(row) {
  const states = maState(row);
  const aboveCount = Object.values(states).filter(Boolean).length;
  if (Number(row.rsi14) >= 70) return "RSI 偏熱，趨勢強但不宜追價。";
  if (Number(row.rsi14) >= 60 && aboveCount === 3) return "三條均線之上，相對強勢結構完整。";
  if (Number(row.rsi14) <= 35) return "RSI 偏冷，短線仍屬弱勢修復區。";
  if (aboveCount === 3) return "三條均線之上，中期趨勢保持完整。";
  if (aboveCount === 0) return "三條均線之下，尚未形成有效修復。";
  if (!states[20] && states[50] && states[200]) return "跌破 20MA，但中期結構尚未破壞。";
  if (!states[20] && !states[50] && states[200]) return "低於 20／50MA，只剩長期均線支撐。";
  return "均線訊號分歧，等待收盤方向確認。";
}

function makeEtfRow(ticker, { chart = false, note } = {}) {
  const source = theme.get(ticker) || snap.get(ticker);
  if (!source) throw new Error(`ETF 資料缺少 ${ticker}`);
  return {
    label: ticker,
    daily: Number(source.dailyPct),
    daily_display: pct(source.dailyPct),
    five_day: pct(source.fiveDayPct),
    one_month: pct(source.oneMonthPct),
    one_month_numeric: Number(source.oneMonthPct),
    ma: maState(source),
    rsi: Number(source.rsi14),
    judgment: note || strengthNote(source),
    chart,
  };
}

const sectorNotes = {
  SPY: "跌破 20／50MA，僅守 200MA；短線風險明顯升高。",
  XLF: "金融維持三條均線之上，1月仍上漲 5.51%。",
  XLV: "醫療 5日上漲 4.27%，防禦承接最清楚。",
  XLRE: "房地產守住三條均線，利率敏感板塊相對抗跌。",
  XLB: "原物料仍在三條均線上方，結構優於指數。",
  XLP: "必需消費逆市上漲，防禦輪動獲得價格確認。",
  XLI: "工業跌破 20／50MA，單日 -3.19%，週期股轉弱。",
  XLE: "油價急升帶動能源 +1.88%，但 5日仍小跌。",
  XLU: "公用事業失守 20MA，仍守 50／200MA。",
  XLC: "通訊日內抗跌，但仍低於三條均線。",
  XLY: "非必需消費低於三條均線，需求 beta 尚弱。",
  XLK: "科技低於 20／50MA，RSI 34.15，修復尚未成立。",
};

const sectorRows = ["SPY", "XLF", "XLV", "XLRE", "XLB", "XLP", "XLI", "XLE", "XLU", "XLC", "XLY", "XLK"]
  .map((ticker) => makeEtfRow(ticker, { note: sectorNotes[ticker] }))
  .sort((left, right) => right.rsi - left.rsi);

const chartTickers = new Set([
  ...[...thematic.rows].sort((a, b) => b.oneMonthPct - a.oneMonthPct).slice(0, 4).map((row) => row.ticker),
  ...[...thematic.rows].sort((a, b) => a.oneMonthPct - b.oneMonthPct).slice(0, 4).map((row) => row.ticker),
]);
const thematicRows = [
  makeEtfRow("SPY"),
  ...thematic.rows.map((row) => makeEtfRow(row.ticker, { chart: chartTickers.has(row.ticker) })),
].sort((left, right) => right.rsi - left.rsi);

const indexNotes = {
  IWM: "跌破 20／50MA，RSI 41.95；小型股廣度同步惡化。",
  DIA: "收盤僅高於 50MA 約 0.03 ATR，已失守 20MA。",
  SPY: "低於 20／50MA、守 200MA；等權 RSP 相對抗跌。",
  QQQ: "距週度 -1SD 僅 0.07，低於 20／50MA，RSI 32.43。",
};
const indexRows = ["IWM", "DIA", "SPY", "QQQ"].map((ticker) => {
  const row = requireRow(snap, ticker, "指數與風格");
  return {
    asset: ticker,
    latest: fixed(row.close),
    daily: pct(row.dailyPct),
    five_day: pct(row.fiveDayPct),
    ma: maState(row),
    rsi: Number(row.rsi14),
    judgment: indexNotes[ticker],
  };
});

const report = {
  report_type: "postmarket",
  title: "美股盤後對賬｜2026-07-29",
  eyebrow: "US postmarket reconciliation · 2026-07-29",
  headline: "FOMC 偏鷹維持、長端利率重新定價；科技與晶片破位，MSFT／META 盤後分化",
  as_of: "資料截至 2026-07-29 美股收盤。長橋收盤快照 72／72、Thematic Sectors 44／44、Macro 24／24 全部成功，盤後即時報價 10／10 可用；Market Breadth、Stockbee 與 Weekly Expected Move 已更新至 7/29。",
  reconciliation_summary: { hit: 4, triggered: 3, miss: 1, not_triggered: 2 },
  regime_badges: "<span class='badge red'>短線高風險</span><span class='badge amber'>VIX 3/5：Intermediate</span><span class='badge red'>SMH 跌破週度 -1SD</span><span class='badge blue'>FOMC 9–3 偏鷹維持</span>",
  summary_cards: [
    { label: "SPY／QQQ", values: [{ text: "-1.54%", color: "red" }, { text: "-2.04%", color: "red" }], note: "權重科技弱於大盤，QQQ 貼近週度 -1SD。" },
    { label: "DIA／IWM", values: [{ text: "-2.18%", color: "red" }, { text: "-1.64%", color: "red" }], note: "跌勢擴至價值與小型股，不再只是科技內部。" },
    { label: "SMH／MU", values: [{ text: "-4.79%", color: "red" }, { text: "-9.94%", color: "red" }], note: "晶片、記憶體與設備鏈同步去風險。" },
    { label: "MSFT／META 盤後", values: [{ text: "+8.83%", color: "green" }, { text: "-7.36%", color: "red" }], note: "財報第二層變數，不應歸因於 FOMC。" },
  ],
  core_conclusions: [
    "<ol>",
    "<li><strong>FOMC 的訊號不是「沒升息＝利多」，而是偏鷹維持。</strong>利率維持 3.50%–3.75%，但投票為 9–3，Hammack、Kashkari、Logan 主張升息 25bp；Warsh 重申 2% 目標，沒有提供下一步指引。</li>",
    "<li><strong>記者會最重要的變化是 Fed 主動減少前瞻指引。</strong>Warsh 表示金融市場要自行定價，Fed 觀察市場但不接受市場「指揮」；這會把政策不確定性轉移到長端殖利率與期限溢價，而不是只看下一次會議機率。</li>",
    "<li><strong>跨資產反應支持「長端收緊、科技去風險」。</strong>TLT -1.65%、美國 10 年期殖利率約 4.65%，QQQ -2.04%、SMH -4.79%；即使沒有即時升息，金融條件仍可透過債券市場收緊。</li>",
    "<li><strong>跌勢已由科技擴至更廣市場。</strong>SPX／NDX／IWM 的 20MA 廣度均下降，Stockbee 4% 上漲／下跌為 165／552，5D／10D ratio 降至 0.65／0.76；RSP -0.90% 仍較 SPY 抗跌，但不能再稱為單純權重股修正。</li>",
    "<li><strong>晶片與記憶體是最弱主線。</strong>SMH -4.79%、NVDA -3.55%、AMD -5.51%、MU -9.94%、SNDK -7.32%、AMAT -8.40%、KLAC -10.80%；SMH、AMD、MU、NVDA 均觸及或跌破週度下界。</li>",
    "<li><strong>盤後財報形成第二層、方向相反的衝擊。</strong>MSFT EPS／營收雙雙優於預期、盤後 +8.83%；META 營收優於預期但 EPS 低於預期且指引偏弱、盤後 -7.36%。隔夜 QQQ 的淨反應不能全部歸因於 Fed。</li>",
    "</ol>",
  ].join(""),
  core_conclusion: "主線已由「科技內部去風險」升級為「偏鷹 FOMC、長端利率收緊、廣度全面轉弱」。MSFT 盤後強勢只能緩衝權重指數，不能取代 QQQ／SMH 的收盤技術與廣度確認。",
  reconciliation_rows: [
    { section: "FOMC 尾端風險", directive: "重點不是猜升不升息，而是處理升息尾端風險。", actual: "最終維持利率，但 9–3 投票出現三名升息異議者，尾端風險轉為政策分歧。", result: "hit", correction: "保留決議機率以外的投票結構與記者會語氣。" },
    { section: "維持不等於利多", directive: "若維持但 Warsh 強調通膨，DXY／TLT 可形成偏鷹反應。", actual: "Warsh 重申 2% 目標並拒絕前瞻承諾；TLT -1.65%，QQQ -2.04%。", result: "hit", correction: "繼續用債券與科技價格確認，不用決議標題交易。" },
    { section: "科技技術偏弱", directive: "QQQ／SMH 低於 20／50MA，科技維持低配。", actual: "QQQ 跌至 661.73；SMH 跌至 504.22，兩者仍低於 20／50MA。", result: "hit", correction: "修復門檻保留 20MA，新增週度 -1SD 風控。" },
    { section: "盤後第二層風險", directive: "MSFT／META 財報後的波動不能全部歸因於 Fed。", actual: "MSFT 盤後 +8.83%，META -7.36%，方向相反且與各自財報吻合。", result: "hit", correction: "FOMC、MSFT、META 三項事件分開對賬。" },
    { section: "偏鴿升級條件", directive: "TLT 站回 84.25、DXY 回落、QQQ 收回 VWAP，三項至少兩項成立才加科技。", actual: "TLT 收 82.85 並跌破 83.75，QQQ 收跌；升級組合未成立。", result: "not_triggered", correction: "不因 MSFT 盤後上漲提前提高整體科技 beta。" },
    { section: "防守主線失效", directive: "若偏鴿、TLT 上漲且 QQQ／SMH 收回 VWAP，防守主線失效。", actual: "債券與科技均未確認偏鴿反應，SMH 反而跌破週度下界。", result: "not_triggered", correction: "原防守主線保留。" },
    { section: "偏鷹維持", directive: "維持但 Warsh 明確保留升息風險時降低科技。", actual: "Warsh 沒有點名下一次會議，但表示今日不變只是故事開始，且三票主張升息。", result: "triggered", correction: "將「明確日期」改為「投票、通膨語氣、跨資產反應」三項確認。" },
    { section: "週度下界", directive: "QQQ <661.66 或 SMH <518.82 時再降高 beta。", actual: "QQQ 收 661.73，僅高 0.07；SMH 收 504.22，已跌破 -1SD。", result: "triggered", correction: "SMH 已觸發；QQQ 下一日仍以 661.66 為收盤門檻。" },
    { section: "宏觀降級門檻", directive: "DXY >102、TLT <83.75 或 VIX 分數 4/5 時降總風險。", actual: "DXY 仍約 101 附近、VIX 3/5；但 TLT 82.85 已跌破 83.75。", result: "triggered", correction: "由長債條件單獨觸發，不等美元或 VIX 同步。" },
    { section: "廣度不是單向崩壞", directive: "指數廣度改善、Stockbee 偏弱，屬兩組訊號分歧。", actual: "六項指數廣度全數下降，Stockbee 5D／10D 降至 0.65／0.76，4% 下跌股 552。", result: "miss", correction: "廣度已由分歧轉為共同惡化，盤後必須用當日數值重算。" },
  ],
  reconciliation_conclusion: "10 項盤前規則逐行對賬：4 命中、3 已觸發、1 失誤、2 未觸發。最大修正是廣度判讀：7/29 已不是指數廣度改善與 Stockbee 偏弱的分歧，而是兩組來源共同轉弱。",
  index_rows: indexRows,
  index_conclusion: "四大 ETF 只保留 IWM、DIA、SPY、QQQ。QQQ 距週度 -1SD 僅 0.07；SPY、QQQ、IWM 低於 20／50MA，DIA 也失守 20MA、僅勉強高於 50MA，四者短線均未形成修復。",
  sector_rows: sectorRows,
  sector_conclusion: "Sector Dashboard 固定 12 列並按 RSI 由高到低排序。XLV、XLP、XLRE、XLF 相對較強；XLK、XLY、XLI 技術轉弱。XLE 因油價反彈逆市上漲，但 5日仍為負。",
  thematic_rows: thematicRows,
  thematic_conclusion: "Thematic Sectors 已完整讀取長橋 44 檔 ETF，另加入 SPY 基準，共 45 列並按 RSI 遞減排序。FXI、IAK、KIE、PPH 居前；REMX、AIRR、TAN、QTUM、SMH、WGMI 居後，弱勢集中在晶片、量子、稀土與高 beta。",
  breadth_rows: [
    { indicator: "SPX >20MA（7/29）", latest: 63.02, percent: true, five_day: "69.18% → 63.02%", one_month: "仍高於六成", judgment: "大型股短線廣度明顯降溫。", tone: "red" },
    { indicator: "SPX >50MA（7/29）", latest: 65.80, percent: true, five_day: "71.57% → 65.80%", one_month: "中期尚高於六成", judgment: "中期底盤未崩，但正在轉弱。" },
    { indicator: "NDX >20MA（7/29）", latest: 47.57, percent: true, five_day: "48.54% → 47.57%", one_month: "低於五成", judgment: "科技短線參與度偏空。", tone: "red" },
    { indicator: "NDX >50MA（7/29）", latest: 49.51, percent: true, five_day: "51.45% → 49.51%", one_month: "跌回五成下方", judgment: "科技中期廣度再失中性線。", tone: "red" },
    { indicator: "IWM >20MA（7/29）", latest: 45.14, percent: true, five_day: "52.57% → 45.14%", one_month: "跌破五成", judgment: "小型股短線廣度轉弱最快。", tone: "red" },
    { indicator: "IWM >50MA（7/29）", latest: 55.00, percent: true, five_day: "61.07% → 55.00%", one_month: "仍高於五成", judgment: "中期底盤尚存，但緩衝縮小。" },
    { indicator: "T2108（Stockbee 7/29）", latest: 48.33, percent: true, five_day: "55.33% → 48.33%", one_month: "跌回五成下方", judgment: "全市場長期廣度轉為中性偏弱。", tone: "red" },
    { indicator: "5D ratio（Stockbee 7/29）", latest: "0.65", five_day: "0.78 → 0.65", one_month: "遠低於 1", judgment: "短線強股明顯少於弱股。", tone: "red" },
    { indicator: "10D ratio（Stockbee 7/29）", latest: "0.76", five_day: "0.88 → 0.76", one_month: "低於 1", judgment: "中短線趨勢仍偏空。", tone: "red" },
    { indicator: "4%+ 上漲／下跌（7/29）", latest: "165 / 552", five_day: "341 / 388 → 165 / 552", one_month: "極端下跌擴散", judgment: "下跌家數為上漲家數逾三倍。", tone: "red" },
    { indicator: "季度 +25%／-25%（7/29）", latest: "1172 / 1304", five_day: "1261 / 1231 → 1172 / 1304", one_month: "弱股反超強股", judgment: "中期結構也開始轉弱。", tone: "red" },
  ],
  breadth_context: "<div class='callout danger'><strong>雙來源共同轉弱：</strong>SPX、NDX、IWM 的 20／50MA 廣度六項全數下降；Stockbee 5D／10D ratio、T2108、4% 漲跌家數與季度強弱股也同步惡化。這次不再是來源分歧。</div>",
  breadth_conclusion: "綜合三大指數與 Stockbee，7/29 的跌勢已由權重科技擴散至全市場。RSP -0.90% 仍較 SPY -1.54% 抗跌，說明非科技相對較強，但只能稱為相對承接，不能抵消廣度共同惡化。",
  macro_rows: [
    { asset: "DXY", latest: "約 101.1", daily: "未破 102", meaning: "美元沒有觸發 102 減科技線；本輪收緊主要由長端債券而非美元主導。" },
    { asset: "美國 10 年債", latest: "約 4.65%", daily: "約 +3bp", meaning: "記者會後長端維持高位，市場以期限溢價替 Fed 收緊金融條件。" },
    { asset: "VIX／VIXY", latest: "18.21／22.53", daily: "-2.46%／+6.07%", meaning: "VIX 分數 3/5：現貨 >20 0、VIXY 5日>0 1、1月>0 1、20MA 1、50MA 0；Intermediate。" },
    { asset: "TLT", latest: fixed(requireRow(snap, "TLT", "Macro").close), daily: pct(requireRow(snap, "TLT", "Macro").dailyPct), meaning: "跌破 83.75 盤前風控線，距週度 -1SD 82.25 僅 0.60。" },
    { asset: "USO", latest: fixed(requireRow(snap, "USO", "Macro").close), daily: pct(requireRow(snap, "USO", "Macro").dailyPct), meaning: "單日急升 7.32%，重新提高能源通膨尾端風險。" },
    { asset: "GLD", latest: fixed(requireRow(snap, "GLD", "Macro").close), daily: pct(requireRow(snap, "GLD", "Macro").dailyPct), meaning: "小幅上漲，避險需求存在但未形成失序訊號。" },
    { asset: "SLV", latest: fixed(requireRow(snap, "SLV", "Macro").close), daily: pct(requireRow(snap, "SLV", "Macro").dailyPct), meaning: "白銀近乎持平，商品內部分化。" },
    { asset: "CPER", latest: fixed(requireRow(snap, "CPER", "Macro").close), daily: pct(requireRow(snap, "CPER", "Macro").dailyPct), meaning: "銅價近乎持平，沒有確認需求崩塌。" },
  ],
  macro_conclusion: "FOMC 後最重要的跨資產訊號是「TLT 下跌、10年期高位、油價急升」，而不是 DXY 升破 102 或 VIX 恐慌。這代表長端利率與供給通膨正在收緊金融條件；VIX 仍依五項規則評為 3/5 Intermediate。",
  expected_move_rows: [
    { ticker: "QQQ", price: "661.73", boundary: "-1SD 661.66", status: "距下界 0.07", tone: "amber", implication: "下一收盤跌破 661.66，指數風險再升級。" },
    { ticker: "SMH", price: "504.22", boundary: "-1SD 518.82", status: "跌破 -1SD", tone: "red", implication: "晶片週度風控已觸發。" },
    { ticker: "AMD", price: "429.56", boundary: "-1SD 472.55／-2SD 423.15", status: "逼近 -2SD", tone: "red", implication: "距 -2SD 僅 6.41，不宜搶反彈。" },
    { ticker: "NVDA", price: "190.01", boundary: "-1SD 196.58", status: "跌破 -1SD", tone: "red", implication: "AI 權重股加入週度破位。" },
    { ticker: "MU", price: "739.00", boundary: "-1SD 804.59", status: "跌破 -1SD", tone: "red", implication: "記憶體主線弱勢持續。" },
    { ticker: "CAT", price: "782.71", boundary: "-2SD 787.70", status: "跌破 -2SD", tone: "red", implication: "跌勢已擴及工業權重。" },
    { ticker: "XLK", price: "166.57", boundary: "-1SD 168.76", status: "跌破 -1SD", tone: "red", implication: "科技產業 ETF 正式越過週度下界。" },
    { ticker: "MSFT 盤後", price: "425.01", boundary: "+1SD 410.15", status: "突破 +1SD", tone: "green", implication: "財報後形成權重指數上行緩衝。" },
    { ticker: "META 盤後", price: "542.49", boundary: "-1SD 544.00", status: "跌破 -1SD", tone: "red", implication: "指引與費用疑慮抵消營收 Beat。" },
    { ticker: "XLP／XLV", price: "87.36／166.24", boundary: "+1SD 86.03／165.37", status: "突破 +1SD", tone: "green", implication: "防禦輪動仍獲價格確認。" },
    { ticker: "TLT", price: "82.85", boundary: "-1SD 82.25", status: "接近 -1SD", tone: "amber", implication: "再跌 0.60 即確認長端風險升級。" },
  ],
  expected_move_conclusion: "QQQ 幾乎貼住 -1SD，SMH、NVDA、XLK 已跌破 -1SD，AMD 接近 -2SD，CAT 已跌破 -2SD；盤後 MSFT 上破 +1SD、META 下破 -1SD，顯示隔夜權重科技仍會大幅分化。",
  event_review: [
    "<h3>FOMC 決議與 Warsh 記者會</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5 macro-review-table'><thead><tr><th>項目</th><th class='num'>結果</th><th class='num'>盤前基準</th><th>記者會訊號</th><th>市場含義</th></tr></thead><tbody>",
    "<tr><td>政策利率</td><td class='num'>3.50%–3.75%</td><td class='num'>維持 64.6%</td><td><span class='badge amber'>維持</span> 連續第五次不變</td><td>沒有即時升息，但不能解讀為寬鬆。</td></tr>",
    "<tr><td>投票</td><td class='num'>9–3</td><td class='num'>未設定</td><td><span class='badge red'>三票升息</span> Hammack、Kashkari、Logan 要求 +25bp</td><td>政策分歧明顯偏鷹，9月升息風險仍在。</td></tr>",
    "<tr><td>通膨目標</td><td class='num'>2%</td><td class='num'>偏鷹維持風險</td><td>Warsh 否認存在較高的「隱含目標」，稱五年高通膨不會由一個月數據解決。</td><td>單一溫和 CPI／PPI 不足以觸發政策轉向。</td></tr>",
    "<tr><td>前瞻指引</td><td class='num'>不提供</td><td class='num'>看 TLT／DXY</td><td>Fed 減少引導市場；金融市場自行定價，Fed 不接受市場指揮。</td><td>政策不確定性轉移至期限溢價，長端波動可能維持較高。</td></tr>",
    "<tr><td>下一步</td><td class='num'>未承諾日期</td><td class='num'>9月為主要風險窗</td><td>Warsh 稱今日不變是故事開端而非結束。</td><td>GDP、PCE、就業與能源價格將共同決定是否升息。</td></tr>",
    "</tbody></table></div>",
    "<h3>盤後大型科技財報</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-7'><thead><tr><th>公司</th><th class='num'>EPS Actual</th><th class='num'>EPS Forecast</th><th class='num'>Revenue Actual</th><th class='num'>Revenue Forecast</th><th>Beat／Miss</th><th class='num'>盤後反應</th></tr></thead><tbody>",
    `<tr><td>Microsoft（MSFT）</td><td class='num'>$4.81</td><td class='num'>$4.24</td><td class='num'>$90.00B</td><td class='num'>$87.62B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "MSFT", "盤後報價").postmarketChangePct)}</td></tr>`,
    `<tr><td>Meta（META）</td><td class='num'>$6.18</td><td class='num'>$7.19</td><td class='num'>$60.80B</td><td class='num'>$60.22B</td><td><span class='badge amber'>Miss / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "META", "盤後報價").postmarketChangePct)}</td></tr>`,
    "</tbody></table></div>",
  ].join(""),
  event_conclusion: "FOMC 的核心不是利率沒動，而是三票主張升息、2% 目標強硬、前瞻指引減少；這會讓長端利率承擔更多政策調整。盤後 MSFT 與 META 方向相反，必須與 Fed 衝擊分開核算。",
  next_session: [
    "<h3>FOMC 後四種具體情景</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5'><thead><tr><th>情景</th><th>必要確認</th><th>關鍵門檻</th><th>市場含義</th><th>行動</th></tr></thead><tbody>",
    "<tr><td><span class='badge amber'>基準：偏鷹維持</span></td><td>10年期維持高位、TLT 低於 83.75，QQQ／SMH 不收回失地。</td><td>TLT 83.75；QQQ 661.66；SMH 518.82</td><td>Fed 不升息，但債券市場代為收緊；科技估值繼續受壓。</td><td>科技 beta 維持低於基準，反彈不追。</td></tr>",
    "<tr><td><span class='badge red'>升級：通膨／能源再加速</span></td><td>PCE 或油價偏熱，DXY、10年期與 USO 同升。</td><td>DXY 102；USO 136.69；TLT 82.25</td><td>9月升息風險上升，長久期與高 beta 再估值。</td><td>若任兩項越線，總風險再降 1/3，保留 XLE／防禦。</td></tr>",
    "<tr><td><span class='badge green'>緩和：數據降溫</span></td><td>PCE／就業溫和，TLT 站回 84.25，DXY 回落，QQQ 重返 661.66 上方。</td><td>TLT 84.25；DXY &lt;101；QQQ &gt;661.66</td><td>政策風險延後，MSFT 財報可帶動大型科技技術反彈。</td><td>只回補核心科技 1/3；SMH 未收回 518.82 前不加晶片。</td></tr>",
    "<tr><td><span class='badge blue'>分化：財報蓋過 Fed</span></td><td>MSFT 強、META 弱，QQQ 上漲但等權／廣度沒有同步改善。</td><td>QQQ 盤後 666.07；NDX >20MA 47.57%</td><td>權重股托指數，不等於風險偏好全面回升。</td><td>看 QQQE／RSP 與上漲家數；未同步就只做個股，不升整體 beta。</td></tr>",
    "</tbody></table></div>",
  ].join(""),
  next_conclusion: "基準情景仍是偏鷹維持：TLT 83.75、QQQ 661.66、SMH 518.82 是隔夜三個核心門檻。只有數據降溫、債券回升與科技價格確認至少兩項同時成立，才小幅提高曝險。",
  cross_validation: "<div class='callout danger'><strong>共同確認：</strong>9–3 偏鷹投票、TLT 跌破 83.75、QQQ／SMH 低於 20／50MA、兩套廣度共同惡化，一致指向金融條件與科技風險升級。</div><div class='callout warn'><strong>重要分歧：</strong>VIX 現貨仍低於 20、DXY 未破 102，MSFT 盤後大漲；因此不是流動性失序，而是債券與產業盈利共同重估。</div><div class='callout'><strong>主導結論：</strong>先以收盤風控為主、盤後財報為輔。MSFT 可緩衝 QQQ，但只有 QQQE／RSP、上漲家數、SMH 同步修復，才把反彈升級為全面 risk-on。</div>",
  sources: [
    "<a href='https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm'>Federal Reserve：7/29 FOMC 聲明與投票</a>",
    "<a href='https://www.axios.com/2026/07/29/fed-warsh-rates-inflation'>Axios：Warsh 記者會與前瞻指引</a>",
    "<a href='https://apnews.com/article/ad10c177cb8d96f9e3ed122e12352a74'>AP：FOMC 決議、記者會與債券市場</a>",
    "<a href='https://apnews.com/article/microsoft-earnings-results-ai-f7dff4fb9d51a2bdec56a13e5da1053d'>AP：Microsoft 財報</a>",
    "<a href='https://apnews.com/article/meta-earnings-q2-facebook-profit-revenue-ai-bcbc62dde6d2cac724e3b3385fcabeab'>AP：Meta 財報</a>",
    "<a href='https://mx.investing.com/indices/volatility-s-p-500-historical-data'>VIX 歷史資料</a>",
    "<span>長橋 OpenAPI：72 檔收盤快照、44 檔 Thematic、24 檔 Macro 與 10 檔盤後報價；Google Sheets：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Stockbee、Weekly Expected Move。</span>",
  ].join("；"),
};

if (snapshot.rows.length !== 72 || snapshot.errors.length !== 0) {
  throw new Error(`收盤快照必須為 72／72、錯誤 0；目前 ${snapshot.rows.length}／72、錯誤 ${snapshot.errors.length}`);
}
if (thematic.rows.length !== 44 || thematic.errors.length !== 0) {
  throw new Error(`Thematic Sectors 必須為 44／44、錯誤 0；目前 ${thematic.rows.length}／44、錯誤 ${thematic.errors.length}`);
}
if (macro.rows.length !== 24 || macro.errors.length !== 0) {
  throw new Error(`Macro 必須為 24／24、錯誤 0；目前 ${macro.rows.length}／24、錯誤 ${macro.errors.length}`);
}
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.label === "SPY").length !== 1) {
  throw new Error("Thematic Sectors 報告必須為完整 44 檔加一列 SPY 基準");
}
if (chartTickers.size !== 8) {
  throw new Error(`板塊動能圖必須為 8 檔，目前 ${chartTickers.size}`);
}
if (!macroMap.has("VIXY")) {
  throw new Error("Macro 長橋快照缺少 VIXY");
}

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
