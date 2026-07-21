#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-21.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const output = path.join(root, "data", "2026-07-21-postmarket.json");

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
const theme = new Map(thematic.rows.map((row) => [row.ticker, row]));
const macroMap = new Map(macro.rows.map((row) => [row.key, row]));

function pct(value) {
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function fixed(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function ma(row, thematicRow = false) {
  return thematicRow
    ? { 20: row.aboveMa20, 50: row.aboveMa50, 200: row.aboveMa200 }
    : { 20: row.above20, 50: row.above50, 200: row.above200 };
}

function strengthJudgment(row) {
  if (row.rsi14 >= 65) return "趨勢強，但已接近過熱區。";
  if (row.rsi14 >= 55) return "相對強勢，仍需觀察能否延續。";
  if (row.rsi14 <= 40) return "動能偏弱，尚未完成修復。";
  if (row.rsi14 < 50) return "反彈後仍偏弱，未確認反轉。";
  return "動能中性，等待進一步擴散。";
}

const sectorNotes = {
  SPY: "大盤基準收復 20／50MA，短線修復成立。",
  XLE: "能源月線領先，油價上漲提供支持。",
  XLF: "金融守住主要均線，月線仍屬強勢。",
  XLRE: "房地產延續相對強勢，但利率上升限制彈性。",
  XLV: "醫療守住全部主要均線，維持防守承接。",
  XLP: "必需消費當日回吐，但中期結構尚可。",
  XLC: "通訊服務仍低於 50／200MA，反彈未擴散。",
  XLU: "公用事業低於 20MA，長端殖利率形成壓力。",
  XLI: "工業低於 20MA，但仍守住 50／200MA。",
  XLY: "非必需消費低於全部主要均線，結構偏弱。",
  XLK: "科技大漲但仍低於 20／50MA，屬修復而非反轉。",
  XLB: "原物料低於 20／50MA，商品反彈尚未全面傳導。",
};

const themeNotes = {
  SPY: "大盤基準；收復 20／50／200MA，供主題比較。",
  KIE: "保險月線維持強勢，仍高於主要均線。",
  IAK: "保險相對強勢，接近高檔區。",
  KRE: "區域銀行延續月線優勢。",
  XOP: "油氣勘探受原油走強支持。",
  CIBR: "網安回落，仍守主要均線。",
  XSW: "等權軟體下跌，與晶片形成明顯分化。",
  IBB: "大型生技守住中長期均線。",
  XBI: "生技反彈，但仍低於 20MA。",
  IGV: "軟體承壓，尚未承接晶片反彈。",
  IHI: "醫療器材延續修復。",
  MAGS: "巨頭組合回升，但科技內部擴散有限。",
  IBIT: "加密代理反彈，仍低於 50MA。",
  SMH: "晶片大幅修復，仍低於 20／50MA。",
  AIQ: "AI 主題反彈，但月線仍弱。",
  ARKK: "高 beta 成長回升，尚未完全修復。",
  QTUM: "量子主題維持高波動整理。",
  BOTZ: "機器人主題反彈，趨勢仍待確認。",
  UFO: "太空主題高 beta 修復，風險仍高。",
  URA: "鈾礦尚未收復短中期均線。",
  GLD: "黃金反彈，但仍低於 50／200MA。",
  SLV: "白銀大漲，仍低於全部主要均線。",
  REMX: "稀土主題自超賣區反彈。",
  WGMI: "礦股高 beta 反彈，結構仍弱。",
  KWEB: "中國網路股偏弱，未跟隨美股科技。",
  XRT: "零售反彈有限，消費風險偏好尚未改善。",
};

function makeRow(ticker, row, judgment, isThematic = false, chart = false) {
  return {
    label: ticker === "SPY" ? "SPY（基準）" : ticker,
    daily: row.dailyPct,
    daily_display: pct(row.dailyPct),
    five_day: pct(row.fiveDayPct),
    one_month: pct(row.oneMonthPct),
    one_month_numeric: row.oneMonthPct,
    rsi: row.rsi14,
    judgment,
    chart,
    ma: ma(row, isThematic),
  };
}

const sectorTickers = ["SPY", "XLE", "XLF", "XLRE", "XLV", "XLP", "XLC", "XLU", "XLI", "XLY", "XLK", "XLB"];
const sectorRows = sectorTickers
  .map((ticker) => makeRow(ticker, snap.get(ticker), sectorNotes[ticker] || strengthJudgment(snap.get(ticker))))
  .sort((left, right) => right.rsi - left.rsi);

const chartTickers = new Set(["XBI", "CIBR", "XSW", "SMH", "AIQ", "SLV", "REMX", "WGMI"]);
const thematicTickers = ["KIE", "IAK", "KRE", "XOP", "CIBR", "XSW", "IBB", "XBI", "IGV", "IHI", "MAGS", "SPY", "IBIT", "SMH", "AIQ", "ARKK", "QTUM", "BOTZ", "UFO", "URA", "GLD", "SLV", "REMX", "WGMI", "KWEB", "XRT"];
const thematicRows = thematicTickers
  .map((ticker) => {
    if (ticker === "SPY") return makeRow(ticker, snap.get(ticker), themeNotes[ticker]);
    return makeRow(ticker, theme.get(ticker), themeNotes[ticker] || strengthJudgment(theme.get(ticker)), true, chartTickers.has(ticker));
  })
  .sort((left, right) => right.rsi - left.rsi);

const indexNotes = {
  VOO: "收復 20／50MA，大盤短線修復成立。",
  SPY: "收復全部主要均線，但只高於 20／50MA 約半個 ATR。",
  QQQ: "大漲但仍低於 20／50MA，五日與一月仍為負。",
  QQQE: "等權 Nasdaq 仍低於 20MA，顯示修復未全面擴散。",
  RSP: "等權大盤漲幅有限，仍低於 20MA。",
  IWM: "小型股幾乎回到 20MA，廣度修復優於大型科技。",
  DIA: "道指守住 50／200MA，仍低於 20MA。",
  SMH: "晶片大漲 4.52%，但仍低於 20／50MA。",
};
const indexRows = ["VOO", "SPY", "QQQ", "QQQE", "RSP", "IWM", "DIA", "SMH"].map((ticker) => {
  const row = snap.get(ticker);
  return { asset: ticker, latest: fixed(row.close), daily: pct(row.dailyPct), five_day: pct(row.fiveDayPct), ma: ma(row), rsi: row.rsi14, judgment: indexNotes[ticker] };
});
const vixy = macroMap.get("VIXY");
indexRows.push({
  asset: "VIX / VIXY",
  latest: "約 17.05",
  daily: "約 -8.58%",
  five_day: pct(vixy.fiveDayPct),
  ma: { 20: vixy.aboveMa20, 50: vixy.aboveMa50, 200: vixy.aboveMa200 },
  rsi: vixy.rsi14,
  judgment: "VIX 明顯低於 20；5 日、均線與 RSI 使用長橋 VIXY。",
  dn_ok: true,
});

const report = {
  report_type: "postmarket",
  title: "美股盤後對賬｜2026-07-21",
  eyebrow: "US postmarket reconciliation · 2026-07-21",
  headline: "晶片反彈兌現，SPY 收復均線；科技趨勢與廣度仍差最後一步",
  as_of: "資料截至 2026-07-21 美股收盤。長橋主快照 65／65、Thematic Sectors 44／44、Macro 24／24、Market 18／18 均成功，所有日線日期一致為 7/21。",
  reconciliation_summary: { hit: 4, triggered: 2, miss: 0, not_triggered: 2 },
  regime_badges: "<span class='badge green'>晶片反彈確認</span><span class='badge green'>SPY 收復 20／50MA</span><span class='badge amber'>QQQ／SMH 仍低於均線</span><span class='badge blue'>廣度短線修復</span>",
  summary_cards: [
    { label: "SPY／QQQ", values: [{ text: "+0.83%", color: "green" }, { text: "+1.85%", color: "green" }], note: "指數反彈，科技彈性較大。" },
    { label: "SMH／MU", values: [{ text: "+4.52%", color: "green" }, { text: "+12.17%", color: "green" }], note: "記憶體與設備鏈同步擴散。" },
    { label: "NDX／IWM >20MA", values: [{ text: "47.54%", color: "amber" }, { text: "60.63%", color: "green" }], note: "小型股修復較完整，科技尚未過 50%。" },
    { label: "Stockbee 5D／10D", values: [{ text: "0.99", color: "amber" }, { text: "0.90", color: "amber" }], note: "明顯改善，但兩項仍未越過 1。" },
  ],
  core_conclusions: "<ol><li><strong>晶片盤前訊號完整兌現。</strong>SMH +4.52%，SNDK、MU、INTC、AMD 分別上漲 14.27%、12.17%、8.64%、8.11%，AMAT、MRVL、TSM、LRCX、KLAC 也同步上漲，反彈由記憶體擴散至設備鏈。</li><li><strong>軟體沒有接棒，科技仍是內部分化。</strong>ADBE -3.23%、NOW -2.52%、CRM -2.15%、PLTR -1.62%、MSFT -1.13%；QQQ 的上漲主要由晶片驅動，不能等同全面科技 risk-on。</li><li><strong>SPY 收復均線，但 QQQ／SMH 尚未完成趨勢反轉。</strong>SPY 已回到 20／50MA 上方；QQQ 與 SMH 收盤仍低於各自 20／50MA，五日與一月變化也仍為負。</li><li><strong>廣度出現強力一日修復，卻未完全確認中期擴散。</strong>Stockbee 4% 上漲／下跌為 464／131，T2108 回到 50.19，5D ratio 升至 0.99；但 NDX >50MA 只有 43.68%，10D ratio 仍僅 0.90。</li><li><strong>這不是低利率推動的反彈。</strong>10 年債殖利率升至 4.63%，USO +2.66%、CPER +2.89%、SLV +4.12%，DXY 約 100.89；市場同時交易晶片修復與再通膨資產。</li><li><strong>財報數字好不代表股價必然同向。</strong>MMM、GM 均 Beat 並分別上漲 7.32%、4.91%；DHI 同樣 EPS／營收 Beat，卻因全年營收指引偏弱下跌 0.88%。</li></ol>",
  core_conclusion: "本日屬於強力短線修復，而非全面趨勢反轉：晶片訊號命中、SPY 收復均線、廣度大幅改善；但軟體未接棒，QQQ／SMH 仍低於 20／50MA，5D／10D ratio 也尚未同時越過 1。",
  reconciliation_rows: [
    { section: "晶片主線", directive: "半導體若守住 VWAP 且擴散至設備鏈，可把盤前反彈視為有效修復。", actual: "SMH +4.52%；SNDK、MU、INTC、AMD、AMAT、MRVL、TSM、LRCX、KLAC 全數大漲。", result: "hit", correction: "確認反彈有效，但趨勢升級仍需 SMH 收復 20／50MA。" },
    { section: "軟體分化", directive: "軟體未同步轉強前，不把晶片反彈解讀成全面科技擴散。", actual: "ADBE、NOW、CRM、PLTR、MSFT 全數收跌，XSW -1.38%、IGV -1.25%。", result: "hit", correction: "維持晶片與軟體分開評估。" },
    { section: "SPY 技術修復", directive: "SPY 收回 20／50MA，才確認大盤短線修復。", actual: "SPY 收 748.28，高於 20MA 744.98 與 50MA 743.80。", result: "triggered", correction: "大盤可由偏防守降至中性，但均線上方緩衝仍薄。" },
    { section: "科技趨勢升級", directive: "QQQ 收回 714.67／718.83、SMH 收回 601.63／598.40，才升級科技趨勢。", actual: "QQQ 收 708.97、SMH 收 584.08，兩者仍低於 20／50MA。", result: "not_triggered", correction: "保留原門檻，不以單日大漲取代收盤確認。" },
    { section: "市場廣度", directive: "NDX >20MA、T2108、5D ratio 同時越過 50%／50／1，才確認全面擴散。", actual: "NDX >20MA 47.54%、T2108 50.19、5D ratio 0.99；只完成一項，另外兩項非常接近。", result: "triggered", correction: "標示為部分觸發，等待三項同步確認。" },
    { section: "再通膨脈絡", directive: "油價、銅價與長端殖利率同升時，科技反彈仍須防估值壓力。", actual: "USO +2.66%、CPER +2.89%，10 年債殖利率升至 4.63%。", result: "hit", correction: "科技倉位仍須以均線與相對強弱管理。" },
    { section: "財報反應", directive: "財報對賬同時看 Beat／Miss、指引與收盤反應，不用單一 headline 判斷。", actual: "MMM、GM Beat 後上漲；DHI Beat 但指引偏弱，收跌 0.88%。", result: "hit", correction: "延續數字、指引、價格三層對賬。" },
    { section: "全面風險降級", directive: "若 QQQ 跌破 696.06 且 VIX >20，才升級為全面高風險。", actual: "QQQ 收 708.97，VIX 約 17.05，雙條件均未成立。", result: "not_triggered", correction: "目前是修復不完整，不是系統性恐慌。" },
  ],
  reconciliation_conclusion: "本次 4 項命中、2 項已觸發、0 項失誤、2 項未觸發。盤前最重要的兩個判斷——晶片擴散與軟體不接棒——均獲收盤確認；需要保留的修正是把 SPY 修復與 QQQ／SMH 趨勢升級分開。",
  index_rows: indexRows,
  index_conclusion: "SPY／VOO 已收復 20／50MA，RSP、IWM、DIA 仍守 50／200MA；但 QQQ、QQQE、SMH 尚未完成短中期均線修復。大盤先改善，科技趨勢仍需下一步確認。",
  sector_rows: sectorRows,
  sector_conclusion: "S&P 500 產業 ETF 與 SPY 基準均按 RSI 排序。能源、金融、房地產與醫療的月線較強；科技當日領漲卻仍低於 20／50MA，顯示漲幅與趨勢狀態不可混為一談。",
  thematic_rows: thematicRows,
  thematic_conclusion: "26 列包含 SPY 基準，全部使用長橋 7/21 完整日線並按 RSI 排序。生技、保險與能源的中期結構較強；晶片、AI、白銀與礦股雖大幅反彈，仍未完全修復主要均線。",
  breadth_rows: [
    { indicator: "SPX >20MA", latest: 48.90, percent: true, five_day: "58.05% → 48.90%", one_month: "跌破 50%", judgment: "與指數上漲出現背離，需複核成分更新時間。" },
    { indicator: "SPX >50MA", latest: 59.24, percent: true, five_day: "63.61% → 59.24%", one_month: "仍高於 50%", judgment: "中期緩衝仍在，但尚未擴張。" },
    { indicator: "NDX >20MA", latest: 47.54, percent: true, five_day: "44.66% → 47.54%", one_month: "仍低於 50%", judgment: "科技短線修復，尚差最後一步。" },
    { indicator: "NDX >50MA", latest: 43.68, percent: true, five_day: "43.68% → 43.68%", one_month: "持續低於 50%", judgment: "科技中期廣度未改善。" },
    { indicator: "IWM >20MA", latest: 60.63, percent: true, five_day: "54.56% → 60.63%", one_month: "重回 60%", judgment: "小型股短線修復最明顯。" },
    { indicator: "IWM >50MA", latest: 62.68, percent: true, five_day: "62.27% → 62.68%", one_month: "穩定高於 60%", judgment: "小型股中期廣度維持。" },
    { indicator: "T2108", latest: 50.19, percent: true, five_day: "約 50% 附近 → 50.19%", one_month: "重新站上 50%", judgment: "全市場長期廣度回到中性線。" },
    { indicator: "5D ratio", latest: "0.99", five_day: "0.77 → 0.99", one_month: "接近 1", judgment: "短線強弱幾乎平衡，尚未正式轉多。", tone: "amber" },
    { indicator: "10D ratio", latest: "0.90", five_day: "0.69 → 0.90", one_month: "仍低於 1", judgment: "中短線動能改善但未確認。", tone: "amber" },
    { indicator: "4%+ 上漲／下跌", latest: "464 / 131", five_day: "132 / 215 → 464 / 131", one_month: "單日顯著反轉", judgment: "上漲擴散強，確認反彈並非只有少數巨頭。" },
    { indicator: "季度 +25%／-25%", latest: "1225 / 1150", five_day: "1189 / 1244 → 1225 / 1150", one_month: "強股重新超過弱股", judgment: "中期結構邊際修復。" },
  ],
  breadth_context: "<div class='callout warn'><strong>資料背離：</strong>SPX >20MA 由 52.08% 降至 48.90%，與 S&P 500 上漲並由 SPY 收復 20MA 不一致；可能來自成分股更新時間或樣本差異，本報告保留原值並標示複核，不以單點蓋過其他訊號。</div><p class='section-summary'><strong>三大指數與 Stockbee 綜合：</strong>IWM >20MA 升至 60.63%，NDX >20MA 升至 47.54%；Stockbee 4% 上漲／下跌 464／131、T2108 50.19、5D／10D ratio 0.99／0.90。短線修復明確，但科技中期與 ratio 尚未確認全面轉多。</p><div class='callout warn'><strong>升級訊號：</strong>NDX >20MA 回到 50%、T2108 >50 且 5D ratio >1 三項同步成立，才把修復升級為廣度轉多。</div>",
  breadth_conclusion: "Market Breadth 與 Stockbee 的共同結論是短線明顯修復、但中期確認不足：小型股擴散優於科技，強股家數大增；NDX >50MA 只有 43.68%，5D／10D ratio 也仍未同時站上 1。",
  macro_rows: [
    ...["QQQ", "QQQE", "VOO", "RSP", "IWM", "DIA"].map((ticker) => {
      const row = snap.get(ticker);
      return { asset: `${ticker} 50MA ATR`, latest: `${row.extension50Atr > 0 ? "+" : ""}${fixed(row.extension50Atr)}`, atr_value: row.extension50Atr, daily: pct(row.dailyPct), meaning: row.extension50Atr >= 0 ? "仍在 50MA 上方，保有中期緩衝。" : "仍在 50MA 下方，趨勢修復未完成。" };
    }),
    { asset: "美國 2 年債", latest: "4.26%", daily: "+5bp", meaning: "前端殖利率上升，降息交易未擴大。" },
    { asset: "美國 10 年債", latest: "4.63%", daily: "+3bp", meaning: "長端繼續上升，限制高估值資產擴張。" },
    { asset: "美國 20 年債", latest: "5.14%", daily: "+2bp", meaning: "期限溢價仍處高位。" },
    { asset: "VIX", latest: "約 17.05", daily: "約 -8.58%", meaning: "低於 20，風險情緒明顯降溫；Cboe 官方 CSV 尚未更新 7/21。" },
    { asset: "DXY", latest: "100.89", daily: "-0.06%", meaning: "美元近乎持平，仍低於 102 科技減碼線。" },
    ...["USO", "GLD", "SLV", "CPER", "TLT"].map((ticker) => {
      const row = snap.get(ticker);
      const meanings = { USO: "原油延續強勢，再通膨壓力上升。", GLD: "黃金反彈，但仍低於 50／200MA。", SLV: "白銀大漲，仍屬跌深修復。", CPER: "銅價上漲，景氣敏感商品獲得承接。", TLT: "債券下跌，與殖利率上升互相確認。" };
      return { asset: ticker, latest: fixed(row.close), daily: pct(row.dailyPct), meaning: meanings[ticker] };
    }),
  ],
  macro_conclusion: "DXY 沒有缺席：美元 100.89、仍低於 102；真正壓力來自 2 年／10 年／20 年殖利率同步上升，以及原油、銅與白銀同漲。科技反彈並非由低利率環境推動。",
  expected_move_rows: [
    { ticker: "SPY", price: fixed(snap.get("SPY").close), boundary: "730.03／756.55", status: "區間內", tone: "grey", implication: "接近上緣，已收復 20／50MA。" },
    { ticker: "QQQ", price: fixed(snap.get("QQQ").close), boundary: "672.99／717.68", status: "區間內", tone: "grey", implication: "接近上緣，但仍低於 20／50MA。" },
    { ticker: "IWM", price: fixed(snap.get("IWM").close), boundary: "287.51／300.57", status: "區間內", tone: "grey", implication: "靠近上緣，短線廣度顯著改善。" },
    { ticker: "DIA", price: fixed(snap.get("DIA").close), boundary: "513.00／528.62", status: "區間內", tone: "grey", implication: "仍守 50／200MA。" },
    { ticker: "XLK", price: fixed(snap.get("XLK").close), boundary: "168.26／182.92", status: "區間內", tone: "grey", implication: "接近上緣，但技術趨勢尚未修復。" },
    { ticker: "SMH", price: fixed(snap.get("SMH").close), boundary: "514.63／598.44", status: "區間內", tone: "grey", implication: "逼近上緣與均線壓力區。" },
    { ticker: "USO", price: fixed(snap.get("USO").close), boundary: "115.51／132.41", status: "區間內", tone: "grey", implication: "接近上緣，尚未觸發減科技線。" },
  ],
  expected_move_conclusion: "七項核心資產均未突破本週 Expected Move 邊界；QQQ、SMH、USO 已靠近上緣，下一交易日應同時觀察突破是否伴隨均線與廣度確認。",
  event_review: "<div class='table-scroll'><table><thead><tr><th>宏觀數據</th><th class='num'>Actual</th><th class='num'>Forecast</th><th class='num'>Previous</th><th>判斷</th></tr></thead><tbody><tr><td>ADP 每週就業變化（截至 7/4 四週平均）</td><td class='num'>+16.5K</td><td class='num'>無一致預期</td><td class='num'>+19.8K</td><td><span class='badge amber'>較前值放緩</span> 私營就業動能降溫。</td></tr></tbody></table></div><div class='table-scroll'><table><thead><tr><th>財報</th><th class='num'>EPS Actual／Forecast</th><th class='num'>Revenue Actual／Forecast</th><th>Beat／Miss</th><th>指引與股價反應</th></tr></thead><tbody><tr><td>MMM</td><td class='num'>$2.40／$2.25</td><td class='num'>$6.50B／$6.40B</td><td><span class='badge green'>Beat／Beat</span></td><td>上調全年調整後 EPS 指引，收盤 +7.32%。</td></tr><tr><td>GM</td><td class='num'>$3.57／$3.19</td><td class='num'>$48.03B／$47.09B</td><td><span class='badge green'>Beat／Beat</span></td><td>上調全年指引，收盤 +4.91%。</td></tr><tr><td>DHI</td><td class='num'>$3.20／$2.97</td><td class='num'>$9.227B／$9.14B</td><td><span class='badge green'>Beat／Beat</span></td><td>全年營收指引低於市場預期，收盤 -0.88%。</td></tr></tbody></table></div>",
  event_conclusion: "ADP 每週就業四週平均由 19.8K 降至 16.5K，顯示就業邊際放緩；三家公司財報均 Beat／Beat，但 DHI 因指引偏弱收跌，驗證財報必須同時對賬數字、指引與價格。",
  next_session: `<ol><li><strong>大盤防守線：</strong>SPY 需守住 ${fixed(snap.get("SPY").ma20)}／${fixed(snap.get("SPY").ma50)}；重新跌回均線下方，視為修復失敗。</li><li><strong>科技升級線：</strong>QQQ 需收回 ${fixed(snap.get("QQQ").ma20)}／${fixed(snap.get("QQQ").ma50)}，SMH 需收回 ${fixed(snap.get("SMH").ma20)}／${fixed(snap.get("SMH").ma50)}，才把晶片反彈升級為趨勢修復。</li><li><strong>廣度確認：</strong>NDX >20MA 回到 50%、T2108 >50、5D ratio >1 三項同步成立，才提高總 beta。</li><li><strong>再通膨風險：</strong>若 DXY >102、10 年債殖利率繼續高於 4.63%，或 USO 突破 132.41，降低長久期與高估值曝險。</li><li><strong>財報事件：</strong>GOOGL、TSLA 盤後財報可能重新定義 QQQ 風險，不在均線壓力區無條件追價。</li><li><strong>軟體接棒：</strong>XSW、IGV 與 MSFT、CRM、NOW 至少出現同向轉強，才確認科技內部擴散。</li></ol>`,
  next_conclusion: "下一交易日的關鍵不是晶片能否再漲一天，而是 QQQ／SMH 是否收復均線、軟體是否接棒，以及三項廣度門檻能否同步越線。維持中等風險、短線修復中的判斷。",
  cross_validation: "<div class='callout'><strong>互相確認：</strong>SMH 與晶片鏈大漲、SPY 收復均線、Stockbee 4% 上漲家數顯著增加、T2108 站上 50，共同確認短線修復不是單一巨頭造成。</div><div class='callout warn'><strong>互相分歧：</strong>QQQ／SMH 仍低於 20／50MA，軟體 ETF 與核心個股下跌，NDX >50MA 只有 43.68%，5D／10D ratio 仍低於 1；因此中期趨勢尚未全面轉多。</div><div class='callout warn'><strong>資料複核：</strong>SPX >20MA 反而降至 48.90%，與指數上漲出現異常背離；保留原始值但不讓單一異常欄位主導結論，下一次更新繼續核對。</div>",
  sources: "使用者 Google Sheets：Market Breath 與 Stockbee（更新至 2026-07-21）；長橋 OpenAPI：65 個主要資產、44 檔主題 ETF、24 個 Macro 與 18 個 Market RSI 項目的 7/21 收盤、5 日／1 月變化、MA、ATR 與靜態 RSI；<a href='https://apnews.com/article/ccf404ea3258636974afa17f714db8e8'>AP：7/21 美股收盤與 AI／晶片反彈</a>；<a href='https://apnews.com/article/30c42bb51683c4b43c9f64dfeff7a3ea'>AP：油價與美國公債殖利率</a>；<a href='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve'>美國財政部：7/21 殖利率</a>；<a href='https://uk.investing.com/indices/usdollar-historical-data'>Investing.com：DXY 歷史數據</a>；<a href='https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'>Cboe：VIX 歷史資料</a>；<a href='https://mediacenter.adp.com/2027-07-21-ADP-National-Employment-Report-Preliminary-Estimate-for-July-4%2C-2026'>ADP：7/21 每週就業初值</a>；<a href='https://investor.drhorton.com/news-and-events/press-releases/2026/07-21-2026-113055285'>D.R. Horton：第二季財報</a>；<a href='https://investor.gm.com/news-releases/news-release-details/gm-releases-2026-second-quarter-results'>GM：第二季財報</a>；<a href='https://investors.3m.com/'>3M 投資者關係：第二季財報</a>。本報告不構成投資建議。",
};

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
