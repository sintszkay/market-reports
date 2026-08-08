#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-07-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge-adjusted.json'), 'utf8'));
const quotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge-quotes.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-google-sheet.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-premarket.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `：${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = title => {
  const pattern = new RegExp(`<section[^>]*>[\\s\\S]*?<h2[^>]*>${title}<\\/h2>([\\s\\S]*?)<\\/section>`, 'i');
  return (html.match(pattern) || [])[1] || '';
};
const rowCount = fragment => ((fragment.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr>/g) || []).length;
const tickerOrder = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
const rsiValues = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
const descending = values => values.every((value, index) => index === 0 || values[index - 1] >= value);
const tableShapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]).map(body => {
  const heads = (body.match(/<thead>[\s\S]*?<\/thead>/i) || [''])[0].match(/<th\b/g) || [];
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  return {heads:heads.length, cells:rows.map(row => (row[1].match(/<td\b/g) || []).length)};
});

pass('報告日期與標題', /<title>2026-08-07｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-07'));
pass('無未解析欄位與舊報告標題', !/<!-- DATA:/.test(html) && !html.includes('<title>2026-08-06｜美股盤前監控</title>'));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-06' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-06' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前 130/136', quotes.counts.quoteRequested === 136 && quotes.counts.premarketAvailable === 130 && quotes.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-07')), `${quotes.counts.premarketAvailable}/${quotes.counts.quoteRequested}`);
pass('Google Sheet 快照為 8/6', sheet.asOf === '2026-08-06' && sheet.sectorDashboard.values.length >= 25 && sheet.thematicSectors.values.length >= 50 && sheet.stockbee.values.length >= 10);

const movers = section('盤前異動');
pass('盤前異動固定 16 檔', rowCount(movers) === 16, `${rowCount(movers)} 檔`);
pass('主要正缺口一致', ['DOCS','+89.59%','ONTO','+13.21%','NET','+10.17%','ABNB','+8.41%'].every(value => movers.includes(value)));
pass('主要負缺口一致', ['TTD','-27.16%','SEZL','-26.57%'].every(value => movers.includes(value)));
pass('DOCS 已核實為財報而非拆分', movers.includes('FY2027 營收指引') && !movers.includes('拆分'));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickerOrder(etfTables[0] || '');
const thematicOrder = tickerOrder(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsiValues(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsiValues(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('VOO／BUG／PAVE 各一次', ['VOO','BUG','PAVE'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 順序固定', tickerOrder(major).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(major));
pass('Above MA 對齊規則存在', /ma-state-group/.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化量化 1/12', major.includes('技術惡化分數為 1/12') && html.includes('三大指數綜合 1/12'));
pass('QQQ 盤前重回 50MA', major.includes('720.27') && major.includes('714.70') && major.includes('重新站上 50MA'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 0 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：0/8 High'));
pass('市場廣度量化 0/8', checklist.includes('5日惡化 0/8') && html.includes('市場廣度惡化分數為 0/8'));
pass('正式 VIX 量化 0/5', checklist.includes('正式 VIX 15.15；0/5'));

const macro = section('宏觀事件與盤前背景');
pass('非農／失業率數字正確', /非農就業[\s\S]*?-23K[\s\S]*?\+87K[\s\S]*?\+20K/.test(macro) && /失業率[\s\S]*?4\.1%[\s\S]*?4\.2%/.test(macro));
pass('工資與修正值完整', ['+0.1%','+3.2%','-103K'].every(value => macro.includes(value)));
pass('宏觀含 Actual／Forecast／Previous', ['Actual','Forecast','Previous'].every(value => macro.includes(value)));
pass('財報正負樣本完整', ['DOCS 財報','NET 財報','ABNB 財報','TTD 財報'].every(value => macro.includes(value)));

const breadth = section('市場廣度');
pass('廣度最新六值', ['63.02%','64.21%','61.76%','51.96%','60.45%','60.14%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['52.52%','2.28','1.37','300／280','1410／1087','23／37'].every(value => breadth.includes(value)));
pass('五日與單日結論分離', breadth.includes('與 Stockbee 交叉驗證') && breadth.includes('短線單日訊號') && breadth.includes('五日趨勢仍改善'));

const fx = section('外匯與商品');
pass('外匯商品 9 列且無驅動欄', rowCount(fx) === 9 && !fx.includes('關鍵位置/驅動'));
pass('FX 表頭與 RSI 完整', ['8/6收盤','8/7盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('FX／商品使用 Sheet 收盤值', ['106.30','129.27','57.89','26.45','389.67','55.85','40.76','118.87','36.49'].every(value => fx.includes(value)));
pass('USDU 薄量未採信', fx.includes('薄量／略過') && fx.includes('12 股'));

const atr = section('50MA ATR 延伸');
pass('ATR 使用前復權值', ['4.75','3.66','3.48','-4.34','-3.56','-3.04'].every(value => atr.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('收益率與債券 ETF 完整', ['4.18%','約 4.60%','5.18%','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('Fed 反對票方向與機率', treasury.includes('三名反對票主張加息 25bp') && treasury.includes('44%') && !treasury.includes('主張降息'));

const plan = section('交易計畫');
pass('週期望波動使用盤前價', ['SPY','770.90','DIA','538.72','QQQ','720.27','IWM','300.43','SMH','583.88','TLT','82.80'].every(value => plan.includes(value)));
pass('週波動狀態正確', (plan.match(/突破 \+2SD/g) || []).length === 1 && (plan.match(/突破 \+1SD/g) || []).length === 4 && (plan.match(/>區間內</g) || []).length === 1);

const review = section('上次盤前判斷複盤（8/6）');
pass('複盤位置與四項對賬', rowCount(review) === 4 && html.indexOf('上次盤前判斷複盤（8/6）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('上次盤前判斷複盤（8/6）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態詞完整', ['>命中<','>已觸發<','>失誤<'].every(value => review.includes(value)) && review.includes('未觸發'));

pass('所有表格欄數一致', tableShapes.every(shape => shape.heads > 0 && shape.cells.every(count => count === shape.heads)), JSON.stringify(tableShapes.filter(shape => shape.cells.some(count => count !== shape.heads))));
pass('資料來源齊全', ['docs.google.com','bls.gov','apnews.com','axios.com','longbridge.cn','federalreserve.gov'].every(domain => html.includes(domain)));
pass('無 Polymarket 欄', !/Polymarket\s*[／/]\s*預測市場事件風險/.test(html));
pass('無舊日主線殘留', !html.includes('APP／DDOG／SNDK') && !html.includes('8/7 非農前隔夜風險'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
