#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-10-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-10-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-10-longbridge-adjusted.json'), 'utf8'));
const quotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-10-longbridge-quotes.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-10-google-sheet.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-10-premarket.json'), 'utf8'));

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

pass('報告日期與標題', /<title>2026-08-10｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-10'));
pass('無未解析欄位與舊報告標題', !/<!-- DATA:/.test(html) && !html.includes('<title>2026-08-07｜美股盤前監控</title>'));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-07' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-07' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前 131/136', quotes.counts.quoteRequested === 136 && quotes.counts.premarketAvailable === 131 && quotes.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-10')), `${quotes.counts.premarketAvailable}/${quotes.counts.quoteRequested}`);
pass('Google Sheet 快照為 8/7', sheet.asOf === '2026-08-07' && sheet.sectorDashboard.values.length >= 25 && sheet.thematicSectors.values.length >= 50 && sheet.stockbee.values.length >= 10);

const movers = section('盤前異動');
pass('盤前異動固定 16 檔', rowCount(movers) === 16, `${rowCount(movers)} 檔`);
pass('主要正缺口一致', ['COHR','+3.89%','SMCI','+3.47%','RKLB','+3.24%','AMAT','+3.20%'].every(value => movers.includes(value)));
pass('主要負缺口一致', ['MNDY','-9.27%','B','-5.11%','INTC','-3.69%'].every(value => movers.includes(value)));
pass('異動催化有分類', ['台積電七月營收','股票發行','Jefferies 下調','財報前定位'].every(value => movers.includes(value)));

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
pass('技術惡化量化 0/12', major.includes('技術惡化分數為 0/12') && html.includes('三大指數綜合 0/12'));
pass('QQQ 50MA 與前收完整', major.includes('723.03') && major.includes('714.57') && major.includes('守 50MA'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 1 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：1/8 High'));
pass('市場廣度量化 0/8', checklist.includes('5日惡化 0/8') && html.includes('市場廣度惡化分數 0/8'));
pass('正式 VIX 量化 0/5', checklist.includes('正式 VIX 14.90；0/5'));

const macro = section('宏觀事件與盤前背景');
pass('今日與本週宏觀日程完整', ['今日美國高重要數據','CPI YoY','核心 CPI MoM','PPI MoM','初領失業金'].every(value => macro.includes(value)));
pass('CPI 預測與前值完整', /CPI YoY[\s\S]*?3\.4%[\s\S]*?3\.5%/.test(macro) && /核心 CPI MoM[\s\S]*?\+0\.2%[\s\S]*?0\.0%/.test(macro));
pass('宏觀含 Actual／Forecast／Previous', ['Actual','Forecast','Previous'].every(value => macro.includes(value)));
pass('財報 Actual／Forecast 與 Beat／Miss 完整', ['B 財報','EPS 0.73','EPS 0.81','Miss／Beat','MNDY 財報','Beat／Mixed'].every(value => macro.includes(value)));

const breadth = section('市場廣度');
pass('廣度最新六值', ['65.20%','65.60%','70.58%','52.94%','63.83%','62.96%'].every(value => breadth.includes(value)));
pass('Stockbee 最新值', ['53.58%','2.85','1.64','510／152','1540／1051','27／34'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', breadth.includes('三大指數廣度') && breadth.includes('與 Stockbee 交叉驗證') && breadth.includes('綜合結論'));

const fx = section('外匯與商品');
pass('外匯商品 10 列且無驅動欄', rowCount(fx) === 10 && !fx.includes('關鍵位置/驅動'));
pass('FX 表頭與 RSI 完整', ['8/7收盤','1日','5日','1月','8/10盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值與 RSI 完整', ['DXY','99.73','-0.24%','-1.23%','28.12'].every(value => fx.includes(value)));
pass('FX／商品使用 Sheet 與長橋', ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].every(value => fx.includes(value)));

const atr = section('50MA ATR 延伸');
pass('ATR 使用前復權值', ['4.26','3.88','4.48','3.37','2.98','-2.70','-2.52','-2.53'].every(value => atr.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('收益率與債券 ETF 完整', ['4.20%','4.64%','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('FedWatch 機率有日期與來源限制', treasury.includes('42%') && treasury.includes('AP 引述 CME FedWatch｜8/7'));

const plan = section('交易計畫');
pass('過期週波動已停用', plan.includes('尚未更新') && plan.includes('8/3–8/7') && plan.includes('不把舊 +1SD／+2SD 數值當成 8/10 交易門檻'));
pass('交易計畫使用前收／均線／VWAP', ['前收','20MA','50MA','VWAP'].every(value => plan.includes(value)));

const review = section('上次盤前判斷複盤（8/7）');
pass('複盤位置與五項對賬', rowCount(review) === 5 && html.indexOf('上次盤前判斷複盤（8/7）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('上次盤前判斷複盤（8/7）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態詞完整', ['>命中<','>已觸發<','>偏保守<'].every(value => review.includes(value)));

pass('所有表格欄數一致', tableShapes.every(shape => shape.heads > 0 && shape.cells.every(count => count === shape.heads)), JSON.stringify(tableShapes.filter(shape => shape.cells.some(count => count !== shape.heads))));
pass('資料來源齊全', ['docs.google.com','apnews.com','finance.yahoo.com','longbridge.com','cmegroup.com'].every(domain => html.includes(domain)));
pass('無 Polymarket 欄', !/Polymarket\s*[／/]\s*預測市場事件風險/.test(html));
pass('無舊日主線殘留', !html.includes('DOCS／NET／ABNB') && !html.includes('8/7 非農前隔夜風險') && !html.includes('週 +2SD 767.83'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
