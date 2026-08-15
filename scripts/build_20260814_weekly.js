#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const raw = read("data/2026-08-14-weekly-longbridge.json");
const adjusted = read("data/2026-08-14-weekly-longbridge-adjusted.json");
const sheet = read("data/2026-08-14-weekly-google-sheet.json");
const expectedDate = "2026-08-14";
const dxyExternal = {
  asOf: expectedDate,
  close: 99.74,
  fiveDayPct: -1.62,
  oneMonthPct: -1.11,
  source: "Yahoo Finance／ICE 延遲收盤"
};

for (const [name, source] of [["長橋原始日線", raw], ["長橋前復權日線", adjusted]]) {
  if (source.asOf !== expectedDate || source.errors.length || source.counts.success !== 139) {
    throw new Error(`${name} 未通過完整性檢查。`);
  }
  if (source.rows.some((row) => row.asOf !== expectedDate)) throw new Error(`${name} 含非 ${expectedDate} 收盤資料。`);
}
if (sheet.asOf !== expectedDate || sheet.breadth.length !== 5 || sheet.stockbeeRows.length !== 6) {
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
    SPY: "三條均線上方，週線小升但內部廣度分化。",
    DIA: "本週唯一週線下跌的四大 ETF，仍守三條均線。",
    IWM: "週線領先且逼近 52 週高，小型股價格仍有韌性。",
    QQQ: "三條均線上方，但 SMH 尚未收回 50MA。"
  }[row.ticker];
  return `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(special)}</tr>`;
});

const excludedMovers = new Set([...raw.universes.coreTickers, "MSTR"]);
const moverPool = raw.rows.filter((row) => raw.universes.moverCandidates.includes(row.ticker) && !excludedMovers.has(row.ticker));
const winners = [...moverPool].sort((a, b) => b.fiveDayPct - a.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const losers = [...moverPool].sort((a, b) => a.fiveDayPct - b.fiveDayPct).slice(0, 5).map((row) => byTicker(row.ticker));
const moverNotes = {
  SNDK: "Investor Day 強化 AI 推論與記憶體需求敘事，市場上修長期成長斜率。",
  SMCI: "初步業務更新顯示積壓訂單強、毛利高於原指引，AI 伺服器預期快速修復。",
  CAVA: "財報後成長與門店效率預期獲得重估，抵銷零售數據轉弱。",
  MU: "記憶體供需與 AI 儲存鏈同步升溫，並受 SNDK 催化外溢。",
  DDOG: "軟體風險偏好回升，市場重新交易雲端與 AI 工作負載增長。",
  SEZL: "高波動成長股延續反彈，但一月趨勢仍弱。",
  COHR: "Q4 營收與毛利創強勁增長，股價仍因財報前漲幅與高預期出現賣事實。",
  FSLR: "政策與估值敏感度上升，資金在高位週期股中先行降風險。",
  DOCS: "高估值成長股遭獲利了結，市場提高對後續增速的要求。",
  APP: "高預期下持續去風險，估值壓縮蓋過短線基本面利多。",
  AVGO: "AI 硬件財報後出現輪動，市場更重視新增訂單能否轉成毛利與現金流。",
  CSCO: "雙 Beat 與強勁 FY27 指引仍遭賣出，反映 AI 訂單好消息已被大幅定價。",
  AMAT: "業績與指引強，但財報後下跌顯示晶圓設備高預期與估值門檻升高。"
};
const moverTable = (title, rows) => `<h3>${title}</h3>${table([
  {label:"股票"},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"市場反饋因子"}
], rows.map((row) => `<tr>${cell(row.ticker)}${num(pct(row.fiveDayPct))}${num(pct(row.oneMonthPct))}${maCell(row)}${cell(moverNotes[row.ticker] || "財報與預期差推動本週重新定價。")}</tr>`), "ma-table report-data-table report-cols-5")}`;

const currentBreadth = sheet.breadth[0];
const priorBreadth = sheet.breadth.at(-1);
const currentStockbee = sheet.stockbeeRows[0];
const priorStockbee = sheet.stockbeeRows.at(-1);
const breadthDefinitions = [
  ["SPX >20MA（8/13）", currentBreadth.spx20, priorBreadth.spx20, "%"],
  ["SPX >50MA（8/13）", currentBreadth.spx50, priorBreadth.spx50, "%"],
  ["NDX >20MA（8/13）", currentBreadth.ndx20, priorBreadth.ndx20, "%"],
  ["NDX >50MA（8/13）", currentBreadth.ndx50, priorBreadth.ndx50, "%"],
  ["IWM >20MA（8/13）", currentBreadth.iwm20, priorBreadth.iwm20, "%"],
  ["IWM >50MA（8/13）", currentBreadth.iwm50, priorBreadth.iwm50, "%"],
  ["Stockbee 5D ratio（8/14）", currentStockbee.ratio5d, priorStockbee.ratio5d, ""],
  ["Stockbee 10D ratio（8/14）", currentStockbee.ratio10d, priorStockbee.ratio10d, ""],
  ["4%+ 上漲／下跌（8/14）", `${currentStockbee.up4}／${currentStockbee.down4}`, `${priorStockbee.up4}／${priorStockbee.down4}`, "pair"],
  ["T2108（8/14）", currentStockbee.t2108, priorStockbee.t2108, "%"],
  ["34/13 上漲／下跌（8/14）", `${currentStockbee.up34_13}／${currentStockbee.down34_13}`, `${priorStockbee.up34_13}／${priorStockbee.down34_13}`, "pair"]
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
const treasuryPrior = sheet.treasury["2026-08-07"];
const treasuryCurrent = sheet.treasury["2026-08-14"];
const crossAssetChecks = [
  byTicker("USDU").fiveDayPct > 0.5,
  treasuryCurrent.tenYear > treasuryPrior.tenYear,
  !byTicker("TLT").above50,
  byTicker("USO").oneMonthPct > 0
];
const crossAssetRisk = crossAssetChecks.filter(Boolean).length;
const scoreRows = [
  ["四大 ETF 技術", `${fourEtfRawRisk}/16`, "20%", Math.round(fourEtfRawRisk / 16 * 20), 20, "每檔以 5日<0、1月<0、低於20MA、低於50MA各計 1 點；本週只有 DIA 五日為負。"],
  ["市場廣度", `${breadthScore}/8`, "20%", Math.round(breadthScore / 8 * 20), 20, "六項 MA 廣度以 8/13 對 8/7，Stockbee 5D／10D 以 8/14 對 8/7；惡化計風險。"],
  ["VIX 波動", `${vixScore}/5`, "10%", Math.round(vixScore / 5 * 10), 10, "VIX>20、VIX 日／週升、VIXY 高於20／50MA，共五項。"],
  ["板塊／主題動能", `${weakRows.length}/${weakUniverse.length}`, "15%", Math.round(weakRows.length / weakUniverse.length * 15), 15, "5日<0、低於20MA、RSI<50 三項中至少兩項成立即列弱勢。"],
  ["50MA ATR 延伸", `${atrExtendedCount}/${atrUniverse.length}`, "10%", Math.round(atrExtendedCount / atrUniverse.length * 10), 10, "固定 18 檔中距 50MA 絕對值達 2 ATR 的標的數。"],
  ["跨資產壓力", `${crossAssetRisk}/4`, "15%", Math.round(crossAssetRisk / 4 * 15), 15, "USDU 五日升幅>0.5%、10Y 週升、TLT 低於50MA、USO 一月上升；本週後三項成立。"],
  ["宏觀／事件風險", "3/3", "10%", 10, 10, "零售與信心轉弱、通膨仍高於目標且油價上升、下週 FOMC 紀要與零售財報均構成事件窗。"]
];
const totalRisk = scoreRows.reduce((sum, row) => sum + row[3], 0);
if (breadthScore !== 3 || technicalScore !== 0 || vixScore !== 0 || crossAssetRisk !== 3 || totalRisk !== 40) throw new Error(`量化分數異常：breadth=${breadthScore}, technical=${technicalScore}, vix=${vixScore}, cross=${crossAssetRisk}, total=${totalRisk}`);
const marketScoreTable = table([
  {label:"評分維度"},{label:"原始風險",num:true},{label:"權重",num:true},{label:"風險分",num:true},{label:"量化依據"}
], scoreRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3]}" data-max-score="${row[4]}">${row[3]}/${row[4]}</td>${cell(row[5])}</tr>`), "market-score-table report-data-table report-cols-5");

const previousRules = [
  ["大盤趨勢失效", "SPY <20MA 750.17，且 SPX >20MA 廣度 <55%。", "SPY 776.34；SPX >20MA 68.78%（8/13）。", "未觸發", "價格與短線廣度都高於失效線。"],
  ["科技修復失效", "QQQ <50MA 714.31，且 SMH <20MA 564.01。", "QQQ 731.07；SMH 587.82。", "未觸發", "科技價格未跌破複合風控。"],
  ["晶片完整突破", "SMH >50MA 594.94，且 NDX >20MA 廣度 >60%。", "SMH 587.82；NDX 68.62%（8/13）。", "未觸發", "廣度達標，但 SMH 未收回 50MA。"],
  ["廣度失速", "NDX >20MA <55%，或 Stockbee 5D <1。", "68.62%（8/13）；1.55（8/14）。", "未觸發", "短線廣度降溫，但尚未失速。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5。", "VIX 14.25；0/5。", "未觸發", "波動沒有確認價格分化。"],
  ["美元／長端壓力", "DXY >101.50，且 10Y >4.80%。", `DXY ${fixed(dxyExternal.close)}；10Y ${fixed(treasuryCurrent.tenYear)}%。`, "未觸發", "兩項均未達門檻；USDU 技術代理亦低於 20／50MA。"],
  ["通膨上行", "CPI 年率 >=3.6%，或核心月率 >=0.4%。", "CPI 3.4%；核心月率 0.2%。", "未觸發", "通膨仍高於目標，但沒有突破上週風控線。"],
  ["能源再通膨", "USO >50MA 121.17，且 10Y >4.75%。", "USO 126.60；10Y 4.68%。", "未觸發", "油價成立、長端未成立，屬接近但未觸發。"],
  ["成長失速", "零售月率 <0，且 IWM <20MA 294.77。", "零售 -0.6%；IWM 305.09。", "未觸發", "消費條件成立，但小型股仍守住價格防線。"]
];
const previousTable = table([
  {label:"上週規則／監控項"},{label:"原門檻"},{label:"本週結果"},{label:"分類",result:true},{label:"修正／備註"}
], previousRules.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}<td class="result-cell">${resultBadge(row[3])}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5");

const crossAssets = [
  ["DXY", fixed(dxyExternal.close), signed(dxyExternal.fiveDayPct), signed(dxyExternal.oneMonthPct), `${dxyExternal.source}；低於 101.50 美元風控線。`],
  ...["USDU","FXE","FXB","FXY"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {
      USDU:"美元代理週線僅微升，仍低於 20／50MA；美元壓力尚未確認。",
      FXE:"歐元代理站上 20／50MA，美元並非單邊轉強。",
      FXB:"英鎊代理用於確認美元交叉盤方向。",
      FXY:"日圓代理反映避險與利差交易，仍需配合美債判讀。"
    }[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ["美國 2 年債殖利率", `${fixed(treasuryCurrent.twoYear)}%`, "-2bp", "—", "短端小幅回落，但沒有形成全曲線放鬆。"],
  ["美國 10 年債殖利率", `${fixed(treasuryCurrent.tenYear)}%`, "+3bp", "—", "長端上升，折現率壓力重新累積。"],
  ["美國 20 年債殖利率", `${fixed(treasuryCurrent.twentyYear)}%`, "+5bp", "—", "超長端升幅大於 2Y，期限溢價上升。"],
  ["美國 30 年債殖利率", `${fixed(treasuryCurrent.thirtyYear)}%`, "+6bp", "—", "30Y 升至 5.25%，曲線呈熊市陡峭化。"],
  ...["SHY","IEF","TLT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = ticker === "SHY" ? "短債價格變化有限。" : ticker === "IEF" ? "中期債受長端上升壓制。" : `長債仍低於 50MA，距離 ${fixed(Math.abs(row.distance50Atr))} ATR。`;
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  }),
  ...["USO","GLD","SLV","CPER","IBIT"].map((ticker) => {
    const row = byTicker(ticker);
    const meaning = {USO:"五日急升，重新放大再通膨與企業成本風險。",GLD:"金價月線強，避險需求與高長端同時存在。",SLV:"銀價月線延伸高，追價風險高於黃金。",CPER:"銅價月線上升，但本週近乎持平。",IBIT:"比特幣代理週月同跌，風險偏好未全面擴散。"}[ticker];
    return [ticker, fixed(row.close), signed(row.fiveDayPct), signed(row.oneMonthPct), meaning];
  })
];

const macroRows = [
  ["FOMC 目標區間", "3.50%–3.75%", "維持", "3.50%–3.75%", "下次決策為 9/15–9/16；8/19 紀要將補充 7月會議內部分歧。"],
  ["7月 CPI", "月率 +0.1%／年率 +3.4%", "年率 3.4%", "—", "通膨未突破風控線，但仍明顯高於 2% 目標。"],
  ["7月核心 CPI", "月率 +0.2%／年率 +2.5%", "—", "—", "核心放緩有利短端，但不足以抵銷油價與長端上升。"],
  ["7月 PPI", "月率 0.0%／年率 +4.7%", "—", "—", "企業端價格年率仍高，毛利與利率敏感度上升。"],
  ["7月核心 PPI", "月率 +0.2%／年率 +4.2%", "—", "—", "服務與投入成本壓力仍需由公司指引確認。"],
  ["7月零售銷售", "-0.6%", "+0.1%", "+0.2%（修訂）", "明顯低於預期；消費弱化已成為成長風險，但 IWM 尚未跌破 20MA。"],
  ["密大 8月信心初值", "51.0", "54.5", "55.2", "信心下降；一年通膨預期 4.3%、五至十年 3.3%，停滯性通膨敘事升溫。"],
  ["2Y／10Y／30Y", "4.17%／4.68%／5.25%", "—", "4.19%／4.65%／5.19%", "短端 -2bp、10Y +3bp、30Y +6bp，曲線熊市陡峭化。"]
];

const eventRows = [
  ["8/18 08:30", "7月進出口價格", "待更新", "進口 +0.3%", "確認油價與關稅是否傳導至進口成本。"],
  ["8/18 08:30", "7月新屋開工／建築許可", "待更新", "開工 142.7萬", "房屋供給與高按揭利率下的需求韌性。"],
  ["8/18 09:00", "Home Depot Q2 財報", "公司指引待核對", "—", "大額家居支出、專業客戶與毛利率。"],
  ["8/18 09:15", "7月工業生產", "待更新", "—", "實體產出能否抵銷零售轉弱。"],
  ["8/19 14:00", "7月 FOMC 會議紀要", "—", "—", "關注反對票、通膨容忍度與 9月政策門檻。"],
  ["8/20 08:00", "Walmart Q2 財報", "EPS $0.72–$0.74 指引", "—", "同店銷售、廣告、電商與低收入消費者需求。"],
  ["8/20 08:30", "初領失業金／費城 Fed", "待更新", "—", "零售走弱是否擴散到就業與製造業。"],
  ["8/21 10:00", "州級就業報告", "—", "—", "用地區分布確認 7月就業疲弱是否集中。"]
];

const scenarios = [
  ["基準：高位整固", 40, "FOMC 紀要偏平衡；10Y 維持 4.55%–4.80%，油價不再加速。", "SPY／QQQ 守 20MA，Stockbee 5D 保持 >1；指數高位震盪。", "能源與軟體輪動，晶片等待 SMH 50MA 確認。", "核心曝險維持正常，新倉分批且不追延伸。"],
  ["偏多：廣度再擴散", 25, "10Y <4.55%，USO 回吐本週升幅；零售財報優於悲觀預期。", "SMH >50MA 591.49，NDX >20MA >60%，Stockbee 5D >2。", "晶片、小型股與等權接棒，成長與週期同升。", "高 beta 增加 1/3，但保留 ATR 約束。"],
  ["偏空：停滯性通膨", 25, "紀要偏鷹、USO 續升；10Y >4.80% 且 DXY >101.50。", "QQQ 跌破 50MA 712.78，科技廣度轉弱。", "長久期科技、房屋與清潔能源承壓，能源相對領先。", "科技與高 beta 降低 1/3，停止追價。"],
  ["尾端：成長失速", 10, "初領上升且零售財報下修；長端因成長擔憂急跌。", "IWM <20MA 296.72，Stockbee 5D <1。", "防守股與長債相對領先，週期與小型股落後。", "降低週期曝險，等待廣度重新確認。"]
];
const scenarioTable = table([
  {label:"下週情境"},{label:"主觀概率",num:true},{label:"宏觀／跨資產觸發"},{label:"指數／廣度預測"},{label:"板塊／主題預測"},{label:"交易動作"}
], scenarios.map((row) => `<tr>${cell(row[0])}<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`), "scenario-table report-data-table report-cols-6");

const linkageRows = [
  ["大盤 ETF", "四大 ETF 仍在 20／50／200MA 上方。", "SPY 守 756.20、IWM 守 296.72。", "SPY <756.20 且 SPX 20MA 廣度 <55%。"],
  ["市場廣度", "MA 廣度 3/6 改善；Stockbee 5D 降、10D 升。", "5D >2 且 4% 上漲持續多於下跌。", "NDX 20MA <55% 或 Stockbee 5D <1。"],
  ["Sector／Thematic", "能源最強，軟體／資安仍強；中國與加密落後。", "SMH >591.49 且 NDX >20MA >60%。", "QQQ <712.78 且 SMH <564.11。"],
  ["美債／美元", "2Y 小跌、長端上升，曲線熊市陡峭化。", "10Y <4.55%、DXY <99.00。", "10Y >4.80% 且 DXY >101.50。"],
  ["商品", "USO 急升，金銀月線延伸，IBIT 轉弱。", "USO 回吐且 CPER／IWM 同升確認實體需求。", "USO 續升且 10Y 同升，代表再通膨壓力加劇。"],
  ["宏觀／財報", "通膨未爆線，但零售與信心明顯轉弱。", "零售財報穩、紀要不鷹，AI 硬件毛利獲確認。", "WMT／HD 下修，或紀要推升 10Y 至 4.80% 以上。"]
];
const linkageTable = table([
  {label:"上文模組"},{label:"基準判斷"},{label:"偏多確認"},{label:"偏空／失效"}
], linkageRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}${cell(row[3])}</tr>`), "scenario-linkage-table report-data-table report-cols-4");

const monitoring = [
  ["大盤趨勢失效", `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <55%`, `${fixed(byTicker("SPY").close)}；${fixed(currentBreadth.spx20)}%（8/13）`, "總風險降低 1/3。"],
  ["科技修復失效", `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SMH <20MA ${fixed(byTicker("SMH").ma20)}`, `${fixed(byTicker("QQQ").close)}；${fixed(byTicker("SMH").close)}`, "科技與晶片降低 1/3。"],
  ["晶片完整突破", `SMH >50MA ${fixed(byTicker("SMH").ma50)}，且 NDX >20MA 廣度 >60%`, `${fixed(byTicker("SMH").close)}；${fixed(currentBreadth.ndx20)}%（8/13）`, "晶片回補 1/3。"],
  ["廣度失速", "NDX >20MA <55%，或 Stockbee 5D <1", `${fixed(currentBreadth.ndx20)}%（8/13）；${fixed(currentStockbee.ratio5d)}（8/14）`, "停止擴大高 beta 新倉。"],
  ["波動升級", "VIX >20，或五項波動分數 >=4/5", `${fixed(vix.close)}；${vixScore}/5`, "降低大盤曝險並停止追價。"],
  ["美元／長端壓力", "DXY >101.50，且 10Y >4.80%", `${fixed(dxyExternal.close)}；${fixed(treasuryCurrent.tenYear)}%`, "科技與高 beta 再降低 1/3。"],
  ["能源再通膨", `USO >20MA ${fixed(byTicker("USO").ma20)}，且 10Y >4.75%`, `${fixed(byTicker("USO").close)}；${fixed(treasuryCurrent.tenYear)}%`, "提高通膨風控，不追高成長。"],
  ["成長失速", `IWM <20MA ${fixed(byTicker("IWM").ma20)}，且 Stockbee 5D <1`, `${fixed(byTicker("IWM").close)}；${fixed(currentStockbee.ratio5d)}`, "降低週期與小型股 1/3。"],
  ["消費確認", "WMT 或 HD 下修全年指引，且 IWM 5日轉負", `${signed(byTicker("IWM").fiveDayPct)}`, "零售與小型股曝險降低 1/3。"]
];
const monitorTable = table([
  {label:"訊號名"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}
], monitoring.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "weekly-monitor-table report-data-table report-cols-4");

const sources = `<ul>
  <li>長橋 CLI：8/14 收盤、5日／1月漲跌採 <code>kline history --adjust none</code>；均線、RSI、ATR 與 52 週高採前復權序列。139／139 標的成功。</li>
  <li><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit?gid=0#gid=0" target="_blank" rel="noopener">Market Watch Google Sheet</a> 與 <a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit" target="_blank" rel="noopener">Stockbee 2026</a>；MA 廣度截至 8/13，Stockbee 截至 8/14。</li>
  <li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve" target="_blank" rel="noopener">美國財政部每日殖利率</a>：8/7 與 8/14；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/" target="_blank" rel="noopener">DXY</a> 為 Yahoo Finance／ICE 8/14 延遲收盤，其餘外匯、債券及商品代理用長橋 8/14 收盤。</li>
  <li><a href="https://www.bls.gov/news.release/cpi.nr0.htm" target="_blank" rel="noopener">BLS CPI</a>、<a href="https://www.bls.gov/news.release/ppi.nr0.htm" target="_blank" rel="noopener">BLS PPI</a>、<a href="https://www.census.gov/retail/sales.html" target="_blank" rel="noopener">Census 零售</a>、<a href="https://www.sca.isr.umich.edu/" target="_blank" rel="noopener">密大消費者調查</a>。</li>
  <li><a href="https://www.federalreserve.gov/newsevents/2026-august.htm" target="_blank" rel="noopener">Fed 8月日曆</a>、<a href="https://www.bls.gov/schedule/2026/home.htm" target="_blank" rel="noopener">BLS 日曆</a>、<a href="https://www.census.gov/construction/soc/schedule.html" target="_blank" rel="noopener">Census 房屋日曆</a>；<a href="https://ir.homedepot.com/events-and-presentations?page=1" target="_blank" rel="noopener">Home Depot IR</a>、<a href="https://corporate.walmart.com/news/events/fy2027-q2-earnings-release" target="_blank" rel="noopener">Walmart IR</a>。</li>
  <li><a href="https://apnews.com/article/5d9870d6c5ae735f9b74bf4ceefaa3ec" target="_blank" rel="noopener">AP 8/14 收盤</a>；財報因子參考 <a href="https://www.coherent.com/news/press-releases/fourth-quarter-and-fiscal-year-2026-results" target="_blank" rel="noopener">Coherent</a>、<a href="https://investor.appliedmaterials.com/static-files/425ac634-4ee7-4c41-a07f-fa9e3c42b797" target="_blank" rel="noopener">Applied Materials</a>、<a href="https://ir.supermicro.com/news/news-details/2026/Supermicro-Provides-Fourth-Quarter-of-Fiscal-Year-2026-Preliminary-Business-Update/default.aspx" target="_blank" rel="noopener">Supermicro</a> 與 <a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks" target="_blank" rel="noopener">Cisco 財報整理</a>。</li>
</ul>`;

const report = {
  report_title: "2026-08-14 美股一週總結｜價格仍強、廣度降溫；油價與長端利率抬高風險",
  report_type: "weekly",
  week: "2026-08-10–2026-08-14",
  source_dates: {longbridge:expectedDate,market_watch_sheet:expectedDate,market_breadth_sheet:"2026-08-13",stockbee_sheet:expectedDate,treasury:expectedDate,dxy:dxyExternal.asOf},
  qqq_reengage_20ma: fixed(byTicker("QQQ").ma20),
  qqq_breakout_add_1sd: fixed(byTicker("QQQ").ma50),
  report_eyebrow: "2026-08-15｜美股週報｜資料截至 2026-08-14 收盤",
  report_heading: "美股一週總結：價格仍強、廣度降溫；油價與長端利率抬高風險",
  data_timestamp_note: "收盤與技術值截至 8/14；MA 廣度截至 8/13，Stockbee 截至 8/14。",
  report_badges: `<span class="badge amber">風險：Intermediate</span><span class="badge blue">SPY ${signed(byTicker("SPY").fiveDayPct)}</span><span class="badge amber">廣度 ${breadthScore}/8</span><span class="badge green">技術 ${technicalScore}/12</span><span class="badge green">VIX ${vixScore}/5</span>`,
  summary_cards: `<div class="card"><span>SPY／QQQ／IWM／DIA 5日</span><strong>${pct(byTicker("SPY").fiveDayPct)}／${pct(byTicker("QQQ").fiveDayPct)}／${pct(byTicker("IWM").fiveDayPct)}／${pct(byTicker("DIA").fiveDayPct)}</strong><small>四大 ETF 仍在三條均線上方，但 DIA 週線轉負。</small></div><div class="card"><span>MA 廣度／Stockbee</span><strong>${fixed(currentBreadth.spx20)}%／${fixed(currentBreadth.ndx20)}%／${fixed(currentBreadth.iwm20)}%</strong><small>MA 截至 8/13；5D／10D ratio 為 ${fixed(currentStockbee.ratio5d)}／${fixed(currentStockbee.ratio10d)}。</small></div><div class="card"><span>零售／密大信心</span><strong><span class="dn">-0.6%</span>／<span class="dn">51.0</span></strong><small>消費與信心同時弱於預期，成長風險上升。</small></div><div class="card"><span>2Y／10Y／30Y 週變化</span><strong><span class="up">-2bp</span>／<span class="dn">+3bp</span>／<span class="dn">+6bp</span></strong><small>曲線熊市陡峭化，長端折現率重新升高。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才加碼：Intermediate Risk 下，價格、廣度與跨資產至少兩項確認才提高風險。",
  upgrade_trigger_1: `SPY／QQQ 守住 20MA ${fixed(byTicker("SPY").ma20)}／${fixed(byTicker("QQQ").ma20)}，且 Stockbee 5D ratio >2。`,
  upgrade_trigger_2: `SMH 收回 50MA ${fixed(byTicker("SMH").ma50)}，且 NDX >20MA 廣度保持 >60%。`,
  upgrade_trigger_3: `10Y <4.55%，且 USO 跌回 20MA ${fixed(byTicker("USO").ma20)} 以下。`,
  downgrade_trigger_rule: "任一觸發即成立：複合風控成立便降級，不等待第二項確認。",
  downgrade_trigger_1: `SPY <20MA ${fixed(byTicker("SPY").ma20)}，且 SPX >20MA 廣度 <55%。`,
  downgrade_trigger_2: `QQQ <50MA ${fixed(byTicker("QQQ").ma50)}，且 SMH <20MA ${fixed(byTicker("SMH").ma20)}。`,
  downgrade_trigger_3: "10Y >4.80% 且 DXY >101.50，或 VIX 五項波動分數 >=4/5。",
  core_conclusions: `<ol><li><strong>價格趨勢仍完整，但本週已不是全面上漲。</strong>SPY／QQQ／IWM 五日 ${signed(byTicker("SPY").fiveDayPct)}／${signed(byTicker("QQQ").fiveDayPct)}／${signed(byTicker("IWM").fiveDayPct)}，DIA ${signed(byTicker("DIA").fiveDayPct)}；四大 ETF 仍在 20／50／200MA 上方。</li><li><strong>市場廣度由全面改善轉為分化。</strong>八項量化中 3 項惡化：NDX 20MA、IWM 50MA 與 Stockbee 5D；其餘五項改善。Stockbee 5D 降至 ${fixed(currentStockbee.ratio5d)}，10D 升至 ${fixed(currentStockbee.ratio10d)}，短線降溫但中期未崩。</li><li><strong>領漲因子轉向能源與部分軟體／資安。</strong>XLE／OIH／XOP 五日 ${signed(byTicker("XLE").fiveDayPct)}／${signed(byTicker("OIH").fiveDayPct)}／${signed(byTicker("XOP").fiveDayPct)}；KWEB／FXI／IBIT 為 ${signed(byTicker("KWEB").fiveDayPct)}／${signed(byTicker("FXI").fiveDayPct)}／${signed(byTicker("IBIT").fiveDayPct)}，風險偏好沒有全面擴散。</li><li><strong>宏觀組合轉向輕度停滯性通膨。</strong>CPI／PPI 沒有突破風控線，但零售 -0.6%、信心 51.0；2Y -2bp、10Y +3bp、30Y +6bp，加上 USO 五日 ${signed(byTicker("USO").fiveDayPct)}，長端與成本壓力同步上升。</li><li><strong>市場反饋重點從 Beat 轉向「預期差與毛利兌現」。</strong>CSCO、COHR、AMAT 基本面數字不弱仍遭賣出；SNDK、SMCI 則因長期需求或毛利路徑上修大漲。下週應用 HD／WMT 與 FOMC 紀要確認消費及折現率。</li></ol>`,
  weekly_positioning: `<h3>市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>市場風險分數</span><strong>${totalRisk}<small>/100</small></strong><em>Intermediate Risk</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:${totalRisk}%"></span></div><p>價格與 VIX 仍穩，但廣度降溫、12/18 檔 ATR 延伸、油價與長端利率同步上升，將總分推至中等風險。</p><small>0–34 Low Risk；35–59 Intermediate Risk；60–100 High Risk。</small></div></div>${marketScoreTable}<div class="callout warn"><strong>分數反算：</strong>${scoreRows.map((row) => row[3]).join(" + ")} = ${totalRisk}。Intermediate Risk 代表核心曝險可留在正常下緣，但新增風險必須等待價格、廣度或跨資產至少兩項確認。</div><div class="action-directive"><span class="ad-label">本週配置</span><ul class="ad-list"><li class="ad-primary">核心曝險維持正常下緣，新增部位優先選相對強勢且未過度延伸標的。</li><li class="ad-watch">XLF、RSP、XLE、SPY 與多個寬基 ETF 已超過 50MA 3 ATR；用回踩或盤整換取入場空間。</li><li class="ad-avoid">USO 與長端殖利率同升時，不把低 VIX 誤讀成全面低風險。</li></ul></div>`,
  previous_week_reconciliation: `<div class="status-pills"><span class="badge green">0 命中</span><span class="badge amber">0 已觸發</span><span class="badge red">0 失誤</span><span class="badge grey">9 未觸發</span></div>${previousTable}<div class="callout warn"><strong>對賬結論：</strong>九條複合規則均未完整觸發，因此沒有可驗證失誤；但能源再通膨與成長失速各有一半條件成立。這兩個近觸發訊號正是本週風險分數由 25 升至 ${totalRisk} 的主因。</div>`,
  indices_style_review: `${table([{label:"ETF"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"20/50/200MA",ma:true},{label:"RSI",num:true},{label:"判斷"}], indexRows, "ma-table report-data-table report-cols-7 index-summary-table")}<p><strong>小結：</strong>依 RSI 由高至低為 SPY、IWM、QQQ、DIA；四檔仍在三條均線上方。IWM 五日領先且最接近 52 週高，DIA 週線轉負，風格由防守轉向小型股與等權，但尚未形成全面風險擴散。</p>`,
  big_winners_losers: `${moverTable("本週五大強勢股", winners)}${moverTable("本週五大弱勢股", losers)}<div class="callout warn"><strong>NVDA 補充：</strong>五日 ${signed(byTicker("NVDA").fiveDayPct)}、一月 ${signed(byTicker("NVDA").oneMonthPct)}，收 ${fixed(byTicker("NVDA").close)}；高於 20MA ${fixed(byTicker("NVDA").ma20)} 與 50MA ${fixed(byTicker("NVDA").ma50)}，距 50MA +${fixed(byTicker("NVDA").distance50Atr)} ATR。趨勢仍在，但延伸不適合追價。</div><p><strong>共同因子：</strong>市場獎勵能把 AI／記憶體需求轉成訂單與毛利上修的公司，懲罰「Beat 已在價格內」或估值缺乏新增兌現的公司。COHR 的基本面強而股價弱，與 SNDK／SMCI 的強勢形成最清楚對照。</p>`,
  sector_momentum_chart: barChart(["OIH","XOP","XLE","BUG","XSW","SMH","IBIT","KWEB"].map((ticker) => ({label:ticker,value:byTicker(ticker).fiveDayPct}))),
  sector_thematic_weekly: `${etfTable("S&amp;P 500 Sector ETF", sectors, 'data-etf-group="sector" data-expected-rows="12" data-benchmark="SPY" data-sort="rsi-desc"')}${etfTable("Thematic Sector ETF", themes, 'data-etf-group="thematic" data-expected-rows="45" data-etf-universe="thematic-complete" data-source-count="45" data-report-count="45" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc"')}<div class="callout warn"><strong>板塊結論：</strong>Sector 由 XLE ${signed(byTicker("XLE").fiveDayPct)} 明顯領先，XLY／XLB 為主要弱項；Thematic 由 OIH／XOP 領漲，KWEB／FXI／IBIT 落後。55 個非基準板塊／主題中有 ${weakRows.length} 個符合弱勢定義，輪動存在但並非全面惡化。</div>`,
  market_breadth_weekly: `${table([{label:"指標（最新日）"},{label:"最新",num:true},{label:"8/7",num:true},{label:"週變化",num:true},{label:"判斷"}], breadthRows, "report-data-table report-cols-5")}<div class="status-pills"><span class="badge amber">5日惡化 ${breadthScore}/8</span><span class="badge amber">Stockbee 5D ${fixed(currentStockbee.ratio5d)}</span><span class="badge green">Stockbee 10D ${fixed(currentStockbee.ratio10d)}</span><span class="badge green">T2108 ${fixed(currentStockbee.t2108)}%</span></div><p><strong>三大指數廣度：</strong>MA 廣度截至 8/13。SPX 20／50MA 較 8/7 上升 3.58／2.59pp；NDX 為 -1.96／+9.80pp；IWM 為 +2.54／-0.28pp。六項中四項改善，短線弱點集中在 NDX 20MA，中期弱點集中在 IWM 50MA。</p><p><strong>與 Stockbee 交叉驗證：</strong>Stockbee 截至 8/14。5D ratio 由 2.85 降至 ${fixed(currentStockbee.ratio5d)}，10D 由 1.64 升至 ${fixed(currentStockbee.ratio10d)}；4% 上漲／下跌為 ${currentStockbee.up4}／${currentStockbee.down4}，34/13 為 ${currentStockbee.up34_13}／${currentStockbee.down34_13}。短線動能降溫，中期強股仍多於弱股。</p><div class="callout warn"><strong>綜合結論：</strong>五日趨勢量化分數 ${breadthScore}/8，屬輕度惡化。廣度尚未觸發失速線，但已不支持無條件追高；下週以 NDX >20MA 55% 與 Stockbee 5D 1 作風控。</div>`,
  atr_weekly: `${table([{label:"ETF"},{label:"價格",num:true},{label:"50MA",num:true},{label:"ATR(14)",num:true},{label:"距50MA ATR",num:true},{label:"判斷"}], atrRows, "report-data-table report-cols-6")}<div class="callout warn"><strong>小結：</strong>${atrExtendedCount}/${atrUniverse.length} 檔距 50MA 絕對值達 2 ATR。XLF、RSP、XLE 與 SPY 正向延伸最高；TLT 為負向延伸。價格趨勢偏多，但追價風險已是總分的重要來源。</div>`,
  fx_commodities_treasury_weekly: `${table([{label:"資產"},{label:"最新",num:true},{label:"5日",num:true},{label:"1月",num:true},{label:"市場含義"}], crossAssets.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<div class="callout warn"><strong>長短債比較：</strong>2Y／10Y／20Y／30Y 一週 -2／+3／+5／+6bp，10s2s 由 +46bp 擴至 +51bp。這不是寬鬆式牛市陡峭，而是長端上升的熊市陡峭；TLT 低於 50MA ${fixed(Math.abs(byTicker("TLT").distance50Atr))} ATR，與 USO 上升共同構成跨資產壓力。</div>`,
  macro_fed_weekly: `${table([{label:"數據／政策"},{label:"Actual",num:true},{label:"Forecast／門檻",num:true},{label:"Previous",num:true},{label:"政策與市場含義"}], macroRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "macro-review-table report-data-table report-cols-5")}<p><strong>小結：</strong>CPI／PPI 沒有突破上週風控線，卻也未替 Fed 創造明確寬鬆空間；零售與信心轉弱、油價與長端上升，使政策組合更接近「成長降溫但通膨約束仍在」。8/19 紀要的重點是政策反應函數，不是單一升降息押注。</p>`,
  next_week_plan: `${table([{label:"日期（ET）"},{label:"事件"},{label:"Forecast",num:true},{label:"Previous",num:true},{label:"監控重點"}], eventRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<p class="note">8/19 公布的是 7月 FOMC 紀要，不是新的利率決策；下次 FOMC 為 9/15–9/16。</p><h3>四種情境與主觀概率</h3>${scenarioTable}<h3>各模組聯動預測</h3>${linkageTable}<div class="action-directive"><span class="ad-label">執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看 8/18：</strong>進口價格、房屋與工業生產決定成本與實體需求組合。</li><li class="ad-watch"><strong>再看 8/19：</strong>用 FOMC 紀要判斷 10Y 4.80% 是否會變成壓力線。</li><li class="ad-watch"><strong>最後看 8/20：</strong>WMT、初領與費城 Fed 共同確認消費弱化是否擴散。</li><li class="ad-invalidate"><strong>風控：</strong>QQQ <${fixed(byTicker("QQQ").ma50)} 且 SMH <${fixed(byTicker("SMH").ma20)}，或 10Y >4.80% 且 DXY >101.50，科技降低 1/3。</li></ul></div>`,
  cross_validation_summary: `<div class="callout ok"><strong>互相確認：</strong>四大 ETF 全數站上三條均線，技術分數 0/12；VIX 0/5、VIXY 低於 20／50MA，價格趨勢與波動仍支持核心曝險。</div><div class="callout warn"><strong>互相分歧：</strong>廣度 3/8 惡化、SMH 未收回 50MA，中國與加密主題落後；零售與信心轉弱同時 USO、10Y、30Y 上升。內部結構與跨資產已比指數價格更保守。</div><div class="callout warn"><strong>主導結論：</strong>${totalRisk}/100 Intermediate Risk。執行上保留核心、限制追價，只有 Stockbee 5D >2、SMH 收回 50MA 或 10Y 回到 4.55% 下方等確認出現，才提高新增風險。</div>`,
  next_week_monitoring_checklist: monitorTable,
  sources
};

const output = path.resolve(root, "data/2026-08-14-weekly.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({output:path.relative(root, output), totalRisk, breadthScore, technicalScore, vixScore, sectorRows:sectors.length, thematicRows:themes.length, winners:winners.map((row) => row.ticker), losers:losers.map((row) => row.ticker)}, null, 2));
