#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-19-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-19-longbridge.json'), 'utf8'));
const adjusted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-19-longbridge-adjusted.json'), 'utf8'));
const sheet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-19-google-sheet.json'), 'utf8'));
const failures = [];
const pass = (name, ok, detail='') => { if (!ok) failures.push(name + (detail?`：${detail}`:'')); console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`); };
const section = title => ([...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].find(match => new RegExp(`<h2[^>]*>${title}<\\/h2>`,'i').test(match[0])) || [])[0] || '';
const allRows = fragment => [...fragment.matchAll(/<tbody>[\s\S]*?<\/tbody>/gi)].flatMap(match => match[0].match(/<tr\b[^>]*>/g)||[]).length;
const tickers = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
const rsi = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
const descending = values => values.every((value,index) => index===0 || values[index-1]>=value);

pass('報告日期與標題', /<title>2026-08-19｜美股盤前監控<\/title>/.test(html));
pass('無未解析欄位', !/<!-- DATA:/.test(html));
pass('長橋技術 70/70', snapshot.asOf==='2026-08-18' && snapshot.counts.technicalSuccess===70 && snapshot.errors.length===0);
pass('長橋盤前 147/147 且零失敗', snapshot.counts.quoteRequested===147 && snapshot.counts.premarketAvailable===147 && snapshot.quoteErrors.length===0);
pass('前復權技術快照一致', adjusted.asOf==='2026-08-18' && adjusted.counts.technicalSuccess===70);
pass('歷史快照時間無未來資料', snapshot.premarketDate==='2026-08-19' && snapshot.generatedAt==='2026-08-19T13:29:00Z');
pass('Sheet 快照日期與列數', sheet.asOf==='2026-08-19' && sheet.sectorDashboard.values.length===13 && sheet.thematicSectors.values.length===46);

const review = section('上次盤前判斷複盤（8/18）');
pass('上次盤前複盤五項且位置正確', allRows(review)===5 && html.indexOf('上次盤前判斷複盤（8/18）')<html.indexOf('<h2>盤前異動</h2>'));
pass('複盤狀態完整', ['>命中<','>已觸發<','>失誤<'].every(value => review.includes(value)));

const movers = section('盤前異動');
const moverTickers = tickers(movers);
pass('盤前異動固定 16 檔', allRows(movers)===16 && moverTickers.length===16, moverTickers.join(','));
pass('核心事件與下跌股完整', ['MRNA','MRK','BNTX','MRVL','EL','TGT','LOW','TJX','AVGO','SMCI'].every(value => moverTickers.includes(value)));
pass('成交量只顯示數量', !movers.includes('長橋盤前成交') && movers.includes('萬股'));

const checklist = section('大盤修正檢查表');
pass('修正清單 8 項且 1 High', (checklist.match(/risk-check-row/g)||[]).length===8 && checklist.includes('Checklist：1/8 High'));
pass('廣度惡化 8/8', checklist.includes('五日惡化 8/8') && html.includes('廣度 8/8'));
pass('VIX 五項 1/5', checklist.includes('正式 VIX 15.84；1/5') && checklist.includes('只有五日變化為正'));

const macro = section('宏觀事件與盤前背景');
pass('宏觀 Actual／Forecast／Previous 完整', ['Actual','Forecast','Previous','FOMC 7月會議紀要','待公布','14:00 ET'].every(value => macro.includes(value)));
pass('TGT 具體 Beat／Beat', ['EPS 4.11','EPS 2.33','營收 26.54B','營收 26.13B','Beat／Beat'].every(value => macro.includes(value)));
pass('LOW 具體 Beat／Miss', ['EPS 4.40','EPS 4.22','營收 25.96B','Beat／Miss'].every(value => macro.includes(value)));
pass('TJX／EL 具體財報', ['EPS 1.22','營收 15.20B','EPS 0.39','營收 3.63B'].every(value => macro.includes(value)));
pass('FOMC 未使用盤後結果', !macro.includes('升息必要') && !macro.includes('許多官員'));

const etf = section('板塊與主題 ETF');
const etfTables = [...etf.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorOrder = tickers(etfTables[0]||''); const thematicOrder = tickers(etfTables[1]||'');
pass('Sector 12 檔且 RSI 降序', sectorOrder.length===12 && descending(rsi(etfTables[0]||'')), sectorOrder.join(','));
pass('Thematic 45 檔且 RSI 降序', thematicOrder.length===45 && descending(rsi(etfTables[1]||'')) && new Set(thematicOrder).size===45);
pass('Thematic 含 VOO 基準', thematicOrder.filter(value => value==='VOO').length===1);

const major = section('大盤 ETF 技術');
pass('大盤 ETF 只含四檔且順序固定', allRows(major)===4 && tickers(major).join(',')==='IWM,DIA,SPY,QQQ');
pass('MA 紅綠三角同列', /ma-state-group/.test(major) && /ma-state ma-up/.test(major) && /ma-arrow[^>]*>[▲▼]</.test(major) && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化 0/12', major.includes('技術惡化 0/12') && html.includes('技術 0/12'));

const breadth = section('市場廣度');
pass('三大指數廣度資料正確', ['52.98%','59.56%','57.84%','59.80%','55.05%','57.92%'].every(value => breadth.includes(value)));
pass('Stockbee 資料正確', ['1.10','1.30','167／335','1469／1053','47.94%'].every(value => breadth.includes(value)));
pass('三大指數與 Stockbee 綜合分析', ['三大指數廣度','Stockbee','綜合結論','8/8'].every(value => breadth.includes(value)));

const fx = section('外匯與商品');
pass('外匯商品 10 列', allRows(fx)===10);
pass('FX 表頭時間一致', ['8/18收盤','8/19盤前','RSI','趨勢／RSI 含義'].every(value => fx.includes(value)));
pass('DXY 正式日期與 RSI', ['99.67','39.08','正式日線','中短線偏弱'].every(value => fx.includes(value)));

const treasury = section('美債與 Fed 傳導');
pass('長短債與曲線完整', ['4.19%','4.71%','5.28%','+52bp','SHY','IEF','TLT'].every(value => treasury.includes(value)));
pass('FOMC 情景不預判', ['紀要前','若 14:00 後','偏鷹'].every(value => treasury.includes(value)));

const plan = section('交易計畫');
pass('交易計畫與本週波幅', ['MRNA／MRK／XBI','14:00 ET','8/17–8/21','20/50/200MA'].every(value => html.includes(value)));
pass('交易計畫無單字拆列', !/<strong class="ticker-nowrap">[A-Z0-9.]<br>/.test(plan));

const shapes = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => {
  const body=match[1]; const head=((body.match(/<thead>[\s\S]*?<\/thead>/i)||[''])[0].match(/<th\b/g)||[]).length;
  const rows=[...body.matchAll(/<tbody>[\s\S]*?<\/tbody>/gi)].flatMap(m=>[...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]);
  return {head,cells:rows.map(row=>(row[1].match(/<td\b/g)||[]).length)};
});
const badShapes=shapes.filter(shape=>!(shape.head>0&&shape.cells.every(count=>count===shape.head)));
pass('所有表格欄數一致', badShapes.length===0, JSON.stringify(badShapes));
pass('窄欄防單字換行樣式', css.includes('word-break:keep-all') && css.includes('overflow-wrap:normal') && css.includes('white-space:nowrap'));

const visible = html.replace(/<script[\s\S]*?<\/script>/g,'');
const simplified = /(数据|报告|板块|市场|风险|财报|实际|预测|软件|复盘|允许|背离|为准|恶化|多头|解释|失败|外汇|判断|测试|视为)/;
pass('讀者可見文字無常見簡體', !simplified.test(visible), (visible.match(simplified)||[])[0]||'');
pass('資料來源與時間完整', ['federalreserve.gov','corporate.target.com','investor.tjx.com','09:29 ET'].every(value => html.includes(value)));

const ruleErrors = validateReportHtml(html,{reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length===0, ruleErrors.join('；'));

if (failures.length) { console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('\nQA PASSED');
