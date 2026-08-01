#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const snapshot = read("../postmarket_snapshot_2026-07-31.json");
const market = read("../market_rsi_longport.json");
const thematic = read("../thematic_rsi_longport_2026-07-31.json");
const macro = read("../macro_rsi_longport.json");
const postmarket = read("data/2026-07-31-postmarket.json");

const expectedDate = "2026-07-31";
for (const [name, source] of [["長橋收盤快照", snapshot], ["Sector Dashboard", market], ["Thematic Sectors", thematic], ["Macro", macro]]) {
  if ((source.errors || []).length) throw new Error(`${name} 仍有取數錯誤：${JSON.stringify(source.errors)}`);
  const rows = source.rows || [];
  if (!rows.length || rows.some((row) => row.asOf !== expectedDate)) throw new Error(`${name} 不是完整的 ${expectedDate} 收盤資料。`);
}
if (snapshot.rows.length !== 75 || market.rows.length !== 18 || thematic.rows.length !== 44 || macro.rows.length !== 32) {
  throw new Error(`來源列數異常：snapshot=${snapshot.rows.length}, market=${market.rows.length}, thematic=${thematic.rows.length}, macro=${macro.rows.length}`);
}

const snap = new Map(snapshot.rows.map((row) => [row.ticker, row]));
const macroMap = new Map(macro.rows.map((row) => [row.key, row]));
const byTicker = (ticker) => {
  const row = snap.get(ticker);
  if (!row) throw new Error(`缺少 ${ticker} 收盤資料。`);
  return row;
};
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixed = (value, digits = 2) => Number(value).toFixed(digits);
const signed = (value, digits = 2) => `${Number(value) >= 0 ? "+" : ""}${fixed(value, digits)}%`;
const tone = (value) => Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
const pct = (value) => `<span class="${tone(value)}">${signed(value)}</span>`;
const cell = (value) => `<td>${value}</td>`;
const num = (value) => `<td class="num">${value}</td>`;
const table = (headers, rows, classes = "report-data-table", attrs = "") => `<div class="table-scroll"><table class="${classes}" ${attrs}><thead><tr>${headers.map((h) => `<th${h.num ? ' class="num"' : h.ma ? ' class="ma-heading"' : h.result ? ' class="result-heading"' : ""}>${h.label}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

function maState(period, above) {
  return `<span class="ma-state ${above ? "ma-up" : "ma-down"}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${above ? "▲" : "▼"}</span></span>`;
}
function maCell(row) {
  const a20 = row.above20 ?? row.aboveMa20;
  const a50 = row.above50 ?? row.aboveMa50;
  const a200 = row.above200 ?? row.aboveMa200;
  return `<td class="ma-cell"><div class="ma-indicators">${maState(20, a20)}${maState(50, a50)}${maState(200, a200)}</div></td>`;
}
function rsiCell(value) {
  const cls = value >= 70 ? " hot" : value <= 30 ? " cold" : "";
  return `<td class="num"><span class="rsi${cls}"><i><b style="width:${Math.max(0, Math.min(100, Math.round(value)))}%"></b></i>${fixed(value)}</span></td>`;
}
function technicalJudgment(row) {
  const a20 = row.above20 ?? row.aboveMa20;
  const a50 = row.above50 ?? row.aboveMa50;
  const a200 = row.above200 ?? row.aboveMa200;
  if (row.rsi14 >= 70) return "RSI 過熱，趨勢強但不追價。";
  if (a20 && a50 && a200) return "三條均線上方，趨勢完整。";
  if (!a20 && !a50 && !a200) return "三條均線下方，趨勢偏弱。";
  if (!a20 && !a50 && a200) return "短中線承壓，長期趨勢尚在。";
  if (!a20 && a50 && a200) return "跌破 20MA，仍有中期支撐。";
  if (a20 && !a50 && a200) return "短線反彈，尚未收回 50MA。";
  return "均線結構分歧，等待確認。";
}
function etfTable(title, rows, attrs = "") {
  const sorted = [...rows].sort((a, b) => b.rsi14 - a.rsi14);
  const body = sorted.map((row) => `<tr>${cell(esc(row.ticker))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${num(pct(row.distanceFrom52wHighPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(technicalJudgment(row))}</tr>`);
  return `<div class="etf-group"><h3>${title}</h3>${table([
    { label: "ETF" }, { label: "5日", num: true }, { label: "1月", num: true }, { label: "距52週高", num: true },
    { label: "20/50/200MA", ma: true }, { label: "RSI", num: true }, { label: "判斷" },
  ], body, "ma-table report-data-table report-cols-7 weekly-etf-table", attrs)}</div>`;
}
function indexRows() {
  return ["DIA", "SPY", "IWM", "QQQ"].map(byTicker).sort((a, b) => b.rsi14 - a.rsi14).map((row) => {
    let judgment = technicalJudgment(row);
    if (row.ticker === "QQQ") judgment = "5日小漲但仍低於 20／50MA，月線 -5.13%。";
    if (row.ticker === "IWM") judgment = "5日近乎持平且低於 20／50MA，小型股未接棒。";
    if (row.ticker === "SPY") judgment = "守住 20／50MA，價格修復快於廣度。";
    if (row.ticker === "DIA") judgment = "三條均線上方，道指維持防守緩衝。";
    return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(judgment)}</tr>`;
  });
}
function chartRows(rows) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)));
  return rows.map((row) => {
    const width = Math.max(2, Math.round(Math.abs(row.value) / max * 48));
    const side = row.value >= 0 ? "pos" : "neg";
    return `<div class="bar-row"><span class="lbl">${row.label}</span><span class="val ${side}">${signed(row.value)}</span><div class="bar-track" style="--zero:50%"><span class="b ${side}" style="width:${width}%"></span></div></div>`;
  }).join("");
}
function resultBadge(kind) {
  const map = { "命中": "result-hit", "失誤": "result-miss", "部分命中": "result-partial", "已觸發": "result-partial", "未觸發": "result-not-triggered" };
  return `<span class="result-badge ${map[kind] || "result-not-triggered"}">${kind}</span>`;
}

const sectorTickers = ["XLF", "XLE", "XLV", "XLY", "XLP", "XLRE", "XLI", "XLK", "XLC", "XLB", "XLU", "SPY"];
const sectorRows = sectorTickers.map((ticker) => market.rows.find((row) => row.ticker === ticker) || byTicker(ticker));
const spyForThematic = { ...byTicker("SPY"), aboveMa20: true, aboveMa50: true, aboveMa200: true };
const thematicRows = [...thematic.rows, spyForThematic];

const winners = [...snapshot.rows].filter((row) => !["SPY", "QQQ", "IWM", "DIA", "RSP", "QQQE", "VIXY"].includes(row.ticker)).sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5);
const losers = [...snapshot.rows].filter((row) => !["SPY", "QQQ", "IWM", "DIA", "RSP", "QQQE", "VIXY"].includes(row.ticker)).sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5);
const moverTable = (title, rows, direction) => `<h3>${title}</h3>${table([
  { label: "股票" }, { label: "5日", num: true }, { label: "1月", num: true }, { label: "20/50/200MA" }, { label: "讀法" },
], rows.map((row) => `<tr>${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${cell(direction === "up" ? "強勢集中於大型雲端／軟體與財報反應。" : "半導體／記憶體供應鏈承壓，尚未形成修復。")}</tr>`), "ma-table report-data-table report-cols-5")}`;

const previousRules = [
  ["科技回補確認", "QQQ >50MA 718.29 且 SMH >50MA 598.88；NDX >20MA >45% 與 Stockbee 5D >1 至少再滿足一項。", "QQQ 687.99、SMH 540.53；NDX 53.39%，5D ratio 0.98。", "未觸發", "價格線未收回，不能只憑 NDX 廣度改善回補科技。"],
  ["綜合廣度確認", "SPX／NDX／IWM >20MA 至少兩項過 60%／45%／50%，且 5D ratio >1、4%上漲多於下跌。", "53.28%／53.39%／43.93%；0.98；177／214。", "未觸發", "只有 NDX 過線，整體 risk-on 未成立。"],
  ["大盤低點風控", "SPY <737.29（7/24 低點）。", "SPY 收 747.03。", "未觸發", "總風險毋須再降 1/3。"],
  ["大盤修復", "SPY >50MA 745.07 且 VIX <17.5。", "SPY 747.03；VIX 15.99。", "命中", "價格修復成立，但廣度未同步，取消一級降倉而非全面加倉。"],
  ["波動升級", "VIX >20。", "VIX 15.99；五項波動分數 0/5。", "未觸發", "不追加波動風控。"],
  ["美元／利率壓力", "DXY >101.50 且 10Y >4.75%。", "DXY 99.79；10Y 4.75%。", "未觸發", "美元回落抵消部分長端壓力；複合條件未成立。"],
  ["能源強勢失效", "USO <50MA 125.38。", "USO 129.17；新 50MA 123.30。", "未觸發", "能源事件倉可持有，但月線 +25.08% 不追價。"],
  ["等權防守失效", "RSP <50MA 210.06 且 DIA <50MA 514.56。", "RSP 215.01；DIA 524.32。", "未觸發", "等權與道指緩衝仍在。"],
  ["財報擴散確認", "MSFT／META／AMZN 後 QQQ >718.29 且 NDX >20MA >45%。", "MSFT／AMZN 五日 +21.75%／+17.00%，NDX 53.39%，但 QQQ 687.99。", "部分命中", "大型雲端財報強，但半導體分化令 QQQ 未收回價格線。"],
];
const previousTable = table([
  { label: "上週規則／監控項" }, { label: "原門檻" }, { label: "本週結果" }, { label: "分類", result: true }, { label: "修正／備註" },
], previousRules.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}<td class="result-cell">${resultBadge(row[3])}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5");

const breadthRows = postmarket.breadth_rows.map((row) => {
  const indicator = row.indicator.replace(/（(?:7\/31|Stockbee 7\/31)）/, "").replace("5D ratio", "Stockbee 5D ratio").replace("10D ratio", "Stockbee 10D ratio");
  const latest = typeof row.latest === "number" && row.percent ? `${fixed(row.latest)}%` : row.latest;
  return `<tr>${cell(indicator)}${num(latest)}${cell(row.five_day)}${cell(row.one_month)}${cell(row.judgment)}</tr>`;
});

const atrTickers = ["MSFT", "AMZN", "FXI", "XOP", "DIA", "RSP", "SPY", "IWM", "QQQ", "SMH", "NVDA", "TLT"];
const atrRows = atrTickers.map((ticker) => snap.get(ticker) || macroMap.get(ticker)).filter(Boolean).sort((a, b) => (b.extension50Atr ?? b.distance50Atr) - (a.extension50Atr ?? a.distance50Atr)).map((row) => {
  const ext = row.extension50Atr ?? row.distance50Atr;
  const ticker = row.ticker || row.key;
  const judgment = ext > 2 ? "正向延伸偏高，不追價。" : ext < -3 ? "負向延伸極端，等價格確認而非摸底。" : ext < -1 ? "低於 50MA，反彈仍需確認。" : "延伸仍在可控範圍。";
  return `<tr>${cell(ticker)}${num(fixed(row.close))}${num(fixed(row.ma50))}${num(fixed(row.atr14))}${num(`${ext >= 0 ? "+" : ""}${fixed(ext)}`)}${cell(judgment)}</tr>`;
});

const bondRows = ["SHY", "IEF", "TLT"].map((key) => macroMap.get(key));
const crossAssetRows = [
  ["DXY", "99.79", "-1.49%", "約 -1.35%", "美元週線回落，沒有觸發 >101.50 的科技減碼線。"],
  ["美國 2 年債殖利率", "4.28%", "-5bp", "—", "短端回落，市場沒有完全跟隨 FOMC 偏鷹訊號。"],
  ["美國 10 年債殖利率", "4.75%", "+6bp", "—", "長端上行，10s2s 由 +36bp 擴至 +47bp。"],
  ["美國 30 年債殖利率", "5.27%", "+11bp", "—", "長端升幅最大，期限溢價與財政風險壓力明顯。"],
  ...bondRows.map((row) => [row.key, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), row.key === "SHY" ? "短債正報酬，資金偏好短久期。" : row.key === "IEF" ? "中期債小跌，低於三條均線。" : "長債五日 -1.20%，低於 50MA 4.06 ATR。"]),
  ["USO", fixed(byTicker("USO").close), signed(byTicker("USO").fiveDayPct), signed(byTicker("USO").oneMonthPct), "五日回吐但月線仍 +25.08%，通膨尾端未解除。"],
  ["GLD", fixed(byTicker("GLD").close), signed(byTicker("GLD").fiveDayPct), signed(byTicker("GLD").oneMonthPct), "金價近乎持平，未顯示流動性恐慌。"],
  ["SLV", fixed(byTicker("SLV").close), signed(byTicker("SLV").fiveDayPct), signed(byTicker("SLV").oneMonthPct), "三條均線下方，貴金屬內部分化。"],
  ["CPER", fixed(byTicker("CPER").close), signed(byTicker("CPER").fiveDayPct), signed(byTicker("CPER").oneMonthPct), "銅價週月同升，需求端未確認衰退。"],
];

const macroRows = [
  ["FOMC 目標區間", "3.50%–3.75%", "維持", "3.50%–3.75%", "9 比 3 維持；三位反對票主張升息 25bp，前瞻指引縮減。"],
  ["9/16 FOMC 市場定價", "升至 3.75%–4.00%：66.1%", "維持：33.9%", "上週升息機率 54.5%", "會後升息定價上升，但短端殖利率反而回落，政策與市場訊號分歧。"],
  ["第二季 GDP 年化", "1.5%", "2.1%", "4.3%", "總量低於預期，但私人國內最終銷售 3.9%，不是單純衰退訊號。"],
  ["核心 PCE 月率／年率", "0.1%／3.3%", "0.2%／3.3%", "0.3%／3.4%", "月率低於預期、年率符合預期，通膨改善但仍高於目標。"],
  ["GDP 價格指數", "6.3%", "3.6%", "2.1%", "價格分項偏熱，限制市場把 GDP miss 解讀成全面寬鬆。"],
  ["初領／續領失業金", "19.7萬／178.2萬", "20.5萬／181.0萬", "20.8萬／180.2萬", "勞動市場讀數優於預期，沒有衰退式惡化。"],
  ["就業成本指數", "0.9%", "0.8%", "0.9%", "薪資成本略熱，長端利率仍有支撐。"],
];

const eventRows = [
  ["8/3 10:00", "ISM 製造業", "待公布", "—", "新訂單、價格支付與就業分項。"],
  ["8/3 盤後", "PLTR 財報", "待公布", "—", "政府／商業收入與 AI 需求能否延續。"],
  ["8/4 08:30／10:00", "貿易帳／JOLTS／工廠訂單", "待公布", "—", "GDP 後確認需求與職缺是否同步降溫。"],
  ["8/4 盤後", "AMD 財報", "待公布", "—", "資料中心、AI GPU 與毛利率；晶片風格的關鍵驗證。"],
  ["8/5 08:15／10:00", "ADP／ISM 服務業", "待公布", "—", "服務業就業與價格壓力。"],
  ["8/5 盤前", "UBER 財報", "待公布", "—", "訂單、利潤率與消費韌性。"],
  ["8/6 08:30", "初領失業金／生產力", "待公布", "—", "勞動需求與單位勞工成本。"],
  ["8/7 08:30", "7月非農就業報告", "待公布", "6月 +5.7萬", "薪資、失業率與前值修訂將主導短端利率。"],
];

const scenarioRows = [
  ["基準：局部輪動延續", 45, "ISM 與就業降溫但不失速；10Y 維持 4.65%–4.80%，DXY 留在 99.0–101.5。", "SPY 守 50MA 744.21、在 758.42 前高下整理；QQQ 測試 20MA 701.02，但 IWM 與整體廣度只緩慢修復。", "XSW／IGV 相對領先；金融與能源保留強度；SMH 在 AMD 後仍需收回 571.63 才算接棒。", "核心曝險維持中性；軟體／金融以相對強勢持有，晶片只做事件倉。"],
  ["偏多：軟著陸與廣度擴散", 25, "非農溫和、薪資月率不高於 0.3%，ISM 價格分項降溫；10Y <4.65%、DXY <99.0。", "QQQ >701.02、SMH >571.63；SPX／NDX／IWM 20MA 廣度至少兩項過 60%／55%／50%，Stockbee 5D >1。", "軟體強勢擴散至晶片、AI 與小型股；XLK／SMH 改善，RSP／IWM 不再落後 SPY。", "科技與高 beta 回補 1/3；QQQ／SMH 再收回 50MA 714.75／596.17 才恢復標準部位。"],
  ["偏空：通膨／長端再定價", 20, "非農或薪資明顯偏熱、ISM 價格上升；10Y >4.80% 且 DXY >101.50。", "SPY 跌破 744.21、QQQ／IWM 持續低於 20／50MA；NDX 20MA 廣度回落至 45% 以下。", "長久期科技、晶片、房屋與清潔能源承壓；能源可能相對抗跌，金融則取決於信用利差是否穩定。", "科技與高 beta 降低 1/3；停止追價 MSFT／AMZN，保留現金與短久期債。"],
  ["尾端：成長失速", 10, "非農接近零或大幅下修、ISM 服務業跌破 50、初領與續領同步惡化。", "2Y／10Y 同步急跌，但 IWM、XLF 與市場廣度先轉弱；QQQ 可能因利率下行反彈，卻缺乏成分股確認。", "XLV／XLP 與高品質大型股相對抗跌；XLF、XLE、IWM 與週期股落後；TLT／GLD 反彈。", "不把利率下跌直接視為 risk-on；降低週期與小型股，等待 Stockbee 5D >1 和信用風險穩定。"],
];
const scenarioTable = table([
  { label: "下週情境" }, { label: "主觀概率", num: true }, { label: "宏觀／跨資產觸發" }, { label: "指數／廣度預測" }, { label: "板塊／主題預測" }, { label: "交易動作" },
], scenarioRows.map((row) => `<tr>${cell(row[0])}<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`), "scenario-table report-data-table report-cols-6");

const linkageRows = [
  ["大盤 ETF", "SPY 以 744.21–758.42 整理；DIA 維持相對韌性，QQQ／IWM 仍落後。", "QQQ >701.02、IWM >293.99，且 DIA／SPY 守住 20MA。", "SPY <744.21 且 VIX >17.5；IWM <50MA 292.26。"],
  ["市場廣度", "NDX 短線改善、SPX／IWM 中性偏弱；Stockbee 5D 在 0.90–1.05 附近。", "三大 20MA 廣度至少兩項過 60%／55%／50%，5D >1 且 4% 上漲多於下跌。", "NDX <45%、IWM <40%，或 Stockbee 5D <0.75。"],
  ["S&P 500 Sector", "XLF／XLE 保持 RSI 領先；XLY 反彈後進入確認，XLK 尚未重返領導。", "XLK 收回 20／50MA，且 XLY／XLI 與 RSP 同步轉強。", "XLK／XLC 再弱且 XLF 信用敏感股同步下跌，代表壓力由科技擴散。"],
  ["Thematic／財報", "XSW／IGV 延續相對強勢；AMD 決定 SMH、SNDK、MU 是否止跌，PLTR 驗證 AI 軟體估值。", "AMD 後 SMH >571.63、NDX 廣度 >55%；PLTR 上漲且 XSW／IGV 不回吐。", "SMH <540.53、SNDK／MU 再破低；軟體財報 Beat 但股價下跌。"],
  ["長短債／DXY", "2Y 偏穩、10Y 在 4.65%–4.80%；曲線維持陡峭，長債弱於短債。", "10Y <4.65%、TLT 收回 20MA 83.88，且 DXY <99.0。", "10Y >4.80%、TLT 續低於 50MA 4 ATR，且 DXY >101.50。"],
  ["商品與防守資產", "USO 保持月線強勢但不追價；CPER 偏強，GLD／SLV 仍缺乏趨勢確認。", "CPER 與 IWM 同升確認需求；GLD／TLT 同升且 VIX 不升，代表良性降息交易。", "USO >140 且 10Y 上升是通膨風險；CPER／IWM 同跌則轉向成長失速。"],
];
const linkageTable = table([
  { label: "上文模組" }, { label: "基準預測" }, { label: "偏多確認" }, { label: "偏空／失效" },
], linkageRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}${cell(row[3])}</tr>`), "scenario-linkage-table report-data-table report-cols-4");

const marketScoreRows = [
  ["四大 ETF 技術", "6/16", "20%", 8, 20, "每檔以 5日<0、1月<0、低於20MA、低於50MA 各計 1 點：DIA 0/4、SPY 0/4、IWM 3/4、QQQ 3/4。"],
  ["市場廣度", "9/10", "20%", 18, 20, "SPX 2/2、NDX 1/2、IWM 2/2、T2108 1/1、Stockbee 3/3；分數越高代表廣度風險越大。"],
  ["VIX 波動", "0/5", "10%", 0, 10, "VIX >20 0/1；VIXY 5日>0、1月>0、高於20MA、高於50MA均為 0/1。"],
  ["板塊／主題動能", "28/54", "15%", 8, 15, "11 個 Sector 加 43 個 Thematic；5日<0、低於20MA、RSI<50 三項中至少兩項成立即列弱勢。"],
  ["50MA ATR 延伸", "4/18", "10%", 2, 10, "固定 18 檔跨資產 ETF 中，XLF、XLE、XLV、TLT 距 50MA 的絕對值達 2 ATR。"],
  ["跨資產壓力", "3/4", "15%", 11, 15, "DXY 五日>0 為 0/1；10Y 五日上升、TLT 低於50MA、USO 一月>0 各為 1/1。"],
  ["宏觀／事件風險", "3/3", "10%", 10, 10, "下週非農、AMD／PLTR 財報與 FOMC 後利率路徑再定價三個高影響窗口均成立。"],
];
const marketScoreTable = table([
  { label: "評分維度" }, { label: "原始風險", num: true }, { label: "權重", num: true }, { label: "風險分", num: true }, { label: "量化依據" },
], marketScoreRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3]}" data-max-score="${row[4]}">${row[3]}/${row[4]}</td>${cell(row[5])}</tr>`), "market-score-table report-data-table report-cols-5");

const monitorRows = [
  ["科技價格修復", "QQQ >20MA 701.02 且 SMH >20MA 571.63", "687.99／540.53", "科技回補 1/3；兩者再收回 50MA 才恢復標準部位。"],
  ["綜合廣度確認", "SPX／NDX／IWM >20MA 至少兩項過 60%／55%／50%，且 Stockbee 5D >1", "53.28%／53.39%／43.93%；0.98", "允許擴大新倉與高 beta。"],
  ["大盤風控", "SPY <50MA 744.21 且 VIX >17.5", "747.03／15.99", "總風險降低 1/3。"],
  ["廣度失速", "NDX >20MA <45% 且 Stockbee 5D <0.75", "53.39%／0.98", "科技與高 beta 降低 1/3。"],
  ["波動升級", "VIX >20 或五項波動分數 >=4/5", "15.99；0/5", "降低大盤曝險並停止追價。"],
  ["美元／長端壓力", "DXY >101.50 且 10Y >4.80%", "99.79／4.75%", "科技與高 beta 再降低 1/3。"],
  ["能源強勢失效", "USO <50MA 123.30", "129.17", "能源事件倉降低 1/2。"],
  ["等權防守失效", "RSP <50MA 211.05 且 DIA <50MA 516.39", "215.01／524.32", "擴大至全面大盤防守。"],
  ["晶片財報確認", "AMD 財報後 SMH >20MA 571.63 且 NDX >20MA >55%", "540.53／53.39%", "確認晶片接棒，否則把軟體反彈視為局部輪動。"],
];

const sources = `<ul><li>長橋 API：7/31 收盤、日線、20／50／200MA、RSI(14)、ATR(14)、52週高；75 檔收盤快照、18 檔 Sector Dashboard、44 檔 Thematic Sectors、32 檔 Macro，錯誤均為 0。</li><li>Market Watch Google Sheet：7/31 的 Sector Dashboard、Thematic Sectors 與 Macro 三張主表；報告 RSI 依長橋同日收盤重算並排序。</li><li>Market Breadth／Stockbee：7/31 的三大指數 20／50MA 廣度、T2108、5D／10D ratio、4% 漲跌家數及季度強弱股。</li><li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value=2026" target="_blank" rel="noopener">美國財政部每日國債殖利率</a>：7/24 與 7/31 收盤。</li><li><a href="https://www.investing.com/central-banks/fed-rate-monitor" target="_blank" rel="noopener">CME FedWatch 衍生的利率機率</a>：7/31 15:05 ET；<a href="https://www.newyorkfed.org/research/calendars/nationalecon_cal" target="_blank" rel="noopener">紐約聯儲經濟日曆</a>、<a href="https://www.bls.gov/schedule/news_release/empsit.htm" target="_blank" rel="noopener">BLS 就業日曆</a>。</li><li>DXY：外部 7/31 正式收盤 99.789；7/24 收盤 101.302。盤中讀數不作週報收盤基準。</li></ul>`;

const report = {
  report_title: "2026-07-31 美股一週總結｜價格修復但廣度未跟，長端利率重新施壓",
  report_type: "weekly",
  week: "2026-07-27–2026-07-31",
  source_dates: { longbridge: expectedDate, market_watch_sheet: expectedDate, market_breadth_sheet: expectedDate, stockbee_sheet: expectedDate, treasury: expectedDate, dxy: expectedDate },
  qqq_reengage_20ma: "701.02",
  qqq_breakout_add_1sd: "714.75",
  report_eyebrow: "2026-08-01｜美股週報｜資料截至 2026-07-31 收盤",
  report_heading: "美股一週總結：價格修復但廣度未跟，長端利率重新施壓",
  data_timestamp_note: "長橋與三張主表均凍結於 7/31 收盤；DXY 與美債使用正式收盤資料。週報先生成本地草稿，經確認後才發布。",
  report_badges: `<span class="badge amber">風險：Intermediate</span><span class="badge blue">SPY +1.10%</span><span class="badge green">DXY -1.49%</span><span class="badge red">10Y +6bp</span><span class="badge grey">VIX 分數 0/5</span>`,
  summary_cards: `<div class="card"><span>SPY／QQQ</span><strong><span class="up">+1.10%</span>／<span class="up">+0.55%</span></strong><small>價格反彈，但 QQQ 仍低於 20／50MA。</small></div><div class="card"><span>軟體／晶片</span><strong><span class="up">XSW +7.79%</span>／<span class="dn">SMH -3.68%</span></strong><small>本週最清楚的風格分化。</small></div><div class="card"><span>2Y／10Y／30Y</span><strong><span class="up">-5bp</span>／<span class="dn">+6bp</span>／<span class="dn">+11bp</span></strong><small>曲線陡峭化，長端折現率壓力上升。</small></div><div class="card"><span>SPX／NDX／IWM &gt;20MA</span><strong>53.28%／53.39%／43.93%</strong><small>NDX 改善，SPX 與 IWM 降溫。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才成立：以下三項至少兩項成立，才從 Intermediate 轉向偏進攻。",
  upgrade_trigger_1: "QQQ 收回 20MA 701.02，且 SMH 收回 20MA 571.63。",
  upgrade_trigger_2: "SPX／NDX／IWM 20MA 廣度至少兩項過 60%／55%／50%，Stockbee 5D ratio 同時 >1。",
  upgrade_trigger_3: "AMD 財報後晶片不再落後，且 QQQ／QQQE 同步轉強。",
  downgrade_trigger_rule: "任一觸發即成立：任一複合風控成立即降級，不等待第二項確認。",
  downgrade_trigger_1: "SPY 跌破 50MA 744.21，且 VIX 升破 17.5。",
  downgrade_trigger_2: "DXY >101.50 且 10Y >4.80%，科技與高 beta 再減 1/3。",
  downgrade_trigger_3: "NDX >20MA 廣度 <45%，且 Stockbee 5D ratio <0.75。",
  core_conclusions: `<ol><li><strong>價格修復不等於全面 risk-on。</strong>SPY／DIA 五日 +1.10%／+1.07%，但 IWM 近乎持平；SPX 與 IWM 20MA 廣度降至 53.28%／43.93%。</li><li><strong>軟體／雲端接棒，晶片／記憶體繼續去風險。</strong>XSW／IGV 五日 +7.79%／+7.50%，SMH -3.68%；SNDK、KLAC、MU 分別 -15.43%、-13.16%、-10.63%。</li><li><strong>Fed 訊號偏鷹，但市場定價分裂。</strong>FOMC 以 9 比 3 維持 3.50%–3.75%，三位反對票主張升息；9 月升息機率升至 66.1%，然而 2 年期殖利率本週反而下降 5bp。</li><li><strong>真正的宏觀壓力在長端。</strong>10 年期升 6bp、30 年期升 11bp，10s2s 曲線由 +36bp 擴至 +47bp；TLT 五日 -1.20% 且低於 50MA 4.06 ATR。</li><li><strong>下週是廣度與晶片的交叉驗證。</strong>AMD、PLTR 與非農會決定軟體反彈能否擴散；若 QQQ／SMH 不收回 20MA，維持選股而非追逐指數。</li></ol>`,
  weekly_positioning: `<h3>市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>市場風險分數</span><strong>57<small>/100</small></strong><em>Intermediate</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:57%"></span></div><p>指數價格修復與低 VIX 降低尾端風險；廣度轉弱、晶片落後及長端利率上行限制加倉。</p><small>0–34 Low Risk；35–59 Intermediate Risk；60–100 High Risk。各分項以原始風險比例乘權重後四捨五入。</small></div></div>${marketScoreTable}<div class="callout warn"><strong>分數反算：</strong>8 + 18 + 0 + 8 + 2 + 11 + 10 = 57。最大風險來自市場廣度與長端／跨資產壓力；VIX 仍是主要緩衝。57 分代表中等風險上緣，不等於全面看空。</div><div class="action-directive"><span class="ad-label">本週配置</span><ul class="ad-list"><li class="ad-primary">核心曝險維持中性，優先軟體／雲端與金融的相對強勢，不追已延伸的大型財報贏家。</li><li class="ad-watch">晶片等 AMD 財報與 SMH 20MA 571.63 雙確認；未確認前只做事件倉。</li><li class="ad-avoid">避免把 SPY 單週反彈誤判成全面廣度修復。</li></ul></div>`,
  previous_week_reconciliation: `<div class="status-pills"><span class="badge green">1 命中</span><span class="badge amber">1 部分命中</span><span class="badge red">0 失誤</span><span class="badge grey">7 未觸發</span></div>${previousTable}<div class="callout warn"><strong>對賬結論：</strong>上週唯一完整命中是 SPY 收回 50MA 且 VIX 低於 17.5；財報擴散只有部分成立。廣度、晶片與 QQQ 價格線都未確認，所以只能取消一級降倉，不能直接升為全面 risk-on。</div>`,
  indices_style_review: `${table([{label:"ETF"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}], indexRows(), "ma-table report-data-table report-cols-7 index-summary-table")}<p><strong>小結：</strong>四大 ETF 只有 SPY／DIA 站在三條均線上方；QQQ／IWM 仍低於 20／50MA。價格領先、廣度落後的結構要求保留確認條件。</p>`,
  big_winners_losers: `${moverTable("本週五大強勢股", winners, "up")}${moverTable("本週五大弱勢股", losers, "down")}<p><strong>NVDA 補充：</strong>五日 -2.94%，收 200.75，低於 20MA 203.30 與 50MA 206.12；晶片主線尚未跟上軟體反彈。</p>`,
  sector_momentum_chart: chartRows([{label:"XSW",value:7.79},{label:"IGV",value:7.50},{label:"XLY",value:6.11},{label:"CIBR",value:3.88},{label:"SMH",value:-3.68},{label:"TAN",value:-3.80},{label:"WGMI",value:-3.97},{label:"XHB",value:-4.38}]),
  sector_thematic_weekly: `${etfTable("S&amp;P 500 Sector ETF", sectorRows)}${etfTable("Thematic Sector ETF", thematicRows, `data-etf-universe="thematic-complete" data-source-count="${thematic.rows.length}" data-report-count="${thematicRows.length}" data-benchmark="SPY" data-sort="rsi-desc"`)}<p><strong>小結：</strong>Sector 以能源／金融 RSI 居前，但本週最強動能來自 XLY；Thematic 則由 FXI／KWEB 與軟體領先。兩張表均含 SPY 基準並依 RSI 由高至低排序。</p>`,
  market_breadth_weekly: `${table([{label:"指標"},{label:"最新",num:true},{label:"5日變化"},{label:"約1月趨勢"},{label:"判斷"}], breadthRows, "report-data-table report-cols-5")}<p><strong>三大指數廣度：</strong>SPX 與 IWM 的 20／50MA 廣度本週同步下降；NDX 的 20MA 廣度由 48.54% 升至 53.39%，但 50MA 廣度仍降到 47.57%。短線只有科技局部改善，中期三者都未形成一致擴散。</p><p><strong>與 Stockbee 交叉驗證：</strong>Stockbee 5D／10D ratio 回升至 0.98／0.91，顯示拋壓收斂；但仍低於 1，4% 上漲／下跌為 177／214，季度 +25%／-25% 為 1172／1233，尚未確認強股重新佔優。</p><div class="callout warn"><strong>綜合結論：</strong>短線由極弱修復到中性偏弱，中期仍是價格強於廣度。SPY 上漲不能單獨推導全面 risk-on；需等三大指數廣度至少兩項過線且 Stockbee 5D >1。</div>`,
  atr_weekly: `${table([{label:"ETF"},{label:"價格",num:true},{label:"50MA",num:true},{label:"ATR(14)",num:true},{label:"距 50MA ATR",num:true},{label:"判斷"}], atrRows, "report-data-table report-cols-6")}<div class="callout warn"><strong>小結：</strong>MSFT 已高於 50MA 4.08 ATR，TLT 則低於 50MA 4.06 ATR；一端不宜追高，另一端不宜在長端利率尚未確認回落前摸底。</div>`,
  fx_commodities_treasury_weekly: `${table([{label:"資產"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"市場含義"}], crossAssetRows.map((row)=>`<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<div class="callout warn"><strong>長短債比較：</strong>2 年期下降 5bp，但 10 年／30 年期上升 6／11bp，10s2s 曲線一週陡峭 11bp。這不是單純的 Fed 升息交易，而是長端期限溢價、通膨與財政風險重新定價；對高估值科技的壓力高於對短久期資產。</div>`,
  macro_fed_weekly: `${table([{label:"數據／政策"},{label:"Actual",num:true},{label:"Forecast／門檻",num:true},{label:"Previous",num:true},{label:"政策與市場含義"}], macroRows.map((row)=>`<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "macro-review-table report-data-table report-cols-5")}<p><strong>小結：</strong>GDP 低於預期與核心 PCE 月率放緩，對短端偏利多；價格指數、ECI 與三張升息反對票則支撐長端。這種組合最容易造成曲線陡峭化，而不是全期限利率一致下行。</p>`,
  next_week_plan: `${table([{label:"日期（ET）"},{label:"事件"},{label:"Forecast",num:true},{label:"Previous",num:true},{label:"監控重點"}], eventRows.map((row)=>`<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<h3>四種情境與主觀概率</h3><p class="note">以下為依 7/31 價格、廣度、利率與事件窗口形成的條件式預測，不是已知結果；概率會在 ISM、AMD 與非農公布後更新。</p>${scenarioTable}<h3>各模組聯動預測</h3>${linkageTable}<div class="action-directive"><span class="ad-label">執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看利率：</strong>10Y 是否突破 4.80% 或回落至 4.65% 以下，決定科技估值的順風／逆風。</li><li class="ad-watch"><strong>再看財報：</strong>AMD 後以 SMH 571.63 與 NDX 廣度 55% 判斷晶片是否接棒，不只看 AMD 單股漲跌。</li><li class="ad-watch"><strong>最後看非農擴散：</strong>價格反應必須與 SPX／NDX／IWM 廣度及 Stockbee 5D 同步，才調整整體風險。</li><li class="ad-invalidate"><strong>風控優先：</strong>10Y >4.80% 且 DXY >101.50，或 SPY <744.21 且 VIX >17.5，科技與高 beta 降低 1/3。</li></ul></div>`,
  cross_validation_summary: `<div class="callout ok"><strong>互相確認：</strong>MSFT／AMZN 與 XSW／IGV 同步轉強，確認本週反彈核心在雲端與軟體；DIA、RSP 站穩均線，也支持大盤不是全面崩壞。</div><div class="callout warn"><strong>互相分歧：</strong>SPY 上漲、VIX 0/5，但 SPX／IWM 廣度下降；2 年期利率回落，10／30 年期卻上升。價格修復與內部／利率訊號並不一致。</div><div class="callout warn"><strong>主導結論：</strong>Intermediate 的核心不是看空全部市場，而是避免把大型財報股拉動的反彈外推成全面風險偏好。先看 QQQ／SMH 20MA、三大指數廣度與 10Y 是否同步改善。</div>`,
  next_week_monitoring_checklist: table([{label:"訊號名"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}], monitorRows.map((row)=>`<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "weekly-monitor-table report-data-table report-cols-4"),
  sources,
};

const out = path.resolve(root, "data/2026-07-31-weekly.json");
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(out);
