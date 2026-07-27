#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "reports", "2026-07-27-premarket-update.html");
const html = fs.readFileSync(htmlPath, "utf8");
const data = require(path.join(root, "data", "2026-07-27-premarket.json"));

function countRows(source) {
  return (source.match(/<tr>/g) || []).length;
}

function rsiValues(source) {
  return [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
}

function descending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

function sectionFromHeading(source, headingPrefix) {
  const start = source.indexOf(`<h3>${headingPrefix}`);
  return start < 0 ? "" : source.slice(start);
}

const sectorSource = sectionFromHeading(data.sector_thematic_etf_tables, "S&amp;P 500 Sector ETF");
const thematicStart = data.sector_thematic_etf_tables.indexOf("<h3>Thematic Sector ETF");
const sectorOnly = thematicStart < 0 ? "" : sectorSource.slice(0, sectorSource.indexOf("<h3>Thematic Sector ETF"));
const thematicSource = thematicStart < 0 ? "" : data.sector_thematic_etf_tables.slice(thematicStart);
const sectorBody = (sectorOnly.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
const thematicBodies = [...thematicSource.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((match) => match[1]);
const thematicRows = thematicBodies.join("");
const allEtfRows = [...data.sector_thematic_etf_tables.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
const majorTickers = [...data.major_etf_technical_table.matchAll(/<tr><td>([A-Z]+)<\/td>/g)].map((match) => match[1]);
const serialized = JSON.stringify(data);

const stalePattern = /2026-07-24｜美股盤前監控|7\/23 收盤廣度|43\.33%|138／325|油價跳升推高通膨/;
const unresolvedPattern = /\{\{|undefined|NaN|REPLACE_ME|待補|不可得/;
const simplifiedPattern = /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨|下跌家数|盘前|技术|广度|价格|确认|仓位|趋势|预期|运输|发布|判断|卖压|结构|反弹|收复|高于|低于|区间|驱动|扩散|参与|标售|缓冲|假设|恢复|结束|邮轮|旅游|设备链|记忆体|网通|企业|云端|加密资产|风险资产|板块/;

const checks = {
  date: data.report_title === "2026-07-27｜美股盤前監控",
  localDraftDisclosure: /本地草稿/.test(data.cross_validation_summary),
  movers: data.pre_market_movers.length,
  moverTickerPlainText: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  moverVolumeCompact: data.pre_market_movers.every((row) => /；(?:[0-9.]+萬股|[0-9,]+股)$/.test(row.catalyst)),
  sectorRows: countRows(sectorBody),
  sectorRsiDescending: descending(rsiValues(sectorBody)),
  thematicGroups: thematicBodies.length,
  thematicRows: countRows(thematicRows),
  thematicRsiDescending: thematicBodies.length === 2 && thematicBodies.every((body) => descending(rsiValues(body))),
  spyInThematic: (thematicRows.match(/<strong>SPY<\/strong>/g) || []).length,
  allEtfRowsHaveThreeMa: allEtfRows.length > 0 && allEtfRows.every((row) => {
    if (!/class="etf-symbol"/.test(row)) return true;
    return (row.match(/\bma-state\b/g) || []).length === 3;
  }),
  technicalAsOf: data.technical_as_of === "2026-07-24",
  technicalScore: /技術惡化分數 11\/12（SPY 4\/4、QQQ 4\/4、DIA 3\/4）/.test(data.correction_checklist_dashboard),
  breadthScore: /5日廣度惡化分數 7\/8（SPX 1\/2、NDX 2\/2、T2108 1\/1、Stockbee 3\/3）/.test(data.correction_checklist_dashboard),
  vixCompositeScore: data.vix_volatility_score === 1
    && data.vix_volatility_level === "Low"
    && data.vix_volatility_components.spotGt20 === 0
    && data.vix_volatility_components.fiveDayGt0 === 0
    && data.vix_volatility_components.oneMonthGt0 === 0
    && data.vix_volatility_components.above20ma === 1
    && data.vix_volatility_components.above50ma === 0
    && /data-vix-scoring="composite-5"/.test(data.correction_checklist_dashboard)
    && /VIX 波動分數 1\/5（>20 0\/1、5日>0 0\/1、1月>0 0\/1、20MA 1\/1、50MA 0\/1）= Low/.test(data.correction_checklist_dashboard)
    && /現貨 17\.59；VIXY 5日 -0\.97%、1月 -6\.42%/.test(data.correction_checklist_dashboard)
    && /0–1 Low、2–3 Intermediate、4–5 High/.test(data.correction_checklist_dashboard)
    && !/VIX &gt;20／波動升溫/.test(data.correction_checklist_dashboard),
  breadthLatest: ["55.06%", "65.20%", "32.03%", "39.80%", "39.79%", "56.51%", "0.83", "0.76", "144／349"]
    .every((value) => data.market_breadth_table.includes(value)),
  macroActualForecastPrevious: [
    "<strong>耐用品訂單</strong>",
    "<small>Actual</small><strong>+0.3%</strong>",
    "<small>Forecast</small><strong>+2.5%</strong>",
    "<small>Previous</small><strong>-4.0%</strong>",
    "<strong>扣除運輸耐用品訂單</strong>",
    "<small>Actual</small><strong>+0.6%</strong>",
    "<small>Forecast</small><strong>+0.8%</strong>",
    "<small>Previous</small><strong>+1.3%</strong>",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  earningsPending: ["MSFT／META 財報", "AAPL／AMZN 財報", "EPS 4.22／7.21", "EPS 1.89／1.82", "Actual</small><strong>待公布"]
    .every((value) => data.macro_premarket_background_table.includes(value)),
  noPrematureEarningsResult: !/MSFT[^<]{0,30}(?:Beat|Miss)|META[^<]{0,30}(?:Beat|Miss)|AAPL[^<]{0,30}(?:Beat|Miss)|AMZN[^<]{0,30}(?:Beat|Miss)/.test(data.macro_premarket_background_table),
  distinctTreasurySection: /<h2>美債與 Fed 傳導<\/h2>/.test(html)
    && ["美國10年期殖利率", "TLT", "DXY", "2年期美債標售"]
      .every((value) => data.treasury_fed_economic_data_table.includes(value))
    && !/耐用品訂單|MSFT／META 財報|AAPL／AMZN 財報|Headline Miss|FOMC 利率決議/.test(data.treasury_fed_economic_data_table),
  treasuryRows: countRows((data.treasury_fed_economic_data_table.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || ""),
  dxyVisible: /DXY<\/span><strong>101\.27/.test(data.fx_commodities_table),
  dxyTrigger: /DXY[^<]{0,20}102/.test(serialized),
  expectedMove: ["DIA", "TLT", "XLI", "XOP", "接近 +1SD", "接近 -1SD", "目前沒有 1SD／2SD 突破"]
    .every((value) => data.macro_premarket_background_table.includes(value)),
  majorUniverse: majorTickers.join(",") === "IWM,DIA,SPY,QQQ"
    && /data-major-universe="indices-4"/.test(data.major_etf_technical_table),
  sources: /長橋 OpenAPI/.test(data.cross_validation_summary)
    && /Market Watch/.test(data.cross_validation_summary)
    && /Stockbee/.test(data.cross_validation_summary)
    && /U\.S\. Census Bureau/.test(data.cross_validation_summary),
  staleData: stalePattern.test(html) || stalePattern.test(serialized),
  unresolved: unresolvedPattern.test(html),
  simplifiedChineseLeak: simplifiedPattern.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const pass = Object.entries(checks).every(([name, value]) => {
  if (["movers", "sectorRows", "thematicGroups", "thematicRows", "spyInThematic", "treasuryRows"].includes(name)) return true;
  if (["staleData", "unresolved", "simplifiedChineseLeak"].includes(name)) return value === false;
  return value === true;
})
  && checks.movers === 18
  && checks.sectorRows === 12
  && checks.thematicGroups === 2
  && checks.thematicRows === 24
  && checks.spyInThematic === 1
  && checks.treasuryRows === 4;

if (!pass) process.exit(1);
