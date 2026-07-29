#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-29-premarket-update.html"), "utf8");
const css = fs.readFileSync(path.join(root, "reports", "report-shared.css"), "utf8");
const data = require(path.join(root, "data", "2026-07-29-premarket.json"));
const thematicSource = require(path.resolve(root, "..", "thematic_rsi_longport.json"));
const technicalSource = require(path.resolve(root, "..", "postmarket_snapshot_2026-07-28.json"));
const quoteSource = require(path.resolve(root, "..", "premarket_quotes_0729.json"));

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function tbodyAfter(source, heading) {
  const start = source.indexOf(`<h3>${heading}`);
  if (start < 0) return "";
  const match = source.slice(start).match(/<tbody>([\s\S]*?)<\/tbody>/);
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
const majorTickers = [...data.major_etf_technical_table.matchAll(/<tr><td><strong>([A-Z]+)<\/strong><\/td>/g)]
  .map((match) => match[1]);
const thematicSourceRsi = new Map(thematicSource.rows.map((row) => [row.ticker, row.rsi14]));
const technicalSourceRsi = new Map(technicalSource.rows.map((row) => [row.ticker, row.rsi14]));
const thematicReportRsi = [...thematicBody.matchAll(/class="etf-symbol"><strong>([A-Z]+)<\/strong>[\s\S]*?data-rsi="([0-9.]+)"/g)]
  .map((match) => ({ ticker: match[1], rsi: Number(match[2]) }));
const thematicReportTickers = thematicReportRsi.map((row) => row.ticker);
const allText = `${html}\n${JSON.stringify(data)}`;

const checks = {
  reportDate: data.report_title === "2026-07-29｜美股盤前監控",
  publishReady: /本報告為 2026-07-29 美股盤前更新/.test(data.cross_validation_summary)
    && !/本地草稿|未經使用者確認|不推送/.test(data.cross_validation_summary),
  technicalAsOf: data.technical_as_of === "2026-07-28",
  longbridgeComplete: Array.isArray(quoteSource)
    && quoteSource.length === 94
    && new Set(quoteSource.map((row) => row.ticker)).size === 94,
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
    && thematicSource.rows.every((row) => row.asOf === "2026-07-28"),
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
  thematicEnglishSymbols: [...thematicBody.matchAll(/class="etf-symbol"><strong>([^<]+)<\/strong>/g)]
    .every((match) => /^[A-Z]+$/.test(match[1])),
  majorUniverse: majorTickers.join(",") === "IWM,DIA,SPY,QQQ",
  vixComposite: data.vix_volatility_score === 3
    && data.vix_volatility_level === "Intermediate"
    && /VIX 19\.08；波動分數 3\/5/.test(data.correction_checklist_dashboard)
    && />20 0\/1、5日>0 1\/1、1月>0 0\/1、20MA 1\/1、50MA 1\/1/.test(data.correction_checklist_dashboard),
  checklistScore: /Checklist Score：5\/8 High＝High Risk/.test(data.correction_checklist_dashboard),
  fomcFocus: [
    "CME 維持</span><strong>64.6%",
    "前日 69.0%／前週 72.3%",
    "CME 升息</span><strong class=\"dn\">35.4%",
    "前日 31.0%／前週 27.7%",
    "14:00／14:30 ET",
    "聲明／Warsh 記者會",
    "無 SEP",
    "維持＋偏鴿",
    "維持＋偏鷹",
    "升息 25bp",
    "升息但一次性",
  ].every((value) => data.treasury_fed_economic_data_table.includes(value)),
  fomcSeparated: /FOMC 聲明[\s\S]*14:00 ET/.test(data.treasury_fed_economic_data_table)
    && /Warsh 記者會[\s\S]*14:30 ET/.test(data.treasury_fed_economic_data_table)
    && /盤後 MSFT／META 會形成第三段波動/.test(data.treasury_fed_economic_data_table),
  macroActualForecastPrevious: [
    "FOMC 利率決議",
    "<small>Actual</small>",
    "<small>Forecast</small>",
    "<small>Previous</small>",
    "HUM 財報",
    "EPS 7.61<br>營收 40.87B",
    "EPS 7.25<br>營收 40.57B",
    "BSX 財報",
    "EPS 0.86<br>營收 5.44B",
    "EPS 0.83<br>營收 5.39B",
    "V 財報",
    "EPS 3.32<br>營收 11.60B",
    "EPS 3.23<br>營收 11.39B",
  ].every((value) => data.macro_premarket_background_table.includes(value)),
  earningsSignals: count(data.macro_premarket_background_table, />Beat／Beat</g) === 3
    && /MSFT 財報[\s\S]*?Actual<\/small><strong>待公布[\s\S]*?Forecast<\/small><strong>EPS 4\.24<br>營收 87\.67B/.test(data.macro_premarket_background_table)
    && /META 財報[\s\S]*?Actual<\/small><strong>待公布[\s\S]*?Forecast<\/small><strong>EPS 7\.18<br>營收 60\.19B/.test(data.macro_premarket_background_table),
  pendingNoPrematureBeatMiss: !/MSFT 財報[\s\S]{0,500}(?:Beat|Miss)/.test(data.macro_premarket_background_table)
    && !/META 財報[\s\S]{0,500}(?:Beat|Miss)/.test(data.macro_premarket_background_table),
  earningsLayout: /macro-data-grid--earnings/.test(data.macro_premarket_background_table)
    && /\.flat-report \.macro-policy-table\{min-width:1180px\}/.test(css)
    && /\.flat-report \.macro-data-grid--earnings strong\{[\s\S]*?white-space:normal;/.test(css),
  breadthIntegrated: [
    "SPX >20MA（7/28）",
    "69.18%",
    "NDX >20MA（7/28）",
    "48.54%",
    "IWM >20MA（7/28）",
    "52.57%",
    "0.78／0.88",
    "341／388",
    "SPX／NDX／IWM 20MA 與 50MA 廣度均較前一日改善",
    "不能只用 Stockbee",
  ].every((value) => `${data.market_breadth_table}${data.stockbee_breadth_interpretation}`.includes(value)),
  dxyVisible: /DXY<\/span><strong>約 101\.49/.test(data.fx_commodities_table)
    && /DXY 升破 102/.test(allText),
  ratesNotDuplicate: /CME FedWatch/.test(data.treasury_fed_economic_data_table)
    && /TLT/.test(data.treasury_fed_economic_data_table)
    && /DXY/.test(data.treasury_fed_economic_data_table)
    && !/HUM 財報|BSX 財報|V 財報/.test(data.treasury_fed_economic_data_table),
  expectedMove: ["SPY", "QQQ", "IWM", "DIA", "XLK", "SMH", "USO", "TLT", "AMD", "MSFT", "META", "低於 -1SD"]
    .every((value) => data.macro_premarket_background_table.includes(value)),
  sources: /長橋 OpenAPI/.test(data.cross_validation_summary)
    && /CME FedWatch/.test(data.cross_validation_summary)
    && /Federal Reserve/.test(data.cross_validation_summary)
    && /Humana/.test(data.cross_validation_summary)
    && /Boston Scientific/.test(data.cross_validation_summary),
  unresolved: /\{\{|undefined|NaN|REPLACE_ME|待補|不可得|待更新/.test(html),
  staleNarrative: /2026-07-28｜美股盤前監控|KO 財報|UPS 財報|Richmond Fed/.test(allText),
  simplifiedChinese: /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨|下跌家数|盘前|技术|广度|价格|确认|仓位|趋势|预期|运输|发布|判断|卖压|结构|反弹|收复|高于|低于|区间|驱动|扩散|参与|标售|缓冲|假设|恢复|结束|设备链|记忆体|网通|企业|云端|加密资产|板块/.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const numberTargets = {
  movers: 16,
  sectorRows: 12,
  thematicRows: 45,
  thematicHasSpyOnce: 1,
};
const negativeChecks = new Set(["unresolved", "staleNarrative", "simplifiedChinese"]);
const pass = Object.entries(checks).every(([name, value]) => {
  if (Object.hasOwn(numberTargets, name)) return value === numberTargets[name];
  if (negativeChecks.has(name)) return value === false;
  return value === true;
});

if (!pass) process.exit(1);
