#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-12-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-longbridge-adjusted.json'), 'utf8'));
const quotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-longbridge-quotes.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-google-sheet.json'), 'utf8'));
const macro = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-macro.json'), 'utf8'));

const failures = [];
function pass(name, ok, detail = '') {
  if (!ok) failures.push(name + (detail ? '：' + detail : ''));
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}
function section(title) {
  const pattern = new RegExp('<section[^>]*>[\\s\\S]*?<h2[^>]*>' + title + '<\\/h2>([\\s\\S]*?)<\\/section>', 'i');
  return (html.match(pattern) || [])[1] || '';
}
function rowCount(fragment) {
  return (((fragment.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr>/g)) || []).length;
}
function tickerOrder(fragment) {
  return [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
}
function rsiValues(fragment) {
  return [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
}
const descending = values => values.every((value, index) => index === 0 || values[index - 1] >= value);

pass('報告日期與標題', /<title>2026-08-12｜美股盤前監控<\/title>/.test(html));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-11' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-11' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前覆蓋', quotes.counts.quoteRequested === 136 && quotes.counts.premarketAvailable >= 125 && quotes.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-12')), quotes.counts.premarketAvailable + '/' + quotes.counts.quoteRequested);
pass('Google Sheet 快照為 8/11 且 QA PASS', sheet.asOf === '2026-08-11' && sheet.dataQa.values.filter(row => String(row[3] || '').includes('PASS')).length >= 3);

const movers = section('盤前異動');
pass('盤前異動固定 16 檔', rowCount(movers) === 16, rowCount(movers) + ' 檔');
pass('主要正缺口一致', ['CAVA','SMCI','COHR','SNDK','MRVL','MU','AVGO'].every(value => movers.includes(value)));
pass('主要負缺口一致', ['NVO','NOW','PLTR','MSFT'].every(value => movers.includes(value)));
pass('薄量噪音未進主榜', !['FNKO','WGMI','XMAG','JETS','ONTO'].some(ticker => movers.includes('>' + ticker + '<')));
pass('SMCI／CAVA 財報逐項拆解', ['EPS 1.70','營收約 111.2 億美元','EPS 0.19','營收 3.684 億美元','Beat／Beat'].every(value => html.includes(value)));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickerOrder(etfTables[0] || '');
const thematicOrder = tickerOrder(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsiValues(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsiValues(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('VOO／BUG／PAVE 各一次', ['VOO','BUG','PAVE'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 順序固定', tickerOrder(major).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(major));
pass('MA 使用紅綠三角形且不拆行', /ma-state ma-up/.test(major) && /ma-arrow[^>]*>[▲▼]</.test(major) && /ma-state-group/.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化量化 0/12', major.includes('技術惡化 0/12') && html.includes('三大指數 0/12'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 2 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：2/8 High'));
pass('市場廣度量化 7/8', checklist.includes('五日惡化 7/8') && html.includes('廣度惡化 7/8'));
pass('VIX 五項分數 0/5', checklist.includes('正式 VIX 15.28；0/5') && checklist.includes('5日>0') && checklist.includes('1月>0'));

const macroSection = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous', ['Actual','Forecast','Previous','CPI MoM','CPI YoY','核心 CPI MoM','核心 CPI YoY'].every(value => macroSection.includes(value)));
pass('CPI 共識與前值完整', /CPI MoM[\s\S]*?\+0\.1%[\s\S]*?-0\.4%/.test(macroSection) && /核心 CPI MoM[\s\S]*?\+0\.2%[\s\S]*?0\.0%/.test(macroSection));
pass('SMCI Beat／Miss 完整', ['EPS 1.70','EPS 0.92','營收 11.12B','營收 11.56B','Beat／Miss'].every(value => macroSection.includes(value)));
pass('CAVA Beat／Beat 完整', ['EPS 0.19','EPS 0.18','營收 368.44M','營收 360.09M','Beat／Beat'].every(value => macroSection.includes(value)));
pass('COHR 未公布不預判', ['COHR FY26 Q4','待公布','1.91–2.05B','事件風險'].every(value => macroSection.includes(value)));
pass('CPI 發布狀態一致', macro.released ? !macroSection.includes('CPI 尚待公布') : macroSection.includes('CPI 尚待公布'));

const breadth = section('市場廣度');
pass('廣度最新六值', ['63.61%','63.22%','64.70%','52.94%','60.24%','60.29%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['50.69%','1.51','1.67','259／181','1552／1040','226／131'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', breadth.includes('三大指數廣度') && breadth.includes('與 Stockbee 交叉驗證') && breadth.includes('五日明顯降溫、中期尚未失守'));

const fx = section('外匯與商品');
pass('外匯商品 10 列', rowCount(fx) === 10);
pass('FX 表頭與 RSI 完整', ['8/11收盤','1日','5日','1月','8/12盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值、趨勢與 RSI 完整', ['DXY','99.75','28.12','美元仍弱且接近超賣'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債與曲線完整', ['4.25%','4.72%','5.25%','+47bp','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('VIX 公式未機械簡化', treasury.includes('正式 VIX') && html.includes('五項為 >20、5日>0、1月>0、高於20MA、高於50MA'));

const plan = section('交易計畫');
pass('Weekly Expected Move 為本週', ['8/10–8/14','GOOGL','接近 -1SD'].every(value => plan.includes(value)));
pass('交易計畫使用盤前／均線／VWAP', ['盤前','20MA','50MA','VWAP'].every(value => plan.includes(value)));

const review = section('昨晚盤前判斷複盤（8/11）');
pass('複盤位置與五項對賬', rowCount(review) === 5 && html.indexOf('昨晚盤前判斷複盤（8/11）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('昨晚盤前判斷複盤（8/11）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態詞完整', ['>命中<','>已觸發<','>失誤<'].every(value => review.includes(value)));

const tableShapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]).map(body => {
  const heads = (body.match(/<thead>[\s\S]*?<\/thead>/i) || [''])[0].match(/<th\b/g) || [];
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  return {heads:heads.length, cells:rows.map(row => (row[1].match(/<td\b/g) || []).length)};
});
pass('所有表格欄數一致', tableShapes.every(shape => shape.heads > 0 && shape.cells.every(count => count === shape.heads)));
pass('資料來源齊全', ['docs.google.com','bls.gov','apnews.com','supermicro.com','marketbeat.com','coherent.com','finance.yahoo.com'].every(domain => html.includes(domain)));
pass('無舊日主線殘留', !html.includes('2026-08-11｜美股盤前監控') && !html.includes('NFIB 已 Beat') && !html.includes('RKLB Q2 財報'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error('\nQA FAILED (' + failures.length + ')\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nQA PASSED');
