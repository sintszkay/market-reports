#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const work = path.resolve(root, '..');
const html = fs.readFileSync(path.join(root, 'reports', '2026-08-03-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'reports', 'report-shared.css'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', '2026-08-03-premarket.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(work, 'premarket_quotes_0803.json'), 'utf8'));
const close = JSON.parse(fs.readFileSync(path.join(work, 'postmarket_snapshot_2026-07-31.json'), 'utf8')).rows;
const thematicSource = JSON.parse(fs.readFileSync(path.join(work, 'thematic_rsi_longport_2026-07-31.json'), 'utf8')).rows;

const count = (s, re) => (s.match(re) || []).length;
const bodyAfter = (s, h) => {
  const i = s.indexOf(h); if (i < 0) return '';
  const m = s.slice(i).match(/<tbody>([\s\S]*?)<\/tbody>/); return m ? m[1] : '';
};
const symbols = body => [...body.matchAll(/ticker-nowrap">([A-Z]+)<\/strong>/g)].map(m => m[1]);
const sectorBody = bodyAfter(data.sector_thematic_etf_tables, 'S&amp;P 500 Sector ETF');
const thematicBody = bodyAfter(data.sector_thematic_etf_tables, 'Thematic Sector ETF');
const sectorOrder = symbols(sectorBody);
const thematicOrder = symbols(thematicBody);
const majorOrder = symbols(bodyAfter(data.major_etf_technical_table, '<table'));
const closeMap = new Map(close.map(r => [r.ticker, r]));
const thematicMap = new Map([...thematicSource.map(r => [r.ticker, r]), ['SPY', closeMap.get('SPY')]]);
const rsiSorted = (list, map) => list.every((t, i) => i === 0 || map.get(list[i - 1]).rsi14 >= map.get(t).rsi14);
const all = `${html}\n${JSON.stringify(data)}`;
const checks = {
  reportDate: data.report_title === '2026-08-03｜美股盤前監控',
  publishNote: /盤前更新/.test(data.cross_validation_summary) && /發布前已完成資料、內容與版面 QA/.test(data.cross_validation_summary),
  noUnresolved: !/<!-- DATA:|undefined|NaN|REPLACE_ME/.test(html),
  noMojibake: !/锝|銆|鍓|鐩|鏁據|鈥/.test(all),
  currentCloseData: close.length > 50 && close.every(r => r.asOf === '2026-07-31'),
  longbridgePremarket: pre.length >= 95 && new Set(pre.map(r => r.ticker)).size === pre.length && ['SPY','QQQ','DIA','IWM','SMH','SHY','IEF','TLT'].every(t => pre.some(r => r.ticker === t && r.price > 0)),
  excludesBadQuote: !/ticker-nowrap">XRT<\/strong><\/td><td class="num">0\.00/.test(data.pre_market_movers_rows),
  moverCount: count(data.pre_market_movers_rows, /<tr>/g) === 16,
  moverVolumes: count(data.pre_market_movers_rows, /長橋盤前量/g) === 16,
  tickerNoWrap: /\.ticker-nowrap\{[^}]*white-space:nowrap/.test(css) && count(data.pre_market_movers_rows, /ticker-nowrap/g) === 16,
  sectorCount: count(sectorBody, /<tr>/g) === 12,
  sectorRsiSorted: rsiSorted(sectorOrder, closeMap),
  thematicCount: count(thematicBody, /<tr>/g) === 45,
  thematicRsiSorted: rsiSorted(thematicOrder, thematicMap),
  thematicCoverage: thematicSource.every(r => thematicOrder.includes(r.ticker)) && thematicOrder.filter(t => t === 'SPY').length === 1,
  thematicTickerOnly: !/[一-龥]/.test(thematicOrder.join('')),
  majorUniverse: majorOrder.join(',') === 'IWM,DIA,SPY,QQQ',
  macroActualForecastPrevious: ['Actual','Forecast','Previous','ISM 製造業 PMI','待公布','54.0','53.3','建築支出 MoM','+0.2%','+0.1%'].every(x => data.macro_premarket_background_table.includes(x)),
  earningsExact: ['PLTR 財報','EPS 0.31','營收 1.81B','EPS 0.34','營收 1.63B','ON 財報','EPS 0.66','營收 1.59B'].every(x => data.macro_premarket_background_table.includes(x)),
  noFakeActual: count(data.macro_premarket_background_table, /待公布/g) >= 8 && !/Beat \/ Beat|Miss \/ Miss/.test(data.macro_premarket_background_table),
  checklistEight: count(data.correction_checklist_dashboard, /risk-check-row/g) === 8 && /Checklist Score：3\/8 High/.test(data.correction_checklist_dashboard),
  vixFiveFactor: ['VIX 16.10','五項分數 0/5','>20 0/1','5日>0 0/1','1月>0 0/1','20MA 0/1','50MA 0/1'].every(x => data.correction_checklist_dashboard.includes(x)),
  breadthIntegrated: ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA','Stockbee 5D ratio','Stockbee 10D ratio','T2108','季度 +25%／-25%','Stockbee 5D／10D 為 0.98／0.91','T2108 47.36'].every(x => `${data.market_breadth_table}${data.stockbee_breadth_interpretation}`.includes(x)),
  breadthDiagnosticFormat: ['指標','最新','5日趨勢','約1月趨勢','判斷','三大指數廣度','與 Stockbee 交叉驗證','綜合結論','短線','中期'].every(x => data.market_breadth_table.includes(x))
    && /breadth-diagnostic-table/.test(data.market_breadth_table)
    && !/breadth-history-table/.test(data.market_breadth_table),
  dxyVisible: data.fx_commodities_table.includes('DXY') && data.fx_commodities_table.includes('99.78') && data.treasury_fed_economic_data_table.includes('DXY'),
  fxTrendRsiMeaning: ['FXE','FXB','FXY','USDU','XAU','XAG','COPPER','CL','BTC','趨勢／RSI 含義','RSI 62.99','RSI 61.25','RSI 69.89','RSI 40.07','RSI 45.80','RSI 43.99','RSI 59.24','RSI 55.62','RSI 45.04','均線','1月'].every(x => data.fx_commodities_table.includes(x))
    && /fx-trend-table/.test(data.fx_commodities_table),
  bondCurve: ['SHY','IEF','TLT','+0.05%','+0.27%','+0.50%','2Y','10Y'].every(x => data.treasury_fed_economic_data_table.includes(x)),
  expectedMove: ['DIA','531.57','517.07','QQQ','706.47','669.51','PLTR','137.44','108.68'].every(x => data.trading_plan.includes(x)),
  chartRows: count(html, /class="bar-row"/g) === 8 && count(html, /class="b (?:pos|neg)"/g) === 8,
  maTriangles: /20MA ▲/.test(html) && /20MA ▼/.test(html) && /class="up">20MA ▲/.test(html) && /class="dn">20MA ▼/.test(html),
  numericColumns: count(html, /class="num/g) >= 200,
  stylesheetVersion: /report-shared\.css\?v=20260803-flat-5/.test(html),
  maSingleLine: /\.ma-state-group\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,minmax\(0,1fr\)\)[^}]*min-width\s*:\s*0/s.test(css)
    && /\.ma-state-group \.ma-separator\s*\{\s*display\s*:\s*none\s*\}/.test(css),
  breadthLayout: /\.flat-report \.breadth-diagnostic-table\{[^}]*min-width:1040px[^}]*table-layout:fixed[^}]*\}/s.test(css)
    && /\.flat-report \.breadth-diagnostic-table th:nth-child\(5\)\{width:35%\}/.test(css)
    && /\.flat-report \.breadth-diagnostic-table td:nth-child\(1\),[\s\S]*?white-space:nowrap;[\s\S]*?overflow-wrap:normal;[\s\S]*?word-break:keep-all;/.test(css),
  sourceLinks: ['docs.google.com/spreadsheets/d/1zXbIf','docs.google.com/spreadsheets/d/1O6Oh','ismworld.org','apnews.com','長橋 OpenAPI'].every(x => data.cross_validation_summary.includes(x))
};

console.log(JSON.stringify(checks, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
