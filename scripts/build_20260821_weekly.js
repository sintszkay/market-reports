#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const raw = read("data/2026-08-21-weekly-longbridge.json");
const adjusted = read("data/2026-08-21-weekly-longbridge-adjusted.json");
const sheet = read("data/2026-08-21-weekly-google-sheet.json");
const expectedDate = "2026-08-21";
const dxyExternal = {
  asOf: expectedDate,
  close: 98.66,
  fiveDayPct: -1.01,
  oneMonthPct: -2.48,
  source: "Investing.com DXY 歷史收盤"
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
    SPY: "三條均線上方，但五日轉負且 SPX 20MA 廣度跌破 50%。",
    DIA: "四大 ETF 中跌幅最小，仍守三條均線，價值風格相對抗跌。",
    IWM: "仍守三條均線，但五日轉負；小型股未確認廣度修復。",
    QQQ: "收盤僅略高於 50MA，且 SMH 已跌破 20／50MA。"
  }[row.ticker];
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(special)}</tr>`;
});

const excludedMovers = new Set([...raw.universes.coreTickers, "MSTR"]);
const moverPool = raw.rows.filter((row) => raw.universes.moverCandidates.includes(row.ticker) && !excludedMovers.has(row.ticker));
const winners = [...moverPool].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const losers = [...moverPool].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const moverNotes = {
  RCEL: "五日大幅加速且一月漲幅已逾一倍，屬公司事件驅動的高波動醫療股；不以未核實消息替代原因。",
  COIN: "比特幣錄得多年來最大單週升幅，交易平台與加密 beta 同步放大。",
  CRCL: "穩定幣與加密監管樂觀情緒疊加，比特幣反彈帶動估值修復。",
  HOOD: "加密、交易與監管預期共同推動，並與 COIN／CRCL 同向確認。",
  ELF: "消費成長股在前期調整後反彈，但零售數據仍要求後續營收與毛利確認。",
  ARM: "長端利率上升與 AI 高估值去風險共同壓制，跌幅大於 SMH。",
  INTC: "晶片板塊去風險疊加先前大額增發稀釋壓力，五日跌幅擴大。",
  ONTO: "半導體設備在高位獲利回吐，市場把焦點移到 NVDA 財報前的產業資本開支驗證。",
  CRWD: "高位獲利回吐，加上全球 CTO 離任消息，提高短期執行不確定性。",
  ALAB: "AI 連接晶片高 beta 隨半導體估值壓縮，且五日／一月均轉負。"
};
const moverTable = (title, rows) => `<h3>${title}</h3>${table([
  {label:"股票"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"市場反饋因子"}
], rows.map((row) => `<tr>${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${cell(moverNotes[row.ticker] || "財報與預期差推動本週重新定價。")}</tr>`), "ma-table report-data-table report-cols-5")}`;

const themeWeeklyUniverse = themes.filter((row) => row.ticker !== "VOO");
const themeWeeklyGainers = [...themeWeeklyUniverse].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5);
const themeWeeklyLosers = [...themeWeeklyUniverse].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5);
const themeMoverNotes = {
  IBIT: `比特幣代理五日 ${signed(byTicker("IBIT").fiveDayPct)}，與 COIN／CRCL／HOOD 同向；RSI ${fixed(byTicker("IBIT").rsi14)} 已過熱，趨勢強但不追價。`,
  COPX: `美元轉弱與金屬輪動推動銅礦五日 ${signed(byTicker("COPX").fiveDayPct)}、一月 ${signed(byTicker("COPX").oneMonthPct)}；三線上方，先看 20MA ${fixed(byTicker("COPX").ma20)}。`,
  IBB: `生技與 XLV 同步領先，顯示資金轉向有防守屬性的成長；RSI ${fixed(byTicker("IBB").rsi14)} 已進入過熱區。`,
  SLV: `銀價受美元偏弱與貴金屬需求支持，五日 ${signed(byTicker("SLV").fiveDayPct)}；一月已升 ${signed(byTicker("SLV").oneMonthPct)}，但仍低於 200MA。`,
  ARKK: `高 beta 創新籃子受加密與成長股反彈帶動；三線上方，但需 Stockbee 5D 回到 2 以上確認擴散。`,
  XAR: `航太國防五日 ${signed(byTicker("XAR").fiveDayPct)}，已跌破 20／50MA；由前期領先轉為獲利回吐，下週先看 50MA ${fixed(byTicker("XAR").ma50)}。`,
  AIRR: `美國工業復興籃子跌破三條均線，與 XLI 同步，顯示工業輪動已由強轉弱。`,
  JETS: `USO 五日 ${signed(byTicker("USO").fiveDayPct)} 加重燃油成本壓力；JETS 已低於 20／50MA，反彈先看 20MA ${fixed(byTicker("JETS").ma20)}。`,
  ITA: `國防 ETF 與 XAR 同步跌破 20／50MA，確認不是單一標的波動，而是前期強勢軍工回吐。`,
  WGMI: `IBIT 大漲但礦工 ETF 反跌，市場偏好現貨資產 beta、沒有同步買入營運槓桿；這是加密行情品質的關鍵分歧。`
};
const themeMoverReviewTable = (title, rows, attrs) => `<div class="theme-mover-review"><h3>${title}</h3>${table([
  {label:"ETF"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"點評／下週觀察"}
], rows.map((row) => `<tr data-five-day="${fixed(row.fiveDayPct, 4)}">${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(themeMoverNotes[row.ticker])}</tr>`), "ma-table report-data-table report-cols-6 theme-mover-table", attrs)}</div>`;

if (themeWeeklyGainers.map((row) => row.ticker).join(",") !== "IBIT,COPX,IBB,SLV,ARKK" || themeWeeklyLosers.map((row) => row.ticker).join(",") !== "XAR,AIRR,JETS,ITA,WGMI") {
  throw new Error("Thematic ETF 週漲跌幅前五名與資料快照不一致。");
}

const currentBreadth = sheet.breadth[0];
const priorBreadth = sheet.breadth.at(-1);
const currentStockbee = sheet.stockbeeRows[0];
const priorStockbee = sheet.stockbeeRows.at(-1);
const breadthDefinitions = [
  ["SPX >20MA（8/21）", currentBreadth.spx20, priorBreadth.spx20, "%"],
  ["SPX >50MA（8/21）", currentBreadth.spx50, priorBreadth.spx50, "%"],
  ["NDX >20MA（8/21）", currentBreadth.ndx20, priorBreadth.ndx20, "%"],
  ["NDX >50MA（8/21）", currentBreadth.ndx50, priorBreadth.ndx50, "%"],
  ["IWM >20MA（8/21）", currentBreadth.iwm20, priorBreadth.iwm20, "%"],
  ["IWM >50MA（8/21）", currentBreadth.iwm50, priorBreadth.iwm50, "%"],
  ["Stockbee 5D ratio（8/21）", currentStockbee.ratio5d, priorStockbee.ratio5d, ""],
  ["Stockbee 10D ratio（8/21）", currentStockbee.ratio10d, priorStockbee.ratio10d, ""],
  ["4%+ 上漲／下跌（8/21）", `${currentStockbee.up4}／${currentStockbee.down4}`, `${priorStockbee.up4}／${priorStockbee.down4}`, "pair"],
  ["T2108（8/21）", currentStockbee.t2108, priorStockbee.t2108, "%"],
  ["34/13 上漲／下跌（8/21）", `${currentStockbee.up34_13}／${currentStockbee.down34_13}`, `${priorStockbee.up34_13}／${priorStockbee.down34_13}`, "pair"]
];
const breadthRows = breadthDefinitions.map(([label, latest, prior, suffix]) => {
  if (suffix === "pair") return `<tr>${cell(label)}${num(latest)}${num(prior)}${num("—")}${cell(label.startsWith("4%") ? "週五單日反彈強，但不能抵銷五日廣度轉弱。" : "中期上漲股仍多於下跌股，但優勢縮窄。")}</tr>`;
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
const threeIndexRawRisk = ["SPY", "QQQ", "IWM"].map(byTicker).reduce((score, row) => score + [row.fiveDayPct < 0, row.oneMonthPct < 0, !row.above20, !row.above50].filter(Boolean).length, 0);
const treasuryPrior = sheet.treasury["2026-08-14"];
const treasuryCurrent = sheet.treasury["2026-08-21"];
const crossAssetChecks = [
  byTicker("USDU").fiveDayPct > 0.5,
  treasuryCurrent.tenYear > treasuryPrior.tenYear,
  !byTicker("TLT").above50,
  byTicker("USO").oneMonthPct > 0
];
const crossAssetRisk = crossAssetChecks.filter(Boolean).length;
const scoreRows = [
  ["三大指數技術", `${threeIndexRawRisk}/12`, "20%", Math.round(threeIndexRawRisk / 12 * 20), 20, "SPY／QQQ／IWM 各以 5日<0、1月<0、低於20MA、低於50MA計分；本週三檔皆為五日負報酬。"],
  ["市場廣度", `${breadthScore}/8`, "20%", Math.round(breadthScore / 8 * 20), 20, "六項 MA 廣度與 Stockbee 5D／10D 均以 8/21 對 8/14；惡化計風險。"],
  ["VIX 波動", `${vixScore}/5`, "10%", Math.round(vixScore / 5 * 10), 10, "VIX>20、VIX 日／週升、VIXY 高於20／50MA，共五項。"],
  ["板塊／主題動能", `${weakRows.length}/${weakUniverse.length}`, "15%", Math.round(weakRows.length / weakUniverse.length * 15), 15, "5日<0、低於20MA、RSI<50 三項中至少兩項成立即列弱勢。"],
  ["50MA ATR 延伸", `${atrExtendedCount}/${atrUniverse.length}`, "10%", Math.round(atrExtendedCount / atrUniverse.length * 10), 10, "固定 18 檔中距 50MA 絕對值達 2 ATR 的標的數。"],
  ["跨資產壓力", `${crossAssetRisk}/4`, "15%", Math.round(crossAssetRisk / 4 * 15), 15, "USDU 五日升幅>0.5%、10Y 週升、TLT 低於50MA、USO 一月上升；本週 10Y 與 TLT 兩項成立。"],
  ["宏觀／事件風險", "3/3", "10%", 10, 10, "長端殖利率上升、成長數據分歧、8/26 GDP／PCE／耐用品與 NVDA 財報形成同日事件窗。"]
];
const totalRisk = scoreRows.reduce((sum, row) => sum + row[3], 0);
if (breadthScore !== 8 || technicalScore !== 0 || vixScore !== 1 || crossAssetRisk !== 2 || totalRisk !== 58) throw new Error(`量化分數異常：breadth=${breadthScore}, technical=${technicalScore}, vix=${vixScore}, cross=${crossAssetRisk}, total=${totalRisk}`);
const marketScoreTable = table([
  {label:"評分維度"},{label:"原始風險",num:true},{label:"權重",num:true},{label:"風險分",num:true},{label:"量化依據"}
], scoreRows.map((row) => {
  const attrs = row[0] === "VIX 波動" ? ` data-vix-close="${fixed(vix.close, 4)}" data-vix-daily="${fixed(vix.dailyPct, 4)}" data-vix-five-day="${fixed(vix.fiveDayPct, 4)}" data-vixy-above20="${vixy.above20}" data-vixy-above50="${vixy.above50}"` : "";
  return `<tr${attrs}>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3]}" data-max-score="${row[4]}">${row[3]}/${row[4]}</td>${cell(row[5])}</tr>`;
}), "market-score-table report-data-table report-cols-5");

const previousRules = [
  ["大盤趨勢失效", "SPY <20MA 756.20，且 SPX >20MA 廣度 <55%。", `SPY ${fixed(byTicker("SPY").close)}；SPX >20MA ${fixed(currentBreadth.spx20)}%（8/21）。`, "未觸發", "廣度已低於門檻，但 SPY 收盤仍高於原 20MA。"],
  ["科技修復失效", "QQQ <50MA 712.78，且 SMH <20MA 564.11。", `QQQ ${fixed(byTicker("QQQ").close)}；SMH ${fixed(byTicker("SMH").close)}。`, "未觸發", "SMH 已失守，但 QQQ 尚高於原 50MA 0.66。"],
  ["晶片完整突破", "SMH >50MA 591.49，且 NDX >20MA 廣度 >60%。", `SMH ${fixed(byTicker("SMH").close)}；NDX ${fixed(currentBreadth.ndx20)}%（8/21）。`, "未觸發", "價格與廣度兩項都未達標。"],
  ["廣度失速", "NDX >20MA <55%，或 Stockbee 5D <1。", `${fixed(currentBreadth.ndx20)}%（8/21）；${fixed(currentStockbee.ratio5d)}（8/21）。`, "已觸發", "NDX 20MA 廣度跌至 50.98%，依原規則停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5。", `VIX ${fixed(vix.close)}；${vixScore}/5。`, "未觸發", "VIX 週線上升，但水位與 VIXY 趨勢未確認升級。"],
  ["美元／長端壓力", "DXY >101.50，且 10Y >4.80%。", `DXY ${fixed(dxyExternal.close)}；10Y ${fixed(treasuryCurrent.tenYear)}%。`, "未觸發", "10Y 接近但未突破，DXY 反而週線下跌。"],
  ["能源再通膨", "USO >20MA 125.78，且 10Y >4.75%。", `USO ${fixed(byTicker("USO").close)}；10Y ${fixed(treasuryCurrent.tenYear)}%。`, "未觸發", "USO 成立，10Y 距原門檻只差 1bp；保留近觸發警戒。"],
  ["成長失速", "IWM <20MA 296.72，且 Stockbee 5D <1。", `IWM ${fixed(byTicker("IWM").close)}；Stockbee 5D ${fixed(currentStockbee.ratio5d)}。`, "未觸發", "IWM 與 Stockbee 都在原風控線上方。"],
  ["消費確認", "WMT 或 HD 下修全年指引，且 IWM 5日轉負。", `WMT 上調銷售與營業利益指引；IWM ${signed(byTicker("IWM").fiveDayPct)}。`, "未觸發", "小型股條件成立，但 Walmart 沒有下修，複合條件未成立。"]
];
const previousTable = table([
  {label:"上週規則／監控項"},{label:"原門檻"},{label:"本週結果"},{label:"分類",result:true},{label:"修正／備註"}
], previousRules.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}<td class="result-cell">${resultBadge(row[3])}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5");

const crossAssets = [
  ["DXY", fixed(dxyExternal.close), signed(dxyExternal.fiveDayPct), signed(dxyExternal.oneMonthPct), `${dxyExternal.source}；美元週線轉弱，沒有與長端利率同步收緊金融條件。`],
  ...["USDU","FXE","FXB","FXY"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {
      USDU:"美元代理五日轉弱，低於 20／50MA；與 DXY 方向一致。",
      FXE:"歐元代理週月同升且 RSI 偏熱，確認美元弱勢不是單一交易日。",
      FXB:"英鎊代理站上三條均線，交叉盤同樣指向美元回落。",
      FXY:"日圓代理月線走強，但仍低於 200MA；避險與利差交易尚未全面逆轉。"
    }[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ["美國 2 年債殖利率", `${fixed(treasuryCurrent.twoYear)}%`, "+7bp", "不適用", "短端上升，顯示市場沒有把成長放緩直接解讀為快速降息。"],
  ["美國 10 年債殖利率", `${fixed(treasuryCurrent.tenYear)}%`, "+6bp", "不適用", "升至 4.74%，接近 4.80% 長端風控線。"],
  ["美國 20 年債殖利率", `${fixed(treasuryCurrent.twentyYear)}%`, "0bp", "不適用", "維持 5.25%，超長端供給與期限溢價壓力仍高。"],
  ["美國 30 年債殖利率", `${fixed(treasuryCurrent.thirtyYear)}%`, "+2bp", "不適用", "升至 5.27%；10s2s 反而由 51bp 收窄至 50bp。"],
  ...["SHY","IEF","TLT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = ticker === "SHY" ? "短債價格持平，與 2Y 殖利率上升並不矛盾。" : ticker === "IEF" ? "中期債週線回落且低於三條均線。" : `長債仍低於三條均線，距 50MA 為 ${fixed(row.distance50Atr)} ATR。`;
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ...["USO","GLD","SLV","CPER","IBIT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {USO:"五日急升但一月仍負，屬供給／事件型再通膨風險，尚非完整需求週期。",GLD:"週月同升且 RSI 過熱，高長端與避險需求同時存在。",SLV:"五日與一月升幅更高，但仍低於 200MA，追價風險高。",CPER:"一月走強、本週持平；實體需求確認弱於貴金屬。",IBIT:"五日大漲且 RSI 過熱，但 WGMI 反跌，現貨與礦工 beta 明顯分歧。"}[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  })
];

const macroRows = [
  ["FOMC 目標區間", "3.50%–3.75%", "維持", "3.50%–3.75%", "7月會議以 9比3 維持；三位官員傾向升息，政策分歧偏向通膨風險。"],
  ["7月 FOMC 紀要", "條件式偏鷹", "9月維持機率約 65%", "6月：多數傾向持平／略降", "若通膨不降，與會者認為仍可能需要收緊；下次決策為 9/15–9/16。"],
  ["7月新屋開工／許可", "123.9萬／144.3萬", "—", "141.5萬／137.4萬", "開工月減 12.4%、許可月增 5.0%；供給活動急降，但前瞻許可尚未同步崩落。"],
  ["7月工業生產／產能利用", "+0.2%／76.3%", "—", "+0.3%／76.2%", "製造業仍正成長，但動能不強；與工業 ETF 轉弱方向一致。"],
  ["初領／續領失業金", "20.6萬／179.9萬", "—", "21.2萬／178.1萬", "初領改善、續領上升，就業沒有急速惡化，但再就業速度仍需觀察。"],
  ["Walmart Q2 FY27", "營收 +5.9%／調整後營益 +17.4%", "全年銷售／營益上調", "—", "零售需求與利潤率優於悲觀預期，消費風險未獲得全面下修確認。"],
  ["8月美國綜合 PMI 初值", "56.0", "—", "54.5", "商業活動加速，支持軟著陸，但也降低快速寬鬆的必要性。"],
  ["2Y／10Y／30Y", "4.24%／4.74%／5.27%", "—", "4.17%／4.68%／5.25%", "全週 +7／+6／+2bp；10s2s 由 51bp 收窄至 50bp，屬殖利率上移而非熊市陡峭。"]
];

const eventRows = [
  ["8/25 10:00", "7月新屋銷售", "待更新", "—", "高按揭利率下，需求是否跟隨開工同步降溫。"],
  ["8/26 08:30", "Q2 GDP 第二次估算／7月 PCE", "待更新", "GDP 初值待修訂", "同一時段同時驗證成長與 Fed 最關注的通膨指標。"],
  ["8/26 08:30", "7月耐用品訂單", "待更新", "—", "飛機訂單以外的核心資本品，確認企業投資是否擴散。"],
  ["8/26 盤後", "NVIDIA Q2 FY27 財報", "公司指引待核對", "—", "資料中心增速、Blackwell／後續產品供給、毛利率與出口限制。"],
  ["8/26 盤後", "Salesforce Q2 FY27 財報", "公司指引待核對", "—", "Agentforce 商業化、剩餘履約義務與 AI 對軟體需求的實際拉動。"],
  ["8/27 08:30", "初領失業金／商品貿易與庫存初值", "待更新", "初領 20.6萬", "就業韌性與 GDP 修訂線索的交叉驗證。"],
  ["8/27–8/29", "Jackson Hole 經濟政策研討會", "主題：Financial Innovation", "—", "關注主席談話是否重設通膨容忍度、資產負債表與長端利率路徑。"]
];

const scenarios = [
  ["基準：事件窗內高位整固", 35, "10Y 維持 4.65%–4.80%；PCE 沒有上行意外，NVDA 指引大致符合預期。", "SPY 守 20MA、QQQ 守 50MA，Stockbee 5D 維持 >1。", "醫療、金屬與加密輪動，晶片等待財報確認。", "核心曝險維持正常下緣，新倉分批且不追過熱。"],
  ["偏多：AI 與廣度再擴散", 25, "10Y <4.60%；PCE 偏冷，NVDA／CRM 指引強於市場預期。", `SMH >50MA ${fixed(byTicker("SMH").ma50)}，NDX >20MA >60%，Stockbee 5D >2。`, "晶片、軟體、小型股與等權接棒，行情由少數逆勢主題擴散。", "高 beta 增加 1/3，但仍遵守 ATR 約束。"],
  ["偏空：通膨與 AI 估值雙壓", 30, "PCE 偏熱或 Jackson Hole 偏鷹；10Y >4.80%。", `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SPX >20MA 廣度 <45%。`, "半導體、長久期科技、房屋與公用事業承壓。", "科技與高 beta 降低 1/3，停止追價。"],
  ["尾端：成長失速", 10, "GDP 下修且初領升至 23萬以上，長端因成長擔憂急跌。", `IWM <20MA ${fixed(byTicker("IWM").ma20)}，且 Stockbee 5D <1。`, "防守股與長債相對領先，週期與小型股落後。", "降低週期曝險，等待廣度重新確認。"]
];
const scenarioTable = table([
  {label:"下週情境"},{label:"主觀概率",num:true},{label:"宏觀／跨資產觸發"},{label:"指數／廣度預測"},{label:"板塊／主題預測"},{label:"交易動作"}
], scenarios.map((row) => `<tr>${cell(row[0])}<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`), "scenario-table report-data-table report-cols-6");

const linkageRows = [
  ["大盤 ETF", "四大 ETF 五日皆跌，但仍在三條均線上方。", `SPY 守 ${fixed(byTicker("SPY").ma20)}、QQQ 守 ${fixed(byTicker("QQQ").ma50)}。`, `SPY <${fixed(byTicker("SPY").ma20)} 且 SPX 20MA 廣度 <45%。`],
  ["市場廣度", "六項 MA 廣度與 Stockbee 5D／10D 全數週降。", "Stockbee 5D >2 且 NDX 20MA >60%。", "NDX 20MA <45% 或 Stockbee 5D <1。"],
  ["Sector／Thematic", "醫療、能源、材料領先；工業、公用、科技落後。", `SMH >${fixed(byTicker("SMH").ma50)} 且 NDX >20MA >60%。`, `QQQ <${fixed(byTicker("QQQ").ma50)} 且 SMH <${fixed(byTicker("SMH").ma20)}。`],
  ["美債／美元", "2Y／10Y 同升，美元卻轉弱，金融條件訊號分歧。", "10Y <4.60%、DXY 維持 <100。", "10Y >4.80% 且 DXY >100。"],
  ["商品／加密", "油、金、銀與 IBIT 同升，但銅持平、WGMI 反跌。", "CPER 與 IWM 同升，且 WGMI 跟上 IBIT。", "USO 與 10Y 續升，或 IBIT／WGMI 同時跌破 20MA。"],
  ["宏觀／財報", "PMI 與 Walmart 穩，房屋開工弱，Fed 紀要偏鷹。", "PCE 偏冷且 NVDA／CRM 指引強。", "PCE 偏熱、Jackson Hole 偏鷹或 NVDA 毛利／指引失望。"]
];
const linkageTable = table([
  {label:"上文模組"},{label:"基準判斷"},{label:"偏多確認"},{label:"偏空／失效"}
], linkageRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}${cell(row[3])}</tr>`), "scenario-linkage-table report-data-table report-cols-4");

const monitoring = [
  ["大盤趨勢失效", `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <45%`, `${fixed(byTicker("SPY").close)}；${fixed(currentBreadth.spx20)}%（8/21）`, "總風險降低 1/3。"],
  ["科技修復失效", `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SMH <20MA ${fixed(byTicker("SMH").ma20)}`, `${fixed(byTicker("QQQ").close)}；${fixed(byTicker("SMH").close)}`, "科技與晶片降低 1/3。"],
  ["晶片完整突破", `SMH >50MA ${fixed(byTicker("SMH").ma50)}，且 NDX >20MA 廣度 >60%`, `${fixed(byTicker("SMH").close)}；${fixed(currentBreadth.ndx20)}%（8/21）`, "晶片回補 1/3。"],
  ["廣度失速", "NDX >20MA <45%，或 Stockbee 5D <1", `${fixed(currentBreadth.ndx20)}%（8/21）；${fixed(currentStockbee.ratio5d)}（8/21）`, "停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5", `${fixed(vix.close)}；${vixScore}/5`, "降低大盤曝險並停止追價。"],
  ["美元／長端壓力", "DXY >100.00，且 10Y >4.80%", `${fixed(dxyExternal.close)}；${fixed(treasuryCurrent.tenYear)}%`, "科技與高 beta 再降低 1/3。"],
  ["能源再通膨", `USO >20MA ${fixed(byTicker("USO").ma20)}，且 10Y >4.75%`, `${fixed(byTicker("USO").close)}；${fixed(treasuryCurrent.tenYear)}%`, "提高通膨風控，不追高成長。"],
  ["成長失速", `IWM <20MA ${fixed(byTicker("IWM").ma20)}，且 Stockbee 5D <1`, `${fixed(byTicker("IWM").close)}；${fixed(currentStockbee.ratio5d)}`, "降低週期與小型股 1/3。"],
  ["NVDA 事件失效", `NVDA <20MA ${fixed(byTicker("NVDA").ma20)}，且 SMH <20MA ${fixed(byTicker("SMH").ma20)}`, `${fixed(byTicker("NVDA").close)}；${fixed(byTicker("SMH").close)}`, "財報後科技與晶片降低 1/3。"]
];
const monitorTable = table([
  {label:"訊號名"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}
], monitoring.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "weekly-monitor-table report-data-table report-cols-4");

const sources = `<ul>
  <li>長橋 CLI：8/21 收盤、5日／1月漲跌採 <code>kline history --adjust none</code>；均線、RSI、ATR 與 52 週高採前復權序列。139／139 標的成功。</li>
  <li><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit?gid=0#gid=0" target="_blank" rel="noopener">Market Watch Google Sheet</a> 與 <a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit" target="_blank" rel="noopener">Stockbee 2026</a>；板塊、主題、MA 廣度與 Stockbee 均截至 8/21。</li>
  <li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve" target="_blank" rel="noopener">美國財政部每日殖利率</a>：8/14 與 8/21；<a href="https://www.investing.com/indices/usdollar-historical-data" target="_blank" rel="noopener">DXY</a> 採 8/21 歷史收盤，其餘外匯、債券、商品與加密代理用長橋 8/21 收盤。</li>
  <li><a href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm" target="_blank" rel="noopener">Federal Reserve 7月決議</a>、<a href="https://www.census.gov/construction/nrc/current/" target="_blank" rel="noopener">Census 房屋</a>、<a href="https://www.federalreserve.gov/releases/g17/Current/" target="_blank" rel="noopener">Fed 工業生產</a>、<a href="https://www.dol.gov/ui/data.pdf" target="_blank" rel="noopener">DOL 失業救濟</a>。</li>
  <li><a href="https://corporate.walmart.com/news/2026/08/20/walmart-releases-q2-fy27-earnings" target="_blank" rel="noopener">Walmart Q2 FY27</a>；本週市場表現參考 <a href="https://apnews.com/article/09c079b43680c3e4564346892b5dc824" target="_blank" rel="noopener">AP 8/21 收盤</a>。</li>
  <li>下週日曆：<a href="https://www.bea.gov/news/schedule/full" target="_blank" rel="noopener">BEA GDP／PCE</a>、<a href="https://www.census.gov/economic-indicators/" target="_blank" rel="noopener">Census 經濟指標</a>、<a href="https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Sets-Conference-Call-for-Second-Quarter-Financial-Results/default.aspx" target="_blank" rel="noopener">NVIDIA IR</a>、<a href="https://investor.salesforce.com/news/news-details/2026/Salesforce-Announces-Date-of-Second-Quarter-Fiscal-2027-Earnings-Release-and-Webcast/default.aspx" target="_blank" rel="noopener">Salesforce IR</a>、<a href="https://www.kansascityfed.org/research/jackson-hole-economic-symposium/" target="_blank" rel="noopener">Jackson Hole</a>。</li>
</ul>`;

const report = {
  report_title: "2026-08-21 美股一週總結｜指數回撤、廣度全面降溫；加密與醫療逆勢",
  report_type: "weekly",
  week: "2026-08-17–2026-08-21",
  source_dates: {longbridge:expectedDate,market_watch_sheet:expectedDate,market_breadth_sheet:expectedDate,stockbee_sheet:expectedDate,treasury:expectedDate,dxy:dxyExternal.asOf},
  qqq_reengage_20ma: fixed(byTicker("QQQ").ma20),
  qqq_breakout_add_1sd: fixed(byTicker("QQQ").ma50),
  report_eyebrow: "2026-08-22｜美股週報｜資料截至 2026-08-21 收盤",
  report_heading: "美股一週總結：指數回撤、廣度全面降溫；加密與醫療逆勢",
  data_timestamp_note: "收盤、技術值、MA 廣度與 Stockbee 均截至 8/21。",
  report_badges: `<span class="badge amber">風險：Intermediate</span><span class="badge blue">SPY ${signed(byTicker("SPY").fiveDayPct)}</span><span class="badge red">廣度 ${breadthScore}/8</span><span class="badge green">技術 ${technicalScore}/12</span><span class="badge green">VIX ${vixScore}/5</span>`,
  summary_cards: `<div class="card"><span>SPY／QQQ／IWM／DIA 5日</span><strong>${pct(byTicker("SPY").fiveDayPct)}／${pct(byTicker("QQQ").fiveDayPct)}／${pct(byTicker("IWM").fiveDayPct)}／${pct(byTicker("DIA").fiveDayPct)}</strong><small>四大 ETF 週線全跌，但仍在三條均線上方；QQQ 只略高於 50MA。</small></div><div class="card"><span>20MA 廣度／Stockbee</span><strong>${fixed(currentBreadth.spx20)}%／${fixed(currentBreadth.ndx20)}%／${fixed(currentBreadth.iwm20)}%</strong><small>六項 MA 廣度與 5D／10D ratio 全數較 8/14 下降。</small></div><div class="card"><span>領先 Sector</span><strong>XLV ${pct(byTicker("XLV").fiveDayPct)}／XLE ${pct(byTicker("XLE").fiveDayPct)}</strong><small>醫療、能源與材料逆勢，科技、公用與工業落後。</small></div><div class="card"><span>2Y／10Y／30Y 週變化</span><strong><span class="dn">+7bp</span>／<span class="dn">+6bp</span>／<span class="dn">+2bp</span></strong><small>殖利率整體上移，10s2s 由 51bp 微收窄至 50bp。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才加碼：Intermediate Risk 下，價格、廣度與跨資產至少兩項確認才提高風險。",
  upgrade_trigger_1: `SPY 守住 20MA ${fixed(byTicker("SPY").ma20)}、QQQ 守住 50MA ${fixed(byTicker("QQQ").ma50)}，且 Stockbee 5D ratio >2。`,
  upgrade_trigger_2: `SMH 收回 50MA ${fixed(byTicker("SMH").ma50)}，且 NDX >20MA 廣度 >60%。`,
  upgrade_trigger_3: "10Y <4.60%，且 DXY 維持 <100.00。",
  downgrade_trigger_rule: "任一觸發即成立：複合風控成立便降級，不等待第二項確認。",
  downgrade_trigger_1: `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <45%。`,
  downgrade_trigger_2: `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SMH <20MA ${fixed(byTicker("SMH").ma20)}。`,
  downgrade_trigger_3: "10Y >4.80% 且 DXY >100.00，或 VIX 五項波動分數 >=4/5。",
  core_conclusions: `<ol><li><strong>價格回撤，但長期趨勢尚未失效。</strong>SPY／QQQ／IWM／DIA 五日 ${signed(byTicker("SPY").fiveDayPct)}／${signed(byTicker("QQQ").fiveDayPct)}／${signed(byTicker("IWM").fiveDayPct)}／${signed(byTicker("DIA").fiveDayPct)}；四檔仍在 20／50／200MA 上方，但 QQQ 收盤只高於 50MA 約 ${fixed(byTicker("QQQ").close - byTicker("QQQ").ma50)}。</li><li><strong>市場廣度是本週最明確的風險訊號。</strong>六項指數 MA 廣度與 Stockbee 5D／10D 全數較 8/14 下降，量化分數 ${breadthScore}/8。週五 4% 上漲／下跌為 ${currentStockbee.up4}／${currentStockbee.down4}，只能證明單日修復，不能改寫五日趨勢。</li><li><strong>領漲從科技轉向醫療、能源、材料與加密現貨。</strong>XLV／XLE／XLB 五日 ${signed(byTicker("XLV").fiveDayPct)}／${signed(byTicker("XLE").fiveDayPct)}／${signed(byTicker("XLB").fiveDayPct)}；IBIT／COPX／IBB 為 ${signed(byTicker("IBIT").fiveDayPct)}／${signed(byTicker("COPX").fiveDayPct)}／${signed(byTicker("IBB").fiveDayPct)}。但 WGMI ${signed(byTicker("WGMI").fiveDayPct)}，加密行情沒有擴散到礦工營運 beta。</li><li><strong>跨資產不是單純 risk-off，而是美元弱、長端高、實物資產強。</strong>DXY 五日 ${signed(dxyExternal.fiveDayPct)}，2Y／10Y 卻上升 7／6bp；USO／GLD／SLV 五日 ${signed(byTicker("USO").fiveDayPct)}／${signed(byTicker("GLD").fiveDayPct)}／${signed(byTicker("SLV").fiveDayPct)}。這個組合對高估值科技的折現率最不友善。</li><li><strong>下週是成長、通膨與 AI 同日交叉驗證。</strong>8/26 同時公布 GDP 第二次估算、PCE、耐用品，盤後接 NVDA／CRM；8/27 起 Jackson Hole。市場方向取決於 10Y 能否守在 4.80% 下、QQQ 能否守 50MA，以及 NVDA 指引能否讓 SMH 收回 50MA。</li></ol>`,
  weekly_positioning: `<h3>市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>市場風險分數</span><strong>${totalRisk}<small>/100</small></strong><em>Intermediate Risk</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:${totalRisk}%"></span></div><p>四大 ETF 與 VIX 尚未確認趨勢失效，但廣度 8/8 惡化、${weakRows.length}/${weakUniverse.length} 個板塊／主題轉弱、10Y 上升與 SMH 失守短中期均線，把風險推到 Intermediate 上緣。</p><small>0–34 Low Risk；35–59 Intermediate Risk；60–100 High Risk。</small></div></div>${marketScoreTable}<div class="callout warn"><strong>分數反算：</strong>${scoreRows.map((row) => row[3]).join(" + ")} = ${totalRisk}。距 High Risk 只差 2 分；核心曝險留在正常下緣，新增風險需要價格、廣度與跨資產至少兩項確認。</div><div class="action-directive"><span class="ad-label">本週配置</span><ul class="ad-list"><li class="ad-primary">保留寬基核心，但 QQQ 貼近 50MA，科技與晶片不主動加槓桿。</li><li class="ad-watch">相對強勢集中 XLV、XLE、XLB、IBIT、COPX 與 IBB；GLD、IBIT、IBB 已過熱，等回踩而非追價。</li><li class="ad-avoid">週五反彈未讓 5日廣度修復，避免把單日強度當成新一輪全面上漲。</li></ul></div>`,
  previous_week_reconciliation: `<div class="status-pills"><span class="badge green">0 命中</span><span class="badge amber">1 已觸發</span><span class="badge red">0 失誤</span><span class="badge grey">8 未觸發</span></div>${previousTable}<div class="callout warn"><strong>對賬結論：</strong>上週九條複合規則中只有「廣度失速」成立：NDX >20MA 降至 ${fixed(currentBreadth.ndx20)}%。科技修復失效與能源再通膨都只差一個條件，應列近觸發而不是誤判；其餘規則未達門檻。</div>`,
  indices_style_review: `${table([{label:"ETF"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}], indexRows, "ma-table report-data-table report-cols-7 index-summary-table", 'data-major-universe="indices-4" data-sort="rsi-desc"')}<p><strong>小結：</strong>依 RSI 由高至低為 SPY、DIA、IWM、QQQ。四檔仍在三條均線上方，但 QQQ 收 ${fixed(byTicker("QQQ").close)}、50MA ${fixed(byTicker("QQQ").ma50)}，緩衝只剩 ${fixed(byTicker("QQQ").close - byTicker("QQQ").ma50)}；RSP 五日 ${signed(byTicker("RSP").fiveDayPct)}、QQQE ${signed(byTicker("QQQE").fiveDayPct)}，等權相對抗跌但仍未轉正。</p>`,
  big_winners_losers: `${moverTable("本週五大強勢股", winners)}${moverTable("本週五大弱勢股", losers)}<div class="callout warn"><strong>NVDA 財報前：</strong>五日 ${signed(byTicker("NVDA").fiveDayPct)}、一月 ${signed(byTicker("NVDA").oneMonthPct)}，收 ${fixed(byTicker("NVDA").close)}；仍高於 20MA ${fixed(byTicker("NVDA").ma20)} 與 50MA ${fixed(byTicker("NVDA").ma50)}。個股趨勢尚在，但 SMH 已跌破 20／50MA，8/26 指引必須同時修復產業廣度才算有效。</div><p><strong>共同因子：</strong>強勢榜由 RCEL 的公司事件與 COIN／CRCL／HOOD 的加密 beta 主導；弱勢榜則集中 ARM、INTC、ONTO、ALAB 等 AI／半導體高 beta，以及 CRWD。市場在 NVDA 財報前降低高估值硬件與軟體曝險，並把風險轉向現貨加密與防守成長。</p>`,
  sector_momentum_chart: barChart(["IBIT","COPX","XLV","XLE","SMH","WGMI","XAR","XLK"].map((ticker) => ({label:ticker,value:byTicker(ticker).fiveDayPct}))),
  sector_thematic_weekly: `${etfTable("S&amp;P 500 Sector ETF", sectors, 'data-etf-group="sector" data-expected-rows="12" data-benchmark="SPY" data-sort="rsi-desc"')}${etfTable("Thematic Sector ETF", themes, 'data-etf-group="thematic" data-expected-rows="45" data-etf-universe="thematic-complete" data-source-count="45" data-report-count="45" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc"')}${themeMoverReviewTable("Thematic 週漲幅前 5 點評", themeWeeklyGainers, 'data-theme-mover="gainers" data-expected-rows="5" data-sort="five-day-desc"')}${themeMoverReviewTable("Thematic 週跌幅前 5 點評", themeWeeklyLosers, 'data-theme-mover="losers" data-expected-rows="5" data-sort="five-day-asc"')}<div class="callout warn"><strong>板塊結論：</strong>Sector 前三為 XLV ${signed(byTicker("XLV").fiveDayPct)}、XLE ${signed(byTicker("XLE").fiveDayPct)}、XLB ${signed(byTicker("XLB").fiveDayPct)}；後三為 XLK ${signed(byTicker("XLK").fiveDayPct)}、XLU ${signed(byTicker("XLU").fiveDayPct)}、XLI ${signed(byTicker("XLI").fiveDayPct)}。Thematic 前五集中加密現貨、銅礦、生技、白銀與創新成長；後五集中航太國防、工業、航空與加密礦工。55 個非基準板塊／主題中有 ${weakRows.length} 個符合弱勢定義，輪動存在，但行情寬度已明顯收窄。</div>`,
  market_breadth_weekly: `${table([{label:"指標（最新日）"},{label:"最新",num:true},{label:"8/14",num:true},{label:"週變化",num:true},{label:"判斷"}], breadthRows, "report-data-table report-cols-5")}<div class="status-pills"><span class="badge red">5日惡化 ${breadthScore}/8</span><span class="badge amber">Stockbee 5D ${fixed(currentStockbee.ratio5d)}</span><span class="badge amber">Stockbee 10D ${fixed(currentStockbee.ratio10d)}</span><span class="badge amber">T2108 ${fixed(currentStockbee.t2108)}%</span></div><p><strong>三大指數廣度：</strong>8/21 對 8/14，SPX 20／50MA 下降 16.80／11.62pp；NDX 下降 18.62／11.76pp；IWM 下降 17.20／7.55pp。六項全部惡化，且三個 20MA 廣度均已降至約 49%–51%。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 由 ${fixed(priorStockbee.ratio5d)} 降至 ${fixed(currentStockbee.ratio5d)}，10D 由 ${fixed(priorStockbee.ratio10d)} 降至 ${fixed(currentStockbee.ratio10d)}；T2108 由 ${fixed(priorStockbee.t2108)}% 降至 ${fixed(currentStockbee.t2108)}%。週五 4% 上漲／下跌 ${currentStockbee.up4}／${currentStockbee.down4} 顯示短線反彈，但中期擴散仍比上週弱。</p><div class="callout warn"><strong>綜合結論：</strong>五日趨勢量化分數 ${breadthScore}/8，屬明顯惡化。下週先看 NDX >20MA 能否回到 60% 與 Stockbee 5D 能否重返 2；跌破 45% 或 1，則停止擴大高 beta 新倉。</div>`,
  atr_weekly: `${table([{label:"ETF"},{label:"價格",num:true},{label:"50MA",num:true},{label:"ATR(14)",num:true},{label:"距50MA ATR",num:true},{label:"判斷"}], atrRows, "report-data-table report-cols-6")}<div class="callout warn"><strong>小結：</strong>${atrExtendedCount}/${atrUniverse.length} 檔距 50MA 絕對值達 2 ATR。GLD、XLE、XLV、SLV、USO、RSP、XLF、SPY、CPER、QQQE 為正向延伸，TLT 為負向延伸；強勢資產集中實物、防守與等權，追價風險仍高。</div>`,
  fx_commodities_treasury_weekly: `${table([{label:"資產"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"市場含義"}], crossAssets.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<div class="callout warn"><strong>長短債比較：</strong>2Y／10Y／20Y／30Y 一週 +7／+6／0／+2bp，10s2s 由 51bp 微收窄至 50bp，屬殖利率曲線整體上移與輕度熊市趨平。TLT 低於三條均線且距 50MA ${fixed(byTicker("TLT").distance50Atr)} ATR；DXY 卻五日 ${signed(dxyExternal.fiveDayPct)}，美元沒有確認長端壓力，訊號仍分歧。</div>`,
  macro_fed_weekly: `${table([{label:"數據／政策"},{label:"實際／最新",num:true},{label:"預期／門檻",num:true},{label:"前值",num:true},{label:"政策與市場含義"}], macroRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "macro-review-table weekly-macro-fed-table report-data-table report-cols-5")}<p><strong>小結：</strong>本週不是單向衰退訊號：房屋開工急降，卻有工業生產、初領與 Walmart 韌性，綜合 PMI 更升至 56.0。Fed 紀要與 2Y／10Y 同升表示通膨約束仍在；下週 GDP／PCE 必須一起看，不能只用單一成長數據推演降息。</p>`,
  next_week_plan: `${table([{label:"日期（ET）"},{label:"事件"},{label:"Forecast",num:true},{label:"Previous",num:true},{label:"監控重點"}], eventRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<p class="note">8/26 是本週核心事件窗：08:30 同時公布 GDP／PCE／耐用品，盤後接 NVDA 與 CRM；8/27–8/29 Jackson Hole 再決定利率敘事。</p><h3>四種情境與主觀概率</h3>${scenarioTable}<h3>各模組聯動預測</h3>${linkageTable}<div class="action-directive"><span class="ad-label">執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看 8/25：</strong>新屋銷售確認開工下滑是否已傳導到需求。</li><li class="ad-watch"><strong>核心看 8/26：</strong>用 PCE 與 10Y 判斷折現率，再用 NVDA／CRM 指引驗證 AI 獲利兌現。</li><li class="ad-watch"><strong>最後看 8/27–8/29：</strong>Jackson Hole 是否把 4.80% 變成長端壓力線。</li><li class="ad-invalidate"><strong>風控：</strong>QQQ <${fixed(byTicker("QQQ").ma50)} 且 SMH <${fixed(byTicker("SMH").ma20)}，或 10Y >4.80% 且 DXY >100，科技降低 1/3。</li></ul></div>`,
  cross_validation_summary: `<div class="callout ok"><strong>互相確認：</strong>四大 ETF 仍站上三條均線，三大指數綜合技術分數 ${technicalScore}/12；VIX 收 ${fixed(vix.close)}、波動分數 ${vixScore}/5，價格與波動尚未確認趨勢失效。</div><div class="callout warn"><strong>互相分歧：</strong>廣度 ${breadthScore}/8 惡化、SMH 低於 20／50MA、板塊／主題弱勢 ${weakRows.length}/${weakUniverse.length}；同時 10Y 上升、美元下跌、油金銀與 IBIT 上升。市場不是全面 risk-off，而是高估值科技被重新折現。</div><div class="callout warn"><strong>主導結論：</strong>${totalRisk}/100 Intermediate Risk，距 High Risk 只差 2 分。保留核心但限制新增高 beta；只有 Stockbee 5D >2、SMH 收回 50MA 或 10Y 回到 4.60% 下方等確認出現，才提高風險。</div>`,
  next_week_monitoring_checklist: monitorTable,
  sources
};

const output = path.resolve(root, "data/2026-08-21-weekly.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({output:path.relative(root, output), totalRisk, breadthScore, technicalScore, vixScore, sectorRows:sectors.length, thematicRows:themes.length, winners:winners.map((row) => row.ticker), losers:losers.map((row) => row.ticker)}, null, 2));
