#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const raw = read("data/2026-08-28-weekly-longbridge.json");
const adjusted = read("data/2026-08-28-weekly-longbridge-adjusted.json");
const sheet = read("data/2026-08-28-weekly-google-sheet.json");
const expectedDate = "2026-08-28";
const dxyExternal = {
  asOf: expectedDate,
  close: 99.66,
  fiveDayPct: 0.87,
  oneMonthPct: -1.74,
  source: "Investing.com DXY 8/28 歷史收盤"
};

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
    SPY: "週線小漲且守三線，但 SPX 20MA 廣度已降至 42.34%。",
    DIA: "週線相對抗跌；失守 20MA，但仍在 50／200MA 上方。",
    QQQ: "週線小漲，卻收在 20MA 下方；晶片沒有跟上軟體。",
    IWM: "四大 ETF 唯一週跌，並失守 20／50MA，內需與小型股偏弱。"
  }[row.ticker];
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(special)}</tr>`;
});

const excludedMovers = new Set([...raw.universes.coreTickers, "MSTR"]);
const moverPool = raw.rows.filter((row) => raw.universes.moverCandidates.includes(row.ticker) && !excludedMovers.has(row.ticker));
const winners = [...moverPool].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const losers = [...moverPool].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const moverNotes = {
  CRM: "財報後重估最強：營收、cRPO、利潤率與自由現金流同時改善，市場願意支付 AI 軟體變現溢價。",
  CRWD: "ARR、淨新增 ARR 與自由現金流均強，並上調指引；安全軟體的可見度獲得重新定價。",
  NOW: "企業軟體隨 CRM／CRWD 同步擴散，顯示本週買盤不是單一財報跳空。",
  FNKO: "公司特定高波動反彈，缺少同產業交叉確認，宜視為事件型價格行為。",
  MSFT: "大型雲與軟體跟隨 IGV 走強，成為科技內部對沖晶片弱勢的核心。",
  ASTS: "衛星通訊高 beta 大幅獲利回吐，與 UFO 同向，風險偏好沒有全面擴散。",
  RKLB: "太空主題同步轉弱，確認 ASTS 並非單一個股波動。",
  CAVA: "高估值消費成長股回落，小型股與內需廣度轉弱放大估值壓力。",
  MRVL: "財報後單日重挫；市場聚焦指引中的毛利率區間，收入成長不足以抵銷獲利品質疑慮。",
  U: "軟體內部分化：資金集中可見度較高的企業軟體，未同步擴散至所有高 beta 應用軟體。"
};
const moverTable = (title, rows) => `<h3>${title}</h3>${table([
  {label:"股票"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"市場反饋因子"}
], rows.map((row) => `<tr>${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${cell(moverNotes[row.ticker] || "本週價格出現明顯重新定價，等待基本面交叉確認。")}</tr>`), "ma-table report-data-table report-cols-5")}`;

const themeWeeklyUniverse = themes.filter((row) => row.ticker !== "VOO");
const themeWeeklyGainers = [...themeWeeklyUniverse].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5);
const themeWeeklyLosers = [...themeWeeklyUniverse].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5);
const themeMoverNotes = {
  IGV: `軟體五日 ${signed(byTicker("IGV").fiveDayPct)}，與 CRM／CRWD／NOW 同向；財報品質與可見度是本週最強因子。`,
  BUG: `網路安全五日 ${signed(byTicker("BUG").fiveDayPct)}，CRWD 財報把營收、ARR 與現金流確認傳導到整個主題。`,
  CIBR: `資安籃子跟隨 BUG 上漲，證明買盤有產業廣度，但 RSI ${fixed(byTicker("CIBR").rsi14)} 已偏熱。`,
  XSW: `等權軟體五日 ${signed(byTicker("XSW").fiveDayPct)}，顯示強勢不只集中 MSFT／CRM 等大型股。`,
  MAGS: `大型科技週線 ${signed(byTicker("MAGS").fiveDayPct)}，靠 MSFT 等軟體平台抵銷 NVDA 週五回落。`,
  WGMI: `礦工 ETF 五日 ${signed(byTicker("WGMI").fiveDayPct)}，但 IBIT ${signed(byTicker("IBIT").fiveDayPct)}；現貨與營運槓桿再度分歧。`,
  AIRR: `美國工業復興籃子五日 ${signed(byTicker("AIRR").fiveDayPct)}，與 XLI 同弱，內需／資本品交易失去廣度。`,
  SLV: `白銀五日 ${signed(byTicker("SLV").fiveDayPct)}，在一月仍升 ${signed(byTicker("SLV").oneMonthPct)} 後回吐；屬高位降溫而非長期結構反轉。`,
  UFO: `太空 ETF 五日 ${signed(byTicker("UFO").fiveDayPct)}，與 ASTS／RKLB 同向，主題 beta 明顯去風險。`,
  REMX: `稀土與戰略材料五日 ${signed(byTicker("REMX").fiveDayPct)}，商品與工業同步降溫，等待重新站回 20MA ${fixed(byTicker("REMX").ma20)}。`
};
const themeMoverReviewTable = (title, rows, attrs) => `<div class="theme-mover-review"><h3>${title}</h3>${table([
  {label:"ETF"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"點評／下週觀察"}
], rows.map((row) => `<tr data-five-day="${fixed(row.fiveDayPct, 4)}">${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(themeMoverNotes[row.ticker])}</tr>`), "ma-table report-data-table report-cols-6 theme-mover-table", attrs)}</div>`;

if (themeWeeklyGainers.map((row) => row.ticker).join(",") !== "IGV,BUG,CIBR,XSW,MAGS" || themeWeeklyLosers.map((row) => row.ticker).join(",") !== "WGMI,AIRR,SLV,UFO,REMX") {
  throw new Error("Thematic ETF 週漲跌幅前五名與資料快照不一致。");
}

const currentBreadth = sheet.breadth[0];
const priorBreadth = sheet.breadth.at(-1);
const currentStockbee = sheet.stockbeeRows[0];
const priorStockbee = sheet.stockbeeRows.at(-1);
const breadthDefinitions = [
  ["SPX >20MA（8/28）", currentBreadth.spx20, priorBreadth.spx20, "%"],
  ["SPX >50MA（8/28）", currentBreadth.spx50, priorBreadth.spx50, "%"],
  ["NDX >20MA（8/28）", currentBreadth.ndx20, priorBreadth.ndx20, "%"],
  ["NDX >50MA（8/28）", currentBreadth.ndx50, priorBreadth.ndx50, "%"],
  ["IWM >20MA（8/28）", currentBreadth.iwm20, priorBreadth.iwm20, "%"],
  ["IWM >50MA（8/28）", currentBreadth.iwm50, priorBreadth.iwm50, "%"],
  ["Stockbee 5D ratio（8/28）", currentStockbee.ratio5d, priorStockbee.ratio5d, ""],
  ["Stockbee 10D ratio（8/28）", currentStockbee.ratio10d, priorStockbee.ratio10d, ""],
  ["4%+ 上漲／下跌（8/28）", `${currentStockbee.up4}／${currentStockbee.down4}`, `${priorStockbee.up4}／${priorStockbee.down4}`, "pair"],
  ["T2108（8/28）", currentStockbee.t2108, priorStockbee.t2108, "%"],
  ["34/13 上漲／下跌（8/28）", `${currentStockbee.up34_13}／${currentStockbee.down34_13}`, `${priorStockbee.up34_13}／${priorStockbee.down34_13}`, "pair"]
];
const breadthRows = breadthDefinitions.map(([label, latest, prior, suffix]) => {
  if (suffix === "pair") {
    const judgment = label.startsWith("4%") ? "週五 4% 下跌股遠多於上漲股，短線賣壓占優。" : "中期上漲股仍略多，但領先幅度較上週收窄。";
    return `<tr>${cell(label)}${num(latest)}${num(prior)}${num("—")}${cell(judgment)}</tr>`;
  }
  const change = Number(latest) - Number(prior);
  return `<tr>${cell(label)}${num(`${fixed(latest)}${suffix}`)}${num(`${fixed(prior)}${suffix}`)}${num(`${change >= 0 ? "+" : ""}${fixed(change)}${suffix === "%" ? "pp" : ""}`)}${cell(change >= 0 ? "較上週改善。" : "較上週惡化。")}</tr>`;
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
const atrExtended = atrUniverse.filter((row) => Math.abs(row.distance50Atr) >= 2);
const atrExtendedCount = atrExtended.length;
const atrRows = [...atrUniverse].sort((a, b) => b.distance50Atr - a.distance50Atr).map((row) => {
  const ext = row.distance50Atr;
  const judgment = ext >= 3 ? "正向延伸偏高，不追價。" : ext >= 2 ? "正向延伸較高，等待回踩。" : ext <= -2 ? "負向延伸較深，等價格確認。" : "延伸仍在可控範圍。";
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(fixed(row.ma50))}${num(fixed(row.atr14))}${num(`${ext >= 0 ? "+" : ""}${fixed(ext)}`)}${cell(judgment)}</tr>`;
});

const weakUniverse = [...sectors.filter((row) => row.ticker !== "SPY"), ...themes.filter((row) => row.ticker !== "VOO")];
const weakRows = weakUniverse.filter((row) => [row.fiveDayPct < 0, !row.above20, row.rsi14 < 50].filter(Boolean).length >= 2);
const threeIndexRawRisk = ["SPY", "QQQ", "IWM"].map(byTicker).reduce((score, row) => score + [row.fiveDayPct < 0, row.oneMonthPct < 0, !row.above20, !row.above50].filter(Boolean).length, 0);
const treasuryPrior = sheet.treasury["2026-08-21"];
const treasuryCurrent = sheet.treasury["2026-08-28"];
const crossAssetChecks = [
  byTicker("USDU").fiveDayPct > 0.5,
  treasuryCurrent.tenYear > treasuryPrior.tenYear,
  !byTicker("TLT").above50,
  byTicker("USO").oneMonthPct > 0
];
const crossAssetRisk = crossAssetChecks.filter(Boolean).length;
const scoreRows = [
  ["三大指數技術", `${threeIndexRawRisk}/12`, "20%", Math.round(threeIndexRawRisk / 12 * 20), 20, "SPY／QQQ／IWM 各以 5日<0、1月<0、低於20MA、低於50MA計分；QQQ 與 IWM 短線結構轉弱。"],
  ["市場廣度", `${breadthScore}/8`, "20%", Math.round(breadthScore / 8 * 20), 20, "六項 MA 廣度與 Stockbee 5D／10D 以 8/28 對 8/21；八項全部惡化。"],
  ["VIX 波動", `${vixScore}/5`, "10%", Math.round(vixScore / 5 * 10), 10, "VIX>20、VIX 日／週升、VIXY 高於20／50MA，共五項；本週皆未成立。"],
  ["板塊／主題動能", `${weakRows.length}/${weakUniverse.length}`, "15%", Math.round(weakRows.length / weakUniverse.length * 15), 15, "5日<0、低於20MA、RSI<50 三項中至少兩項成立即列弱勢。"],
  ["50MA ATR 延伸", `${atrExtendedCount}/${atrUniverse.length}`, "10%", Math.round(atrExtendedCount / atrUniverse.length * 10), 10, "固定 18 檔中距 50MA 絕對值達 2 ATR 的標的數。"],
  ["跨資產壓力", `${crossAssetRisk}/4`, "15%", Math.round(crossAssetRisk / 4 * 15), 15, "USDU 五日升幅>0.5%、10Y 週升、TLT 低於50MA、USO 一月上升；本週三項成立。"],
  ["宏觀／事件風險", "3/3", "10%", 10, 10, "PCE 仍高、Warsh 未釋放寬鬆訊號，且下週 ISM／JOLTS／非農與 AVGO 形成密集事件窗。"]
];
const totalRisk = scoreRows.reduce((sum, row) => sum + row[3], 0);
if (breadthScore !== 8 || technicalScore !== 4 || vixScore !== 0 || crossAssetRisk !== 3 || totalRisk !== 61) throw new Error(`量化分數異常：breadth=${breadthScore}, technical=${technicalScore}, vix=${vixScore}, cross=${crossAssetRisk}, total=${totalRisk}`);
const riskLabel = totalRisk >= 60 ? "High Risk" : totalRisk >= 35 ? "Intermediate Risk" : "Low Risk";
const marketScoreTable = table([
  {label:"評分維度"},{label:"原始風險",num:true},{label:"權重",num:true},{label:"風險分",num:true},{label:"量化依據"}
], scoreRows.map((row) => {
  const attrs = row[0] === "VIX 波動" ? ` data-vix-close="${fixed(vix.close, 4)}" data-vix-daily="${fixed(vix.dailyPct, 4)}" data-vix-five-day="${fixed(vix.fiveDayPct, 4)}" data-vixy-above20="${vixy.above20}" data-vixy-above50="${vixy.above50}"` : "";
  return `<tr${attrs}>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3]}" data-max-score="${row[4]}">${row[3]}/${row[4]}</td>${cell(row[5])}</tr>`;
}), "market-score-table report-data-table report-cols-5");

const previousRules = [
  ["大盤趨勢失效", "SPY <20MA 762.33，且 SPX >20MA 廣度 <45%。", `SPY ${fixed(byTicker("SPY").close)}；SPX >20MA ${fixed(currentBreadth.spx20)}%（8/28）。`, "未觸發", "廣度條件成立，但 SPY 仍高於原 20MA。"],
  ["科技修復失效", "QQQ <50MA 713.35，且 SMH <20MA 562.94。", `QQQ ${fixed(byTicker("QQQ").close)}；SMH ${fixed(byTicker("SMH").close)}。`, "未觸發", "SMH 條件成立，QQQ 尚高於原 50MA。"],
  ["晶片完整突破", "SMH >50MA 589.30，且 NDX >20MA 廣度 >60%。", `SMH ${fixed(byTicker("SMH").close)}；NDX ${fixed(currentBreadth.ndx20)}%（8/28）。`, "未觸發", "價格與廣度均未達門檻。"],
  ["廣度失速", "NDX >20MA <45%，或 Stockbee 5D <1。", `${fixed(currentBreadth.ndx20)}%（8/28）；${fixed(currentStockbee.ratio5d)}（8/28）。`, "已觸發", "Stockbee 5D 降至 0.98，依原規則停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5。", `VIX ${fixed(vix.close)}；${vixScore}/5。`, "未觸發", "VIX 與 VIXY 均未確認波動升級。"],
  ["美元／長端壓力", "DXY >100，且 10Y >4.80%。", `DXY ${fixed(dxyExternal.close)}；10Y ${fixed(treasuryCurrent.tenYear)}%。`, "未觸發", "兩項都未達原門檻，複合條件不成立。"],
  ["能源再通膨", "USO >20MA 126.00 附近，且 10Y >4.75%。", `USO ${fixed(byTicker("USO").close)}；10Y ${fixed(treasuryCurrent.tenYear)}%。`, "未觸發", "USO 成立，但 10Y 低於原門檻。"],
  ["成長失速", "IWM <20MA 298.60，且 Stockbee 5D <1。", `IWM ${fixed(byTicker("IWM").close)}；Stockbee 5D ${fixed(currentStockbee.ratio5d)}。`, "已觸發", "價格與廣度兩項均成立，小型股風險上升。"],
  ["NVDA 事件失效", "NVDA <20MA 213.18，且 SMH <20MA 562.94。", `NVDA ${fixed(byTicker("NVDA").close)}；SMH ${fixed(byTicker("SMH").close)}。`, "未觸發", "SMH 成立，但 NVDA 尚高於原 20MA；現行 20MA 已升至 218.05。"]
];
const previousTable = table([
  {label:"上週規則／監控項"},{label:"原門檻"},{label:"本週結果"},{label:"分類",result:true},{label:"修正／備註"}
], previousRules.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}<td class="result-cell">${resultBadge(row[3])}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5");

const yieldBp = {
  twoYear: Math.round((treasuryCurrent.twoYear - treasuryPrior.twoYear) * 100),
  tenYear: Math.round((treasuryCurrent.tenYear - treasuryPrior.tenYear) * 100),
  twentyYear: Math.round((treasuryCurrent.twentyYear - treasuryPrior.twentyYear) * 100),
  thirtyYear: Math.round((treasuryCurrent.thirtyYear - treasuryPrior.thirtyYear) * 100)
};
const bpText = (value) => `${value >= 0 ? "+" : ""}${value}bp`;
const prior10s2s = Math.round((treasuryPrior.tenYear - treasuryPrior.twoYear) * 100);
const current10s2s = Math.round((treasuryCurrent.tenYear - treasuryCurrent.twoYear) * 100);
const crossAssets = [
  ["DXY", fixed(dxyExternal.close), signed(dxyExternal.fiveDayPct), signed(dxyExternal.oneMonthPct), `${dxyExternal.source}；美元週線反彈，但仍低於 100。`],
  ...["USDU","FXE","FXB","FXY"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {
      USDU:"美元代理五日轉強，但仍低於 50MA；與前端利率上升方向一致。",
      FXE:"歐元代理週線回落，確認本週美元壓力來自主要交叉盤。",
      FXB:"英鎊代理週線回落，美元反彈並非單一貨幣對。",
      FXY:"日圓代理週月同跌，利差交易尚未逆轉。"
    }[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ["美國 2 年債殖利率", `${fixed(treasuryCurrent.twoYear)}%`, bpText(yieldBp.twoYear), "不適用", "一週升 10bp，是 Warsh 談話後最明確的政策偏鷹反饋。"],
  ["美國 10 年債殖利率", `${fixed(treasuryCurrent.tenYear)}%`, bpText(yieldBp.tenYear), "不適用", "一週微降 1bp；長端未跟隨前端上行，曲線轉平。"],
  ["美國 20 年債殖利率", `${fixed(treasuryCurrent.twentyYear)}%`, bpText(yieldBp.twentyYear), "不適用", "超長端回落 4bp，但絕對水位仍高於 5%。"],
  ["美國 30 年債殖利率", `${fixed(treasuryCurrent.thirtyYear)}%`, bpText(yieldBp.thirtyYear), "不適用", `一週降 5bp；10s2s 由 ${prior10s2s}bp 收窄至 ${current10s2s}bp。`],
  ...["SHY","IEF","TLT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = ticker === "SHY" ? "短債價格小跌，對應 2Y 殖利率上升。" : ticker === "IEF" ? "中期債近乎持平，與 10Y 殖利率微降一致。" : `長債週線反彈，但仍低於 50／200MA，距 50MA ${fixed(row.distance50Atr)} ATR。`;
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ...["USO","GLD","SLV","CPER","IBIT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {
      USO:"週線回落但一月仍升，供給型通膨壓力降溫、尚未消失。",
      GLD:"一月仍強，本週回吐；與長端殖利率回落沒有形成新一輪同步突破。",
      SLV:"週線跌幅大於黃金，但一月仍雙位數上漲，屬高波動降溫。",
      CPER:"週月動能偏弱，實體週期沒有確認科技大盤的高位強度。",
      IBIT:"週線小漲且 RSI 過熱；WGMI 大跌，現貨與礦工 beta 分歧。"
    }[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  })
];

const macroRows = [
  ["Q2 GDP 第二次估算", "年化 +1.5%", "第二次估算", "初值約 +1.4%", "總量溫和，但私人國內購買者 +4.2%，內需比標題 GDP 強。"],
  ["7月 PCE／核心 PCE", "YoY +3.7%／+3.3%", "Fed 目標 2%", "—", "兩者 MoM 均 +0.2%；通膨仍高於目標，限制快速降息。"],
  ["7月個人所得／支出", "+0.4%／+0.2%", "—", "—", "實質 PCE 約持平、儲蓄率 3.0%，消費名義成長未轉化為實質加速。"],
  ["7月耐用品訂單", "+1.1%", "—", "—", "扣除運輸 +0.4%、扣除國防 +1.3%，企業投資訊號比大盤廣度穩。"],
  ["7月新屋銷售", "60.7萬，MoM -10.5%", "—", "67.8萬", "庫存 48.8萬、供應 9.6 個月，房屋需求與小型股同步轉弱。"],
  ["8月消費者信心", "89.4", "—", "90.2", "預期指數僅 68.2，家庭對未來偏保守，與實質支出停滯互相確認。"],
  ["CES 年度基準初估", "非農 -7.9萬", "截至 2026年3月", "—", "總體修訂僅 -0.1%，但私人部門 -17.8萬，就業底盤略弱於原估。"],
  ["Warsh 談話／殖利率", "2Y +10bp；10Y -1bp", "固定 2% 通膨目標", "2Y 4.24%／10Y 4.74%", "主席未承諾政策路徑，強調通膨仍高；曲線以由前端主導的趨平反映更久的政策約束。"]
];

const eventRows = [
  ["9/1 10:00", "7月 JOLTS 職缺", "待公布", "740萬", "職缺是否延續降溫，與週五非農一起判斷勞動需求。"],
  ["9/1 10:00", "8月 ISM 製造業", "待公布", "55.6", "新訂單、就業與價格分項決定成長／通膨組合。"],
  ["9/1 10:00", "7月建築支出", "待公布", "—", "住宅弱勢是否擴散到非住宅建設。"],
  ["9/2 盤後", "Broadcom Q3 FY26 財報", "公司營收指引 294億美元", "AI 半導體營收指引 160億美元", "AI 收入、網路晶片與毛利率能否修復 SMH／MRVL 弱勢。"],
  ["9/3 08:30／10:00", "7月貿易帳／8月 ISM 服務業", "待公布", "逆差 733億美元／54.1", "服務價格與就業分項是 PCE 之後的通膨交叉驗證。"],
  ["9/3 08:30", "Q2 生產力與單位勞工成本修訂", "待公布", "初值待修訂", "生產力能否吸收薪資與 AI 資本開支，直接影響利潤率敘事。"],
  ["9/4 08:30", "8月就業報告", "待公布", "非農 -2.3萬／失業率 4.1%", "全週主事件；薪資、參與率與前值修訂共同決定 Fed 定價。"]
];

const scenarios = [
  ["基準：指數高位、廣度低位震盪", 35, "ISM 保持擴張，非農接近零附近；2Y 維持 4.20%–4.40%。", "SPY 守 20MA、QQQ 守 50MA，但 Stockbee 5D 僅在 1 附近。", "軟體相對領先，晶片與小型股反覆。", "維持核心，新增高 beta 曝險偏低。"],
  ["偏多：數據溫和且廣度再擴散", 20, "就業不弱不熱，2Y <4.20%、10Y <4.65%。", `QQQ 收回 20MA ${fixed(byTicker("QQQ").ma20)}，NDX 20MA >55%，Stockbee 5D >1.5。`, "SMH／AVGO 與等權軟體共同上漲。", "確認後分批回補 1/3 高 beta。"],
  ["偏空：政策與獲利品質雙壓", 35, "ISM 價格偏熱或就業強，2Y >4.40%、10Y >4.80%。", `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX 20MA 廣度 <40%。`, "晶片、小型股、工業與高估值消費續弱。", "科技與週期再降低 1/3。"],
  ["尾端：就業失速", 10, "非農再度負值、失業率上升，長端因成長擔憂急跌。", `IWM <50MA ${fixed(byTicker("IWM").ma50)}，Stockbee 5D 持續 <1。`, "長債與防守相對領先，週期股落後。", "降低週期曝險，等待廣度止跌。"]
];
const scenarioTable = table([
  {label:"下週情境"},{label:"主觀概率",num:true},{label:"宏觀／跨資產觸發"},{label:"指數／廣度預測"},{label:"板塊／主題預測"},{label:"交易動作"}
], scenarios.map((row) => `<tr>${cell(row[0])}<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`), "scenario-table report-data-table report-cols-6");

const linkageRows = [
  ["大盤 ETF", "SPY／QQQ／DIA 小漲，IWM 週跌；QQQ／DIA 低於 20MA。", `QQQ >20MA ${fixed(byTicker("QQQ").ma20)} 且 IWM >20MA ${fixed(byTicker("IWM").ma20)}。`, `SPY <20MA ${fixed(byTicker("SPY").ma20)} 且廣度再降。`],
  ["市場廣度", "六項 MA 廣度與 Stockbee 5D／10D 全數週降。", "SPX／NDX 20MA >55%，Stockbee 5D >1.5。", "SPX 20MA <40% 或 Stockbee 5D 持續 <1。"],
  ["Sector／Thematic", "軟體、資安、通信領先；工業、醫療、能源與太空落後。", `SMH >20MA ${fixed(byTicker("SMH").ma20)}，且 XSW 保持三線上方。`, `SMH <50MA ${fixed(byTicker("SMH").ma50)} 且 IGV 跌破 20MA。`],
  ["美債／美元", "2Y 升、長端降、USDU 反彈，金融條件呈前端收緊。", "2Y <4.20%、10Y <4.65%、USDU 五日轉負。", "2Y >4.40% 且 10Y >4.80%。"],
  ["商品／加密", "油金銀週線回吐；IBIT 小漲但 WGMI 大跌。", "CPER、IWM 與 WGMI 同步轉強。", "USO 重返上漲且 2Y／10Y 同升，或 IBIT 跌破 20MA。"],
  ["宏觀／財報", "GDP 內需尚強、PCE 偏高、就業基準略下修。", "就業溫和、ISM 價格降溫、AVGO 指引強。", "就業／ISM 過熱或 AVGO 毛利／AI 指引失望。"]
];
const linkageTable = table([
  {label:"上文模組"},{label:"基準判斷"},{label:"偏多確認"},{label:"偏空／失效"}
], linkageRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}${cell(row[3])}</tr>`), "scenario-linkage-table report-data-table report-cols-4");

const monitoring = [
  ["大盤趨勢失效", `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <40%`, `${fixed(byTicker("SPY").close)}；${fixed(currentBreadth.spx20)}%（8/28）`, "總風險降低 1/3。"],
  ["科技修復", `QQQ >20MA ${fixed(byTicker("QQQ").ma20)}，且 SMH >20MA ${fixed(byTicker("SMH").ma20)}`, `${fixed(byTicker("QQQ").close)}；${fixed(byTicker("SMH").close)}`, "科技回補 1/3。"],
  ["晶片趨勢修復", `SMH >50MA ${fixed(byTicker("SMH").ma50)}，且 NDX >20MA 廣度 >55%`, `${fixed(byTicker("SMH").close)}；${fixed(currentBreadth.ndx20)}%（8/28）`, "晶片曝險回到中性。"],
  ["廣度失速", "SPX >20MA <40%，或 Stockbee 5D <1", `${fixed(currentBreadth.spx20)}%（8/28）；${fixed(currentStockbee.ratio5d)}（8/28）`, "停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5", `${fixed(vix.close)}；${vixScore}/5`, "降低大盤曝險並停止追價。"],
  ["前端／長端壓力", "2Y >4.40%，且 10Y >4.80%", `${fixed(treasuryCurrent.twoYear)}%；${fixed(treasuryCurrent.tenYear)}%`, "科技與高 beta 再降低 1/3。"],
  ["美元／長端壓力", "DXY >100.00，且 10Y >4.80%", `${fixed(dxyExternal.close)}；${fixed(treasuryCurrent.tenYear)}%`, "降低科技與高 beta 1/3。"],
  ["成長失速", `IWM <50MA ${fixed(byTicker("IWM").ma50)}，且 Stockbee 5D <1`, `${fixed(byTicker("IWM").close)}；${fixed(currentStockbee.ratio5d)}`, "降低週期與小型股 1/3。"],
  ["AVGO 事件失效", `SMH <20MA ${fixed(byTicker("SMH").ma20)}，且 AVGO 財報後跌破 20MA`, `SMH ${fixed(byTicker("SMH").close)}；AVGO 待 9/2`, "晶片與 AI 硬件降低 1/3。"]
];
const monitorTable = table([
  {label:"訊號名"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}
], monitoring.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "weekly-monitor-table report-data-table report-cols-4");

const sources = `<ul>
  <li>長橋 CLI：8/28 收盤、5日／1月漲跌採 <code>kline history --adjust none</code>；均線、RSI、ATR 與 52 週高採前復權序列。139／139 標的成功。</li>
  <li><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit?gid=0#gid=0" target="_blank" rel="noopener">Market Watch Google Sheet</a> 與 <a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit" target="_blank" rel="noopener">Stockbee 2026</a>；Sector、Thematic、MA 廣度與 Stockbee 截至 8/28。</li>
  <li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&amp;type=daily_treasury_yield_curve" target="_blank" rel="noopener">美國財政部每日殖利率</a>：8/21 與 8/28；DXY 採 <a href="https://www.investing.com/indices/usdollar-historical-data" target="_blank" rel="noopener">Investing.com 8/28 歷史收盤</a>，其餘外匯、債券、商品與加密代理使用長橋 8/28 收盤。</li>
  <li><a href="https://www.bea.gov/news/2026/gdp-second-estimate-and-corporate-profits-2nd-quarter-2026" target="_blank" rel="noopener">BEA Q2 GDP 第二次估算</a>、<a href="https://www.bea.gov/news/2026/personal-income-and-outlays-july-2026" target="_blank" rel="noopener">BEA 7月 PCE</a>、<a href="https://www.census.gov/manufacturing/m3/adv/current/index.html" target="_blank" rel="noopener">Census 耐用品</a>、<a href="https://www.census.gov/construction/nrs/current/" target="_blank" rel="noopener">Census 新屋銷售</a>。</li>
  <li><a href="https://www.conference-board.org/topics/consumer-confidence/index.cfm" target="_blank" rel="noopener">Conference Board 消費者信心</a>、<a href="https://www.bls.gov/news.release/archives/prebmk_08282026.htm" target="_blank" rel="noopener">BLS CES 基準初估</a>、<a href="https://www.federalreserve.gov/newsevents/speech/warsh20260828a.htm" target="_blank" rel="noopener">Federal Reserve 主席 Warsh 8/28 談話</a>。</li>
  <li><a href="https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx" target="_blank" rel="noopener">NVIDIA Q2 FY27</a>、<a href="https://investor.salesforce.com/news/news-details/2026/Salesforce-Delivers-Record-Second-Quarter-Fiscal-2027-Results/default.aspx" target="_blank" rel="noopener">Salesforce Q2 FY27</a>、<a href="https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-reports-second-quarter-fiscal-year-2027-financial" target="_blank" rel="noopener">CrowdStrike Q2 FY27</a>、<a href="https://investor.marvell.com/news-events/press-releases/detail/1031/marvell-technology-inc-reports-second-quarter-of-fiscal-year-2027-financial-results" target="_blank" rel="noopener">Marvell Q2 FY27</a>。</li>
  <li>下週日曆：<a href="https://www.bls.gov/schedule/2026/09_sched.htm" target="_blank" rel="noopener">BLS 9月發布表</a>、<a href="https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/" target="_blank" rel="noopener">ISM 日曆</a>、<a href="https://www.census.gov/economic-indicators/" target="_blank" rel="noopener">Census 經濟指標</a>、<a href="https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announce-third-quarter-fiscal-year-2026-financial" target="_blank" rel="noopener">Broadcom Q3 FY26 財報安排</a>。</li>
</ul>`;

const sectorSorted = [...sectors].sort((a, b) => b.fiveDayPct - a.fiveDayPct);
const indexOrder = ["SPY", "DIA", "QQQ", "IWM"].sort((a, b) => byTicker(b).rsi14 - byTicker(a).rsi14).join("、");
const extendedNames = atrExtended.map((row) => row.ticker).join("、");
const report = {
  report_title: "2026-08-28 美股一週總結｜指數小漲、廣度全線惡化；軟體領先、晶片失速",
  report_type: "weekly",
  week: "2026-08-24–2026-08-28",
  source_dates: {longbridge:expectedDate,market_watch_sheet:expectedDate,market_breadth_sheet:expectedDate,stockbee_sheet:expectedDate,treasury:expectedDate,dxy:dxyExternal.asOf},
  qqq_reengage_20ma: fixed(byTicker("QQQ").ma20),
  qqq_breakout_add_1sd: fixed(byTicker("QQQ").ma50),
  report_eyebrow: "2026-08-29｜美股週報｜資料截至 2026-08-28 收盤",
  report_heading: "美股一週總結：指數小漲、廣度全線惡化；軟體領先、晶片失速",
  data_timestamp_note: "收盤、技術值、MA 廣度與 Stockbee 均截至 8/28。",
  report_badges: `<span class="badge red">風險：${riskLabel}</span><span class="badge blue">SPY ${signed(byTicker("SPY").fiveDayPct)}</span><span class="badge red">廣度 ${breadthScore}/8</span><span class="badge amber">技術 ${technicalScore}/12</span><span class="badge green">VIX ${vixScore}/5</span>`,
  summary_cards: `<div class="card"><span>SPY／QQQ／IWM／DIA 5日</span><strong>${pct(byTicker("SPY").fiveDayPct)}／${pct(byTicker("QQQ").fiveDayPct)}／${pct(byTicker("IWM").fiveDayPct)}／${pct(byTicker("DIA").fiveDayPct)}</strong><small>三個大型指數小漲，IWM 轉跌；價格與廣度背離。</small></div><div class="card"><span>20MA 廣度／Stockbee</span><strong>${fixed(currentBreadth.spx20)}%／${fixed(currentBreadth.ndx20)}%／${fixed(currentBreadth.iwm20)}%</strong><small>六項 MA 廣度與 5D／10D ratio 全數較 8/21 下降。</small></div><div class="card"><span>領先 Sector</span><strong>XLC ${pct(byTicker("XLC").fiveDayPct)}／XLK ${pct(byTicker("XLK").fiveDayPct)}</strong><small>通信、科技與金融領先；醫療、工業、能源落後。</small></div><div class="card"><span>2Y／10Y／30Y 週變化</span><strong><span class="dn">${bpText(yieldBp.twoYear)}</span>／${bpText(yieldBp.tenYear)}／${bpText(yieldBp.thirtyYear)}</strong><small>前端升、長端降，10s2s 由 ${prior10s2s}bp 收窄至 ${current10s2s}bp。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才成立：High Risk 下，價格、廣度與利率至少兩項確認才提高曝險。",
  upgrade_trigger_1: `QQQ 收回 20MA ${fixed(byTicker("QQQ").ma20)}，且 SMH 收回 20MA ${fixed(byTicker("SMH").ma20)}。`,
  upgrade_trigger_2: "SPX／NDX >20MA 廣度同時 >55%，且 Stockbee 5D ratio >1.5。",
  upgrade_trigger_3: "2Y <4.20%、10Y <4.65%，且 USDU 五日轉負。",
  downgrade_trigger_rule: "任一觸發即成立：複合風控成立便降級，不等待 VIX 確認。",
  downgrade_trigger_1: `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <40%。`,
  downgrade_trigger_2: `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SMH <50MA ${fixed(byTicker("SMH").ma50)}。`,
  downgrade_trigger_3: "2Y >4.40% 且 10Y >4.80%，或 VIX 五項波動分數 >=4/5。",
  core_conclusions: `<ol><li><strong>指數小漲，市場內部卻轉弱。</strong>SPY／QQQ／DIA 五日 ${signed(byTicker("SPY").fiveDayPct)}／${signed(byTicker("QQQ").fiveDayPct)}／${signed(byTicker("DIA").fiveDayPct)}，IWM ${signed(byTicker("IWM").fiveDayPct)}；QQQ／DIA 低於 20MA，IWM 低於 20／50MA。</li><li><strong>廣度是本週主風險。</strong>六項 MA 廣度與 Stockbee 5D／10D 八項全部較 8/21 惡化；SPX／NDX／IWM 20MA 廣度降至 ${fixed(currentBreadth.spx20)}%／${fixed(currentBreadth.ndx20)}%／${fixed(currentBreadth.iwm20)}%，4% 上漲／下跌僅 ${currentStockbee.up4}／${currentStockbee.down4}。</li><li><strong>財報市場獎勵可見的軟體現金流，沒有獎勵單純 AI 收入增長。</strong>CRM／CRWD 五日 ${signed(byTicker("CRM").fiveDayPct)}／${signed(byTicker("CRWD").fiveDayPct)}，IGV／BUG 領先；NVDA 財報週仍升 ${signed(byTicker("NVDA").fiveDayPct)}，但週五 ${signed(byTicker("NVDA").dailyPct)}、SMH 五日 ${signed(byTicker("SMH").fiveDayPct)}、MRVL ${signed(byTicker("MRVL").fiveDayPct)}，晶片擴散失敗。</li><li><strong>跨資產是前端收緊、長端回落。</strong>2Y 一週 ${bpText(yieldBp.twoYear)}，10Y／30Y ${bpText(yieldBp.tenYear)}／${bpText(yieldBp.thirtyYear)}，USDU 五日 ${signed(byTicker("USDU").fiveDayPct)}；油、金、銀同步回吐，並非全面通膨交易。</li><li><strong>下週由 ISM、JOLTS、非農與 AVGO 接力。</strong>就業與服務價格決定 Fed 路徑，AVGO 則驗證 AI 收入能否同時帶來毛利與指引品質；市場要脫離背離，還需要 QQQ／SMH 收回 20MA 與廣度回升。</li></ol>`,
  weekly_positioning: `<h3>市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>市場風險分數</span><strong>${totalRisk}<small>/100</small></strong><em>${riskLabel}</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:${totalRisk}%"></span></div><p>風險來自廣度 8/8 惡化、${weakRows.length}/${weakUniverse.length} 個板塊／主題轉弱、三大指數技術 4/12 與跨資產 3/4；VIX 0/5 顯示這是低波動的內部背離，不是恐慌式拋售。</p><small>0–34 Low Risk；35–59 Intermediate Risk；60–100 High Risk。</small></div></div>${marketScoreTable}<div class="callout warn"><strong>分數反算：</strong>${scoreRows.map((row) => row[3]).join(" + ")} = ${totalRisk}。風險已進入 High Risk，但 VIX 未確認，配置應先限制新增曝險而非追著指數小跌殺低。</div><div class="action-directive"><span class="ad-label">本週配置</span><ul class="ad-list"><li class="ad-primary">保留寬基核心，新增高 beta 曝險維持低檔，等待價格與廣度重新同步。</li><li class="ad-watch">相對強勢集中 IGV、BUG、CIBR、XSW 與 XLC；CRM 已延伸 6.91 ATR，不追財報跳空。</li><li class="ad-avoid">IWM、SMH、工業與太空主題尚未止弱；VIX 低位不能抵銷廣度風控。</li></ul></div>`,
  previous_week_reconciliation: `<div class="status-pills"><span class="badge green">0 命中</span><span class="badge amber">2 已觸發</span><span class="badge red">0 失誤</span><span class="badge grey">7 未觸發</span></div>${previousTable}<div class="callout warn"><strong>對賬結論：</strong>上週九條複合規則中「廣度失速」與「成長失速」成立；大盤趨勢、科技修復與 NVDA 事件失效均只成立一半。風控應落在小型股與新增高 beta，而不是把未完全觸發的條件誤判為全面熊市。</div>`,
  indices_style_review: `${table([{label:"ETF"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}], indexRows, "ma-table report-data-table report-cols-7 index-summary-table", 'data-major-universe="indices-4" data-sort="rsi-desc"')}<p><strong>小結：</strong>依 RSI 由高至低為 ${indexOrder}。SPY 僅高於 20MA ${fixed(byTicker("SPY").close - byTicker("SPY").ma20)}，QQQ 低於 20MA ${fixed(byTicker("QQQ").ma20 - byTicker("QQQ").close)}；RSP／QQQE 五日 ${signed(byTicker("RSP").fiveDayPct)}／${signed(byTicker("QQQE").fiveDayPct)}，等權表現弱於市值加權，指數集中度仍高。</p>`,
  big_winners_losers: `${moverTable("本週五大強勢股", winners)}${moverTable("本週五大弱勢股", losers)}<div class="callout warn"><strong>財報因子對照：</strong>CRM 營收 113 億美元、cRPO +14%、非 GAAP 營業利益率 34.1%、FCF +81%；CRWD ARR 58.4 億美元、淨新增 ARR 3.33 億美元、FCF 3.77 億美元，兩者都把增長與現金流一起交付。NVDA 營收 962 億美元、資料中心 890 億美元、非 GAAP 毛利率 75%，但週五仍跌 ${signed(byTicker("NVDA").dailyPct)}；MRVL 財報後跌 ${signed(byTicker("MRVL").dailyPct)}。市場正在區分「增長」與「增長能否改善毛利／現金流」。</div><p><strong>共同因子：</strong>強勢榜由企業軟體與資安主導，弱勢榜集中太空、消費高估值與晶片。這與 IGV／BUG 上漲、SMH／UFO 下跌完全一致，是可交叉驗證的產業輪動。</p>`,
  sector_momentum_chart: barChart(["IGV","BUG","XLC","XLK","SMH","SLV","AIRR","WGMI"].map((ticker) => ({label:ticker,value:byTicker(ticker).fiveDayPct}))),
  sector_thematic_weekly: `${etfTable("S&amp;P 500 Sector ETF", sectors, 'data-etf-group="sector" data-expected-rows="12" data-benchmark="SPY" data-sort="rsi-desc"')}${etfTable("Thematic Sector ETF", themes, 'data-etf-group="thematic" data-expected-rows="45" data-etf-universe="thematic-complete" data-source-count="45" data-report-count="45" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc"')}${themeMoverReviewTable("Thematic 週漲幅前 5 點評", themeWeeklyGainers, 'data-theme-mover="gainers" data-expected-rows="5" data-sort="five-day-desc"')}${themeMoverReviewTable("Thematic 週跌幅前 5 點評", themeWeeklyLosers, 'data-theme-mover="losers" data-expected-rows="5" data-sort="five-day-asc"')}<div class="callout warn"><strong>板塊結論：</strong>Sector 前三為 ${sectorSorted.slice(0, 3).map((row) => `${row.ticker} ${signed(row.fiveDayPct)}`).join("、")}；後三為 ${sectorSorted.slice(-3).map((row) => `${row.ticker} ${signed(row.fiveDayPct)}`).join("、")}。Thematic 前五全部是軟體、資安與大型科技，後五集中礦工、工業、貴金屬與太空。55 個非基準板塊／主題中有 ${weakRows.length} 個符合弱勢定義，領漲集中且擴散不足。</div>`,
  market_breadth_weekly: `${table([{label:"指標（最新日）"},{label:"最新",num:true},{label:"8/21",num:true},{label:"週變化",num:true},{label:"判斷"}], breadthRows, "report-data-table report-cols-5")}<div class="status-pills"><span class="badge red">5日惡化 ${breadthScore}/8</span><span class="badge red">Stockbee 5D ${fixed(currentStockbee.ratio5d)}</span><span class="badge amber">Stockbee 10D ${fixed(currentStockbee.ratio10d)}</span><span class="badge amber">T2108 ${fixed(currentStockbee.t2108)}%</span></div><p><strong>三大指數廣度：</strong>8/28 對 8/21，SPX 20／50MA 變化 ${fixed(currentBreadth.spx20 - priorBreadth.spx20)}／${fixed(currentBreadth.spx50 - priorBreadth.spx50)}pp；NDX ${fixed(currentBreadth.ndx20 - priorBreadth.ndx20)}／${fixed(currentBreadth.ndx50 - priorBreadth.ndx50)}pp；IWM ${fixed(currentBreadth.iwm20 - priorBreadth.iwm20)}／${fixed(currentBreadth.iwm50 - priorBreadth.iwm50)}pp。六項全部惡化，IWM 20MA 降幅最大。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 由 ${fixed(priorStockbee.ratio5d)} 降至 ${fixed(currentStockbee.ratio5d)}，10D 由 ${fixed(priorStockbee.ratio10d)} 降至 ${fixed(currentStockbee.ratio10d)}；T2108 由 ${fixed(priorStockbee.t2108)}% 降至 ${fixed(currentStockbee.t2108)}%。季度 25% 上漲／下跌仍為 ${currentStockbee.quarterUp25}／${currentStockbee.quarterDown25}，中期結構未翻空，但短線已防守。</p><div class="callout warn"><strong>綜合結論：</strong>五日趨勢量化分數 ${breadthScore}/8，屬全面惡化。下週只有 SPX／NDX 20MA 同回 55% 以上且 Stockbee 5D >1.5，才算廣度修復；SPX 20MA <40% 或 5D 持續 <1，則維持 High Risk。</div>`,
  atr_weekly: `${table([{label:"ETF"},{label:"價格",num:true},{label:"50MA",num:true},{label:"ATR(14)",num:true},{label:"距50MA ATR",num:true},{label:"判斷"}], atrRows, "report-data-table report-cols-6")}<div class="callout warn"><strong>小結：</strong>${atrExtendedCount}/${atrUniverse.length} 檔距 50MA 絕對值達 2 ATR：${extendedNames}，本輪全部屬正向延伸，集中金融、寬基、能源與貴金屬；CRM 另達 +${fixed(byTicker("CRM").distance50Atr)} ATR，財報跳空不適合追價。</div>`,
  fx_commodities_treasury_weekly: `${table([{label:"資產"},{label:"最新",num:true},{label:"5日／週變化",num:true},{label:"1月",num:true},{label:"市場含義"}], crossAssets.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<div class="callout warn"><strong>長短債比較：</strong>2Y／10Y／20Y／30Y 一週 ${bpText(yieldBp.twoYear)}／${bpText(yieldBp.tenYear)}／${bpText(yieldBp.twentyYear)}／${bpText(yieldBp.thirtyYear)}，10s2s 由 ${prior10s2s}bp 收窄至 ${current10s2s}bp，屬前端上升、長端下降的扭轉式趨平。TLT 週線反彈但仍低於 50／200MA；USDU 五日上升，政策約束集中在前端。</div>`,
  macro_fed_weekly: `${table([{label:"數據／政策"},{label:"實際／最新",num:true},{label:"預期／門檻",num:true},{label:"前值",num:true},{label:"政策與市場含義"}], macroRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "macro-review-table weekly-macro-fed-table report-data-table report-cols-5")}<p><strong>小結：</strong>GDP 內需與耐用品顯示企業活動尚有韌性，但實質消費停滯、新屋銷售與信心偏弱；PCE 仍高於目標，Warsh 未提供寬鬆承諾。市場因此把壓力放在 2Y，而非把長端推向新高，形成前端約束與成長疑慮並存。</p>`,
  next_week_plan: `${table([{label:"日期（ET）"},{label:"事件"},{label:"Forecast",num:true},{label:"Previous",num:true},{label:"監控重點"}], eventRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<p class="note">9/1–9/4 是連續驗證窗：先以 JOLTS／ISM 判斷需求與價格，再用 AVGO 驗證 AI 硬件，最後由非農決定 Fed 定價。</p><h3>四種情境與主觀概率</h3>${scenarioTable}<h3>各模組聯動預測</h3>${linkageTable}<div class="action-directive"><span class="ad-label">執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看 9/1：</strong>JOLTS 與 ISM 製造業的就業／價格分項是否同向。</li><li class="ad-watch"><strong>再看 9/2：</strong>AVGO 的 AI 收入、毛利率與下一季指引能否讓 SMH 收回 20MA。</li><li class="ad-watch"><strong>核心看 9/3–9/4：</strong>ISM 服務業價格與非農共同決定 2Y 是否突破 4.40%。</li><li class="ad-invalidate"><strong>風控：</strong>SPY <20MA ${fixed(byTicker("SPY").ma20)} 且 SPX 20MA <40%，或 QQQ <50MA ${fixed(byTicker("QQQ").ma50)} 且 SMH <50MA ${fixed(byTicker("SMH").ma50)}，降低高 beta 1/3；DXY >100 且 10Y >4.80% 時降低科技 1/3。</li></ul></div>`,
  cross_validation_summary: `<div class="callout ok"><strong>互相確認：</strong>SPY／QQQ／DIA 週線仍正、VIX 收 ${fixed(vix.close)} 且波動分數 ${vixScore}/5，市場沒有進入恐慌性去風險。</div><div class="callout warn"><strong>互相分歧：</strong>廣度 ${breadthScore}/8 全面惡化、三大指數技術 ${technicalScore}/12、弱勢板塊／主題 ${weakRows.length}/${weakUniverse.length}，IWM 與 SMH 同時失守短中期均線。指數高位主要由大型軟體與平台股維持。</div><div class="callout warn"><strong>主導結論：</strong>${totalRisk}/100 ${riskLabel}，而且是低 VIX 的廣度背離型。保留核心、限制新增風險；只有價格、廣度與利率至少兩項改善，才提高曝險。</div>`,
  next_week_monitoring_checklist: monitorTable,
  sources
};

const output = path.resolve(root, "data/2026-08-28-weekly.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({output:path.relative(root, output), totalRisk, breadthScore, technicalScore, vixScore, sectorRows:sectors.length, thematicRows:themes.length, winners:winners.map((row) => row.ticker), losers:losers.map((row) => row.ticker)}, null, 2));
