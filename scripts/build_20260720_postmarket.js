#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-20.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const output = path.join(root, "data", "2026-07-20-postmarket.json");

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

function sectorJudgment(ticker, row) {
  const notes = {
    SPY: "大盤基準跌破 20／50MA，短線尚未修復。",
    XLE: "能源日線與月線領先，油價仍是主要催化。",
    XLF: "金融月線仍強，但本日未提供防守緩衝。",
    XLRE: "房地產守住 20／50MA，利率上升限制彈性。",
    XLV: "醫療月線仍正，本日跌幅居前。",
    XLP: "必需消費維持中性偏強，波動較低。",
    XLC: "通訊服務近乎持平，仍低於 50MA。",
    XLU: "公用事業中期尚可，長端殖利率上升形成壓力。",
    XLI: "工業跌破 20MA，但仍守住 50／200MA。",
    XLY: "非必需消費低於 20／50MA，風險偏弱。",
    XLK: "科技低於 20／50MA，晶片反彈未帶來全面修復。",
    XLB: "原物料低於 20／50MA，景氣敏感方向偏弱。",
  };
  return notes[ticker] || (row.rsi14 >= 55 ? "相對強勢。" : row.rsi14 <= 45 ? "趨勢偏弱。" : "維持中性。");
}

function thematicJudgment(ticker, row) {
  const notes = {
    SPY: "大盤基準；低於 20／50MA，供主題表比較。",
    KIE: "保險月線領先，仍高於主要均線。",
    IAK: "保險維持相對強勢，接近 52 週高位。",
    KRE: "區域銀行月線偏強，本日回吐。",
    XOP: "油氣勘探受油價支持，短線仍強。",
    CIBR: "網安守住主要均線，科技內部相對抗跌。",
    XSW: "等權軟體小幅上漲，月線仍強。",
    IBB: "大型生技回落，但仍守 50／200MA。",
    XBI: "生技本日跌深，月線優勢正在收斂。",
    IGV: "軟體反彈，尚未形成全面擴散。",
    IHI: "醫療器材延續事件後壓力。",
    MAGS: "巨頭組合仍受科技修正壓制。",
    IBIT: "加密代理反彈，仍低於 50MA。",
    SMH: "晶片僅小幅修復，仍低於 20／50MA。",
    AIQ: "AI 主題反彈但結構偏弱。",
    ARKK: "高 beta 成長未完成止跌。",
    QTUM: "量子主題仍在高波動去風險階段。",
    BOTZ: "機器人主題低於全部主要均線。",
    UFO: "太空主題高 beta，趨勢仍弱。",
    URA: "鈾礦回落，尚未收復短中期均線。",
    GLD: "黃金低於主要均線，避險需求有限。",
    SLV: "白銀超賣區附近震盪，趨勢仍弱。",
    REMX: "稀土主題仍在超賣弱勢區。",
    WGMI: "礦股高 beta 仍是最弱群之一。",
    KWEB: "中國網路股偏弱，仍低於主要均線。",
    XRT: "零售回落，消費風險偏好未改善。",
  };
  return notes[ticker] || (row.rsi14 >= 55 ? "相對強勢。" : row.rsi14 <= 45 ? "趨勢偏弱。" : "維持中性。");
}

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
  .map((ticker) => makeRow(ticker, snap.get(ticker), sectorJudgment(ticker, snap.get(ticker))))
  .sort((left, right) => right.rsi - left.rsi);

const chartTickers = new Set(["XBI", "CIBR", "XSW", "SMH", "AIQ", "SLV", "REMX", "WGMI"]);
const thematicTickers = ["KIE", "IAK", "KRE", "XOP", "CIBR", "XSW", "IBB", "XBI", "IGV", "IHI", "MAGS", "SPY", "IBIT", "SMH", "AIQ", "ARKK", "QTUM", "BOTZ", "UFO", "URA", "GLD", "SLV", "REMX", "WGMI", "KWEB", "XRT"];
const thematicRows = thematicTickers
  .map((ticker) => {
    if (ticker === "SPY") {
      const row = snap.get("SPY");
      return makeRow(ticker, row, thematicJudgment(ticker, row), false, false);
    }
    const row = theme.get(ticker);
    return makeRow(ticker, row, thematicJudgment(ticker, row), true, chartTickers.has(ticker));
  })
  .sort((left, right) => right.rsi - left.rsi);

const indexTickers = ["VOO", "SPY", "QQQ", "QQQE", "RSP", "IWM", "DIA", "SMH"];
const indexNotes = {
  VOO: "跌破 20／50MA，大盤中期緩衝消失。",
  SPY: "收盤低於 50MA 約 0.16 ATR，需盡快收復。",
  QQQ: "小幅反彈但低於 20／50MA，五日仍跌 2.20%。",
  QQQE: "等權 Nasdaq 同樣低於 20／50MA，弱勢並非只在巨頭。",
  RSP: "跌破 20MA，但仍高於 50／200MA。",
  IWM: "短線偏弱，中期仍守 50／200MA。",
  DIA: "跌破 20MA，50／200MA 提供有限緩衝。",
  SMH: "選擇性修復，仍低於 20／50MA 且一月跌逾 10%。",
};
const indexRows = indexTickers.map((ticker) => {
  const row = snap.get(ticker);
  return {
    asset: ticker,
    latest: fixed(row.close),
    daily: pct(row.dailyPct),
    five_day: pct(row.fiveDayPct),
    ma: ma(row),
    rsi: row.rsi14,
    judgment: indexNotes[ticker],
  };
});
const vixy = macroMap.get("VIXY");
indexRows.push({
  asset: "VIX / VIXY",
  latest: "18.65",
  daily: "-0.64%",
  five_day: pct(vixy.fiveDayPct),
  ma: { 20: vixy.aboveMa20, 50: vixy.aboveMa50, 200: vixy.aboveMa200 },
  rsi: vixy.rsi14,
  judgment: "VIX 仍低於 20；5 日、均線與 RSI 使用 VIXY。",
  dn_ok: true,
});

const report = {
  report_type: "postmarket",
  title: "美股盤後對賬｜2026-07-20",
  eyebrow: "US postmarket reconciliation · 2026-07-20",
  headline: "美股盤後：晶片選擇性修復，廣度續沉，利率與油價壓制大盤",
  as_of: "資料截至 2026-07-20 美股收盤。長橋 59 個資產與 44 檔主題 ETF 均取得 7/20 完整日線；市場廣度與 Stockbee 已更新至同一交易日。",
  reconciliation_summary: { hit: 2, triggered: 1, miss: 1, not_triggered: 4 },
  regime_badges: "<span class='badge green'>晶片選擇性修復</span><span class='badge red'>SPY 跌破 50MA</span><span class='badge blue'>VIX 仍低於 20</span><span class='badge amber'>油價與殖利率升溫</span>",
  summary_cards: [
    { label: "S&P 500／Nasdaq", values: [{ text: "-0.19%", color: "red" }, { text: "-0.05%", color: "red" }], note: "指數跌幅有限，但收盤結構偏弱。" },
    { label: "QQQ／SMH", values: [{ text: "+0.10%", color: "green" }, { text: "+0.41%", color: "green" }], note: "僅屬選擇性修復，仍低於 20／50MA。" },
    { label: "SPX／IWM >20MA", values: [{ text: "52.08%", color: "amber" }, { text: "46.84%", color: "red" }], note: "短線廣度同步惡化，小型股跌破 50%。" },
    { label: "Stockbee 5D／10D", values: [{ text: "0.77", color: "red" }, { text: "0.69", color: "red" }], note: "兩項均低於 1，強股擴散不足。" },
  ],
  core_conclusions: "<ol><li><strong>指數平靜不代表內部止跌。</strong>S&P 500 僅跌 0.19%、Nasdaq Composite 跌 0.05%，但 SPY 已低於 20／50MA，SPX 與 IWM 的 20MA 廣度同步降至 52.08% 與 46.84%。</li><li><strong>晶片是選擇性修復，不是整條供應鏈反轉。</strong>SMH +0.41%，MU、SNDK、MRVL 分別上漲 1.94%、2.67%、3.32%；但 KLAC、LRCX、AMAT 分別下跌 2.42%、2.09%、0.75%。</li><li><strong>科技內部有少數軟體承接。</strong>MSFT +2.15%、PLTR +1.87%、CRM +1.77%、NOW +1.41%，但 AAPL -2.14%，QQQ 最終只上漲 0.10%，尚未形成全面擴散。</li><li><strong>廣度風險進一步確認。</strong>Stockbee T2108 降至 49.35，季度弱股 1,244 檔已超過強股 1,189 檔，5D／10D ratio 只有 0.77／0.69。</li><li><strong>油價與殖利率共同壓制大盤。</strong>USO +1.25%、XLE +0.45%，10 年債殖利率升至 4.60%，DXY 約 100.95；宏觀條件不利長久期與高 beta 全面修復。</li><li><strong>LEI 低於預期，但並未帶來利率利多。</strong>美國 6 月領先經濟指標下降 0.2%，差於 -0.1% 預期，然而 10 年債殖利率反而上升，市場更受油價與供給風險主導。</li></ol>",
  core_conclusion: "盤前的中性偏防守框架仍有效：晶片與軟體出現局部反彈，但 SPY 跌破 50MA、廣度續沉且利率上升，尚不足以把市場判定為全面 risk-on。",
  reconciliation_rows: [
    { section: "科技主線", directive: "晶片只視為修復，不把盤前反彈當成趨勢反轉。", actual: "SMH +0.41%，但仍低於 20／50MA；設備鏈 KLAC、LRCX、AMAT 全數下跌。", result: "hit", correction: "維持選股而非整體加碼，先等 SMH 收回 20MA。" },
    { section: "盤前強者", directive: "只交易守住 VWAP 與相對強勢的記憶體／軟體股。", actual: "MRVL +3.32%、SNDK +2.67%、MSFT +2.15%、MU +1.94%，強者明顯優於設備股。", result: "hit", correction: "以收盤相對強弱確認，而不是只看盤前漲幅。" },
    { section: "大型科技擴散", directive: "若 MSFT、AAPL、NOW 同步轉強，QQQ 反彈可擴大。", actual: "MSFT、NOW 上漲，但 AAPL -2.14%；QQQ 僅 +0.10%，條件只完成一部分。", result: "triggered", correction: "三者需同向且 NDX 廣度回到 50% 才升級。" },
    { section: "防守緩衝", directive: "RSP、XLF、XLV 可緩衝科技波動。", actual: "RSP -0.45%、XLF -0.39%、XLV -1.14%，均落後 QQQ +0.10%。", result: "miss", correction: "防守不能只按板塊標籤，仍須用當日相對強弱確認。" },
    { section: "技術升級", directive: "QQQ >718.30 且 NDX >20MA 回到 50%，才升級科技。", actual: "QQQ 收 696.06；NDX >20MA 只有 41.74%，兩項均未達標。", result: "not_triggered", correction: "保留原門檻，反彈未確認前不提高總 beta。" },
    { section: "系統性風險", directive: "VIX >20 且 QQQ <672.99 才升級為全面高風險。", actual: "VIX 收 18.65，QQQ 收 696.06，雙條件均未成立。", result: "not_triggered", correction: "目前是內部弱化，不把未觸發條件寫成已發生。" },
    { section: "LEI／利率", directive: "LEI 低於預期且 10 年債殖利率下行，才有利長久期。", actual: "LEI -0.2% 低於預期，但 10 年債殖利率升至 4.60%。", result: "not_triggered", correction: "宏觀方向衝突時，以利率與價格反應優先。" },
    { section: "美元／油價", directive: "DXY >102 或 USO >132.41 才進一步減科技。", actual: "DXY 約 100.95、USO 收 125.51，兩項均未越線。", result: "not_triggered", correction: "油價正在逼近壓力區，但尚未提前觸發。" },
  ],
  reconciliation_conclusion: "本次為 2 項命中、1 項已觸發、1 項失誤、4 項未觸發。最大修正是防守板塊當日並未發揮緩衝；最大有效訊號則是把晶片定義為選擇性修復，而不是整體反轉。",
  index_rows: indexRows,
  index_conclusion: "SPY／VOO、QQQ／QQQE 與 SMH 均低於 20／50MA；RSP、IWM、DIA 尚守 50／200MA。中期尚未全面破壞，但大盤與科技的修復門檻仍未達成。",
  sector_rows: sectorRows,
  sector_conclusion: "S&P 500 產業 ETF 與 SPY 基準均按 RSI 排序。能源與金融的月線仍較強，但當日只有能源收漲；科技、非必需消費與原物料低於 20／50MA。",
  thematic_rows: thematicRows,
  thematic_conclusion: "26 列包含 SPY 基準，全部使用長橋 7/20 完整日線並按 RSI 排序。保險、油氣與網安相對較強；半導體、AI、高 beta 礦股與金屬主題仍弱，反彈尚未形成全面擴散。",
  breadth_rows: [
    { indicator: "SPX >20MA", latest: 52.08, percent: true, five_day: "62.22% → 52.08%", one_month: "由近 67% 降至 52%", judgment: "短線廣度接近失守 50%。" },
    { indicator: "SPX >50MA", latest: 60.63, percent: true, five_day: "67.79% → 60.63%", one_month: "仍高於 60%", judgment: "中期尚有緩衝，但斜率持續向下。" },
    { indicator: "NDX >20MA", latest: 41.74, percent: true, five_day: "59.22% → 41.74%", one_month: "跌破 50%", judgment: "科技短線廣度明顯偏弱。" },
    { indicator: "NDX >50MA", latest: 43.68, percent: true, five_day: "59.22% → 43.68%", one_month: "跌破 50%", judgment: "科技中期廣度仍未修復。" },
    { indicator: "IWM >20MA", latest: 46.84, percent: true, five_day: "57.31% → 46.84%", one_month: "跌破 50%", judgment: "小型股短線已轉弱。" },
    { indicator: "IWM >50MA", latest: 59.15, percent: true, five_day: "64.50% → 59.15%", one_month: "跌破 60%", judgment: "中期緩衝也在收窄。" },
    { indicator: "T2108", latest: 49.35, percent: true, five_day: "53.50% → 49.35%", one_month: "跌破 50%", judgment: "全市場長線廣度轉入警戒。" },
    { indicator: "5D ratio", latest: "0.77", five_day: "0.70 → 0.77", one_month: "持續低於 1", judgment: "短線強股擴散不足。", tone: "red" },
    { indicator: "10D ratio", latest: "0.69", five_day: "0.75 → 0.69", one_month: "持續低於 1", judgment: "中短線動能進一步惡化。", tone: "red" },
    { indicator: "4%+ 上漲／下跌", latest: "132 / 215", five_day: "138 / 166 → 132 / 215", one_month: "下跌家數擴大", judgment: "賣壓仍廣於買盤。" },
    { indicator: "季度 +25%／-25%", latest: "1189 / 1244", five_day: "1269 / 1225 → 1189 / 1244", one_month: "弱股已超過強股", judgment: "中期強弱結構正式反轉。" },
  ],
  breadth_context: "<div class='callout warn'><strong>Stockbee：</strong>5D／10D ratio 為 0.77／0.69，T2108 跌至 49.35，季度弱股 1,244 檔已超過強股 1,189 檔，短線與中期擴散同時偏弱。</div><p class='section-summary'><strong>三大指數綜合：</strong>SPX、NDX、IWM 的 20MA 廣度分別為 52.08%、41.74%、46.84%；只有 SPX 勉強高於 50%，科技與小型股均已跌破。</p><div class='callout warn'><strong>反向訊號：</strong>若 SPX 與 IWM >20MA 同回 50%、T2108 >50 且 5D ratio >1，才可撤銷目前的廣度防守。</div>",
  breadth_conclusion: "Market Breadth 與 Stockbee 相互確認：風險已由科技擴散到小型股與全市場，不能只用單一資料源概括。SPX／IWM 的 50MA 廣度尚高於 50%，但緩衝正在快速收窄。",
  macro_rows: [
    { asset: "QQQ 50MA ATR", latest: fixed(snap.get("QQQ").extension50Atr), atr_value: snap.get("QQQ").extension50Atr, daily: pct(snap.get("QQQ").dailyPct), meaning: "仍明顯低於 50MA，科技修復未完成。" },
    { asset: "QQQE 50MA ATR", latest: fixed(snap.get("QQQE").extension50Atr), atr_value: snap.get("QQQE").extension50Atr, daily: pct(snap.get("QQQE").dailyPct), meaning: "等權 Nasdaq 同樣偏弱，風險不是單一巨頭造成。" },
    { asset: "VOO 50MA ATR", latest: fixed(snap.get("VOO").extension50Atr), atr_value: snap.get("VOO").extension50Atr, daily: pct(snap.get("VOO").dailyPct), meaning: "已低於 50MA，需盡快收復。" },
    { asset: "RSP 50MA ATR", latest: `+${fixed(snap.get("RSP").extension50Atr)}`, atr_value: snap.get("RSP").extension50Atr, daily: pct(snap.get("RSP").dailyPct), meaning: "等權重仍在 50MA 上方，但短線走弱。" },
    { asset: "IWM 50MA ATR", latest: `+${fixed(snap.get("IWM").extension50Atr)}`, atr_value: snap.get("IWM").extension50Atr, daily: pct(snap.get("IWM").dailyPct), meaning: "小型股仍守 50MA，廣度已先跌破 50%。" },
    { asset: "DIA 50MA ATR", latest: `+${fixed(snap.get("DIA").extension50Atr)}`, atr_value: snap.get("DIA").extension50Atr, daily: pct(snap.get("DIA").dailyPct), meaning: "道指仍有中期緩衝。" },
    { asset: "美國 2 年債", latest: "4.21%", daily: "+3bp", meaning: "前端殖利率上升，降息交易未擴大。" },
    { asset: "美國 10 年債", latest: "4.60%", daily: "+5bp", meaning: "長端上升，壓制高估值與長久期資產。" },
    { asset: "美國 20 年債", latest: "5.12%", daily: "+5bp", meaning: "長端期限溢價維持高位。" },
    { asset: "VIX", latest: "18.65", daily: "-0.64%", meaning: "仍低於 20，尚未確認恐慌。" },
    { asset: "DXY", latest: "100.95", daily: "+0.11%", meaning: "美元小升，但仍低於 102 的科技減碼線。" },
    { asset: "USO", latest: fixed(snap.get("USO").close), daily: pct(snap.get("USO").dailyPct), meaning: "油價延續強勢，但尚未突破 132.41 壓力線。" },
    { asset: "GLD", latest: fixed(snap.get("GLD").close), daily: pct(snap.get("GLD").dailyPct), meaning: "黃金低於主要均線，避險需求有限。" },
    { asset: "SLV", latest: fixed(snap.get("SLV").close), daily: pct(snap.get("SLV").dailyPct), meaning: "白銀小升，仍屬跌深後弱勢。" },
    { asset: "CPER", latest: fixed(snap.get("CPER").close), daily: pct(snap.get("CPER").dailyPct), meaning: "銅價上漲，景氣敏感商品出現承接。" },
    { asset: "TLT", latest: fixed(snap.get("TLT").close), daily: pct(snap.get("TLT").dailyPct), meaning: "債券下跌，與殖利率上升互相確認。" },
  ],
  macro_conclusion: "DXY 沒有缺席：美元約 100.95、仍低於 102；真正壓力來自油價與長端殖利率同升。LEI 偏弱卻未帶動債券上漲，形成成長放緩與成本壓力並存的衝突訊號。",
  expected_move_rows: [
    { ticker: "SPY", price: "742.09", boundary: "730.03／756.55", status: "區間內", tone: "grey", implication: "未觸發週度極端邊界，但已跌破 50MA。" },
    { ticker: "QQQ", price: "696.06", boundary: "672.99／717.68", status: "區間內", tone: "grey", implication: "未破下緣，仍低於 20／50MA。" },
    { ticker: "IWM", price: "292.31", boundary: "287.51／300.57", status: "區間內", tone: "grey", implication: "接近下半區，廣度已跌破 50%。" },
    { ticker: "DIA", price: "517.94", boundary: "513.00／528.62", status: "區間內", tone: "grey", implication: "仍守週度下緣與 50MA。" },
    { ticker: "XLK", price: "175.71", boundary: "168.26／182.92", status: "區間內", tone: "grey", implication: "科技未觸發極端線，但技術面偏弱。" },
    { ticker: "SMH", price: "558.83", boundary: "514.63／598.44", status: "區間內", tone: "grey", implication: "反彈仍位於週度區間中下段。" },
    { ticker: "USO", price: "125.51", boundary: "115.51／132.41", status: "區間內", tone: "grey", implication: "油價逼近上半區，但尚未觸發減科技線。" },
  ],
  expected_move_conclusion: "七項核心資產均未突破週度 Expected Move 邊界；因此本日風險來自均線與廣度惡化，而不是波動區間的極端突破。",
  event_review: "<div class='table-scroll'><table><thead><tr><th>宏觀數據</th><th class='num'>Actual</th><th class='num'>Forecast</th><th class='num'>Previous</th><th>判斷</th></tr></thead><tbody><tr><td>美國領先經濟指標（6月）</td><td class='num'>-0.20%</td><td class='num'>-0.10%</td><td class='num'>+0.10%</td><td><span class='badge red'>Miss</span> 領先動能轉弱。</td></tr><tr><td>美國同步經濟指標（6月）</td><td class='num'>+0.20%</td><td class='num'>—</td><td class='num'>+0.20%</td><td><span class='badge blue'>持平</span> 當期經濟仍維持擴張。</td></tr></tbody></table></div><div class='table-scroll'><table><thead><tr><th>財報</th><th class='num'>EPS Actual／Forecast</th><th class='num'>Revenue Actual／Forecast</th><th>Beat／Miss</th><th>股價反應</th></tr></thead><tbody><tr><td>DPZ</td><td class='num'>$4.07／$4.17</td><td class='num'>$1.194B／$1.18B</td><td><span class='badge amber'>EPS Miss／Revenue Beat</span></td><td>盤前約 +7.10%，收盤只剩 +2.11%，利多明顯回吐。</td></tr></tbody></table></div>",
  event_conclusion: "LEI Miss 沒有帶來殖利率下行，代表債市更關注通膨與供給風險；DPZ 的營收 Beat 也未守住盤前漲幅，提醒財報對賬必須同時看數字與收盤反應。",
  next_session: `<ol><li><strong>大盤修復：</strong>SPY 先收回 ${fixed(snap.get("SPY").ma50)} 的 50MA，再看 ${fixed(snap.get("SPY").ma20)} 的 20MA；否則反彈仍是減壓。</li><li><strong>科技修復：</strong>QQQ 需先收回 ${fixed(snap.get("QQQ").ma20)}／${fixed(snap.get("QQQ").ma50)}；SMH 需先收回 ${fixed(snap.get("SMH").ma20)}，才能把選擇性反彈升級。</li><li><strong>廣度確認：</strong>NDX >20MA 回到 50%、T2108 >50 且 Stockbee 5D ratio >1，三項缺一不可。</li><li><strong>利率與油價：</strong>若 10 年債殖利率續站 4.60% 上方、USO 再突破 132.41，降低長久期與高 beta。</li><li><strong>財報風險：</strong>GOOGL、TSLA 重大財報在週三盤後，週二不宜只因局部反彈提前追價。</li><li><strong>防守校正：</strong>RSP、XLF、XLV 只有重新跑贏 QQQ 才能作為防守緩衝，不能按板塊名稱預設有效。</li></ol>`,
  next_conclusion: "下一交易日先看 SPY 50MA、QQQ／SMH 均線與三項廣度門檻能否同步修復；未確認前保持中性偏防守，保留現金並只交易收盤相對強者。",
  cross_validation: "<div class='callout danger'><strong>互相確認：</strong>SPY、QQQ、SMH 低於 20／50MA，SPX／NDX／IWM 的 20MA 廣度同步下降，T2108 與 Stockbee ratio 也轉弱，共同確認市場內部仍在去風險。</div><div class='callout warn'><strong>互相分歧：</strong>QQQ、SMH 與部分記憶體／軟體股收漲，VIX 仍低於 20，RSP／IWM／DIA 尚守 50MA；因此不是全面恐慌，而是選擇性修復與廣度惡化並存。</div><div class='callout'><strong>主導結論：</strong>以廣度與均線為主、局部強股為輔。未見 SPY 收回 50MA、NDX 廣度回到 50% 與 5D ratio 回到 1 前，不把晶片反彈解讀成全面 risk-on。</div>",
  sources: "使用者 Google Sheets：Market Breath 與 Stockbee（更新至 2026-07-20）；長橋 OpenAPI：59 個主要資產與 44 檔主題 ETF 的 7/20 收盤、5 日／1 月變化、MA、ATR 與靜態 RSI；<a href='https://apnews.com/article/stocks-market-ai-oil-iran-war-15939a01f378bcec5eec2868e8100ca9'>AP：7/20 美股收盤、油價與個股反應</a>；<a href='https://www.conference-board.org/topics/us-leading-indicators/index.cfm?__source=newsletter%7Ctheexchange'>Conference Board：6 月 LEI／CEI</a>；<a href='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value=2026'>美國財政部：7/20 殖利率</a>；<a href='https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'>Cboe：VIX 歷史資料</a>；<a href='https://ir.dominos.com/news-releases/news-release-details/dominos-pizza-announces-second-quarter-2026-financial-results'>Domino's：第二季財報</a>。本報告不構成投資建議。",
};

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
