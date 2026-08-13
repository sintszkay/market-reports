#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-13-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-13-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-13-longbridge-adjusted.json'), 'utf8'));
const quotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-13-longbridge-quotes.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-13-google-sheet.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  if (!ok) failures.push(name + (detail ? `：${detail}` : ''));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = title => {
  const exact = new RegExp(`<h2[^>]*>${title}<\\/h2>`, 'i');
  return ([...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].find(match => exact.test(match[0])) || [])[0] || '';
};
const allRows = fragment => [...fragment.matchAll(/<tbody>[\s\S]*?<\/tbody>/gi)].flatMap(match => match[0].match(/<tr\b[^>]*>/g) || []).length;
const tickers = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
const rsi = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
const descending = values => values.every((value, index) => index === 0 || values[index - 1] >= value);

pass('報告日期與標題', /<title>2026-08-13｜美股盤前監控<\/title>/.test(html));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-12' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-12' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前覆蓋與日期', quotes.counts.quoteRequested === 136 && quotes.counts.premarketAvailable === 133 && quotes.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-13')), `${quotes.counts.premarketAvailable}/${quotes.counts.quoteRequested}`);
pass('Google Sheet 快照與 Data QA', sheet.asOf === '2026-08-12' && sheet.dataQa.values.filter(row => String(row[3] || '').includes('PASS')).length >= 3);

const movers = section('盤前異動');
pass('盤前異動固定 16 檔', allRows(movers) === 16, `${allRows(movers)} 檔`);
pass('財報催化主榜完整', ['BIRK','TPR','LUNR','CSCO','COHR','JD'].every(value => movers.includes(`>${value}<`)));
pass('網安板塊共振完整', ['PANW','CRWD'].every(value => movers.includes(`>${value}<`)));
pass('成交量只顯示數量', !movers.includes('長橋盤前成交') && /878\.0萬股|87\.8萬股/.test(movers));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickers(etfTables[0] || '');
const thematicOrder = tickers(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsi(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsi(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('Thematic 基準與關鍵列完整', ['VOO','BUG','PAVE','SMH'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 順序固定', tickers(major).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ');
pass('MA 使用紅綠三角且同列', /ma-state-group/.test(major) && /ma-state ma-up/.test(major) && /ma-arrow[^>]*>[▲▼]</.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化分數 0/12', major.includes('技術惡化分數 0/12') && html.includes('技術 0/12'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 1 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：1/8 High'));
pass('廣度惡化分數 1/8', checklist.includes('五日惡化 1/8') && html.includes('廣度 1/8'));
pass('VIX 五項分數 0/5', checklist.includes('正式 VIX 14.55；0/5') && checklist.includes('5日>0') && checklist.includes('1月>0'));

const macro = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous', ['Actual','Forecast','Previous','PPI MoM','PPI YoY','核心 PPI MoM','核心 PPI YoY','初領失業金'].every(value => macro.includes(value)));
pass('PPI 數值與修正值完整', ['0.0%','+0.2%','-0.1%（修正）','4.7%','4.9%','5.5%'].every(value => macro.includes(value)));
pass('CSCO Beat／Beat 完整', ['CSCO FY26 Q4','EPS 1.22','EPS 1.17','營收 17.25B','營收 16.84B','Beat／Beat'].every(value => macro.includes(value)));
pass('COHR Beat／Beat 完整', ['COHR FY26 Q4','EPS 1.74','EPS 1.62','營收 2.05B','營收 1.98B'].every(value => macro.includes(value)));
pass('AMAT 未公布不預判', ['AMAT FY26 Q3','待公布','EPS 3.39','營收 9.01B','事件風險'].every(value => macro.includes(value)));

const review = section('昨晚盤前判斷複盤（8/12）');
pass('昨日盤前複盤位置與五項', allRows(review) === 5 && html.indexOf('昨晚盤前判斷複盤（8/12）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態與結論完整', ['>命中<','>已觸發<','>失誤<','本段結論'].every(value => review.includes(value)));

const breadth = section('市場廣度');
pass('六組指數廣度最新值', ['64.61%','68.62%','56.86%','63.06%','61.52%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['52.04%','1.59','2.08','297／172','1573／1011','222／125'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', ['三大指數廣度','與 Stockbee 交叉驗證','綜合結論','短線','中期'].every(value => breadth.includes(value)));

const fx = section('外匯與商品');
pass('外匯商品 10 列', allRows(fx) === 10);
pass('FX 表頭與時間一致', ['8/12收盤','1日','5日','1月','8/13盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值、趨勢與 RSI', ['99.83','41.49','低於 20／50MA','美元偏弱但未超賣'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債、曲線與 RSI', ['4.20%','4.68%','+48bp','SHY RSI 62.00','IEF RSI 48.00','TLT RSI 39.00'].every(value => treasury.includes(value)));
pass('FedWatch 時間標示清楚', treasury.includes('64% 維持') && treasury.includes('8/12 CPI 後') && html.includes('不冒充即時機率'));

const plan = section('交易計畫');
pass('Weekly Expected Move 為本週', ['8/10–8/14','XLE','XOP','接近 -1SD'].every(value => plan.includes(value)));
pass('交易計畫欄位完整', ['盤前','20MA','50MA','20/50/200MA','行動'].every(value => plan.includes(value)));

const shapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => {
  const body = match[1];
  const head = ((body.match(/<thead>[\s\S]*?<\/thead>/i) || [''])[0].match(/<th\b/g) || []).length;
  const rows = [...body.matchAll(/<tbody>[\s\S]*?<\/tbody>/gi)].flatMap(m => [...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]);
  return {head,cells:rows.map(row => (row[1].match(/<td\b/g) || []).length)};
});
const badShapes = shapes.filter(shape => !(shape.head > 0 && shape.cells.every(count => count === shape.head)));
pass('所有表格欄數一致', badShapes.length === 0, JSON.stringify(badShapes));
pass('窄欄防單字換行樣式存在', css.includes('word-break:keep-all') && css.includes('overflow-wrap:normal') && css.includes('white-space:nowrap'));
pass('資料來源與時間戳完整', ['bls.gov','apnews.com','coherent.com','finance.yahoo.com','cmegroup.com','09:26 ET'].every(value => html.includes(value)));
pass('無舊日主線殘留', !/2026-08-(10|11|12)｜美股盤前監控/.test(html) && !html.includes('NFIB 小型企業信心'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
