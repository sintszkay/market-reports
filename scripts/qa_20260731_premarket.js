#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const work = path.resolve(root, '..');
const html = fs.readFileSync(path.join(root, 'reports', '2026-07-31-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'reports', 'report-shared.css'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', '2026-07-31-premarket.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(work, 'premarket_quotes_0731.json'), 'utf8'));
const thematic = JSON.parse(fs.readFileSync(path.join(root, 'data', '2026-07-30-thematic-longbridge.json'), 'utf8'));
const close = JSON.parse(fs.readFileSync(path.join(work, 'postmarket_snapshot_2026-07-30.json'), 'utf8'));

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
const closeMap = new Map(close.rows.map(r => [r.ticker, r]));
const thematicMap = new Map([...thematic.rows.map(r => [r.ticker, r]), ['SPY', closeMap.get('SPY')]]);
const sortedByRsi = list => list.every((t, i) => i === 0 || thematicMap.get(list[i - 1]).rsi14 >= thematicMap.get(t).rsi14);
const majorBody = bodyAfter(data.major_etf_technical_table, '<table');
const majorOrder = symbols(majorBody);
const all = `${html}\n${JSON.stringify(data)}`;

const checks = {
  reportDate: data.report_title === '2026-07-31｜美股盤前監控',
  publishReady: !/草稿|尚未推送/.test(all),
  technicalAsOf: thematic.rows.length === 44 && thematic.errors.length === 0 && thematic.rows.every(r => r.asOf === '2026-07-30') && close.errors.length === 0,
  longbridgeQuotes: pre.length === 96 && new Set(pre.map(r => r.ticker)).size === 96 && ['SPY','QQQ','DIA','IWM','SHY','IEF','TLT'].every(t => pre.some(r => r.ticker === t && r.premarketAvailable)),
  moverCount: count(data.pre_market_movers_rows, /<tr>/g) === 16,
  moverNoWrap: count(data.pre_market_movers_rows, /ticker-nowrap/g) === 16,
  moverVolumes: count(data.pre_market_movers_rows, /長橋盤前量/g) === 16,
  sectorCount: count(sectorBody, /<tr>/g) === 12,
  sectorRsiSorted: sectorOrder.every((t,i) => i === 0 || closeMap.get(sectorOrder[i-1]).rsi14 >= closeMap.get(t).rsi14),
  thematicCount: count(thematicBody, /<tr>/g) === 45,
  thematicRsiSorted: sortedByRsi(thematicOrder),
  thematicSourceCoverage: thematic.rows.every(r => thematicOrder.includes(r.ticker)) && thematicOrder.filter(t => t === 'SPY').length === 1,
  majorUniverse: majorOrder.join(',') === 'IWM,DIA,SPY,QQQ',
  macroActualForecastPrevious: ['Q2 就業成本指數','+0.9%','+0.8%','Chicago PMI','57.6','56.0','密西根大學消費者信心終值','55.2','54.0','49.5'].every(x => data.macro_premarket_background_table.includes(x)),
  earningsExact: ['AAPL 財報','EPS 2.02','營收 109.42B','EPS 1.89','營收 109.00B','AMZN 財報','EPS 5.75','營收 200.60B','EPS 1.82','營收 197.03B','Beat / Beat'].every(x => data.macro_premarket_background_table.includes(x)),
  noPendingReleased: !/待公布/.test(data.macro_premarket_background_table),
  breadthIntegrated: ['SPX >20MA','NDX >20MA','IWM >20MA','Stockbee','437／189','0.88／0.91','極端跌勢緩和、結構仍弱'].every(x => `${data.market_breadth_table}${data.stockbee_breadth_interpretation}`.includes(x)),
  dxyVisible: /DXY[\s\S]{0,100}100\.38/.test(data.fx_commodities_table) && /DXY/.test(data.treasury_fed_economic_data_table),
  bondCurve: ['SHY','IEF','TLT','-0.06%','-0.25%','-0.41%','ETF 久期不同','2Y／10Y'].every(x => data.treasury_fed_economic_data_table.includes(x)),
  vixScore: ['VIX 17.09','五項分數 1/5','>20 0/1','5日>0 0/1','1月>0 1/1','20MA 0/1','50MA 0/1'].every(x => data.correction_checklist_dashboard.includes(x)),
  checklistEight: count(data.correction_checklist_dashboard, /risk-check-row/g) === 8 && /Checklist Score：3\/8 High/.test(data.correction_checklist_dashboard),
  expectedMove: ['AAPL 317.88／302.73','AMZN 249.16／266.21','QQQ 684.23／702.25'].every(x => all.includes(x)),
  sourceLinks: ['bls.gov/news.release/eci.nr0.htm','sca.isr.umich.edu','apnews.com/article/apple','apnews.com/article/amazon','長橋 OpenAPI'].every(x => data.cross_validation_summary.includes(x)),
  noUnresolved: !/<!-- DATA:|undefined|NaN|REPLACE_ME/.test(html),
  noMojibake: !/锝|銆|鍓|鐩|鏁據|鈥/.test(all),
  noSimplifiedChinese: !/市场|数据|风险|报告|软件|芯片|长桥|宽度|盘前|判断|预期|价格|确认|反弹|收复|高于|低于|区间|驱动|扩散|参与|设备链|板块/.test(all),
  numericTables: count(html, /class="num/g) >= 250,
  noEmptyChart: count(html, /class="bar-row"/g) === 8 && count(html, /class="b (?:pos|neg)"/g) === 8,
  chartCssContract: /\.bar-row \.lbl/.test(css) && /\.bar-row \.val/.test(css) && /\.bar-track \.b/.test(css),
};

console.log(JSON.stringify(checks, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
