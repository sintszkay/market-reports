#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const raw = read("data/2026-08-07-weekly-longbridge.json");
const adjusted = read("data/2026-08-07-weekly-longbridge-adjusted.json");
const sheet = read("data/2026-08-07-weekly-google-sheet.json");
const expectedDate = "2026-08-07";

for (const [name, source] of [["長橋原始日線", raw], ["長橋前復權日線", adjusted]]) {
  if (source.asOf !== expectedDate || source.errors.length || source.counts.success !== 139) {
    throw new Error(`${name} 未通過完整性檢查。`);
  }
  if (source.rows.some((row) => row.asOf !== expectedDate)) throw new Error(`${name} 含非 ${expectedDate} 收盤資料。`);
}
if (sheet.asOf !== expectedDate || sheet.breadth.length !== 6 || sheet.stockbeeRows.length !== 6) {
  throw new Error("Google Sheets／Stockbee 快照不完整。");
}

const rawMap = new Map(raw.rows.map((row) => [row.ticker, row]));
const adjustedMap = new Map(adjusted.rows.map((row) => [row.ticker, row]));
const byTicker = (ticker) => {
  const price = rawMap.get(ticker);
  const technical = adjustedMap.get(ticker);
  if (!price || !technical) throw new Error(`缺少 ${ticker} 長橋資料。`);
  return {
    ...price,
    ma20: technical.ma20,
    ma50: technical.ma50,
    ma200: technical.ma200,
    above20: technical.above20,
    above50: technical.above50,
    above200: technical.above200,
    rsi14: technical.rsi14,
    atr14: technical.atr14,
    distance50Atr: technical.distance50Atr,
    distanceFrom52wHighPct: technical.distanceFrom52wHighPct
  };
};

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixed = (value, digits = 2) => Number(value).toFixed(digits);
const signed = (value, digits = 2) => `${Number(value) >= 0 ? "+" : ""}${fixed(value, digits)}%`;
const tone = (value) => Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
const pct = (value) => `<span class="${tone(value)}">${signed(value)}</span>`;
const cell = (value) => `<td>${value}</td>`;
const num = (value) => `<td class="num">${value}</td>`;
const table = (headers, rows, classes = "report-data-table", attrs = "") => `<div class="table-scroll"><table class="${classes}" ${attrs}><thead><tr>${headers.map((header) => `<th${header.num ? ' class="num"' : header.ma ? ' class="ma-heading"' : header.result ? ' class="result-heading"' : ""}>${header.label}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

function maState(period, above) {
  return `<span class="ma-state ${above ? "ma-up" : "ma-down"}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${above ? "▲" : "▼"}</span></span>`;
}

function maCell(row) {
  return `<td class="ma-cell"><div class="ma-indicators">${maState(20, row.above20)}${maState(50, row.above50)}${maState(200, row.above200)}</div></td>`;
}

function rsiCell(value) {
  const cls = value >= 70 ? " hot" : value <= 30 ? " cold" : "";
  return `<td class="num"><span class="rsi${cls}"><i><b style="width:${Math.max(0, Math.min(100, Math.round(value)))}%"></b></i>${fixed(value)}</span></td>`;
}

function technicalJudgment(row) {
  if (row.rsi14 >= 70) return "RSI 過熱，趨勢強但不追價。";
  if (row.above20 && row.above50 && row.above200) return "三條均線上方，趨勢完整。";
  if (!row.above20 && !row.above50 && !row.above200) return "三條均線下方，趨勢偏弱。";
  if (!row.above20 && !row.above50 && row.above200) return "短中線承壓，長期趨勢尚在。";
  if (!row.above20 && row.above50 && row.above200) return "跌破 20MA，中期支撐仍在。";
  if (row.above20 && !row.above50 && row.above200) return "短線反彈，尚未收回 50MA。";
  return "均線結構分歧，等待確認。";
}

function etfTable(title, rows, attrs = "") {
  const body = [...rows].sort((a, b) => b.rsi14 - a.rsi14).map((row) => `<tr>${cell(esc(row.ticker))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${num(pct(row.distanceFrom52wHighPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(technicalJudgment(row))}</tr>`);
  return `<div class="etf-group"><h3>${title}</h3>${table([
    {label:"ETF"},{label:"5日",num:true},{label:"1月",num:true},{label:"距52週高",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}
  ], body, "ma-table report-data-table report-cols-7 weekly-etf-table", attrs)}</div>`;
}

function resultBadge(kind) {
  const classes = {"命中":"result-hit","失誤":"result-miss","已觸發":"result-partial","未觸發":"result-not-triggered"};
  return `<span class="result-badge ${classes[kind] || "result-not-triggered"}">${kind}</span>`;
}

function barChart(rows) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)));
  return rows.map((row) => {
    const width = Math.max(2, Math.round(Math.abs(row.value) / max * 48));
    const side = row.value >= 0 ? "pos" : "neg";
    return `<div class="bar-row"><span class="lbl">${row.label}</span><span class="val ${side}">${signed(row.value)}</span><div class="bar-track" style="--zero:50%"><span class="b ${side}" style="width:${width}%"></span></div></div>`;
  }).join("");
}

const sectors = raw.universes.sectors.map(byTicker);
const themes = raw.universes.themes.map(byTicker);
if (sectors.length !== 12 || themes.length !== 45 || !themes.some((row) => row.ticker === "BUG") || !themes.some((row) => row.ticker === "PAVE") || !themes.some((row) => row.ticker === "VOO")) {
  throw new Error(`板塊／主題名單錯誤：Sector ${sectors.length}、Thematic ${themes.length}。`);
}

const indexRows = ["DIA", "SPY", "IWM", "QQQ"].map(byTicker).sort((a, b) => b.rsi14 - a.rsi14).map((row) => {
  const special = {
    SPY: "接近 52 週高，價格與廣度同步修復。",
    DIA: "三條均線上方，防守緩衝仍在。",
    IWM: "本週跟上大盤，小型股廣度升至 63.83%。",
    QQQ: "本週最強但一月近乎持平，仍需守住 50MA。"
  }[row.ticker];
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(special)}</tr>`;
});

const excludedMovers = new Set([...raw.universes.coreTickers, "MSTR"]);
const moverPool = raw.rows.filter((row) => raw.universes.moverCandidates.includes(row.ticker) && !excludedMovers.has(row.ticker));
const winners = [...moverPool].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const losers = [...moverPool].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const moverNotes = {
  RCEL: "財報後市場重估營收指引與現金流改善路徑。",
  COHR: "AI 光通訊需求與財報預期上修共同推動估值重定價。",
  PLTR: "財報與指引上修後延續 AI 軟體領漲。",
  U: "Vector 成長與盈利改善預期帶動財報後跳升。",
  FIGS: "財報超預期與全年指引改善推動強勢缺口。",
  SEZL: "高預期下即使基本面不差，估值與獲利了結壓力仍重。",
  TTD: "成長指引不足以支撐原估值，廣告科技被重新定價。",
  DDOG: "財報 Beat 仍遭賣出，市場把焦點轉向增速與估值門檻。",
  APP: "營收小幅 miss、指引與現金流轉換不及高預期。",
  CAVA: "非核心財報衝擊，但消費成長股風險偏好回落。"
};
const moverTable = (title, rows) => `<h3>${title}</h3>${table([
  {label:"股票"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"市場反饋因子"}
], rows.map((row) => `<tr>${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${cell(moverNotes[row.ticker] || "財報與預期差推動本週重新定價。")}</tr>`), "ma-table report-data-table report-cols-5")}`;

const currentBreadth = sheet.breadth[0];
const priorBreadth = sheet.breadth.at(-1);
const currentStockbee = sheet.stockbeeRows[0];
const priorStockbee = sheet.stockbeeRows.at(-1);
const breadthDefinitions = [
  ["SPX >20MA", currentBreadth.spx20, priorBreadth.spx20, "%"],
  ["SPX >50MA", currentBreadth.spx50, priorBreadth.spx50, "%"],
  ["NDX >20MA", currentBreadth.ndx20, priorBreadth.ndx20, "%"],
  ["NDX >50MA", currentBreadth.ndx50, priorBreadth.ndx50, "%"],
  ["IWM >20MA", currentBreadth.iwm20, priorBreadth.iwm20, "%"],
  ["IWM >50MA", currentBreadth.iwm50, priorBreadth.iwm50, "%"],
  ["Stockbee 5D ratio", currentStockbee.ratio5d, priorStockbee.ratio5d, ""],
  ["Stockbee 10D ratio", currentStockbee.ratio10d, priorStockbee.ratio10d, ""],
  ["4%+ 上漲／下跌", `${currentStockbee.up4}／${currentStockbee.down4}`, `${priorStockbee.up4}／${priorStockbee.down4}`, "pair"],
  ["T2108", currentStockbee.t2108, priorStockbee.t2108, "%"],
  ["34/13 上漲／下跌", `${currentStockbee.up34_13}／${currentStockbee.down34_13}`, `${priorStockbee.up34_13}／${priorStockbee.down34_13}`, "pair"]
];
const breadthRows = breadthDefinitions.map(([label, latest, prior, suffix]) => {
  if (suffix === "pair") return `<tr>${cell(label)}${num(latest)}${num(prior)}${num("—")}${cell(label.startsWith("4%") ? "單日強勢股明顯多於弱勢股。" : "中期上漲股重新多於下跌股。")}</tr>`;
  const change = Number(latest) - Number(prior);
  const latestText = `${fixed(latest)}${suffix}`;
  const priorText = `${fixed(prior)}${suffix}`;
  return `<tr>${cell(label)}${num(latestText)}${num(priorText)}${num(`${change >= 0 ? "+" : ""}${fixed(change)}${suffix === "%" ? "pp" : ""}`)}${cell(change >= 0 ? "較上週改善。" : "較上週惡化。")}</tr>`;
});

const breadthScore = [
  currentBreadth.spx20 < priorBreadth.spx20,
  currentBreadth.spx50 < priorBreadth.spx50,
  currentBreadth.ndx20 < priorBreadth.ndx20,
  currentBreadth.ndx50 < priorBreadth.ndx50,
  currentBreadth.iwm20 < priorBreadth.iwm20,
  currentBreadth.iwm50 < priorBreadth.iwm50,
  currentStockbee.ratio5d < priorStockbee.ratio5d,
  currentStockbee.ratio10d < priorStockbee.ratio10d
].filter(Boolean).length;
const technicalScore = ["SPY", "QQQ", "IWM"].map(byTicker).reduce((score, row) => score + [!row.above20, !row.above50, !row.above200, row.rsi14 < 50].filter(Boolean).length, 0);
const vix = byTicker(".VIX");
const vixy = byTicker("VIXY");
const vixScore = [vix.close > 20, vix.dailyPct > 0, vix.fiveDayPct > 0, vixy.above20, vixy.above50].filter(Boolean).length;

const atrTickers = ["XLF","RSP","DIA","SPY","XLV","NVDA","GLD","XLY","IWM","QQQE","CPER","XLK","XLE","QQQ","SLV","SMH","USO","TLT"];
const atrUniverse = atrTickers.map(byTicker);
const atrExtendedCount = atrUniverse.filter((row) => Math.abs(row.distance50Atr) >= 2).length;
const atrRows = [...atrUniverse].sort((a, b) => b.distance50Atr - a.distance50Atr).map((row) => {
  const ext = row.distance50Atr;
  const judgment = ext >= 3 ? "正向延伸偏高，不追價。" : ext >= 2 ? "正向延伸較高，等待回踩。" : ext <= -2 ? "負向延伸較深，等價格確認。" : "延伸仍在可控範圍。";
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(fixed(row.ma50))}${num(fixed(row.atr14))}${num(`${ext >= 0 ? "+" : ""}${fixed(ext)}`)}${cell(judgment)}</tr>`;
});

const weakUniverse = [...sectors.filter((row) => row.ticker !== "SPY"), ...themes.filter((row) => row.ticker !== "VOO")];
const weakRows = weakUniverse.filter((row) => [row.fiveDayPct < 0, !row.above20, row.rsi14 < 50].filter(Boolean).length >= 2);
const fourEtfRawRisk = ["DIA", "SPY", "IWM", "QQQ"].map(byTicker).reduce((score, row) => score + [row.fiveDayPct < 0, row.oneMonthPct < 0, !row.above20, !row.above50].filter(Boolean).length, 0);
const scoreRows = [
  ["四大 ETF 技術", `${fourEtfRawRisk}/16`, "20%", Math.round(fourEtfRawRisk / 16 * 20), 20, "每檔以 5日<0、1月<0、低於20MA、低於50MA各計 1 點；本週僅 QQQ 月線微負。"],
  ["市場廣度", `${breadthScore}/8`, "20%", Math.round(breadthScore / 8 * 20), 20, "三大指數 20／50MA 廣度與 Stockbee 5D／10D 共八項，較 7/31 惡化才計風險。"],
  ["VIX 波動", `${vixScore}/5`, "10%", Math.round(vixScore / 5 * 10), 10, "VIX>20、VIX 日／週升、VIXY 高於20／50MA，共五項。"],
  ["板塊／主題動能", `${weakRows.length}/${weakUniverse.length}`, "15%", Math.round(weakRows.length / weakUniverse.length * 15), 15, "5日<0、低於20MA、RSI<50 三項中至少兩項成立即列弱勢。"],
  ["50MA ATR 延伸", `${atrExtendedCount}/${atrUniverse.length}`, "10%", Math.round(atrExtendedCount / atrUniverse.length * 10), 10, "固定 18 檔中距 50MA 絕對值達 2 ATR 的標的數。"],
  ["跨資產壓力", "2/4", "15%", 8, 15, "DXY 五日上升、10Y 週升、TLT 低於50MA、USO 一月上升；後兩項成立。"],
  ["宏觀／事件風險", "3/3", "10%", 10, 10, "非農轉負、ISM 價格高於70、下週 CPI／PPI／零售與重點財報三個窗口均成立。"]
];
const totalRisk = scoreRows.reduce((sum, row) => sum + row[3], 0);
if (breadthScore !== 0 || technicalScore !== 0 || vixScore !== 0 || totalRisk !== 25) throw new Error(`量化分數異常：breadth=${breadthScore}, technical=${technicalScore}, vix=${vixScore}, total=${totalRisk}`);
const marketScoreTable = table([
  {label:"評分維度"},{label:"原始風險",num:true},{label:"權重",num:true},{label:"風險分",num:true},{label:"量化依據"}
], scoreRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3]}" data-max-score="${row[4]}">${row[3]}/${row[4]}</td>${cell(row[5])}</tr>`), "market-score-table report-data-table report-cols-5");

const previousRules = [
  ["科技價格修復", "QQQ >20MA 701.02 且 SMH >20MA 571.63。", "QQQ 723.03；SMH 582.70。", "命中", "科技回補條件成立；QQQ 已收回 50MA，SMH 仍低於 50MA。"],
  ["綜合廣度確認", "SPX／NDX／IWM >20MA 至少兩項過 60%／55%／50%，且 Stockbee 5D >1。", "65.20%／70.58%／63.83%；5D 2.85。", "命中", "價格與廣度同步擴散，可維持正常核心曝險。"],
  ["大盤風控", "SPY <50MA 744.21 且 VIX >17.5。", "SPY 773.26；VIX 14.90。", "未觸發", "不降低總風險。"],
  ["廣度失速", "NDX >20MA <45% 且 Stockbee 5D <0.75。", "70.58%；2.85。", "未觸發", "科技內部沒有失速。"],
  ["波動升級", "VIX >20 或五項波動分數 >=4/5。", "VIX 14.90；0/5。", "未觸發", "尾端風險仍低。"],
  ["美元／長端壓力", "DXY >101.50 且 10Y >4.80%。", "DXY 99.54；10Y 4.65%。", "未觸發", "複合折現率壓力未成立。"],
  ["能源強勢失效", "USO <50MA 123.30。", "USO 117.98；最新 50MA 121.17。", "已觸發", "能源事件倉按原規則降低 1/2。"],
  ["等權防守失效", "RSP <50MA 211.05 且 DIA <50MA 516.39。", "RSP 220.09；DIA 539.62。", "未觸發", "等權與道指緩衝仍在。"],
  ["晶片財報確認", "AMD 後 SMH >20MA 571.63 且 NDX >20MA >55%。", "SMH 582.70；NDX 70.58%。", "命中", "晶片接棒成立，但 SMH 仍需越過 50MA 594.94 才算完整趨勢修復。"]
];
const previousTable = table([
  {label:"上週規則／監控項"},{label:"原門檻"},{label:"本週結果"},{label:"分類",result:true},{label:"修正／備註"}
], previousRules.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}<td class="result-cell">${resultBadge(row[3])}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5");

const crossAssets = [
  ["DXY", fixed(sheet.dxy.close), signed(sheet.dxy.fiveDayPct), `約 ${signed(sheet.dxy.oneMonthPct)}`, "Investing.com 外部正式收盤；美元走弱，未觸發科技折現率風控。"],
  ["美國 2 年債殖利率", "4.19%", "-9bp", "—", "短端回落，弱就業降低九月升息定價。"],
  ["美國 10 年債殖利率", "4.65%", "-10bp", "—", "本週下行，但仍高於足以全面放鬆估值的區間。"],
  ["美國 30 年債殖利率", "5.19%", "-8bp", "—", "長端回落幅度小於 10Y，期限溢價仍偏高。"],
  ...["SHY","IEF","TLT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = ticker === "SHY" ? "短債價格近乎持平。" : ticker === "IEF" ? "中期債小升，受益於殖利率回落。" : "長債反彈但仍低於 50MA 2.70 ATR。";
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ...["USO","GLD","SLV","CPER"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {USO:"五日急跌但月線仍正，能源事件溢價快速回吐。",GLD:"金價週線強勢，兼具美元走弱與事件避險。",SLV:"銀價週月同升，風險偏好與貴金屬共振。",CPER:"銅價月線偏強，但本週增幅有限。"}[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  })
];

const macroRows = [
  ["FOMC 目標區間", "3.50%–3.75%", "維持", "3.50%–3.75%", "7/29 以 9 比 3 維持，三位反對票主張升息 25bp。"],
  ["9/16 FOMC 市場定價", "升息約 45%", "維持約 55%", "就業前升息約 55%", "非農後升息機率下降，但通膨仍限制寬鬆敘事。"],
  ["7月非農就業", "-2.3萬", "+8.5萬", "6月 +2.0萬（修訂）", "首個月度負增長；5／6月合計再下修 10.3萬。"],
  ["失業率／勞參率", "4.1%／61.4%", "失業率 4.2%", "4.2%／61.5%", "失業率下降主要伴隨勞參率下滑，不能解讀為需求重新轉強。"],
  ["平均時薪年率", "+3.2%", "+3.5%", "+3.4%（修訂）", "工資增速降溫，減輕短端升息壓力。"],
  ["6月 JOLTS", "職缺 740萬", "—", "—", "聘僱 530萬、離職 320萬；職缺仍高但流動性偏弱。"],
  ["7月 ISM 服務業", "54.1", "54.0", "54.0", "就業 47.4、價格 70.3；成長尚在，通膨黏性仍高。"],
  ["Q2 生產力／單位勞工成本", "+1.4%／+1.3%", "—", "—", "生產率改善，但實質時薪報酬年化 -3.1%。"]
];

const eventRows = [
  ["8/10 盤後", "RKLB 財報", "待公布", "—", "訂單、Neutron 進度與國防／太空需求。"],
  ["8/11 17:00", "SMCI 財報", "營收指引低端 $110億", "—", "AI 伺服器積壓訂單、毛利率與交付節奏。"],
  ["8/12 08:30", "7月 CPI", "年率約 3.4%", "3.5%", "若高於 3.5%，弱就業帶來的利率利多可能反轉。"],
  ["8/12 盤後", "CSCO 財報", "待公布", "—", "網路設備、AI 訂單與企業支出。"],
  ["8/13 08:30", "7月 PPI", "市場共識待更新", "—", "企業成本與服務通膨是否延續高位。"],
  ["8/13 盤後", "AMAT 財報", "待公布", "—", "晶圓設備需求與中國／先進製程結構。"],
  ["8/14 08:30", "7月零售銷售", "市場共識待更新", "—", "就業降溫是否已傳導到消費。"],
  ["8/14 10:00", "密大消費者信心初值", "市場共識待更新", "—", "通膨預期與家庭支出意願。"]
];

const scenarios = [
  ["基準：高位整固", 45, "CPI 約 3.3%–3.5%，PPI 未明顯再加速；10Y 4.55%–4.75%。", "SPY／QQQ 守住 20MA；廣度保持過半但不再直線上升。", "軟體、晶片與金融輪動；高 RSI 標的不追價。", "核心曝險維持正常，新增部位分批進場。"],
  ["偏多：通膨降溫擴散", 25, "CPI <=3.3%，PPI 同步偏軟；10Y <4.55%、DXY <99。", "QQQ 守 723 且 SMH 收回 50MA 594.94；Stockbee 5D >2。", "晶片、小型股與等權接棒，風險偏好由巨頭擴散。", "高 beta 增加 1/3，但保留 ATR 追價約束。"],
  ["偏空：停滯性通膨", 20, "CPI >=3.6% 或 PPI 明顯偏熱；10Y >4.80%、DXY >101.50。", "QQQ 跌破 50MA 714.31，SPY 廣度回落至 55% 以下。", "長久期科技、房屋與清潔能源承壓；金融取決於信用風險。", "科技與高 beta 降低 1/3，停止追高。"],
  ["尾端：成長失速", 10, "零售顯著轉負，後續初領與就業再惡化；殖利率急跌。", "IWM／XLF 與廣度先轉弱，即使 QQQ 因利率下降短暫反彈。", "防守股與長債相對領先，週期與小型股落後。", "降低週期曝險，等待信用與廣度重新確認。"]
];
const scenarioTable = table([
  {label:"下週情境"},{label:"主觀概率",num:true},{label:"宏觀／跨資產觸發"},{label:"指數／廣度預測"},{label:"板塊／主題預測"},{label:"交易動作"}
], scenarios.map((row) => `<tr>${cell(row[0])}<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`), "scenario-table report-data-table report-cols-6");

const linkageRows = [
  ["大盤 ETF", "四大 ETF 均在 20／50／200MA 上方。", "QQQ 守 723、IWM 守 20MA 294.77。", "SPY <750.17 且 SPX 20MA 廣度 <55%。"],
  ["市場廣度", "六項 MA 廣度均較 7/31 改善，Stockbee 5D／10D >1。", "5D >2 且 4% 上漲持續多於下跌。", "NDX 20MA <55% 或 Stockbee 5D <1。"],
  ["Sector／Thematic", "XLK、XSW、SMH 領先，能源與公用事業落後。", "SMH >594.94 且 XLK／XSW 不回吐。", "QQQ <714.31 且 SMH <564.01。"],
  ["美債／美元", "弱就業壓低殖利率與美元，支援久期資產。", "10Y <4.55%、DXY <99。", "10Y >4.80% 且 DXY >101.50。"],
  ["商品", "油價回吐事件溢價，金銀走強。", "CPER 與 IWM 同升確認需求；GLD 上升但 VIX 不升。", "USO 再升且 10Y 同升，代表通膨壓力回來。"],
  ["宏觀／財報", "就業弱、服務通膨高；下週由 CPI/PPI 定方向。", "CPI <=3.3%，AI 硬件指引不下修。", "CPI >=3.6%，或 SMCI／AMAT 指引拖累晶片。"]
];
const linkageTable = table([
  {label:"上文模組"},{label:"基準判斷"},{label:"偏多確認"},{label:"偏空／失效"}
], linkageRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}${cell(row[3])}</tr>`), "scenario-linkage-table report-data-table report-cols-4");

const monitoring = [
  ["大盤趨勢失效", "SPY <20MA 750.17，且 SPX >20MA 廣度 <55%", "773.26；65.20%", "總風險降低 1/3。"],
  ["科技修復失效", "QQQ <50MA 714.31，且 SMH <20MA 564.01", "723.03；582.70", "科技與晶片降低 1/3。"],
  ["晶片完整突破", "SMH >50MA 594.94，且 NDX >20MA 廣度 >60%", "582.70；70.58%", "晶片回補 1/3。"],
  ["廣度失速", "NDX >20MA <55%，或 Stockbee 5D <1", "70.58%；2.85", "停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5", "14.90；0/5", "降低大盤曝險並停止追價。"],
  ["美元／長端壓力", "DXY >101.50，且 10Y >4.80%", "99.54；4.65%", "科技與高 beta 再降低 1/3。"],
  ["通膨上行", "CPI 年率 >=3.6%，或核心月率 >=0.4%", "待 8/12 公布", "先降長久期與高估值曝險。"],
  ["能源再通膨", "USO >50MA 121.17，且 10Y >4.75%", "117.98；4.65%", "提高通膨風控，不追高成長。"],
  ["成長失速", "零售月率 <0，且 IWM <20MA 294.77", "待 8/14；301.56", "降低週期與小型股 1/3。"]
];
const monitorTable = table([
  {label:"訊號名"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}
], monitoring.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "weekly-monitor-table report-data-table report-cols-4");

const sources = `<ul>
  <li>長橋 CLI：8/7 收盤與近 5 日／1 月漲跌採 <code>kline history --adjust none</code>；均線、RSI、ATR 與 52 週高採前復權序列避免公司行動失真。139／139 標的成功。</li>
  <li><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit?gid=0#gid=0" target="_blank" rel="noopener">Market Watch Google Sheet</a>：Sector Dashboard、Thematic Sectors、Macro、Maket breath 與 Data QA；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit" target="_blank" rel="noopener">Stockbee 2026</a>。</li>
  <li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve" target="_blank" rel="noopener">美國財政部每日殖利率</a>：7/31 與 8/7；<a href="https://www.investing.com/indices/usdollar-historical-data" target="_blank" rel="noopener">Investing.com DXY 歷史收盤</a>：8/7。</li>
  <li><a href="https://www.bls.gov/news.release/empsit.nr0.htm" target="_blank" rel="noopener">BLS 就業報告</a>、<a href="https://www.bls.gov/news.release/jolts.nr0.htm" target="_blank" rel="noopener">JOLTS</a>、<a href="https://www.bls.gov/news.release/prod2.nr0.htm" target="_blank" rel="noopener">生產力</a>；<a href="https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/july/" target="_blank" rel="noopener">ISM 服務業</a>。</li>
  <li><a href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm" target="_blank" rel="noopener">Fed 7/29 聲明</a>；市場定價參考 <a href="https://www.kiplinger.com/investing/economy/jobs-report-july-2026-what-to-expect" target="_blank" rel="noopener">Kiplinger 非農後整理</a>。</li>
  <li><a href="https://apnews.com/article/9d586bdbf1fb230dcf1f915dcaf50858" target="_blank" rel="noopener">AP 8/7 收盤</a>、<a href="https://apnews.com/article/1cf6047f812b3e1f151781f5722d97b7" target="_blank" rel="noopener">AP 下週展望</a>；事件日期以 <a href="https://www.bls.gov/schedule/2026/home.htm" target="_blank" rel="noopener">BLS</a>、<a href="https://www.census.gov/retail/release_schedule.html" target="_blank" rel="noopener">Census</a> 與公司 IR 日曆交叉確認。</li>
</ul>`;

const report = {
  report_title: "2026-08-07 美股一週總結｜廣度全面修復，科技領漲；就業轉負但通膨風險未退",
  report_type: "weekly",
  week: "2026-08-03–2026-08-07",
  source_dates: {longbridge:expectedDate,market_watch_sheet:expectedDate,market_breadth_sheet:expectedDate,stockbee_sheet:expectedDate,treasury:expectedDate,dxy:expectedDate},
  qqq_reengage_20ma: fixed(byTicker("QQQ").ma20),
  qqq_breakout_add_1sd: fixed(byTicker("QQQ").ma50),
  report_eyebrow: "2026-08-09｜美股週報｜資料截至 2026-08-07 收盤",
  report_heading: "美股一週總結：廣度全面修復，科技領漲；就業轉負但通膨風險未退",
  data_timestamp_note: "本週收盤、技術值與市場廣度已完成長橋及主表交叉核對。",
  report_badges: `<span class="badge green">風險：Low</span><span class="badge blue">SPY ${signed(byTicker("SPY").fiveDayPct)}</span><span class="badge green">廣度 ${breadthScore}/8</span><span class="badge green">技術 ${technicalScore}/12</span><span class="badge grey">VIX ${vixScore}/5</span>`,
  summary_cards: `<div class="card"><span>SPY／QQQ／IWM／DIA</span><strong><span class="up">+3.51%</span>／<span class="up">+5.09%</span>／<span class="up">+3.56%</span>／<span class="up">+2.92%</span></strong><small>四大 ETF 同步站上 20／50／200MA。</small></div><div class="card"><span>SPX／NDX／IWM &gt;20MA</span><strong>65.20%／70.58%／63.83%</strong><small>三大指數短線廣度全部過半並較上週改善。</small></div><div class="card"><span>7月非農／兩月修訂</span><strong><span class="dn">-2.3萬</span>／<span class="dn">-10.3萬</span></strong><small>就業轉負，短端升息壓力下降。</small></div><div class="card"><span>2Y／10Y／30Y</span><strong><span class="up">-9bp</span>／<span class="up">-10bp</span>／<span class="up">-8bp</span></strong><small>殖利率全面回落，但長端水位仍偏高。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才加碼：目前已是 Low Risk，新增風險仍需價格、廣度與宏觀至少兩項確認。",
  upgrade_trigger_1: "SPY／QQQ 守住 20MA 750.17／700.34，且 Stockbee 5D ratio 維持 >1.5。",
  upgrade_trigger_2: "SMH 收回 50MA 594.94，且 NDX >20MA 廣度保持 >60%。",
  upgrade_trigger_3: "7月 CPI <=3.3%，10Y <4.55%，DXY <99。",
  downgrade_trigger_rule: "任一觸發即成立：複合風控成立便降級，不等待第二項確認。",
  downgrade_trigger_1: "SPY <20MA 750.17，且 SPX >20MA 廣度 <55%。",
  downgrade_trigger_2: "QQQ <50MA 714.31，且 SMH <20MA 564.01。",
  downgrade_trigger_3: "10Y >4.80% 且 DXY >101.50%，或 VIX 五項波動分數 >=4/5。",
  core_conclusions: `<ol><li><strong>本週不是只靠權重股拉升，價格與廣度同步修復。</strong>四大 ETF 五日上漲 2.92%–5.09%，三大指數 20MA 廣度升至 63.83%–70.58%，Stockbee 5D／10D ratio 升至 2.85／1.64。</li><li><strong>科技重新領漲，但內部仍有層級。</strong>XLK、XSW、SMH 五日 +7.20%／+7.12%／+7.80%；QQQ 收回 50MA，SMH 仍低於 50MA 594.94，晶片修復尚差最後一層確認。</li><li><strong>就業轉負是利率利多，也是成長警告。</strong>7月非農 -2.3萬，低於 +8.5萬共識；5／6月合計下修 10.3萬。失業率降至 4.1% 同時勞參率降至 61.4%，不能只解讀成軟著陸。</li><li><strong>服務業仍擴張，通膨黏性沒有消失。</strong>ISM 服務業 54.1，但就業 47.4、價格 70.3；本週殖利率下降不代表 Fed 已轉向寬鬆。</li><li><strong>下週 CPI、PPI、零售與 AI 硬件財報決定低風險能否延續。</strong>目前量化總分 25/100；若通膨再升或 QQQ／SMH 跌回均線下，應先減久期與高估值曝險。</li></ol>`,
  weekly_positioning: `<h3>市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>市場風險分數</span><strong>${totalRisk}<small>/100</small></strong><em>Low Risk</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:${totalRisk}%"></span></div><p>趨勢、廣度與波動三個核心模組同步改善；剩餘風險集中在 ATR 延伸、長端仍高與下週通膨事件。</p><small>0–34 Low Risk；35–59 Intermediate Risk；60–100 High Risk。</small></div></div>${marketScoreTable}<div class="callout ok"><strong>分數反算：</strong>${scoreRows.map((row) => row[3]).join(" + ")} = ${totalRisk}。Low Risk 代表可以維持正常核心曝險，不代表可以忽略通膨與追價風險。</div><div class="action-directive"><span class="ad-label">本週配置</span><ul class="ad-list"><li class="ad-primary">核心曝險維持正常，優先持有軟體、晶片與金融中的相對強勢。</li><li class="ad-watch">SPY、DIA、RSP 與 NVDA 已超過 50MA 約 2–3.4 ATR，新倉分批，不追缺口。</li><li class="ad-avoid">能源事件倉已觸發失效線；CPI 前避免用單週利率下跌外推全面寬鬆。</li></ul></div>`,
  previous_week_reconciliation: `<div class="status-pills"><span class="badge green">3 命中</span><span class="badge amber">1 已觸發</span><span class="badge red">0 失誤</span><span class="badge grey">5 未觸發</span></div>${previousTable}<div class="callout ok"><strong>對賬結論：</strong>科技、綜合廣度與晶片三項確認線全部命中；能源失效線亦按規則觸發。上週防守判斷應正式升級為正常核心曝險，但仍保留通膨與 SMH 50MA 兩個確認條件。</div>`,
  indices_style_review: `${table([{label:"ETF"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}], indexRows, "ma-table report-data-table report-cols-7 index-summary-table")}<p><strong>小結：</strong>四大 ETF 全部站在三條均線上方，且依 RSI 由高至低為 SPY、DIA、IWM、QQQ。QQQ 週線最強，但一月仍近乎持平，因此「短線科技領漲」與「中期全面超額報酬」需要分開。</p>`,
  big_winners_losers: `${moverTable("本週五大強勢股", winners)}${moverTable("本週五大弱勢股", losers)}<div class="callout ok"><strong>NVDA 補充：</strong>五日 ${signed(byTicker("NVDA").fiveDayPct)}、一月 ${signed(byTicker("NVDA").oneMonthPct)}，收 ${fixed(byTicker("NVDA").close)}；高於 20MA ${fixed(byTicker("NVDA").ma20)} 與 50MA ${fixed(byTicker("NVDA").ma50)}，距 50MA +${fixed(byTicker("NVDA").distance50Atr)} ATR。趨勢確認，但不宜追價。</div><p><strong>共同因子：</strong>市場獎勵「財報後仍能上修成長／盈利路徑」的公司，懲罰「Beat 但指引不足以支撐高估值」的公司。APP、DDOG、TTD 同時下跌，說明本週風險並非全面科技弱，而是預期差與估值門檻提高。</p>`,
  sector_momentum_chart: barChart(["SMH","XLK","XSW","XLB","VOO","XLU","XLE","WGMI"].map((ticker) => ({label:ticker,value:byTicker(ticker).fiveDayPct}))),
  sector_thematic_weekly: `${etfTable("S&amp;P 500 Sector ETF", sectors, 'data-etf-group="sector" data-expected-rows="12" data-benchmark="SPY" data-sort="rsi-desc"')}${etfTable("Thematic Sector ETF", themes, 'data-etf-group="thematic" data-expected-rows="45" data-etf-universe="thematic-complete" data-source-count="45" data-report-count="45" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc"')}<div class="callout ok"><strong>板塊結論：</strong>SMH／XLK／XSW 成為本週領漲核心，XLB 與更廣泛風險資產亦上升；弱勢集中在 WGMI、XLE、XLU 與部分房地產。55 個非基準板塊／主題中只有 ${weakRows.length} 個符合弱勢定義，結構已由局部修復轉為較廣擴散。</div>`,
  market_breadth_weekly: `${table([{label:"指標"},{label:"8/7",num:true},{label:"7/31",num:true},{label:"週變化",num:true},{label:"判斷"}], breadthRows, "report-data-table report-cols-5")}<div class="status-pills"><span class="badge green">5日惡化 ${breadthScore}/8</span><span class="badge green">Stockbee 5D 2.85</span><span class="badge green">T2108 53.58%</span></div><p><strong>三大指數廣度：</strong>SPX、NDX、IWM 的 20／50MA 廣度六項全部高於 7/31；20MA 廣度分別升 11.92、17.19、19.90 個百分點。短線擴散最強的是 IWM 與 NDX，中期 50MA 廣度也同步改善。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D／10D ratio 由 0.98／0.91 升至 2.85／1.64，4% 上漲／下跌為 510／152，34/13 上漲／下跌為 2111／1308。短中期強股都重新多於弱股，不再是單一指數修復。</p><div class="callout ok"><strong>綜合結論：</strong>五日趨勢量化分數 ${breadthScore}/8，屬明確改善。廣度目前支持 Low Risk，但下週仍需觀察 CPI 後是否保持 NDX >60%、IWM >55% 與 Stockbee 5D >1。</div>`,
  atr_weekly: `${table([{label:"ETF"},{label:"價格",num:true},{label:"50MA",num:true},{label:"ATR(14)",num:true},{label:"距 50MA ATR",num:true},{label:"判斷"}], atrRows, "report-data-table report-cols-6")}<div class="callout warn"><strong>小結：</strong>${atrExtendedCount}/${atrUniverse.length} 檔距 50MA 絕對值達 2 ATR。RSP、DIA、SPY 與 NVDA 正向延伸；TLT 負向延伸。趨勢偏多，但新增部位要以回踩或盤整消化為優先。</div>`,
  fx_commodities_treasury_weekly: `${table([{label:"資產"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"市場含義"}], crossAssets.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<div class="callout warn"><strong>長短債比較：</strong>2Y／10Y／30Y 一週下降 9／10／8bp，10s2s 由 +47bp 微收窄至 +46bp。這是弱就業帶來的全曲線下移，但 10Y 4.65%、30Y 5.19% 仍不算低折現率環境；TLT 尚未收回 50MA。</div>`,
  macro_fed_weekly: `${table([{label:"數據／政策"},{label:"Actual",num:true},{label:"Forecast／門檻",num:true},{label:"Previous",num:true},{label:"政策與市場含義"}], macroRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "macro-review-table report-data-table report-cols-5")}<p><strong>小結：</strong>就業與工資降溫壓低升息機率，ISM 服務價格 70.3 又限制 Fed 轉鴿。當前最合理的讀法是「九月升息壓力下降，但政策仍受通膨約束」，而不是直接押注降息。</p>`,
  next_week_plan: `${table([{label:"日期（ET）"},{label:"事件"},{label:"Forecast",num:true},{label:"Previous",num:true},{label:"監控重點"}], eventRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<p class="note">8/10–8/14 沒有 FOMC 決策；政策定價主要由 CPI、PPI、零售與企業指引推動。</p><h3>四種情境與主觀概率</h3>${scenarioTable}<h3>各模組聯動預測</h3>${linkageTable}<div class="action-directive"><span class="ad-label">執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看 CPI：</strong>決定本週殖利率下降能否延續。</li><li class="ad-watch"><strong>再看 SMCI／CSCO／AMAT：</strong>用訂單與毛利確認 AI 硬件需求，而不是只看股價。</li><li class="ad-watch"><strong>最後看零售與廣度：</strong>弱就業若傳導到消費，IWM／XLF 與 Stockbee 會先反映。</li><li class="ad-invalidate"><strong>風控：</strong>QQQ <714.31 且 SMH <564.01，或 10Y >4.80% 且 DXY >101.50%，科技降低 1/3。</li></ul></div>`,
  cross_validation_summary: `<div class="callout ok"><strong>互相確認：</strong>四大 ETF 全數站上三條均線；三大指數六項 MA 廣度與 Stockbee 5D／10D 同步改善；VIX 0/5。價格、內部結構與波動三者方向一致。</div><div class="callout warn"><strong>互相分歧：</strong>QQQ 五日 +5.09% 但一月近乎持平，SMH 仍低於 50MA；就業轉負推低殖利率，但 ISM 價格仍高於 70。短線利多與中期通膨風險同時存在。</div><div class="callout ok"><strong>主導結論：</strong>25/100 Low Risk 支持正常核心曝險；執行上仍以「不追已延伸標的、CPI 後再加碼、SMH 50MA 作晶片確認」三條為主。</div>`,
  next_week_monitoring_checklist: monitorTable,
  sources
};

const output = path.resolve(root, "data/2026-08-07-weekly.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({output:path.relative(root, output), totalRisk, breadthScore, technicalScore, vixScore, sectorRows:sectors.length, thematicRows:themes.length, winners:winners.map((row) => row.ticker), losers:losers.map((row) => row.ticker)}, null, 2));
