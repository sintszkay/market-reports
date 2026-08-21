#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-20-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-20-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-20-longbridge-adjusted.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-20-google-sheet.json'), 'utf8'));
const dxy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-20-dxy.json'), 'utf8'));

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

pass('報告日期與標題', /<title>2026-08-20｜美股盤前監控<\/title>/.test(html));
pass('補更草稿標記', html.includes('盤前更新（補更）') && html.includes('本地補更草稿'));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋未復權 70/70', snapshot.asOf === '2026-08-19' && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0);
pass('長橋前復權 70/70', adjusted.asOf === '2026-08-19' && adjusted.counts.technicalSuccess === 70 && adjusted.errors.length === 0);
pass('長橋盤前覆蓋', snapshot.counts.quoteRequested === 136 && snapshot.counts.premarketAvailable === 133, `${snapshot.counts.premarketAvailable}/${snapshot.counts.quoteRequested}`);
pass('Google Sheet 與 Data QA 日期', sheet.asOf === '2026-08-20' && html.includes('Data QA'));
pass('DXY 正式日線日期與數值', dxy.asOf === '2026-08-19' && dxy.close > 90 && dxy.close < 110 && dxy.rsi14 > 0 && dxy.rsi14 < 100);

const review = section('上次盤前判斷複盤（8/18）');
pass('上次盤前複盤位置與五項', allRows(review) === 5 && html.indexOf('上次盤前判斷複盤（8/18）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態與本段結論完整', ['>命中<','>已觸發<','>偏保守<','本段結論'].every(value => review.includes(value)));

const movers = section('盤前異動');
const moverTickers = tickers(movers);
pass('盤前異動固定 16 檔', allRows(movers) === 16 && moverTickers.length === 16, moverTickers.join(','));
pass('異動主榜涵蓋加密與財報', ['MSTR','COIN','CRCL','HOOD','WMT','BABA','NTES','NDSN'].every(value => moverTickers.includes(value)));
pass('成交量只顯示數量', !movers.includes('長橋盤前成交') && movers.includes('萬股'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 3 High', (checklist.match(/risk-check-row/g) || []).length === 8 && checklist.includes('Checklist：3/8 High'));
pass('廣度惡化分數 8/8', checklist.includes('五日惡化 8/8') && html.includes('廣度 8/8'));
pass('VIX 五項分數 1/5', checklist.includes('五項 1/5') && html.includes('VIX 1/5'));

const macro = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous', ['Actual','Forecast','Previous','初領失業救濟金','Philadelphia Fed','領先指數'].every(value => macro.includes(value)));
pass('宏觀數字完整', ['206K','210K','212K 修正','47.4','24.1','41.4','+0.2%','+0.1%','-0.1% 修正'].every(value => macro.includes(value)));
pass('WMT 財報與指引分拆', ['EPS 0.81','營收 187.94B','EPS 0.66','營收 177.8B','Beat／Beat','2.6%','0.62–0.64','Miss／Miss'].every(value => macro.includes(value)));
pass('BABA／NDSN 財報具體對賬', ['RMB20.715B','RMB25.35B','Miss／Beat','EPS 3.25','營收 817.67M'].every(value => macro.includes(value)));

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
pass('六組指數廣度與 Stockbee', ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA','Stockbee 5D','Stockbee 10D','556／190'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', ['三大指數廣度','與 Stockbee 交叉驗證','綜合結論','單日修復','五日惡化','中期未崩'].every(value => breadth.includes(value)));

const fx = section('外匯與商品');
pass('外匯商品 10 列', allRows(fx) === 10);
pass('FX 表頭與時間一致', ['8/19收盤','1日','5日','1月','8/20盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 數值、趨勢與 RSI', ['98.83','29.12','均線趨勢','低於 20／50／200MA'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債、曲線與 RSI', ['4.19%','4.65%','5.17%','+46bp','+98bp','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('強數據、紀要與長債解釋', ['初領','FOMC','長端','期限溢價'].every(value => html.includes(value)));

const plan = section('交易計畫');
pass('Weekly Expected Move 使用本週窗口', ['8/17–8/21','Weekly Expected Move'].every(value => plan.includes(value)));
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
pass('無舊日標題與過期資料說明', !/2026-08-(11|12|13|17|18)｜美股盤前監控/.test(html) && !html.includes('日線至 8/14'));

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const simplified = /(数据|报告|板块|市场|风险|财报|实际|预测|软件|复盘|允许|背离|为准|恶化|多头|双确认|解释|失败|外汇|判断|测试|视为)/;
pass('讀者可見文字無簡體常見詞', !simplified.test(visible), (visible.match(simplified) || [])[0] || '');
pass('資料來源與時間戳完整', ['dol.gov','philadelphiafed.org','conference-board.org','fomcminutes20260729','corporate.walmart.com','09:30 ET'].every(value => html.includes(value)));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
