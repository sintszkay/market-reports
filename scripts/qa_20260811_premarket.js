#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-11-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge-adjusted.json'), 'utf8'));
const quotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge-quotes.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-google-sheet.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-premarket.json'), 'utf8'));

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
function descending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

pass('報告日期與標題', /<title>2026-08-11｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-11'));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-10' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-10' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前 129/136', quotes.counts.quoteRequested === 136 && quotes.counts.premarketAvailable === 129 && quotes.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-11')), quotes.counts.premarketAvailable + '/' + quotes.counts.quoteRequested);
pass('Google Sheet 快照為 8/10', sheet.asOf === '2026-08-10' && sheet.dataQa.values.some(row => String(row[3] || '').includes('PASS')));

const movers = section('盤前異動');
pass('盤前異動固定 16 檔', rowCount(movers) === 16, rowCount(movers) + ' 檔');
pass('主要正缺口一致', ['FSLR','+3.72%','AMAT','+2.47%','LRCX','+2.33%','KLAC','+2.32%','NVDA','+1.70%'].every(value => movers.includes(value)));
pass('主要負缺口一致', ['RKLB','-4.00%','APP','-2.42%','U','-2.51%','ABNB','-1.82%'].every(value => movers.includes(value)));
pass('薄量 ONTO 已排除', !movers.includes('>ONTO<') && movers.includes('389 股'));
pass('財報與評級催化有拆解', ['營收 Beat、盈利 Miss','Bank of America','17:00 ET','150 億美元股票發行'].every(value => movers.includes(value)));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickerOrder(etfTables[0] || '');
const thematicOrder = tickerOrder(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsiValues(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsiValues(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('VOO／BUG／PAVE 各一次', ['VOO','BUG','PAVE'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 順序固定', tickerOrder(major).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(major));
pass('MA 標示使用紅綠三角形', /ma-state ma-up/.test(major) && /ma-arrow[^>]*>[▲▼]</.test(major) && /ma-state-group/.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化量化 0/12', major.includes('技術惡化分數 0/12') && html.includes('三大指數綜合 0/12'));
pass('QQQ 前收與 50MA 完整', major.includes('720.87') && major.includes('714.27'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 1 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：1/8 High'));
pass('市場廣度量化 0/8', checklist.includes('5日惡化 0/8') && html.includes('市場廣度惡化分數 0/8'));
pass('VIX 五項分數 1/5', checklist.includes('正式 VIX 15.46；1/5') && checklist.includes('5日>0') && checklist.includes('1月>0'));

const macro = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous', ['Actual','Forecast','Previous','NFIB 小型企業信心','99.8','97.5','97.4','成屋銷售年化','4.04M','4.09M'].every(value => macro.includes(value)));
pass('CPI 預測與前值完整', /CPI YoY[\s\S]*?3\.4%[\s\S]*?3\.5%/.test(macro) && /核心 CPI MoM[\s\S]*?\+0\.2%[\s\S]*?0\.0%/.test(macro));
pass('RKLB 財報逐項 Beat／Miss', ['RKLB Q2 財報','EPS -0.08','EPS -0.06','營收 234.1M','營收 231.6M','Miss／Beat'].every(value => macro.includes(value)));
pass('SMCI 未公布不預判', ['SMCI FY26 Q4','待公布','公司指引 EPS 0.65–0.79','盤後風險'].every(value => macro.includes(value)));

const breadth = section('市場廣度');
pass('廣度最新六值', ['62.82%','65.20%','65.68%','56.86%','57.94%','60.29%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['51.06%','2.06','1.56','310／266','1488／1049','34／38'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', breadth.includes('三大指數廣度') && breadth.includes('與 Stockbee 交叉驗證') && breadth.includes('短線降溫、中期未壞'));

const fx = section('外匯與商品');
pass('外匯商品 10 列', rowCount(fx) === 10);
pass('FX 表頭與 RSI 完整', ['8/10收盤','1日','5日','1月','8/11盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值與 RSI 完整', ['DXY','99.75','-0.24%','-1.23%','28.12'].every(value => fx.includes(value)));
pass('FX／商品使用 Sheet 與長橋', ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債比較完整', ['4.19%','4.65%','SHY','IEF','TLT','短端政策預期較穩','久期結構尚未修復'].every(value => treasury.includes(value)));
pass('FedWatch 有日期與限制', treasury.includes('44%') && treasury.includes('CME FedWatch 引述｜8/7') && html.includes('不冒充即時機率'));

const plan = section('交易計畫');
pass('Weekly Expected Move 為本週', ['8/10–8/14','AMD','XOM','NFLX','NVDA','跌破 -1SD','突破 +1SD'].every(value => plan.includes(value)));
pass('交易計畫使用前收／均線／VWAP', ['前收','20MA','50MA','VWAP'].every(value => plan.includes(value)));

const review = section('昨晚盤前判斷複盤（8/10）');
pass('複盤位置與五項對賬', rowCount(review) === 5 && html.indexOf('昨晚盤前判斷複盤（8/10）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('昨晚盤前判斷複盤（8/10）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態詞完整', ['>命中<','>已觸發<','>失誤<'].every(value => review.includes(value)));

const tableShapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]).map(body => {
  const heads = (body.match(/<thead>[\s\S]*?<\/thead>/i) || [''])[0].match(/<th\b/g) || [];
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  return {heads:heads.length, cells:rows.map(row => (row[1].match(/<td\b/g) || []).length)};
});
pass('所有表格欄數一致', tableShapes.every(shape => shape.heads > 0 && shape.cells.every(count => count === shape.heads)));
pass('資料來源齊全', ['docs.google.com','apnews.com','nar.realtor','bls.gov','finance.yahoo.com','rocketlabcorp.com','supermicro.com'].every(domain => html.includes(domain)));
pass('無舊日主線殘留', !html.includes('2026-08-10｜美股盤前監控') && !html.includes('本週預期波動尚未更新') && !html.includes('MNDY 財報'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error('\nQA FAILED (' + failures.length + ')\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nQA PASSED');
