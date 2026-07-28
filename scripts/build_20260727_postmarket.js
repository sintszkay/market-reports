#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-27.json"), "utf8")
);
const thematic = JSON.parse(
  fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8")
);
const macro = JSON.parse(
  fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8")
);
const output = path.join(root, "data", "2026-07-27-postmarket.json");

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
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

function makeEtfRow(ticker, note, chart = false) {
  const source = theme.get(ticker) || snap.get(ticker);
  if (!source) throw new Error(`Thematic Sectors 缺少 ${ticker}`);
  return {
    label: ticker === "SPY" ? "SPY（基準）" : ticker,
    daily: source.dailyPct,
    daily_display: pct(source.dailyPct),
    five_day: pct(source.fiveDayPct),
    one_month: pct(source.oneMonthPct),
    one_month_numeric: Number(source.oneMonthPct),
    ma: maState(source),
    rsi: Number(source.rsi14),
    judgment: note,
    chart,
  };
}

const sectorNotes = {
  SPY: "大盤基準仍低於 20／50MA，風格輪動尚未變成全面趨勢。",
  XLF: "金融保持最強結構，但 RSI 已接近偏熱區。",
  XLV: "醫療守住三條均線，防守承接仍在。",
  XLRE: "房地產守住三條均線，但日線略有回吐。",
  XLE: "油價急跌拖累當日表現，中期均線仍完整。",
  XLI: "工業維持三線之上，價值風格續強。",
  XLP: "必需消費上漲並守住均線，防守性增強。",
  XLU: "公用事業仍在主要均線上方，當日受利率以外因素壓抑。",
  XLC: "通訊反彈，但仍低於 20／50／200MA。",
  XLK: "科技低於 20／50MA，晶片下跌拖累修復。",
  XLY: "非必需消費反彈，仍未收復主要均線。",
  XLB: "原物料結構偏弱，尚未完成中期修復。",
};

const sectorTickers = ["SPY", "XLF", "XLV", "XLRE", "XLE", "XLI", "XLP", "XLU", "XLC", "XLK", "XLY", "XLB"];
const sectorRows = sectorTickers
  .map((ticker) => {
    const row = requireRow(snap, ticker, "Sector Dashboard");
    return {
      label: ticker === "SPY" ? "SPY（基準）" : ticker,
      daily: row.dailyPct,
      daily_display: pct(row.dailyPct),
      five_day: pct(row.fiveDayPct),
      one_month: pct(row.oneMonthPct),
      one_month_numeric: Number(row.oneMonthPct),
      ma: maState(row),
      rsi: Number(row.rsi14),
      judgment: sectorNotes[ticker],
      chart: false,
    };
  })
  .sort((left, right) => right.rsi - left.rsi);

const themeNotes = {
  SPY: "大盤基準；用來區分主題超額報酬與市場方向。",
  JETS: "油價急跌直接改善成本預期，航空相對強勢獲得收盤確認。",
  IAK: "保險維持中期強勢，金融內部結構仍完整。",
  KIE: "保險高於主要均線，仍是防守與價值主線。",
  KRE: "區域銀行守住中期趨勢，風格偏向價值。",
  XBI: "生技日線持平，仍低於 20MA，未形成加速。",
  IBB: "大型生技守住主要均線，防守性優於高 beta 科技。",
  CIBR: "網安中期結構尚可，短線仍需觀察軟體壓力。",
  XSW: "軟體反彈不足，趨勢仍偏弱。",
  IGV: "軟體低於主要均線，財報前不提前假設反轉。",
  AIQ: "AI 主題受晶片回吐拖累，尚未完成均線修復。",
  SMH: "晶片反彈失敗，單日 -2.25%，仍低於 20／50MA。",
  IBIT: "比特幣代理低於主要均線，風險偏好訊號偏弱。",
  GLD: "黃金反彈，但中期技術結構仍需確認。",
  SLV: "白銀小幅上漲，仍處於深度修復階段。",
  CPER: "銅價回升，提供部分週期支撐。",
  USO: "單日 -8.73% 並跌破週期下緣，事件溢價快速回吐。",
  XHB: "住宅建築仍偏弱，利率下降尚未轉化為趨勢。",
  ITB: "房屋建築接近短線超賣，等待價格確認。",
  ARKK: "高 beta 成長仍低於主要均線，不以超賣替代止跌。",
};

const chartTickers = new Set(["JETS", "KIE", "CIBR", "XBI", "SMH", "AIQ", "USO", "SLV"]);
const thematicTickers = [
  "SPY", "JETS", "IAK", "KIE", "KRE", "XBI", "IBB", "CIBR", "XSW", "IGV",
  "AIQ", "SMH", "IBIT", "GLD", "SLV", "CPER", "USO", "XHB", "ITB", "ARKK",
];
const thematicRows = thematicTickers
  .map((ticker) => makeEtfRow(ticker, themeNotes[ticker], chartTickers.has(ticker)))
  .sort((left, right) => right.rsi - left.rsi);

const indexNotes = {
  IWM: "小型股上漲 0.60%，但仍低於 20MA；價值輪動強於科技。",
  DIA: "道指上漲 0.48%，守住 50／200MA，油價下跌提供成本紅利。",
  SPY: "收盤幾乎持平，仍低於 20／50MA，盤前跳空未能延續。",
  QQQ: "下跌 0.31%，5 日與 1 月皆弱，仍低於 20／50MA。",
};
const indexRows = ["IWM", "DIA", "SPY", "QQQ"].map((ticker) => {
  const row = requireRow(snap, ticker, "指數與風格");
  return {
    asset: ticker,
    latest: fixed(row.close),
    daily: pct(row.dailyPct),
    five_day: pct(row.fiveDayPct),
    ma: maState(row),
    rsi: row.rsi14,
    judgment: indexNotes[ticker],
  };
});

const report = {
  report_type: "postmarket",
  title: "美股盤後對賬｜2026-07-27",
  eyebrow: "US postmarket reconciliation · 2026-07-27",
  headline: "油價崩跌只撐住道指與小型股；晶片反彈失敗，廣度先於科技修復",
  as_of: "資料截至 2026-07-27 美股收盤。長橋收盤快照 72／72、Thematic Sectors 44／44、Macro 24／24 均成功；Sector Dashboard 以長橋收盤值覆核。市場廣度表最新列仍為 7/24，已明確標示，不冒充 7/27。",
  reconciliation_summary: { hit: 4, triggered: 2, miss: 1, not_triggered: 2 },
  regime_badges: "<span class='badge amber'>VIX 3/5：Intermediate</span><span class='badge green'>航空／郵輪相對強勢</span><span class='badge red'>晶片反彈失敗</span><span class='badge blue'>FOMC／大型科技財報前</span>",
  summary_cards: [
    { label: "SPY／QQQ", values: [{ text: "+0.02%", color: "green" }, { text: "-0.31%", color: "red" }], note: "盤前全面反彈未能延續至收盤。" },
    { label: "DIA／IWM", values: [{ text: "+0.48%", color: "green" }, { text: "+0.60%", color: "green" }], note: "油價回落更有利價值與小型股。" },
    { label: "SMH／USO", values: [{ text: "-2.25%", color: "red" }, { text: "-8.73%", color: "red" }], note: "晶片與能源同步回吐，驅動完全不同。" },
    { label: "Stockbee 5D／10D", values: [{ text: "1.05", color: "green" }, { text: "0.90", color: "amber" }], note: "短線轉強，中期仍未全面翻多。" },
  ],
  core_conclusions: [
    "<ol>",
    "<li><strong>盤前跳空反彈大幅收斂。</strong>SPY 僅 +0.02%、QQQ -0.31%，而 DIA +0.48%、IWM +0.60%；收盤主線從全面 risk-on 轉為價值與小型股相對領先。</li>",
    "<li><strong>油價急跌的相對交易命中。</strong>USO -8.73%、XLE -2.11%，JETS +2.89%，AAL +3.28%，郵輪 RCL／NCLH／CCL 分別 +3.92%／+3.41%／+3.00%。</li>",
    "<li><strong>晶片反彈判斷失誤。</strong>SMH -2.25%，SNDK -11.02%、AMD -5.17%、NVDA -4.99%、LRCX -4.46%；盤前廣泛上漲沒有守住 VWAP，也沒有轉化為收盤趨勢。</li>",
    "<li><strong>廣度先於科技改善。</strong>Stockbee 4% 上漲／下跌為 380／195、5D ratio 1.05、T2108 53.38；但 10D ratio 仍只有 0.90，且 NDX 20／50MA 廣度最新可用值仍低於四成。</li>",
    "<li><strong>利率與美元沒有成為科技救援。</strong>2Y／10Y／20Y 收益率分別回落 2／4／3bp，DXY 約 101.48、仍低於 102，但 QQQ 與 SMH 仍收跌，顯示科技弱勢主要來自自身估值與財報前風險。</li>",
    "<li><strong>波動率不能再機械標成低風險。</strong>VIX 18.67 雖低於 20，但五項計分為 3/5：高於 20 為 0、5日上升為 1、1月上升為 0、高於 20MA 為 1、高於 50MA 為 1，屬 Intermediate。</li>",
    "</ol>",
  ].join(""),
  core_conclusion: "收盤確認的是「油價急跌帶來風格輪動」，不是全面科技修復。隔夜持倉可保留價值、航空與等權相對優勢，但 QQQ／SMH 在收復 20MA 前仍低於基準配置。",
  reconciliation_rows: [
    { section: "地緣與油價", directive: "油價急跌有利風險資產，盤前全面反彈可先視為有效修復。", actual: "USO -8.73%，但 SPY 僅 +0.02%、QQQ -0.31%；油價驅動成立，全面反彈沒有守住。", result: "hit", correction: "把驅動命中與大盤收盤確認分開；油價下跌不等於科技必然上漲。" },
    { section: "大盤防守條件", directive: "若 SPY 失守 744.10 且 QQQ／SMH 跌回 VWAP，下調 beta。", actual: "SPY 收 739.09，QQQ -0.31%、SMH -2.25%，防守分支成立。", result: "triggered", correction: "隔夜維持低於基準科技曝險，等待收復 20MA。" },
    { section: "半導體擴散", directive: "晶片鏈盤前全面上漲，可視為反彈由記憶體擴散至設備鏈。", actual: "SMH -2.25%；SNDK、AMD、NVDA、LRCX、AMAT、KLAC 全數收跌。", result: "miss", correction: "盤前漲幅只能列為候選訊號；必須加上 VWAP 與收盤廣度確認。" },
    { section: "航空／能源相對", directive: "油價下跌時航空與郵輪相對能源更有優勢。", actual: "JETS +2.89%，RCL +3.92%、NCLH +3.41%、CCL +3.00%；XLE -2.11%。", result: "hit", correction: "相對交易有效，但次日不追高，先看 USO 是否反彈 130。" },
    { section: "科技升級門檻", directive: "只有 QQQ／SMH 收復 20MA 才升級科技趨勢。", actual: "QQQ 與 SMH 仍低於 20／50MA，門檻未達。", result: "not_triggered", correction: "維持原門檻，不以盤前跳空取代收盤確認。" },
    { section: "耐久財與長債", directive: "耐久財弱於預期且 TLT 走強，利率壓力可暫時緩和。", actual: "耐久財 +0.3% 低於 +2.5% 預期，TLT +0.60%；利率回落，但科技沒有同步受惠。", result: "hit", correction: "資料與利率方向命中；科技仍需自己的價格確認。" },
    { section: "Dallas Fed 加倉", directive: "若 Dallas Fed 偏弱、TLT 走強且 QQQ 守 VWAP，可小幅增加科技。", actual: "生產指數升至 10.1、一般商業活動升至 1.3，QQQ 收跌；條件不成立。", result: "not_triggered", correction: "沒有執行，規則保留。" },
    { section: "2Y 標售", directive: "2Y 標售 bid-to-cover 高於 2.64 且 TLT 走強，利率事件可視為正面。", actual: "bid-to-cover 2.66，TLT +0.60%，兩項條件皆達標。", result: "triggered", correction: "利率風險短線下降，但不得直接推導科技趨勢反轉。" },
    { section: "VIX 低於 20", directive: "VIX 低於 20 只代表未恐慌，不能覆蓋均線與廣度風險。", actual: "VIX 18.67，但五項波動分數 3/5；QQQ／SMH 仍弱。", result: "hit", correction: "維持五項計分，3/5 標為 Intermediate，不再機械標 Low。" },
  ],
  reconciliation_conclusion: "9 項盤前判斷逐行對賬：4 命中、2 已觸發、1 失誤、2 未觸發。最大修正是半導體：以後盤前大漲必須通過 VWAP 與收盤擴散驗證，不能直接寫成有效修復。",
  index_rows: indexRows,
  index_conclusion: "四大 ETF 只保留 IWM、DIA、SPY、QQQ。DIA 與 IWM 收漲並守住 50／200MA，SPY 與 QQQ 仍低於 20／50MA；風格輪動成立，指數趨勢尚未全面修復。",
  sector_rows: sectorRows,
  sector_conclusion: "Sector Dashboard 共 12 列並按 RSI 由高到低排序，含 SPY 基準。金融、醫療、房地產與工業結構較完整；科技、通訊與非必需消費仍處修復區。",
  thematic_rows: thematicRows,
  thematic_conclusion: "Thematic Sectors 固定 20 列、含一列 SPY 基準，並使用長橋 7/27 日線重算後按 RSI 排序。航空／保險相對較強；半導體、AI、軟體與高 beta 仍需確認。線上 Thematic Sectors 工作表本輪出現行錯位，因此沒有採用其錯列單元格。",
  breadth_rows: [
    { indicator: "SPX >20MA（7/24）", latest: 55.06, percent: true, five_day: "58.05% → 55.06%", one_month: "仍高於半數", judgment: "短線略降；來源尚未更新至 7/27。" },
    { indicator: "SPX >50MA（7/24）", latest: 65.20, percent: true, five_day: "63.61% → 65.20%", one_month: "中期改善", judgment: "中期底盤仍在；來源尚未更新至 7/27。" },
    { indicator: "NDX >20MA（7/24）", latest: 32.03, percent: true, five_day: "44.66% → 32.03%", one_month: "低於四成", judgment: "科技短線廣度最弱。" },
    { indicator: "NDX >50MA（7/24）", latest: 39.80, percent: true, five_day: "43.68% → 39.80%", one_month: "低於四成", judgment: "科技中期參與不足。" },
    { indicator: "IWM >20MA（7/24）", latest: 39.79, percent: true, five_day: "54.56% → 39.79%", one_month: "短線失速", judgment: "7/27 價格反彈，仍待廣度更新確認。" },
    { indicator: "IWM >50MA（7/24）", latest: 56.51, percent: true, five_day: "62.27% → 56.51%", one_month: "仍高於半數", judgment: "中期底盤尚可。" },
    { indicator: "T2108（Stockbee 7/27）", latest: 53.38, percent: true, five_day: "50.95% → 53.38%", one_month: "重返中性上方", judgment: "全市場長期廣度改善。" },
    { indicator: "5D ratio（Stockbee 7/27）", latest: "1.05", five_day: "0.84 → 1.05", one_month: "升破 1", judgment: "短線強股重新多於弱股。", tone: "green" },
    { indicator: "10D ratio（Stockbee 7/27）", latest: "0.90", five_day: "0.76 → 0.90", one_month: "仍低於 1", judgment: "中短線尚未完全翻多。", tone: "amber" },
    { indicator: "4%+ 上漲／下跌（7/27）", latest: "380 / 195", five_day: "139 / 337 → 380 / 195", one_month: "單日明顯改善", judgment: "強勢擴散，但需連續性。" },
    { indicator: "季度 +25%／-25%（7/27）", latest: "1186 / 1199", five_day: "1073 / 1272 → 1186 / 1199", one_month: "接近平衡", judgment: "中期結構仍未轉為明顯多頭。" },
  ],
  breadth_context: "<div class='callout warn'><strong>時點限制：</strong>三大指數 20／50MA 廣度工作表最新只到 7/24；本報保留原日期，不把舊值標成 7/27。Stockbee 已更新至 7/27。</div><p class='section-summary'><strong>綜合判斷：</strong>Stockbee 5D ratio 1.05、4% 上漲／下跌 380／195、T2108 53.38，顯示短線廣度先改善；但 10D ratio 0.90，且最新可用 NDX 20／50MA 廣度仍低於四成。短線修復與科技中期弱勢同時存在。</p>",
  breadth_conclusion: "廣度不是單純 Stockbee 多頭：SPX 中期仍穩、NDX 最弱、IWM 價格先反彈，Stockbee 短線先轉強而 10D 尚未過 1。要升級全面 risk-on，需等三大指數廣度更新後至少兩組同步改善。",
  macro_rows: [
    { asset: "DXY", latest: "101.48", daily: "+0.21%", meaning: "仍低於 102 科技減倉觸發線；外匯因子保留，不再無聲消失。" },
    { asset: "美國 2 年債", latest: "4.31%", daily: "-2bp", meaning: "前端利率回落；2Y 標售 bid-to-cover 2.66，略強於 2.64 門檻。" },
    { asset: "美國 10 年債", latest: "4.65%", daily: "-4bp", meaning: "長端回落，但仍是高估值成長股的約束。" },
    { asset: "美國 20 年債", latest: "5.15%", daily: "-3bp", meaning: "期限溢價仍高，長債壓力未解除。" },
    { asset: "VIX", latest: "18.67", daily: "+0.48%", meaning: "五項波動分數 3/5，屬 Intermediate；低於 20 不等於 Low Risk。" },
    { asset: "TLT", latest: "83.75", daily: "+0.60%", meaning: "長債反彈，但仍低於 20／50／200MA。" },
    { asset: "USO", latest: "124.76", daily: "-8.73%", meaning: "跌破本週 -1SD 125.57，油價事件溢價快速退潮。" },
    { asset: "GLD", latest: fixed(requireRow(snap, "GLD", "Macro").close), daily: pct(requireRow(snap, "GLD", "Macro").dailyPct), meaning: "避險資產小幅上漲，但技術結構仍需確認。" },
    { asset: "SLV", latest: fixed(requireRow(snap, "SLV", "Macro").close), daily: pct(requireRow(snap, "SLV", "Macro").dailyPct), meaning: "白銀反彈，仍屬高波動修復。" },
    { asset: "CPER", latest: fixed(requireRow(snap, "CPER", "Macro").close), daily: pct(requireRow(snap, "CPER", "Macro").dailyPct), meaning: "銅價回升，與能源大跌形成商品內部分化。" },
  ],
  macro_conclusion: "DXY 101.48、10Y 4.65% 與 VIX 18.67 都未跨過主要減倉線，但 QQQ／SMH 仍弱，說明本日科技壓力不能只用宏觀解釋。油價急跌是最強跨資產訊號；USO 已跌破週度 -1SD，次日先防反抽。",
  expected_move_rows: [
    { ticker: "SPY", price: "739.09", boundary: "724.53–753.33", status: "區間內", tone: "grey", implication: "接近週初基準，未形成方向突破。" },
    { ticker: "QQQ", price: "682.12", boundary: "661.66–706.80", status: "區間內", tone: "grey", implication: "仍在區間中部偏下，科技趨勢偏弱。" },
    { ticker: "IWM", price: "292.91", boundary: "283.91–298.43", status: "區間內", tone: "green", implication: "價值與小型股相對領先。" },
    { ticker: "DIA", price: "521.26", boundary: "509.91–527.61", status: "區間內", tone: "green", implication: "接近上半區，受惠成本回落。" },
    { ticker: "SMH", price: "548.55", boundary: "518.82–603.56", status: "區間內", tone: "amber", implication: "反彈失敗，但尚未跌破 -1SD。" },
    { ticker: "USO", price: "124.76", boundary: "下緣 125.57", status: "跌破 -1SD", tone: "red", implication: "能源事件倉需減碼，防隔日反抽。" },
    { ticker: "TLT", price: "83.75", boundary: "82.25–84.25", status: "區間內", tone: "blue", implication: "標售後走強，但未突破週上緣。" },
    { ticker: "NVDA", price: "196.51", boundary: "下緣 196.58", status: "跌破 -1SD", tone: "red", implication: "晶片權重風險已達週度下緣。" },
    { ticker: "NOW", price: "105.56", boundary: "上緣 105.51", status: "突破 +1SD", tone: "green", implication: "個股與軟體 ETF 弱勢分化，避免用單股代表板塊。" },
  ],
  expected_move_conclusion: "USO 與 NVDA 已跌破 -1SD，分別確認油價溢價回吐與晶片弱勢；NOW 略破 +1SD，屬於個股分化，不足以推翻 IGV／XSW 的板塊弱勢。",
  event_review: [
    "<h3>宏觀數據</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5'><thead><tr><th>項目</th><th class='num'>Actual</th><th class='num'>Forecast／門檻</th><th class='num'>Previous</th><th>結果與含義</th></tr></thead><tbody>",
    "<tr><td>耐久財訂單（6月）</td><td class='num'>+0.3%</td><td class='num'>+2.5%</td><td class='num'>-4.0%</td><td><span class='badge red'>Miss</span> 低於預期，製造投資動能有限。</td></tr>",
    "<tr><td>耐久財（扣除運輸）</td><td class='num'>+0.6%</td><td class='num'>+0.8%</td><td class='num'>+1.3%</td><td><span class='badge red'>Miss</span> 仍成長，但低於市場預期。</td></tr>",
    "<tr><td>Dallas Fed 生產指數</td><td class='num'>10.1</td><td class='num' data-allow-missing>未提供一致預期</td><td class='num'>4.1</td><td><span class='badge blue'>高於前值</span> 不符合「數據偏弱」加倉條件。</td></tr>",
    "<tr><td>Dallas Fed 一般商業活動</td><td class='num'>1.3</td><td class='num' data-allow-missing>未提供一致預期</td><td class='num'>0.0</td><td><span class='badge blue'>高於前值</span> 調查沒有轉弱。</td></tr>",
    "<tr><td>2Y 美債標售 bid-to-cover</td><td class='num'>2.66</td><td class='num'>2.64 觸發線</td><td class='num'>2.64</td><td><span class='badge green'>已觸發</span> 需求略強，TLT 同步上漲。</td></tr>",
    "</tbody></table></div>",
    "<h3>盤後財報</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-6'><thead><tr><th>公司</th><th class='num'>EPS Actual</th><th class='num'>EPS Forecast</th><th class='num'>Revenue Actual</th><th class='num'>Revenue Forecast</th><th>Beat／Miss</th></tr></thead><tbody>",
    "<tr><td>NUE</td><td class='num'>$4.84</td><td class='num'>$4.38</td><td class='num'>$10.40B</td><td class='num'>$10.14B</td><td><span class='badge green'>Beat / Beat</span></td></tr>",
    "<tr><td>RMBS</td><td class='num'>$0.77</td><td class='num'>$0.72</td><td class='num'>$207.4M</td><td class='num'>$199.3M</td><td><span class='badge green'>Beat / Beat</span></td></tr>",
    "<tr><td>MSFT／META／AAPL／AMZN</td><td class='num' data-allow-missing>待公布</td><td class='num'>依市場共識</td><td class='num' data-allow-missing>待公布</td><td class='num'>依市場共識</td><td><span class='badge grey'>待公布</span></td></tr>",
    "</tbody></table></div>",
  ].join(""),
  event_conclusion: "宏觀數據與財報均保留 Actual／Forecast。耐久財兩項 Miss，Dallas Fed 高於前值，2Y 標售達到觸發線；NUE 與 RMBS 均為 EPS／營收 Beat，未公布的大型科技只標「待公布」。",
  next_session: [
    "<div class='table-scroll'><table class='report-data-table report-cols-4'><thead><tr><th>訊號</th><th>門檻</th><th class='num'>當前值</th><th>動作</th></tr></thead><tbody>",
    "<tr><td>科技修復</td><td>QQQ／SMH 收復各自 20MA</td><td class='num'>仍低於 20MA</td><td>未達標前維持低於基準配置。</td></tr>",
    "<tr><td>大盤防守</td><td>SPY &lt; 739 或 QQQ 跌破 7/27 低點</td><td class='num'>SPY 739.09</td><td>降低高 beta 1/3。</td></tr>",
    "<tr><td>油價反抽</td><td>USO 重返 130</td><td class='num'>124.76</td><td>不追航空；能源空頭先收斂。</td></tr>",
    "<tr><td>美元壓力</td><td>DXY &gt; 102</td><td class='num'>101.48</td><td>降低科技與高 beta 1/3。</td></tr>",
    "<tr><td>波動升級</td><td>VIX &gt; 20 或五項分數 ≥4/5</td><td class='num'>18.67；3/5</td><td>總風險降低 1/3。</td></tr>",
    "<tr><td>廣度確認</td><td>Stockbee 5D／10D 均 &gt;1，且 NDX 20MA 廣度回升</td><td class='num'>1.05／0.90；NDX 7/24 為 32.03%</td><td>達標後才升級全面 risk-on。</td></tr>",
    "</tbody></table></div>",
  ].join(""),
  next_conclusion: "下一交易日先管晶片、油價反抽與 FOMC／大型科技事件風險；航空相對交易可以保留觀察倉，但不在首日大漲後追價。",
  cross_validation: "<div class='callout danger'><strong>互相確認：</strong>QQQ／SMH 低於 20／50MA、NVDA 跌破 -1SD、晶片鏈全面收跌，三組訊號共同確認科技弱勢。</div><div class='callout warn'><strong>互相分歧：</strong>Stockbee 5D ratio 已升破 1、DIA／IWM／RSP 相對較強，但 10D ratio 與 NDX 廣度尚未跟上，屬於輪動而非全面 risk-on。</div><div class='callout'><strong>主導結論：</strong>以收盤價格優先：保留價值／航空相對強勢，科技等 QQQ／SMH 收復 20MA；DXY、VIX、USO 繼續用數值門檻管理事件風險。</div>",
  sources: [
    "<a href='https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit'>Sector Dashboard／Thematic Sectors／Macro</a>；",
    "<a href='https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit'>Stockbee 2026</a>；",
    "<a href='https://www.census.gov/manufacturing/m3/adv/current/index.html'>U.S. Census 耐久財</a>；",
    "<a href='https://www.dallasfed.org/research/surveys/tmos/2026/2607'>Dallas Fed</a>；",
    "<a href='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve'>U.S. Treasury 收益率</a>；",
    "<a href='https://investors.nucor.com/news/news-details/2026/Nucor-Reports-Results-for-the-Second-Quarter-of-2026/default.aspx'>Nucor 財報</a>；",
    "<a href='https://investor.rambus.com/press-releases/press-release-details/2026/Rambus-Reports-Second-Quarter-2026-Financial-Results/default.aspx'>Rambus 財報</a>；",
    "價格、均線、RSI、ATR 與成交資料以長橋 2026-07-27 日線為準。",
  ].join(""),
};

if (snapshot.errors.length || thematic.errors.length || macro.errors.length) {
  throw new Error("長橋快照存在錯誤，不產生報告");
}
if (sectorRows.length !== 12 || thematicRows.length !== 20 || indexRows.length !== 4) {
  throw new Error("主表列數不符合報告規則");
}
if (!macroMap.size) {
  throw new Error("Macro 快照不可用");
}

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
