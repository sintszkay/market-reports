#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workRoot = path.join(root, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_snapshot_2026-07-28.json"), "utf8"));
const thematic = JSON.parse(fs.readFileSync(path.join(workRoot, "thematic_rsi_longport.json"), "utf8"));
const macro = JSON.parse(fs.readFileSync(path.join(workRoot, "macro_rsi_longport.json"), "utf8"));
const extended = JSON.parse(fs.readFileSync(path.join(workRoot, "postmarket_extended_2026-07-28.json"), "utf8"));
const output = path.join(root, "data", "2026-07-28-postmarket.json");

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
const theme = new Map(thematic.rows.map((row) => [row.ticker, row]));
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
    daily: source.dailyPct,
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
  SPY: "基準仍低於 20／50MA，指數尚未全面修復。",
  XLF: "金融創收盤新高，RSI 偏熱，追價風險上升。",
  XLV: "醫療領漲並守住三條均線，防禦承接明確。",
  XLRE: "房地產守住三條均線，利率回落提供支撐。",
  XLB: "原物料反彈並站回三條均線，風格轉強。",
  XLP: "必需消費上漲 1.99%，防禦資金持續流入。",
  DIA: "道指風格強於科技，但不列入產業表。",
  XLI: "工業維持三條均線之上，週期結構尚穩。",
  XLE: "油價急跌拖累當日表現，中期均線仍完整。",
  XLU: "公用事業仍在主要均線之上，短線略有回吐。",
  XLC: "通訊反彈，但仍低於三條主要均線。",
  XLY: "非必需消費反彈，仍未收復主要均線。",
  XLK: "科技低於 20／50MA，晶片跌勢拖累修復。",
};

const sectorRows = ["SPY", "XLF", "XLV", "XLRE", "XLB", "XLP", "XLI", "XLE", "XLU", "XLC", "XLY", "XLK"]
  .map((ticker) => makeEtfRow(ticker, { note: sectorNotes[ticker] }))
  .sort((left, right) => right.rsi - left.rsi);

const chartTickers = new Set(["KIE", "FXI", "PPH", "XRT", "SMH", "AIQ", "SLV", "WGMI"]);
const thematicRows = [
  makeEtfRow("SPY"),
  ...thematic.rows.map((row) => makeEtfRow(row.ticker, { chart: chartTickers.has(row.ticker) })),
].sort((left, right) => right.rsi - left.rsi);

const indexNotes = {
  IWM: "收漲但仍低於 20MA；小型股廣度改善快於價格。",
  DIA: "四大 ETF 最強，站上三條均線並接近週度 +1SD。",
  SPY: "小幅收漲，但仍低於 20／50MA，靠非科技板塊支撐。",
  QQQ: "收跌並低於 20／50MA，科技主線仍在去風險。",
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
  title: "美股盤後對賬｜2026-07-28",
  eyebrow: "US postmarket reconciliation · 2026-07-28",
  headline: "防禦與道指撐住大盤，晶片跌勢擴大；廣度回升但科技仍未修復",
  as_of: "資料截至 2026-07-28 美股收盤。長橋收盤快照 72／72、Thematic Sectors 44／44、Macro 24／24 均成功；盤後行情另以長橋即時報價核對。市場廣度與 Stockbee 均已更新至 7/28。",
  reconciliation_summary: { hit: 4, triggered: 1, miss: 1, not_triggered: 4 },
  regime_badges: "<span class='badge amber'>VIX 3/5：Intermediate</span><span class='badge green'>DIA／防禦相對強</span><span class='badge red'>晶片去風險擴大</span><span class='badge blue'>FOMC／大型科技財報在前</span>",
  summary_cards: [
    { label: "SPY／QQQ", values: [{ text: "+0.24%", color: "green" }, { text: "-0.97%", color: "red" }], note: "大盤由非科技板塊支撐，科技落後。" },
    { label: "DIA／IWM", values: [{ text: "+1.08%", color: "green" }, { text: "+0.16%", color: "green" }], note: "道指風格明顯領先，小型股溫和上漲。" },
    { label: "SMH／SNDK", values: [{ text: "-3.45%", color: "red" }, { text: "-14.25%", color: "red" }], note: "記憶體與設備鏈壓力進一步擴散。" },
    { label: "廣度 5D／10D", values: [{ text: "0.78", color: "red" }, { text: "0.88", color: "red" }], note: "指數廣度回升，但極端漲跌家數仍偏弱。" },
  ],
  core_conclusions: [
    "<ol>",
    "<li><strong>不是全面下跌，而是科技與晶片去風險加劇。</strong>SPY +0.24%、DIA +1.08%、IWM +0.16%，QQQ -0.97%；等權 RSP +1.17%，顯示非科技成分承接大盤。</li>",
    "<li><strong>記憶體與設備鏈仍是壓力核心。</strong>SMH -3.45%、SNDK -14.25%、MU -8.85%、AMD -8.15%、INTC -5.86%、KLAC -6.18%；NVDA +0.25% 也未能改變板塊弱勢。</li>",
    "<li><strong>防禦與價值板塊輪動成立。</strong>XLV +2.36%、XLP +1.99%、XLF +1.27%，而 XLK -1.84%；DIA 站上三條均線，QQQ 與 SPY 仍低於 20／50MA。</li>",
    "<li><strong>廣度出現兩組訊號分歧。</strong>SPX、NDX、IWM 的 20／50MA 廣度全數改善；但 Stockbee 4% 上漲／下跌為 341／388，5D、10D ratio 降至 0.78、0.88。大中型成分改善，不代表高波動股票同步轉強。</li>",
    "<li><strong>宏觀環境偏寬鬆，但沒有救起科技。</strong>10Y 殖利率降至約 4.60%、TLT +0.59%，DXY 101.43 仍低於 102；QQQ 與 SMH 仍收跌，說明科技壓力主要來自自身估值與產業敘事。</li>",
    "<li><strong>財報的標題 Beat 已不足以保證盤後上漲。</strong>Ford、Seagate 在 Beat／Beat 後上漲，Visa、NXP、KLA 即使數字優於預期仍下跌，市場更重視指引、估值與已反映程度。</li>",
    "</ol>",
  ].join(""),
  core_conclusion: "收盤確認的是「防禦與價值輪動、科技與晶片去風險」，不是全面 risk-off。隔夜倉位可保留低於基準的科技 beta，直到 QQQ／SMH 收復 20MA 或廣度與價格同步反轉。",
  reconciliation_rows: [
    { section: "風格分化", directive: "DIA／防禦相對強，QQQ／SMH 與記憶體弱於基準。", actual: "DIA +1.08%、XLV +2.36%、XLP +1.99%；QQQ -0.97%、SMH -3.45%。", result: "hit", correction: "保留風格分化框架，避免用 SPY 小漲判定全面 risk-on。" },
    { section: "記憶體壓力", directive: "SNDK、MU、INTC 若無法收回 VWAP，弱勢可能延續。", actual: "SNDK -14.25%、MU -8.85%、INTC -5.86%，收盤均未形成修復。", result: "hit", correction: "晶片反彈必須同時檢查 ETF、記憶體與設備鏈。" },
    { section: "大盤不是全面崩跌", directive: "防禦承接可令 SPY 明顯強於 QQQ。", actual: "SPY +0.24%、RSP +1.17%，同時 QQQ -0.97%。", result: "hit", correction: "保留等權與產業廣度交叉驗證。" },
    { section: "技術防守", directive: "QQQ／SMH 低於 20／50MA 前，科技 beta 維持低於基準。", actual: "QQQ、SMH 收盤仍低於 20／50MA；5日分別 -4.72%、-9.33%。", result: "hit", correction: "技術門檻有效，下一步改看 20MA 與前一日高點雙確認。" },
    { section: "AMD 週度下界", directive: "AMD 跌破 472.55（週度 -1SD）時減碼。", actual: "AMD 收 454.62，正式跌破 -1SD，單日 -8.15%。", result: "triggered", correction: "已觸發風控；未收回 472.55 前不視為重新站穩。" },
    { section: "科技廣度", directive: "NDX 20／50MA 廣度偏弱，科技參與度可能持續低迷。", actual: "NDX >20／50MA 由 44.36%／48.54% 升至 48.54%／51.45%，已跨回中性區。", result: "miss", correction: "廣度更新後必須重算，不能沿用 7/24 的低值敘事。" },
    { section: "QQQ／SMH 反向訊號", directive: "若兩者收復 VWAP、記憶體跌幅收窄，防守主線失效。", actual: "QQQ／SMH 收跌，記憶體跌幅反而擴大。", result: "not_triggered", correction: "失效條件未發生，原防守主線保留。" },
    { section: "宏觀再風險", directive: "數據偏弱、TLT 上漲且 QQQ 收復 VWAP，才小幅回補成長。", actual: "信心與 Richmond Fed 均 Miss、TLT +0.59%，但 QQQ 未收復 VWAP。", result: "not_triggered", correction: "宏觀利多必須與價格確認同時成立。" },
    { section: "美元風控", directive: "DXY >102 時降低科技與高 beta。", actual: "DXY 收約 101.43，未升破 102。", result: "not_triggered", correction: "保留 102 數值門檻，避免無聲移除外匯風控。" },
    { section: "波動升級", directive: "VIX >20 或五項分數升至至少 4/5 時降總風險。", actual: "VIX 19.08；五項分數為 3/5，仍屬 Intermediate。", result: "not_triggered", correction: "繼續使用五項機械計分，不因單日漲跌改標籤。" },
  ],
  reconciliation_conclusion: "10 項盤前判斷逐行對賬：4 命中、1 已觸發、1 失誤、4 未觸發。主要修正是同日重新讀取市場廣度；NDX 廣度已回升，不能再沿用 7/24 的低值描述。",
  index_rows: indexRows,
  index_conclusion: "四大 ETF 只保留 IWM、DIA、SPY、QQQ。DIA 站上三條均線且 RSI 59.73；IWM 低於 20MA、仍高於 50／200MA；SPY 與 QQQ 均低於 20／50MA，科技修復最弱。",
  sector_rows: sectorRows,
  sector_conclusion: "Sector Dashboard 固定 12 列並按 RSI 由高到低排序。XLF、XLV、XLP、XLRE 位居前列；XLK 與 XLY 仍在主要均線下方，風格輪動清楚。",
  thematic_rows: thematicRows,
  thematic_conclusion: "Thematic Sectors 已完整重讀長橋 44 檔 ETF，另加入 SPY 基準，共 45 列並按 RSI 遞減排序。KIE、IAK、FXI、PPH 相對強；SMH、AIQ、WGMI 等高 beta 主題仍偏弱。",
  breadth_rows: [
    { indicator: "SPX >20MA（7/28）", latest: 69.18, percent: true, five_day: "45.52% → 69.18%", one_month: "回到約七成", judgment: "大型股短線廣度明顯改善。" },
    { indicator: "SPX >50MA（7/28）", latest: 71.57, percent: true, five_day: "62.22% → 71.57%", one_month: "中期高於七成", judgment: "S&P 500 中期底盤轉穩。" },
    { indicator: "NDX >20MA（7/28）", latest: 48.54, percent: true, five_day: "32.03% → 48.54%", one_month: "回到中性附近", judgment: "科技廣度改善，但仍弱於 SPX。" },
    { indicator: "NDX >50MA（7/28）", latest: 51.45, percent: true, five_day: "46.60% → 51.45%", one_month: "剛越過五成", judgment: "中期參與度改善，價格尚未確認。" },
    { indicator: "IWM >20MA（7/28）", latest: 52.57, percent: true, five_day: "41.16% → 52.57%", one_month: "重返五成", judgment: "小型股短線廣度回升。" },
    { indicator: "IWM >50MA（7/28）", latest: 61.07, percent: true, five_day: "60.55% → 61.07%", one_month: "中期仍高於六成", judgment: "中期底盤未壞。" },
    { indicator: "T2108（Stockbee 7/28）", latest: 55.33, percent: true, five_day: "53.38% → 55.33%", one_month: "中性偏多", judgment: "全市場長期廣度略有改善。" },
    { indicator: "5D ratio（Stockbee 7/28）", latest: "0.78", five_day: "0.91 → 0.78", one_month: "跌回 1 以下", judgment: "短線強股少於弱股。", tone: "red" },
    { indicator: "10D ratio（Stockbee 7/28）", latest: "0.88", five_day: "0.92 → 0.88", one_month: "仍低於 1", judgment: "中短線尚未全面翻多。", tone: "red" },
    { indicator: "4%+ 上漲／下跌（7/28）", latest: "341 / 388", five_day: "164 / 242 → 341 / 388", one_month: "高波動分布偏空", judgment: "極端下跌家數略多。" },
    { indicator: "季度 +25%／-25%（7/28）", latest: "1261 / 1231", five_day: "1156 / 1183 → 1261 / 1231", one_month: "接近平衡", judgment: "中期結構略偏多但優勢很小。" },
  ],
  breadth_context: "<div class='callout warn'><strong>雙來源分歧：</strong>三大指數的 20／50MA 廣度全數改善，但 Stockbee 5D／10D ratio 降至 0.78／0.88，4% 上漲／下跌為 341／388。前者偏向大中型指數成分，後者更敏感於全市場極端漲跌；兩者同時成立。</div>",
  breadth_conclusion: "綜合 SPX、NDX、IWM 與 Stockbee，結論不是單純「廣度改善」或「廣度惡化」，而是大中型成分的均線廣度改善、極端強弱股分布偏空。科技價格仍弱於其廣度修復，下一步要看 QQQ／SMH 能否跟上。",
  macro_rows: [
    { asset: "DXY", latest: "101.43", daily: "+0.05%", meaning: "仍低於 102 減科技門檻；外匯壓力未升級。" },
    { asset: "美國 10 年債", latest: "約 4.60%", daily: "-4bp", meaning: "長端殖利率回落，但尚未轉化為科技相對強勢。" },
    { asset: "VIX", latest: "19.08", daily: "+2.20%", meaning: "五項分數 3/5：>20 0、5日>0 1、1月>0 0、20MA 1、50MA 1；Intermediate。" },
    { asset: "TLT", latest: fixed(requireRow(snap, "TLT", "Macro").close), daily: pct(requireRow(snap, "TLT", "Macro").dailyPct), meaning: "接近週度 +1SD 84.25，但仍低於 20／50／200MA。" },
    { asset: "USO", latest: fixed(requireRow(snap, "USO", "Macro").close), daily: pct(requireRow(snap, "USO", "Macro").dailyPct), meaning: "跌破週度 -1SD，油價回落拖累能源。" },
    { asset: "GLD", latest: fixed(requireRow(snap, "GLD", "Macro").close), daily: pct(requireRow(snap, "GLD", "Macro").dailyPct), meaning: "黃金回落，避險資產沒有同步上漲。" },
    { asset: "SLV", latest: fixed(requireRow(snap, "SLV", "Macro").close), daily: pct(requireRow(snap, "SLV", "Macro").dailyPct), meaning: "白銀續跌，高波動商品仍在修復。" },
    { asset: "CPER", latest: fixed(requireRow(snap, "CPER", "Macro").close), daily: pct(requireRow(snap, "CPER", "Macro").dailyPct), meaning: "銅價回落，商品內部一致偏弱。" },
  ],
  macro_conclusion: "DXY 101.43、10Y 約 4.60%、TLT +0.59% 均顯示宏觀壓力沒有升級；但 QQQ／SMH 仍弱，科技賣壓主要來自板塊自身。VIX 仍按五項規則評為 3/5 Intermediate，不因低於 20 就標示低風險。",
  expected_move_rows: [
    { ticker: "CRM", price: "181.50", boundary: "+2SD 181.07", status: "突破 +2SD", tone: "green", implication: "軟體個股強勢，但不代表整個科技板塊轉強。" },
    { ticker: "KO", price: "88.27", boundary: "+2SD 87.81", status: "突破 +2SD", tone: "green", implication: "防禦與財報強勢延續。" },
    { ticker: "AMD", price: "454.62", boundary: "-1SD 472.55", status: "跌破 -1SD", tone: "red", implication: "週度風控已觸發，未收回下界前維持減碼。" },
    { ticker: "USO", price: "120.49", boundary: "-1SD 125.57", status: "跌破 -1SD", tone: "red", implication: "能源事件溢價快速退潮。" },
    { ticker: "XOP", price: "166.37", boundary: "-1SD 167.67", status: "跌破 -1SD", tone: "red", implication: "上游能源同步轉弱。" },
    { ticker: "XLV", price: "167.26", boundary: "+1SD 165.37", status: "突破 +1SD", tone: "green", implication: "醫療防禦輪動獲得價格確認。" },
    { ticker: "XLF", price: "57.60", boundary: "+1SD 57.44", status: "突破 +1SD", tone: "green", implication: "金融相對強勢，但 RSI 已偏熱。" },
    { ticker: "XLP", price: "87.06", boundary: "+1SD 86.03", status: "突破 +1SD", tone: "green", implication: "必需消費防禦輪動成立。" },
    { ticker: "SMH", price: "529.60", boundary: "-1SD 518.82", status: "接近 -1SD", tone: "amber", implication: "若跌破下界，晶片風險再升級。" },
    { ticker: "TLT", price: "84.24", boundary: "+1SD 84.25", status: "接近 +1SD", tone: "blue", implication: "長債只差 0.01；突破後仍需 QQQ 同步確認。" },
  ],
  expected_move_conclusion: "AMD、USO、XOP 跌破 -1SD，CRM、KO 突破 +2SD，XLV、XLF、XLP 突破 +1SD，完整支持「晶片／能源弱、防禦與個別軟體強」的分化敘事。",
  event_review: [
    "<h3>宏觀數據</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-5 macro-review-table'><thead><tr><th>項目</th><th class='num'>Actual</th><th class='num'>Forecast</th><th class='num'>Previous</th><th>結果與含義</th></tr></thead><tbody>",
    "<tr><td>S&amp;P Case-Shiller 20城房價 YoY</td><td class='num'>+1.6%</td><td class='num'>+1.2%</td><td class='num'>+1.2%</td><td><span class='badge green'>Beat</span> 名義房價高於預期，但實質房價仍受通膨壓力。</td></tr>",
    "<tr><td>美國消費者信心</td><td class='num'>90.8</td><td class='num'>92.65</td><td class='num'>92.2（修正；原 91.2）</td><td><span class='badge red'>Miss</span> 現況與勞動市場感受轉弱。</td></tr>",
    "<tr><td>Richmond Fed 製造業指數</td><td class='num'>5</td><td class='num'>6</td><td class='num'>4</td><td><span class='badge red'>Miss</span> 仍在擴張區，但低於盤前採用預期。</td></tr>",
    "</tbody></table></div>",
    "<h3>盤後財報</h3>",
    "<div class='table-scroll'><table class='report-data-table report-cols-7'><thead><tr><th>公司</th><th class='num'>EPS Actual</th><th class='num'>EPS Forecast</th><th class='num'>Revenue Actual</th><th class='num'>Revenue Forecast</th><th>Beat／Miss</th><th class='num'>盤後反應</th></tr></thead><tbody>",
    `<tr><td>Visa（V）</td><td class='num'>$3.32</td><td class='num'>$3.23</td><td class='num'>$11.63B</td><td class='num'>$11.40B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "V", "盤後報價").postmarketChangePct)}</td></tr>`,
    `<tr><td>Ford（F）</td><td class='num'>$0.42</td><td class='num'>$0.35</td><td class='num'>$48.30B</td><td class='num'>$47.51B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "F", "盤後報價").postmarketChangePct)}</td></tr>`,
    `<tr><td>Seagate（STX）</td><td class='num'>$5.71</td><td class='num'>$5.10</td><td class='num'>$3.63B</td><td class='num'>$3.50B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "STX", "盤後報價").postmarketChangePct)}</td></tr>`,
    `<tr><td>NXP（NXPI）</td><td class='num'>$3.61</td><td class='num'>$3.46</td><td class='num'>$3.50B</td><td class='num'>$3.46B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "NXPI", "盤後報價").postmarketChangePct)}</td></tr>`,
    `<tr><td>KLA（KLAC）</td><td class='num'>$1.05</td><td class='num'>$1.00</td><td class='num'>$3.66B</td><td class='num'>$3.60B</td><td><span class='badge green'>Beat / Beat</span></td><td class='num'>${pct(requireRow(afterHours, "KLAC", "盤後報價").postmarketChangePct)}</td></tr>`,
    "</tbody></table></div>",
  ].join(""),
  event_conclusion: "宏觀三項均保留 Actual／Forecast／Previous；房價 Beat，信心與 Richmond Fed Miss。五家公司 EPS／營收均 Beat／Beat，但盤後只有 Ford、Seagate 上漲，Visa、NXP、KLA 下跌，證明不能只看標題 Beat。",
  next_session: [
    "<div class='table-scroll'><table class='report-data-table report-cols-4'><thead><tr><th>訊號</th><th>門檻</th><th class='num'>當前值</th><th>動作</th></tr></thead><tbody>",
    "<tr><td>科技修復</td><td>QQQ 收回 708.06、SMH 收回 585.88（各自 20MA）</td><td class='num'>675.49／529.60</td><td>未達前，科技 beta 維持低於基準。</td></tr>",
    "<tr><td>晶片風險升級</td><td>SMH &lt; 518.82 或 QQQ &lt; 661.66（週度 -1SD）</td><td class='num'>529.60／675.49</td><td>降低半導體與高 beta 1/3。</td></tr>",
    "<tr><td>AMD 風控</td><td>收回 472.55</td><td class='num'>454.62</td><td>未收回前不回補已減倉位。</td></tr>",
    "<tr><td>美元壓力</td><td>DXY &gt; 102</td><td class='num'>101.43</td><td>降低科技與高 beta 1/3。</td></tr>",
    "<tr><td>波動升級</td><td>VIX &gt; 20 或五項分數 ≥4/5</td><td class='num'>19.08；3/5</td><td>總風險降低 1/3。</td></tr>",
    "<tr><td>長債突破</td><td>TLT &gt; 84.25 且 QQQ 同步站回前一日高點</td><td class='num'>84.24</td><td>兩項同時成立才小幅回補成長。</td></tr>",
    "<tr><td>事件風險</td><td>FOMC 14:00 ET；MSFT／META 盤後</td><td class='num'>尚未公布</td><td>事件前不把盤後反彈視為趨勢反轉。</td></tr>",
    "</tbody></table></div>",
  ].join(""),
  next_conclusion: "下一交易日先管 FOMC 與大型科技財報風險。科技升級必須看到 QQQ／SMH 收復 20MA；下檔則以 QQQ 661.66、SMH 518.82、VIX 20、DXY 102 作機械風控。",
  cross_validation: "<div class='callout danger'><strong>共同確認：</strong>QQQ／SMH 低於 20／50MA、記憶體與設備鏈大跌、AMD 跌破 -1SD，三組訊號一致確認科技去風險。</div><div class='callout warn'><strong>重要分歧：</strong>三大指數均線廣度改善，但 Stockbee 5D／10D 仍低於 1；同時 SPY／RSP 上漲而 QQQ 下跌。這是風格輪動，不是全面多頭或全面空頭。</div><div class='callout'><strong>主線結論：</strong>保留防禦與價值相對強勢，科技持倉低於基準；只有價格、均線、廣度三者同步改善，才把當前輪動升級為全面 risk-on。</div>",
  sources: [
    "<a href='https://ae.marketscreener.com/news/us-stocks-rebound-ahead-fed-decision-tech-earnings-ce7f51d2d988f620'>Reuters：7/28 美股收盤與利率背景</a>",
    "<a href='https://www.prnewswire.com/news-releases/us-consumer-confidence-edged-down-in-july-302836484.html'>Conference Board：7月消費者信心</a>",
    "<a href='https://www.housingwire.com/articles/case-shiller-real-prices-may/'>Case-Shiller 20城房價</a>",
    "<a href='https://www.advisorperspectives.com/dshort/updates/2026/07/28/richmond-manufacturing-index-mostly-flat-activity-in-july'>Richmond Fed 製造業</a>",
    "<a href='https://es.investing.com/currencies/us-dollar-index-historical-data'>DXY 歷史資料</a>",
    "<a href='https://mx.investing.com/indices/volatility-s-p-500-historical-data'>VIX 歷史資料</a>",
    "<a href='https://investors.nxp.com/news-releases/news-release-details/nxp-semiconductors-reports-second-quarter-2026-results/'>NXP 官方財報</a>",
    "<a href='https://ir.kla.com/news-events/press-releases/detail/518/kla-corporation-reports-fiscal-2026-fourth-quarter-and-full'>KLA 官方財報</a>",
    "<a href='https://www.marketbeat.com/earnings/reports/2026-7-28-visa-inc-stock/'>Visa 財報數據</a>",
    "<span>長橋 OpenAPI：72 檔收盤快照、44 檔 Thematic、24 檔 Macro 與盤後報價；Google Sheets：Market Breadth、Stockbee、Weekly Expected Move。</span>",
  ].join("；"),
};

if (thematic.rows.length !== 44 || thematic.errors.length !== 0) {
  throw new Error(`Thematic Sectors 必須為 44／44、錯誤 0；目前 ${thematic.rows.length}／44、錯誤 ${thematic.errors.length}`);
}
if (thematicRows.length !== 45 || thematicRows.filter((row) => row.label === "SPY").length !== 1) {
  throw new Error("Thematic Sectors 報告必須為完整 44 檔加一列 SPY 基準");
}

fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(output);
