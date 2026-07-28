#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-28-premarket-update.html"), "utf8");
const css = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const data = require(path.join(root, "data", "2026-07-28-premarket.json"));
const thematicSource = require(path.resolve(root, "..", "thematic_rsi_longport.json"));
const technicalSource = require(path.resolve(root, "..", "postmarket_snapshot_2026-07-27.json"));

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function tbodyAfter(source, heading) {
  const start = source.indexOf(`<h3>${heading}`);
  if (start < 0) return "";
  const tail = source.slice(start);
  const match = tail.match(/<tbody>([\s\S]*?)<\/tbody>/);
  return match ? match[1] : "";
}

function rsiValues(source) {
  return [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
}

function descending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

const sectorBody = tbodyAfter(data.sector_thematic_etf_tables, "S&amp;P 500 Sector ETF");
const thematicBody = tbodyAfter(data.sector_thematic_etf_tables, "Thematic Sector ETF");
const majorTickers = [...data.major_etf_technical_table.matchAll(/<tr><td><strong>([A-Z]+)<\/strong><\/td>/g)].map((match) => match[1]);
const thematicSourceRsi = new Map(thematicSource.rows.map((row) => [row.ticker, row.rsi14]));
const technicalSourceRsi = new Map(technicalSource.rows.map((row) => [row.ticker, row.rsi14]));
const thematicReportRsi = [...thematicBody.matchAll(/class="etf-symbol"><strong>([A-Z]+)<\/strong>[\s\S]*?data-rsi="([0-9.]+)"/g)]
  .map((match) => ({ ticker: match[1], rsi: Number(match[2]) }));
const thematicReportTickers = thematicReportRsi.map((row) => row.ticker);
const allText = `${html}\n${JSON.stringify(data)}`;

const checks = {
  reportDate: data.report_title === "2026-07-28｜美股盤前監控",
  localDraft: /本地草稿/.test(data.cross_validation_summary),
  sourceUniverse: /Sector Dashboard、Thematic Sectors、Macro 為三個主資料表/.test(data.data_timestamp_note),
  technicalAsOf: data.technical_as_of === "2026-07-27",
  movers: data.pre_market_movers.length,
  moverTickers: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  moverVolumes: data.pre_market_movers.every((row) => /長橋盤前量 (?:[0-9.]+億股|[0-9.]+萬股|[0-9,]+股)。$/.test(row.catalyst)),
  sectorRows: count(sectorBody, /<tr>/g),
  sectorRsiSorted: descending(rsiValues(sectorBody)),
  thematicRows: count(thematicBody, /<tr>/g),
  thematicRsiSorted: descending(rsiValues(thematicBody)),
  thematicSourceComplete: thematicSource.rows.length === 44
    && thematicSource.errors.length === 0
    && new Set(thematicSource.rows.map((row) => row.ticker)).size === 44
    && thematicSource.rows.every((row) => row.asOf === "2026-07-27"),
  thematicExactSourceMatch: thematicReportRsi.every(({ ticker, rsi }) =>
    rsi === (thematicSourceRsi.get(ticker) ?? technicalSourceRsi.get(ticker))
  ),
  thematicCoversCompleteUniverse: thematicSource.rows.every((row) => thematicReportTickers.includes(row.ticker))
    && thematicReportTickers.length === 45
    && new Set(thematicReportTickers).size === 45,
  thematicUniverseContract: /data-etf-universe="thematic-complete"/.test(data.sector_thematic_etf_tables)
    && /data-source-count="44"/.test(data.sector_thematic_etf_tables)
    && /data-report-count="45"/.test(data.sector_thematic_etf_tables)
    && /data-benchmark="SPY"/.test(data.sector_thematic_etf_tables)
    && /data-sort="rsi-desc"/.test(data.sector_thematic_etf_tables),
  thematicHasSpyOnce: count(thematicBody, /<strong>SPY<\/strong>/g),
  thematicEnglishSymbols: [...thematicBody.matchAll(/class="etf-symbol"><strong>([^<]+)<\/strong>/g)].every((match) => /^[A-Z]+$/.test(match[1])),
  majorUniverse: majorTickers.join(",") === "IWM,DIA,SPY,QQQ",
  vixComposite: data.vix_volatility_score === 3
    && data.vix_volatility_level === "Intermediate"
    && /VIX 波動分數 3\/5/.test(data.correction_checklist_dashboard)
    && />20 0\/1、5日>0 1\/1、1月>0 0\/1、20MA 1\/1、50MA 1\/1/.test(data.correction_checklist_dashboard),
  checklistScore: /Checklist Score：6\/8 High＝High Risk/.test(data.correction_checklist_dashboard),
  macroFields: [
    "S&amp;P Case-Shiller 20城房價 YoY",
    "美國消費者信心",
    "Richmond Fed 製造業指數",
    "<small>Actual</small>",
    "<small>Forecast</small>",
    "<small>Previous</small>",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  earningsDetail: [
    "KO 財報",
    "EPS 0.97<br>營收 13.38B",
    "EPS 0.93<br>營收 13.16B",
    "Beat／Beat",
    "UPS 財報",
    "EPS 1.76<br>營收 22.80B",
    "BA 財報",
    "EPS -0.76<br>營收 24.56B",
    "V 財報",
    "EPS 3.23<br>營收 11.38B",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  earningsLayout: /class="macro-policy-table report-data-table/.test(data.macro_premarket_background_table)
    && /macro-data-grid--earnings/.test(data.macro_premarket_background_table)
    && /\.flat-report \.macro-policy-table\{min-width:1180px\}/.test(css)
    && /\.flat-report \.macro-policy-table th:nth-child\(2\)\{width:35%\}/.test(css)
    && /\.flat-report \.macro-data-grid--earnings strong\{[\s\S]*?white-space:normal;/.test(css),
  visaPending: /V 財報[\s\S]*?Actual<\/small><strong>待公布/.test(data.macro_premarket_background_table)
    && !/V 財報[\s\S]{0,400}(?:Beat|Miss)/.test(data.macro_premarket_background_table),
  ratesNotDuplicate: /FOMC 利率決議/.test(data.treasury_fed_economic_data_table)
    && /7年期美債標售/.test(data.treasury_fed_economic_data_table)
    && /DXY/.test(data.treasury_fed_economic_data_table)
    && !/美國消費者信心|Richmond Fed|KO 財報|UPS 財報|BA 財報/.test(data.treasury_fed_economic_data_table),
  dxyVisible: /DXY<\/span><strong>101\.50/.test(data.fx_commodities_table)
    && /DXY 升破 102/.test(allText),
  breadthIntegrated: [
    "SPX >20MA",
    "NDX >20MA",
    "IWM >20MA",
    "T2108",
    "5D／10D ratio",
    "380／195",
    "三大指數廣度",
    "不能只用 Stockbee",
  ].every((value) => `${data.market_breadth_table}${data.stockbee_breadth_interpretation}`.includes(value)),
  expectedMove: ["SPY", "QQQ", "IWM", "DIA", "SMH", "USO", "NVDA", "NOW", "CRM", "低於 -1SD", "高於 +1SD"]
    .every((value) => data.macro_premarket_background_table.includes(value)),
  sources: /長橋 OpenAPI/.test(data.cross_validation_summary)
    && /Market Watch/.test(data.cross_validation_summary)
    && /Stockbee/.test(data.cross_validation_summary)
    && /Federal Reserve/.test(data.cross_validation_summary),
  unresolved: /\{\{|undefined|NaN|REPLACE_ME|待補|不可得/.test(html),
  staleNarrative: /2026-07-27｜美股盤前監控|油價急跌推動全面反彈|耐用品 headline 明顯 Miss|2年期美債標售/.test(allText),
  simplifiedChinese: /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨|下跌家数|盘前|技术|广度|价格|确认|仓位|趋势|预期|运输|发布|判断|卖压|结构|反弹|收复|高于|低于|区间|驱动|扩散|参与|标售|缓冲|假设|恢复|结束|邮轮|设备链|记忆体|网通|企业|云端|加密资产|板块/.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const numberTargets = {
  movers: 16,
  sectorRows: 12,
  thematicRows: 45,
  thematicHasSpyOnce: 1,
};
const pass = Object.entries(checks).every(([name, value]) => {
  if (Object.hasOwn(numberTargets, name)) return value === numberTargets[name];
  if (["unresolved", "staleNarrative", "simplifiedChinese"].includes(name)) return value === false;
  return value === true;
});

if (!pass) process.exit(1);
