#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-30-premarket-update.html"), "utf8");
const css = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const data = require(path.join(root, "data", "2026-07-30-premarket.json"));
const thematicSource = require(path.resolve(root, "..", "thematic_rsi_longport.json"));
const technicalSource = require(path.resolve(root, "..", "postmarket_snapshot_2026-07-29.json"));
const quoteSource = require(path.resolve(root, "..", "premarket_quotes_0730.json"));

const count = (source, pattern) => (source.match(pattern) || []).length;

function tbodyAfter(source, heading) {
  const start = source.indexOf(`<h3>${heading}`);
  if (start < 0) return "";
  const match = source.slice(start).match(/<tbody>([\s\S]*?)<\/tbody>/);
  return match ? match[1] : "";
}

const rsiValues = (source) => [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
const descending = (values) => values.every((value, index) => index === 0 || values[index - 1] >= value);

const sectorBody = tbodyAfter(data.sector_thematic_etf_tables, "S&amp;P 500 Sector ETF");
const thematicBody = tbodyAfter(data.sector_thematic_etf_tables, "Thematic Sector ETF");
const majorTickers = [...data.major_etf_technical_table.matchAll(/<tr><td><strong>([A-Z]+)<\/strong><\/td>/g)]
  .map((match) => match[1]);
const thematicSourceRsi = new Map(thematicSource.rows.map((row) => [row.ticker, row.rsi14]));
const technicalSourceRsi = new Map(technicalSource.rows.map((row) => [row.ticker, row.rsi14]));
const thematicReportRsi = [...thematicBody.matchAll(/class="etf-symbol"><strong>([A-Z]+)<\/strong>[\s\S]*?data-rsi="([0-9.]+)"/g)]
  .map((match) => ({ ticker: match[1], rsi: Number(match[2]) }));
const thematicReportTickers = thematicReportRsi.map((row) => row.ticker);
const allText = `${html}\n${JSON.stringify(data)}`;

const checks = {
  reportDate: data.report_title === "2026-07-30｜美股盤前監控",
  localDraft: /2026-07-30 美股盤前本地草稿/.test(data.cross_validation_summary),
  technicalAsOf: data.technical_as_of === "2026-07-29",
  longbridgeComplete: quoteSource.length === 96
    && new Set(quoteSource.map((row) => row.ticker)).size === 96
    && ["SHY", "IEF", "TLT"].every((ticker) => quoteSource.some((row) => row.ticker === ticker && row.premarketAvailable)),
  movers: data.pre_market_movers.length,
  moverTickers: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  moverVolumes: data.pre_market_movers.every((row) => /長橋盤前量 (?:[0-9.]+億股|[0-9.]+萬股|[0-9,]+股)。$/.test(row.catalyst)),
  moverNoWrapContract: /\.premarket-movers-table th:nth-child\(1\),\.premarket-movers-table td:nth-child\(1\)\{[^}]*white-space:nowrap/.test(css),
  sectorRows: count(sectorBody, /<tr>/g),
  sectorRsiSorted: descending(rsiValues(sectorBody)),
  thematicRows: count(thematicBody, /<tr>/g),
  thematicRsiSorted: descending(rsiValues(thematicBody)),
  thematicSourceComplete: thematicSource.rows.length === 44
    && thematicSource.errors.length === 0
    && thematicSource.rows.every((row) => row.asOf === "2026-07-29"),
  thematicExactSourceMatch: thematicReportRsi.every(({ ticker, rsi }) =>
    rsi === (thematicSourceRsi.get(ticker) ?? technicalSourceRsi.get(ticker))
  ),
  thematicCoversCompleteUniverse: thematicSource.rows.every((row) => thematicReportTickers.includes(row.ticker))
    && thematicReportTickers.length === 45
    && new Set(thematicReportTickers).size === 45,
  thematicUniverseContract: /data-source-count="44"/.test(data.sector_thematic_etf_tables)
    && /data-report-count="45"/.test(data.sector_thematic_etf_tables)
    && /data-benchmark="SPY"/.test(data.sector_thematic_etf_tables)
    && /data-sort="rsi-desc"/.test(data.sector_thematic_etf_tables),
  thematicHasSpyOnce: count(thematicBody, /<strong>SPY<\/strong>/g),
  majorUniverse: majorTickers.join(",") === "IWM,DIA,SPY,QQQ",
  macroActualForecastPrevious: [
    "美國 Q2 GDP（年化）",
    "+1.5%",
    "+2.1%",
    "GDP 價格指數",
    "+6.3%",
    "核心 PCE（六月 MoM／YoY）",
    "+0.1%／+3.3%",
    "+0.2%／+3.3%",
    "19.7萬／178.2萬",
    "20.0萬／180.0萬",
    "18.8萬／178.9萬",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  earningsActuals: [
    "MSFT 財報",
    "EPS 4.81<br>營收 90.00B",
    "EPS 4.24<br>營收 87.62B",
    "META 財報",
    "EPS 6.18<br>營收 60.80B",
    "EPS 7.19<br>營收 60.22B",
    "Miss／Beat",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  pendingEarnings: /AAPL 財報[\s\S]*?Actual<\/small><strong>待公布/.test(data.macro_premarket_background_table)
    && /AMZN 財報[\s\S]*?Actual<\/small><strong>待公布/.test(data.macro_premarket_background_table),
  noPendingMacro: !/美國 Q2 GDP[\s\S]{0,300}待公布/.test(data.macro_premarket_background_table)
    && !/核心 PCE[\s\S]{0,300}待公布/.test(data.macro_premarket_background_table)
    && !/初領／續領失業金[\s\S]{0,300}待公布/.test(data.macro_premarket_background_table),
  bondCurve: [
    'data-bond-curve="shy-ief-tlt"',
    "SHY｜1–3年短債",
    "IEF｜7–10年中債",
    "TLT｜20年以上長債",
    "三者最弱",
    "ETF 久期不同",
    "2Y／10Y 殖利率變動驗證",
    "短債主要交易較低的即時升息急迫性",
  ].every((value) => data.treasury_fed_economic_data_table.includes(value)),
  bondCurveValues: /SHY -0\.01%/.test(data.treasury_fed_economic_data_table)
    && /IEF -0\.06%/.test(data.treasury_fed_economic_data_table)
    && /TLT -0\.17%/.test(data.treasury_fed_economic_data_table),
  fomcScenarios: ["9–3 維持", "需求韌性＋月度通脹降溫", "增長弱＋季度通脹高", "全面降溫", "財報主導、宏觀次要"]
    .every((value) => data.treasury_fed_economic_data_table.includes(value)),
  breadthIntegrated: ["63.02%", "47.57%", "45.14%", "48.33%", "0.65／0.76", "165／552", "兩組來源方向一致"]
    .every((value) => `${data.market_breadth_table}${data.stockbee_breadth_interpretation}`.includes(value)),
  dxyVisible: /DXY<\/span><strong>約 100\.8/.test(data.fx_commodities_table)
    && /DXY 升破 102/.test(allText),
  vixComposite: data.vix_volatility_score === 3
    && data.vix_volatility_level === "Intermediate"
    && />20 0\/1、5日>0 1\/1、1月>0 1\/1、20MA 1\/1、50MA 0\/1/.test(data.correction_checklist_dashboard),
  checklistScore: /Checklist Score：6\/8 High＝High Risk/.test(data.correction_checklist_dashboard),
  sources: /BEA：Q2 GDP/.test(data.cross_validation_summary)
    && /BEA：六月/.test(data.cross_validation_summary)
    && /Trading Economics/.test(data.cross_validation_summary)
    && /長橋 OpenAPI/.test(data.cross_validation_summary),
  unresolved: /\{\{|undefined|NaN|REPLACE_ME|待補|不可得|待更新/.test(html),
  staleReport: /2026-07-29｜美股盤前監控|FOMC 利率決議[\s\S]{0,250}待公布|CME 維持 64\.6%/.test(allText),
  simplifiedChinese: /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨|下跌家数|盘前|技术|广度|价格|确认|仓位|趋势|预期|运输|发布|判断|卖压|结构|反弹|收复|高于|低于|区间|驱动|扩散|参与|设备链|记忆体|企业|板块/.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const numberTargets = { movers: 16, sectorRows: 12, thematicRows: 45, thematicHasSpyOnce: 1 };
const negativeChecks = new Set(["unresolved", "staleReport", "simplifiedChinese"]);
const pass = Object.entries(checks).every(([name, value]) => {
  if (Object.hasOwn(numberTargets, name)) return value === numberTargets[name];
  if (negativeChecks.has(name)) return value === false;
  return value === true;
});

if (!pass) process.exit(1);
