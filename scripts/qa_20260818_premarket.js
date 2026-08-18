#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-18-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-18-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-18-longbridge-adjusted.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-18-google-sheet.json'), 'utf8'));
const dxy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-18-dxy.json'), 'utf8'));

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

pass('報告日期與標題', /<title>2026-08-18｜美股盤前監控<\/title>/.test(html));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-17' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-17' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前覆蓋', snapshot.counts.quoteRequested === 136 && snapshot.counts.premarketAvailable === 131, `${snapshot.counts.premarketAvailable}/${snapshot.counts.quoteRequested}`);
pass('Google Sheet 抓取日期', sheet.asOf === '2026-08-18');
pass('DXY 正式日線日期與數值', dxy.asOf === '2026-08-14' && dxy.close > 90 && dxy.close < 110 && dxy.rsi14 > 0 && dxy.rsi14 < 100);

const review = section('上次盤前判斷複盤（8/17）');
pass('上次盤前複盤位置與五項', allRows(review) === 5 && html.indexOf('上次盤前判斷複盤（8/17）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態完整', ['>命中<','>已觸發<','>失誤<'].every(value => review.includes(value)));

const movers = section('盤前異動');
const moverTickers = tickers(movers);
pass('盤前異動固定 16 檔', allRows(movers) === 16 && moverTickers.length === 16, moverTickers.join(','));
pass('異動主榜涵蓋事件與半導體鏈', ['XOS','HD','BIDU','COHR','MRVL','SNDK','LRCX','ALAB','AMAT','MU'].every(value => moverTickers.includes(value)));
pass('成交量只顯示數量', !movers.includes('長橋盤前成交') && movers.includes('萬股'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 2 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：2/8 High'));
pass('廣度惡化分數 4/8', checklist.includes('五日惡化 4/8') && html.includes('廣度 4/8'));
pass('VIX 五項分數 0/5', checklist.includes('正式 VIX 15.19；0/5') && checklist.includes('5日>0') && checklist.includes('1月>0'));

const macro = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous', ['Actual','Forecast','Previous','營建許可','新屋開工','進口價格','工業生產','產能利用率'].every(value => macro.includes(value)));
pass('工業生產與產能利用率已更新', ['+0.2%','+0.3% 修正','76.3%','76.1%','Miss','In line'].every(value => macro.includes(value)));
pass('10:00 待售房屋未預判', ['待售房屋銷售 MoM','+0.3%','-5.4%','待公布'].every(value => macro.includes(value)));
pass('HD／BIDU 財報具體對賬', ['EPS 4.92','營收 47.861B','Beat／Beat','EPS RMB7.22','營收 RMB31.325B','Miss／Miss'].every(value => macro.includes(value)));
pass('無待確認財報共識', !macro.includes('待確認共識'));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickers(etfTables[0] || '');
const thematicOrder = tickers(etfTables[1] || '');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsi(etfTables[0] || '')), sectorOrder.join(','));
pass('Thematic 45 檔完整且 RSI 降序', thematicOrder.length === 45 && descending(rsi(etfTables[1] || '')) && new Set(thematicOrder).size === 45);
pass('Thematic 基準與關鍵列完整', ['VOO','XSW','CIBR','SMH'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));

const major = section('大盤 ETF 技術');
pass('大盤 ETF 只含四檔且順序固定', allRows(major) === 4 && tickers(major).join(',') === 'IWM,DIA,SPY,QQQ');
pass('MA 使用紅綠三角且同列', /ma-state-group/.test(major) && /ma-state ma-up/.test(major) && /ma-arrow[^>]*>[▲▼]</.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化分數 0/12', major.includes('技術惡化 0/12') && html.includes('技術 0/12'));

const breadth = section('市場廣度');
pass('六組指數廣度與 Stockbee', ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA','Stockbee 5D','Stockbee 10D','194／305'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', ['三大指數廣度','Stockbee','綜合結論','短線','中期'].every(value => breadth.includes(value)));

const fx = section('外匯與商品');
pass('外匯商品 10 列', allRows(fx) === 10);
pass('FX 表頭與時間一致', ['8/17收盤','1日','5日','1月','8/18盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值、趨勢與 RSI', ['99.67','39.08','中短線偏弱','低於 20／50MA'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債、曲線與 RSI', ['4.19%','4.72%','5.30%','+53bp','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('弱數據與長債背離有解釋', ['長債','期限溢價','長久期'].every(value => treasury.includes(value)));

const plan = section('交易計畫');
pass('Weekly Expected Move 使用本週窗口', ['8/17–8/21','DIS','MCD','MSFT','NKE','CAT'].every(value => plan.includes(value)));
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
pass('無舊日標題與過期週線', !/2026-08-(11|12|13|17)｜美股盤前監控/.test(html) && !html.includes('8/10–8/14'));

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const simplified = /(数据|报告|板块|市场|风险|财报|实际|预测|软件|复盘|允许|背离|为准|恶化|多头|双确认|解释|失败|外汇|判断|测试|视为)/;
pass('讀者可見文字無簡體常見詞', !simplified.test(visible), (visible.match(simplified) || [])[0] || '');
pass('資料來源與時間戳完整', ['federalreserve.gov/releases/g17','census.gov','bls.gov','ir.homedepot.com','ir.baidu.com','09:07 ET'].every(value => html.includes(value)));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
