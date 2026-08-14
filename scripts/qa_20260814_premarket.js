#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-14-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-longbridge-adjusted.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-google-sheet.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `：${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};
const section = title => {
  const pattern = new RegExp(`<section[^>]*>[\\s\\S]*?<h2[^>]*>${title}<\\/h2>([\\s\\S]*?)<\\/section>`, 'i');
  return (html.match(pattern) || [])[1] || '';
};
const rowCount = fragment => ((fragment.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr\b/g) || []).length;
const tickerOrder = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
const rsiValues = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
const descending = values => values.every((value, index) => index === 0 || values[index - 1] >= value);
const tableShapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]).map(body => {
  const heads = ((body.match(/<thead>[\s\S]*?<\/thead>/i) || [''])[0].match(/<th\b/g) || []).length;
  const rows = [...body.matchAll(/<tbody>[\s\S]*?<\/tbody>/gi)].flatMap(match => [...match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]);
  return {heads, cells:rows.map(row => (row[1].match(/<td\b/g) || []).length)};
});
const currentOvernight = snapshot.quotes.filter(row => row.raw?.overnight?.timestamp?.startsWith('2026-08-14'));
const formalPremarket = snapshot.quotes.filter(row => row.premarketAvailable && row.timestamp?.startsWith('2026-08-14'));

pass('報告日期與標題', /<title>2026-08-14｜美股盤前監控<\/title>/.test(html));
pass('無未解析欄位與舊標題', !/<!-- DATA:/.test(html) && !html.includes('<title>2026-08-07｜美股盤前監控</title>'));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-13' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-13' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('時段口徑為當日隔夜', formalPremarket.length === 0 && currentOvernight.length === 135 && html.includes('隔夜交易；正式盤前尚未開啟') && html.includes('正式 pre_market 為 0'), `${currentOvernight.length}/136`);
pass('Google Sheet 快照為 8/13', sheet.asOf === '2026-08-13' && sheet.sectorDashboard.values.length >= 25 && sheet.thematicSectors.values.length >= 50 && sheet.marketBreadth.values.length >= 20 && sheet.stockbee.values.length >= 10);

const movers = section('盤前異動');
pass('隔夜異動固定 10 檔', rowCount(movers) === 10, `${rowCount(movers)} 檔`);
pass('AMAT 財報與反應一致', ['AMAT','507.35','-5.09%','91.15 億美元','3.50','Q4 指引'].every(value => movers.includes(value)));
pass('半導體分化數字一致', ['LRCX','-1.08%','KLAC','-1.02%','SNDK','+1.76%','MU','+0.85%'].every(value => movers.includes(value)));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickerOrder(etfTables[0] || '');
const thematicOrder = tickerOrder(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsiValues(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsiValues(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('VOO／BUG／PAVE 各一次', ['VOO','BUG','PAVE'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 順序固定', tickerOrder(major).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(major));
pass('Above MA 表頭與儲存格居中', /ma-state-group/.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化量化 0/12', major.includes('技術惡化 0/12') && html.includes('三大指數綜合 0/12'));
pass('四大 ETF 三線多頭', (major.match(/ma-up/g) || []).length === 12 && !major.includes('ma-down'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 0 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：0/8 High'));
pass('市場廣度量化 3/8', checklist.includes('5日惡化 3/8') && html.includes('市場廣度惡化 3/8'));
pass('VIX 量化 1/5', checklist.includes('正式 VIX 14.63；1/5'));

const macro = section('宏觀事件與盤前背景');
pass('CPI 數字一致', /CPI[\s\S]*?\+0\.1%[\s\S]*?\+3\.4%/.test(macro) && /核心 CPI[\s\S]*?\+0\.2%[\s\S]*?\+2\.5%/.test(macro));
pass('PPI 數字一致', /PPI[\s\S]*?0\.0%[\s\S]*?\+4\.7%/.test(macro) && macro.includes('去食能與貿易服務'));
pass('今日事件與共識完整', ['零售銷售','+0.1%','密大消費者信心','54.5','08:30 ET','10:00 ET'].every(value => macro.includes(value)));
pass('AMAT Actual／Forecast／Previous 完整', ['$9.12B','$3.50','$8.99B','$3.40','$7.30B','$2.48'].every(value => macro.includes(value)));

const breadth = section('市場廣度');
pass('廣度最新六值', ['68.78%','68.19%','68.62%','62.74%','66.37%','62.68%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['54.60%','1.84','2.06','340／163','1630／1006','45／31'].every(value => breadth.includes(value)));
pass('五日趨勢與中期結論分離', breadth.includes('局部五日降溫') && breadth.includes('中期仍偏多'));

const fx = section('外匯與商品');
pass('外匯商品 9 列且無驅動欄', rowCount(fx) === 9 && !fx.includes('關鍵位置/驅動'));
pass('FX 使用 Sheet 收盤與零量保護', ['8/13收盤','FXE','FXB','FXY','USDU'].every(value => fx.includes(value)) && fx.includes('隔夜成交為零，不採用方向'));

const atr = section('50MA ATR 延伸');
pass('ATR 使用前復權值', ['+5.12','+5.03','+4.67','-2.43','-2.18','-2.09'].every(value => atr.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('收益率與債券 ETF 完整', ['4.15%','4.63%','5.20%','SHY','IEF','TLT','-0.21%'].every(value => treasury.includes(value)));

const plan = section('交易計畫');
pass('交易表使用隔夜而非 Weekly Expected Move', ['SPY','QQQ','IWM','DIA','SMH','TLT','USO'].every(value => plan.includes(value)) && plan.includes('不使用未更新的 Weekly Expected Move 表'));
pass('未保留 Weekly Expected Move 對帳表', !html.includes('<h2>Weekly Expected Move 對帳</h2>'));

const review = section('上次盤前判斷複盤（8/7）');
pass('複盤四項且位置正確', rowCount(review) === 4 && html.indexOf('上次盤前判斷複盤（8/7）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('上次盤前判斷複盤（8/7）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態詞完整', ['>命中<','>已觸發<','>偏保守<','>未驗證<'].every(value => review.includes(value)));

pass('所有表格欄數一致', tableShapes.every(shape => shape.heads > 0 && shape.cells.every(count => count === shape.heads)), JSON.stringify(tableShapes.filter(shape => shape.cells.some(count => count !== shape.heads))));
pass('資料來源齊全', ['docs.google.com','bls.gov','census.gov','investor.appliedmaterials.com','home.treasury.gov','apnews.com','federalreserve.gov'].every(domain => html.includes(domain)));
pass('無 Polymarket 欄', !/Polymarket\s*[／/]\s*預測市場事件風險/.test(html));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
