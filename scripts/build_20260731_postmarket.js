#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-31.json"), "utf8"));
const market = JSON.parse(fs.readFileSync(path.join(workRoot, "market_rsi_longport.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const output = path.join(root, "data", "2026-07-31-postmarket.json");

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
const marketMap = new Map(market.rows.map((row) => [row.ticker, row]));
const theme = new Map(thematic.rows.map((row) => [row.ticker, row]));
const macroMap = new Map(macro.rows.map((row) => [row.key, row]));

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
  const source = theme.get(ticker) || marketMap.get(ticker) || snap.get(ticker);
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
  SPY: "重返 20／50／200MA 之上，但等權與廣度沒有同步確認。",
  XLF: "金融守住三條均線，RSI 居產業前列。",
  XLV: "醫療保持三條均線上方，防禦結構完整。",
  XLRE: "房地產維持三均線多頭，利率壓力下仍具韌性。",
  XLB: "原物料維持中性偏強，銅價提供部分支撐。",
  XLP: "必需消費守住三均線，延續防禦承接。",
  XLI: "工業短線回穩，但仍需廣度配合。",
  XLE: "油價上行支撐能源，通膨尾端風險同步升高。",
  XLU: "公用事業偏防守，長端上行限制估值擴張。",
  XLC: "通訊仍受大型平台股分化影響。",
  XLY: "非必需消費修復有限，尚未形成全面 risk-on。",
  XLK: "科技仍低於 20／50MA，權重反彈未扭轉技術弱勢。",
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
  IWM: "單日下跌且低於 20／50MA，小型股沒有參與大型股反彈。",
  DIA: "收漲並守住三條均線，價值權重相對穩定。",
  SPY: "收漲並回到三條均線上方，但只高於 20MA 約 0.15 ATR。",
  QQQ: "收漲但仍低於 20／50MA，技術反轉尚未確認。",
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
  title: "美股盤後對賬｜2026-07-31",
  eyebrow: "US postmarket reconciliation · 2026-07-31",
  headline: "AMZN 拉升指數、AAPL 與記憶體拖累內部結構；油價與長端利率令反彈仍非全面 risk-on",
  as_of: "資料截至 2026-07-31 美股收盤。長橋收盤快照 75／75、Sector Dashboard 12／12、Thematic Sectors 44／44、Macro 32／32 均成功；Market Breadth、Stockbee 與 Weekly Expected Move 已對賬至 7/31。",
  reconciliation_summary: { hit: 5, triggered: 3, miss: 1, not_triggered: 2 },
  regime_badges: "<span class='badge amber'>反彈未獲廣度確認</span><span class='badge green'>VIX 0/5：Low</span><span class='badge red'>TLT 跌至週度 -1SD</span><span class='badge blue'>AMZN 財報主導權重</span>",
  summary_cards: [
    { label: "SPY／QQQ", values: [{ text: "+0.72%", color: "green" }, { text: "+0.65%", color: "green" }], note: "權重指數收漲，但 QQQ 仍低於 20／50MA。" },
    { label: "DIA／IWM", values: [{ text: "+0.54%", color: "green" }, { text: "-0.48%", color: "red" }], note: "大型價值承接，小型股未跟隨。" },
    { label: "AMZN／AAPL", values: [{ text: "+15.32%", color: "green" }, { text: "-7.35%", color: "red" }], note: "同為雙 Beat，指引與盈利品質令反應相反。" },
    { label: "TLT／USO", values: [{ text: "-0.66%", color: "red" }, { text: "+1.33%", color: "green" }], note: "長端與油價共同維持通膨折現壓力。" },
  ],
  core_conclusions: [
    "<ol>",
    "<li><strong>指數上漲主要由權重與個股事件推動，不是全面風險偏好回升。</strong>SPY +0.72%、QQQ +0.65%，但 IWM -0.48%、RSP -0.17%；等權與小型股沒有確認權重指數。</li>",
    "<li><strong>AMZN 與 AAPL 的分化驗證市場正在交易未來盈利品質，而非只看 Beat／Miss 標籤。</strong>AMZN +15.32%，雲端成長與 AI 投資回報獲認可；AAPL -7.35%，下一季營收成長指引低於預期且供應限制成為焦點。</li>",
    "<li><strong>盤前的「晶片修復有廣度」判斷失效。</strong>SMH 僅 +0.30%，MRVL +2.32%、AMAT +1.18%，但 SNDK -5.09%、AMD -1.90%、LRCX -1.58%、INTC -1.02%、ARM -0.77%；記憶體與設備鏈沒有共同守住盤前漲幅。</li>",
    "<li><strong>科技技術仍未反轉。</strong>QQQ、SMH 均低於 20／50MA；SMH 5日 -3.68%、1月 -12.88%，AMZN 的單股拉升尚未修復晶片與科技的中短線趨勢。</li>",
    "<li><strong>宏觀仍是長端與油價的雙重約束。</strong>10年期殖利率升至約 4.71%，TLT -0.66% 並收 82.25；USO +1.33%。ECI、Chicago PMI 與密大信心均高於預期，沒有提供快速轉鴿的數據組合。</li>",
    "<li><strong>廣度仍屬分歧而非確認。</strong>SPX 與 IWM 的 20／50MA 廣度下降，NDX 廣度小幅改善；Stockbee 5D ratio 回到 0.98，但 10D ratio 仍為 0.91、4% 下跌股 214 多於上漲股 177。</li>",
    "</ol>",
  ].join(""),
  core_conclusion: "7/31 是 AMZN 與少數權重推動的反彈日，不是全面 risk-on。價格層面由 SPY／QQQ 收漲支撐，技術、廣度與長端利率卻仍要求控制科技與高 beta 的總曝險。",
  reconciliation_rows: [
    { section: "AMZN／AAPL 分化", directive: "兩者雖雙 Beat，仍要依指引、一次性收益與估值分開交易。", actual: "AMZN +15.32%，AAPL -7.35%；方向與盤前分化延續。", result: "hit", correction: "保留 Actual／Forecast 後，再把指引與盈利品質列為獨立欄位。" },
    { section: "科技技術未反轉", directive: "QQQ／SMH 低於 20／50MA，反彈不代表趨勢翻多。", actual: "QQQ 收 687.99、SMH 收 540.53，兩者仍低於 20／50MA。", result: "hit", correction: "維持收盤站回 20MA 才升級的規則。" },
    { section: "長短債分化", directive: "ECI 偏熱時看短、中、長債；期限越長壓力越大。", actual: "SHY -0.01%、IEF -0.28%、TLT -0.66%，10年期殖利率升至約 4.71%。", result: "hit", correction: "持續用實際殖利率確認，不只比較 ETF 漲跌幅。" },
    { section: "油價與通膨尾端", directive: "油價續升且長債續跌時，偏多宏觀條件失效。", actual: "USO +1.33%，TLT -0.66%；長端與油價同時朝不利科技估值方向移動。", result: "hit", correction: "把 USO 與 10年期殖利率列為每日固定交叉訊號。" },
    { section: "廣度不確認", directive: "三大指數廣度與 Stockbee 未同步時，不把 QQQ 上漲外推成全面 risk-on。", actual: "SPX／IWM 廣度下降，NDX 小幅改善；Stockbee 5D 0.98、10D 0.91。", result: "hit", correction: "保留雙來源綜合，至少兩大指數與 Stockbee 同步才升級。" },
    { section: "晶片修復有廣度", directive: "MRVL、SNDK、ARM、設備鏈與 AMD 同漲，若守 VWAP 可視為修復。", actual: "只有 MRVL、AMAT 收漲；SNDK、ARM、LRCX、INTC、AMD 收跌，SMH 僅 +0.30%。", result: "miss", correction: "盤前廣度必須以收盤上漲家數與 SMH 收盤技術確認，不能用開盤跳空代替。" },
    { section: "AAPL 風控線", directive: "AAPL 失守 317.88 時不抄底。", actual: "AAPL 收 308.91，正式跌破週度 -1SD 317.88。", result: "triggered", correction: "下一週以 317.88 為反彈收復線，而非自動變成買點。" },
    { section: "長端降級條件", directive: "TLT 再破盤前低點且油價上行時降低久期與高估值曝險。", actual: "TLT 收 82.25、USO +1.33%，條件同時成立。", result: "triggered", correction: "週末前不因 VIX 低位而忽略長端折現壓力。" },
    { section: "權重反彈但廣度不跟", directive: "若 SPX／NDX／IWM 廣度不跟隨，視為權重股反彈並降低隔夜風險。", actual: "SPY／QQQ 收漲，RSP／IWM 收跌；廣度分歧成立。", result: "triggered", correction: "加入 RSP 與 IWM 作為權重偏差的價格確認。" },
    { section: "AMZN／SMH 同守 VWAP", directive: "兩者同守 VWAP 才提高 AI 基建與晶片多頭曝險。", actual: "AMZN 強勢收高，但 SMH 由盤前 +3.45% 收斂至 +0.30%，條件沒有共同成立。", result: "not_triggered", correction: "AMZN 個股多頭與晶片 beta 分開管理。" },
    { section: "QQQ 升級線", directive: "QQQ 站上 702.25 才提高科技總風險。", actual: "QQQ 收 687.99，未越過升級門檻。", result: "not_triggered", correction: "下週重算 Expected Move 前，保留 702.25 為短線壓力參考。" },
  ],
  reconciliation_conclusion: "11 項盤前判斷逐行對賬：5 命中、3 已觸發、1 失誤、2 未觸發。唯一失誤是把盤前晶片跳空當成收盤廣度修復；其餘核心風控——AAPL 週度下界、長端與油價、權重反彈未獲廣度確認——均成立。",
  index_rows: indexRows,
  index_conclusion: "四大 ETF 只保留 IWM、DIA、SPY、QQQ。DIA／SPY 收漲並守住三條均線；QQQ 雖反彈仍低於 20／50MA，IWM 收跌且低於 20／50MA。大型股強、小型股弱的結構仍在。",
  sector_rows: sectorRows,
  sector_conclusion: "Sector Dashboard 固定 12 列並按 RSI 由高到低排序。金融、醫療與防禦板塊相對完整；科技仍低於 20／50MA，能源受油價支撐但同時提高通膨折現風險。",
  thematic_rows: thematicRows,
  thematic_conclusion: "Thematic Sectors 已完整讀取長橋 44 檔 ETF，另加入 SPY 基準，共 45 列並按 RSI 遞減排序。表格使用同一個 7/31 收盤批次，避免 Google Sheet 排序與報告時間戳錯位。",
  breadth_rows: [
    { indicator: "SPX >20MA（7/31）", latest: 53.28, percent: true, five_day: "69.18% → 53.28%", one_month: "仍高於五成", judgment: "大型股短線參與度明顯降溫。", tone: "red" },
    { indicator: "SPX >50MA（7/31）", latest: 62.02, percent: true, five_day: "71.57% → 62.02%", one_month: "中期仍高於六成", judgment: "中期底盤尚在，但上漲集中度提高。" },
    { indicator: "NDX >20MA（7/31）", latest: 53.39, percent: true, five_day: "48.54% → 53.39%", one_month: "回到五成上方", judgment: "科技短線廣度改善，但幅度有限。", tone: "green" },
    { indicator: "NDX >50MA（7/31）", latest: 47.57, percent: true, five_day: "51.45% → 47.57%", one_month: "仍低於五成", judgment: "科技中期廣度尚未確認反轉。", tone: "red" },
    { indicator: "IWM >20MA（7/31）", latest: 43.93, percent: true, five_day: "52.57% → 43.93%", one_month: "低於五成", judgment: "小型股短線廣度維持偏弱。", tone: "red" },
    { indicator: "IWM >50MA（7/31）", latest: 52.88, percent: true, five_day: "61.07% → 52.88%", one_month: "勉強高於五成", judgment: "中期緩衝快速收窄。", tone: "red" },
    { indicator: "T2108（Stockbee 7/31）", latest: 46.66, percent: true, five_day: "約 48.33% → 46.66%", one_month: "低於五成", judgment: "全市場長期廣度仍偏弱。", tone: "red" },
    { indicator: "5D ratio（Stockbee 7/31）", latest: "0.98", five_day: "0.65 → 0.98", one_month: "接近 1", judgment: "短線修復，但強弱股尚未明顯翻多。" },
    { indicator: "10D ratio（Stockbee 7/31）", latest: "0.91", five_day: "0.76 → 0.91", one_month: "仍低於 1", judgment: "中短線趨勢尚未確認 risk-on。", tone: "red" },
    { indicator: "4%+ 上漲／下跌（7/31）", latest: "177 / 214", five_day: "165 / 552 → 177 / 214", one_month: "跌勢大幅收斂", judgment: "修復明顯，但極端下跌股仍較多。" },
    { indicator: "季度 +25%／-25%（7/31）", latest: "1172 / 1233", five_day: "1172 / 1304 → 1172 / 1233", one_month: "弱股仍多於強股", judgment: "中期結構尚未翻多。", tone: "red" },
  ],
  breadth_context: "<div class='callout warn'><strong>雙來源綜合：</strong>NDX >20MA 與 Stockbee 5D ratio 改善，顯示科技與短線極端跌勢正在修復；但 SPX／IWM 廣度下降、NDX >50MA 仍低於五成、Stockbee 10D ratio 與 T2108 仍偏弱。這是局部修復，不是全面確認。</div>",
  breadth_conclusion: "三大指數廣度與 Stockbee 的綜合訊號是「短線止穩、結構仍弱」。SPY／QQQ 上漲可被視為反彈，但 RSP／IWM 收跌且中期廣度未翻多，週末前不宜把單日漲幅外推成全面 risk-on。",
  macro_rows: [
    { asset: "DXY／USDU", latest: "DXY 100.38（10:13 ET）／USDU 26.49", daily: "USDU +0.15%", meaning: "DXY 沒有升破 102 風控線；美元不是當日主要壓力來源。" },
    { asset: "美國 10 年債", latest: "約 4.71%", daily: "約 +3bp", meaning: "長端殖利率續升，油價與 ECI 偏熱令期限溢價保持壓力。" },
    { asset: "VIX 現貨／VIXY", latest: "15.99／20.51", daily: "-6.44%／-2.66%", meaning: "五項分數 0/5：>20、5日>0、1月>0、高於20MA、高於50MA均為 0；Low。" },
    { asset: "SHY／IEF／TLT", latest: "82.00／92.95／82.25", daily: "-0.01%／-0.28%／-0.66%", meaning: "期限越長跌幅越大；長端折現壓力最重。" },
    { asset: "USO", latest: fixed(requireRow(snap, "USO", "Macro").close), daily: pct(requireRow(snap, "USO", "Macro").dailyPct), meaning: "原油代理續升，1月已 +25.08%，通膨尾端未解除。" },
    { asset: "GLD／SLV", latest: `${fixed(requireRow(snap, "GLD", "Macro").close)}／${fixed(requireRow(snap, "SLV", "Macro").close)}`, daily: `${pct(requireRow(snap, "GLD", "Macro").dailyPct)}／${pct(requireRow(snap, "SLV", "Macro").dailyPct)}`, meaning: "貴金屬同步回落，當日不是典型流動性恐慌。" },
    { asset: "CPER", latest: fixed(requireRow(snap, "CPER", "Macro").close), daily: pct(requireRow(snap, "CPER", "Macro").dailyPct), meaning: "銅價上漲且守三條均線，沒有確認需求衰退。" },
  ],
  macro_conclusion: "DXY 仍低於 102、VIX 五項分數降至 0/5，說明沒有美元或波動率失序；但 10年期約 4.71%、TLT 跌至 82.25、USO 上漲，代表長端與能源仍在收緊科技估值條件。",
  expected_move_rows: [
    { ticker: "AMZN", price: "271.58", boundary: "+2SD 266.21", status: "突破 +2SD", tone: "green", implication: "財報後超越上界，週末不宜追價；下週重算區間。" },
    { ticker: "GOOGL", price: "356.13", boundary: "+2SD 343.41", status: "突破 +2SD", tone: "green", implication: "大型平台股仍有個股動能，但不代表科技廣度全面修復。" },
    { ticker: "CRM", price: "184.02", boundary: "+2SD 181.07", status: "突破 +2SD", tone: "green", implication: "軟體反彈越界；下週需觀察能否守住。" },
    { ticker: "AAPL", price: "308.91", boundary: "-1SD 317.88／-2SD 302.73", status: "跌破 -1SD", tone: "red", implication: "指引壓力已觸發週度風控，未收回 317.88 前不抄底。" },
    { ticker: "CAT", price: "814.81", boundary: "-1SD 838.22", status: "跌破 -1SD", tone: "red", implication: "工業權重仍處週度弱勢區。" },
    { ticker: "GS", price: "1018.38", boundary: "-1SD 1019.81", status: "略破 -1SD", tone: "amber", implication: "金融權重靠近下界，需與 XLF 相對強勢交叉確認。" },
    { ticker: "MA", price: "573.10", boundary: "+1SD 562.28", status: "突破 +1SD", tone: "green", implication: "支付權重提供金融與消費交叉支撐。" },
    { ticker: "NOW", price: "111.23", boundary: "+1SD 105.51／+2SD 112.23", status: "接近 +2SD", tone: "amber", implication: "軟體反彈已接近上方極值，不宜把單日延伸當低風險。" },
    { ticker: "ORCL", price: "129.87", boundary: "+1SD 123.96", status: "突破 +1SD", tone: "green", implication: "雲端與資料庫主題延續修復。" },
    { ticker: "AXP", price: "336.25", boundary: "+1SD 336.40", status: "距 +1SD 0.15", tone: "amber", implication: "接近觸發但尚未越界。" },
    { ticker: "AMD", price: "476.15", boundary: "-1SD 472.55", status: "距 -1SD 3.60", tone: "amber", implication: "晶片反彈失敗後仍靠近週度下界。" },
    { ticker: "AMGN", price: "385.16", boundary: "+1SD 388.40", status: "距 +1SD 3.24", tone: "amber", implication: "防禦相對強，但尚未正式突破。" },
  ],
  expected_move_conclusion: "週度區間在 7/31 收盤完成對賬：AMZN、GOOGL、CRM 突破 +2SD；AAPL、CAT、GS 跌破 -1SD；NOW、AXP、AMD、AMGN 接近邊界。下週必須重新計算 Expected Move，不能沿用本週界線作新交易依據。",
  event_review: [
    "<h3>宏觀數據</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5 macro-review-table'><thead><tr><th>事件</th><th class='num'>Actual</th><th class='num'>Forecast</th><th class='num'>Previous</th><th>判讀</th></tr></thead><tbody>",
    "<tr><td>Q2 就業成本指數 QoQ</td><td class='num'>0.9%</td><td class='num'>0.8%</td><td class='num'>0.9%</td><td><span class='badge red'>高於預期</span> 工資成本未明顯降溫。</td></tr>",
    "<tr><td>Chicago PMI</td><td class='num'>57.6</td><td class='num'>56.0</td><td class='num'>56.7</td><td><span class='badge green'>高於預期</span> 製造業活動維持擴張。</td></tr>",
    "<tr><td>密大消費者信心終值</td><td class='num'>55.2</td><td class='num'>54.0</td><td class='num'>49.5</td><td><span class='badge green'>高於預期</span> 需求訊號改善，但通膨預期仍需監控。</td></tr>",
    "</tbody></table></div>",
    "<h3>大型科技財報</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-7'><thead><tr><th>公司</th><th class='num'>EPS Actual</th><th class='num'>EPS Forecast</th><th class='num'>Revenue Actual</th><th class='num'>Revenue Forecast</th><th>Beat／Miss</th><th class='num'>收盤反應</th></tr></thead><tbody>",
    "<tr><td>Apple（AAPL）</td><td class='num'>$2.02</td><td class='num'>$1.89</td><td class='num'>$109.42B</td><td class='num'>$109.00B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>-7.35%</td></tr>",
    "<tr><td>Amazon（AMZN）</td><td class='num'>$5.75</td><td class='num'>$1.82</td><td class='num'>$200.60B</td><td class='num'>$197.03B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>+15.32%</td></tr>",
    "</tbody></table></div>",
  ].join(""),
  event_conclusion: "三項宏觀數據均高於預期，與油價、長端殖利率共同削弱快速轉鴿敘事。AAPL 與 AMZN 都是 EPS／營收雙 Beat，但收盤反應相反，證明報告必須列出 Actual／Forecast 並進一步比較指引與盈利品質。",
  next_session: [
    "<h3>8/3 下一交易日情景</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5'><thead><tr><th>情景</th><th>必要確認</th><th>關鍵門檻</th><th>市場含義</th><th>行動</th></tr></thead><tbody>",
    "<tr><td><span class='badge amber'>基準：權重反彈</span></td><td>AMZN 保持強勢，但 RSP／IWM 與廣度未同步。</td><td>AMZN 266.21；IWM 291.20；Stockbee 5D 1.0</td><td>指數可漲，市場內部仍偏窄。</td><td>只做有財報確認的個股，不提高整體 beta。</td></tr>",
    "<tr><td><span class='badge green'>升級：廣度確認</span></td><td>SPX／NDX／IWM >20MA 同步上升，RSP／IWM 轉強，Stockbee 5D／10D 都高於 1。</td><td>NDX >50MA 50%；IWM >20MA 50%</td><td>權重反彈擴散為全面 risk-on。</td><td>分兩次回補核心科技與小型股，各不超過目標部位 1/3。</td></tr>",
    "<tr><td><span class='badge red'>降級：長端再收緊</span></td><td>10年期升破 4.71%、TLT 跌破 82.25、USO 續創高，任兩項成立。</td><td>TLT 82.25；USO 129.17；DXY 102</td><td>折現率與能源通膨再次壓制科技估值。</td><td>總風險再降 1/3，優先減長久期與高 beta。</td></tr>",
    "<tr><td><span class='badge blue'>個股分化延續</span></td><td>AMZN 強、AAPL 弱，SMH 仍低於 20／50MA。</td><td>AAPL 317.88；SMH 571.63；QQQ 701.02</td><td>AI 雲端盈利受認可，但晶片與裝置供應鏈未修復。</td><td>將雲端平台與晶片設備分開管理，不用 QQQ 代替個股選擇。</td></tr>",
    "</tbody></table></div>",
  ].join(""),
  next_conclusion: "基準仍是權重反彈、內部偏窄。只有 RSP／IWM、三大指數廣度與 Stockbee 至少兩組同步改善，才把 7/31 的漲勢升級為全面 risk-on；若 TLT／USO 再度惡化，先執行長端風控。",
  cross_validation: "<div class='callout warn'><strong>價格與廣度分歧：</strong>SPY／QQQ 收漲，RSP／IWM 收跌；NDX 短線廣度改善，但 SPX／IWM 與 Stockbee 中期指標仍弱。反彈成立，擴散未成立。</div><div class='callout danger'><strong>宏觀壓力仍在：</strong>ECI、Chicago PMI、密大信心均高於預期；10年期約 4.71%、TLT 跌至 82.25、USO 上漲。VIX 0/5 只表示沒有恐慌，不表示折現率壓力消失。</div><div class='callout'><strong>主導結論：</strong>AMZN 是獲盈利品質確認的個股主線；AAPL 與多數晶片股證明「雙 Beat」或盤前跳空不足以構成買進理由。下週先等廣度與 20MA 收盤確認。</div>",
  sources: [
    "<a href='https://apnews.com/article/stock-markets-rates-korea-ai-oil-e31b3a442bcb957a53f1823ef21e73e8'>AP：7/31 美股、Amazon／Apple、油價與 10年期殖利率</a>",
    "<a href='https://www.bls.gov/news.release/eci.nr0.htm'>BLS：Q2 Employment Cost Index</a>",
    "<a href='https://www.sca.isr.umich.edu/'>University of Michigan：七月消費者信心終值</a>",
    "<a href='https://apnews.com/article/apple-earnings-revenue-iphone-ai-94102918cb3592ebc1d2a38c4d7d819a'>AP：Apple 財報</a>",
    "<a href='https://apnews.com/article/amazon-second-quarter-earnings-cloud-b4ce02b4666a35b8975823c5c22072ee'>AP：Amazon 財報</a>",
    "<a href='https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit'>Market Watch：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Weekly Expected Move</a>",
    "<span>長橋 OpenAPI：75 檔 7/31 收盤快照、44 檔 Thematic、32 檔 Macro；Stockbee：7/31 廣度資料。</span>",
  ].join("；"),
};

if (snapshot.rows.length !== 75 || snapshot.errors.length !== 0) {
  throw new Error(`收盤快照必須為 75／75、錯誤 0；目前 ${snapshot.rows.length}／75、錯誤 ${snapshot.errors.length}`);
}
if (market.rows.length !== 18 || market.errors.length !== 0) {
  throw new Error(`Market 快照必須為 18／18、錯誤 0；目前 ${market.rows.length}／18、錯誤 ${market.errors.length}`);
}
if (thematic.rows.length !== 44 || thematic.errors.length !== 0) {
  throw new Error(`Thematic Sectors 必須為 44／44、錯誤 0；目前 ${thematic.rows.length}／44、錯誤 ${thematic.errors.length}`);
}
if (macro.rows.length !== 32 || macro.errors.length !== 0) {
  throw new Error(`Macro 必須為 32／32、錯誤 0；目前 ${macro.rows.length}／32、錯誤 ${macro.errors.length}`);
}
if (sectorRows.length !== 12 || sectorRows[0].rsi < sectorRows[sectorRows.length - 1].rsi) {
  throw new Error("Sector Dashboard 必須為 12 列並按 RSI 遞減排序");
}
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.label === "SPY").length !== 1) {
  throw new Error("Thematic Sectors 必須為完整 44 檔加一列 SPY 基準");
}
if (thematicRows.some((row, index) => index && thematicRows[index - 1].rsi < row.rsi)) {
  throw new Error("Thematic Sectors RSI 排序錯誤");
}
if (chartTickers.size !== 8) {
  throw new Error(`板塊動能圖必須為 8 檔，目前 ${chartTickers.size}`);
}
if (!macroMap.has("VIXY") || !macroMap.has("SHY") || !macroMap.has("IEF") || !macroMap.has("TLT")) {
  throw new Error("Macro 長橋快照缺少 VIXY／SHY／IEF／TLT");
}

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
