#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-04-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-04-premarket.json'), 'utf8'));
const closeDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-08-03.json'), 'utf8'));
const thematicDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'thematic_rsi_longport.json'), 'utf8'));
const macroDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0804.json'), 'utf8'));
const movers = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0804.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `：${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = title => {
  const re = new RegExp(`<section[^>]*>[\\s\\S]*?<h2[^>]*>${title}<\\/h2>([\\s\\S]*?)<\\/section>`, 'i');
  return (html.match(re) || [])[1] || '';
};
const tickerOrder = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(m => m[1]);

pass('報告日期與標題', /<title>2026-08-04｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-04'));
pass('無舊報告標題或未解析欄位', !html.includes('2026-08-03｜美股盤前監控') && !/<!-- DATA:/.test(html));
pass('收盤快照完整且為 8/3', closeDoc.rows.length === 75 && closeDoc.rows.every(r => r.asOf === '2026-08-03') && !(closeDoc.errors || []).length, `${closeDoc.rows.length} 列`);
pass('Thematic 長橋資料完整且為 8/3', thematicDoc.rows.length === 44 && thematicDoc.rows.every(r => r.asOf === '2026-08-03') && !(thematicDoc.errors || []).length, `${thematicDoc.rows.length} 列`);
pass('Macro 長橋資料完整且為 8/3', macroDoc.rows.length === 32 && macroDoc.rows.every(r => r.asOf === '2026-08-03') && !(macroDoc.errors || []).length, `${macroDoc.rows.length} 列`);
pass('盤前快照 8/4 且可用率達標', pre.length === 96 && pre.filter(r => r.premarketAvailable).length === 95 && pre.filter(r => r.premarketAvailable).every(r => r.timestamp.startsWith('2026-08-04')), `${pre.filter(r => r.premarketAvailable).length}/${pre.length}`);
pass('異動資料為 8/4', movers.length === 68 && movers.every(r => r.timestamp.startsWith('2026-08-04')), `${movers.length} 列`);

const moverSection = section('盤前異動');
pass('盤前異動 16 檔', (moverSection.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr>/g)?.length === 16);
pass('成交量已簡化且無舊句式', moverSection.includes('313.3萬股') && moverSection.includes('191.5萬股') && !moverSection.includes('長橋盤前成交約') && !moverSection.includes('長橋盤前量'));
pass('主要盤前數字一致', moverSection.includes('PLTR') && moverSection.includes('+16.85%') && moverSection.includes('CAT') && moverSection.includes('+11.86%') && moverSection.includes('AMZN') && moverSection.includes('-2.54%'));

const etfSection = section('板塊與主題 ETF');
const tables = [...etfSection.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(m => m[0]);
const sectorTable = tables[0] || '', thematicTable = tables[1] || '';
const sectorOrder = tickerOrder(sectorTable), thematicOrder = tickerOrder(thematicTable);
const rsiValues = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(m => Number(m[1]));
const desc = a => a.every((v,i) => i === 0 || a[i - 1] >= v);
pass('S&P 500 Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && desc(rsiValues(sectorTable)), sectorOrder.join(','));
pass('Thematic 44＋SPY 共 45 檔', /data-source-count="44"/.test(thematicTable) && /data-report-count="45"/.test(thematicTable) && thematicOrder.length === 45, `${thematicOrder.length} 檔`);
pass('Thematic SPY 僅一次且 RSI 降序', thematicOrder.filter(t => t === 'SPY').length === 1 && desc(rsiValues(thematicTable)));
pass('ETF 名稱只顯示英文代號', !/(生技|軟體|半導體|保險|黃金|白銀)/.test(thematicOrder.join(' ')));

const majorSection = section('大盤 ETF 技術');
pass('大盤 ETF 僅四檔且順序正確', tickerOrder(majorSection).slice(0,4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(majorSection));
pass('MA 使用紅綠三角且同列', /ma-state-group/.test(html) && /ma-up/.test(html) && /ma-down/.test(html) && /ticker-nowrap/.test(html));
pass('資產代號與名稱不拆行', (html.match(/class="asset-pair"/g) || []).length === 12 && css.includes('.flat-report .asset-pair{') && css.includes('white-space:nowrap'));
pass('外匯首欄已加寬', css.includes('.flat-report .fx-trend-table{min-width:1040px') && css.includes('.flat-report .fx-trend-table th:nth-child(1){width:17%}'));
pass('美債首欄已加寬', css.includes('.flat-report .bond-curve-table th:nth-child(1){width:22%}') && css.includes('.flat-report .bond-curve-table td:first-child{'));
pass('宏觀事件欄使用專用版面', (html.match(/class="macro-event"/g) || []).length === 6 && css.includes('.flat-report .macro-results-table th:nth-child(1){width:26%}'));
pass('共享樣式版本已更新', html.includes('report-shared.css?v=20260804-flat-7'));

const priorReviewSection = section('昨晚盤前判斷複盤（8/3）');
pass('昨晚盤前複盤已加入核心結論後', priorReviewSection.length > 0 && html.indexOf('昨晚盤前判斷複盤（8/3）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('昨晚盤前判斷複盤（8/3）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤表 5 項且版面固定', (priorReviewSection.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr>/g)?.length === 5 && /premarket-review-table/.test(priorReviewSection) && css.includes('.flat-report .premarket-review-table{min-width:980px'));
pass('複盤包含三類對賬結果', (priorReviewSection.match(/>命中</g) || []).length === 2 && (priorReviewSection.match(/>失誤</g) || []).length === 2 && (priorReviewSection.match(/>已觸發</g) || []).length === 1);
pass('複盤收盤數字可核對', ['XSW +2.92%','IGV +3.00%','SMH +0.91%','SNDK +6.03%','USO 收 -5.46%','XLE 收 -1.28%','ISM 55.6','價格支付降至 71.1'].every(x => priorReviewSection.includes(x)));
pass('複盤有今日修正與小結', priorReviewSection.includes('四象限') && priorReviewSection.includes('VWAP') && priorReviewSection.includes('本段結論'));

const checklistSection = section('大盤修正檢查表');
pass('修正清單 8 項與 0/8 High', (checklistSection.match(/risk-check-row/g) || []).length === 8 && checklistSection.includes('Checklist Score：0/8 High'));
pass('VIX 五項機械計分正確', checklistSection.includes('VIX 15.59') && checklistSection.includes('五項分數 1/5') && checklistSection.includes('>20 0/1') && checklistSection.includes('5日>0 0/1') && checklistSection.includes('1月>0 1/1') && checklistSection.includes('20MA 0/1') && checklistSection.includes('50MA 0/1'));

const macroSection = section('宏觀事件與盤前背景');
pass('宏觀表含 Actual／Forecast／Previous', ['Actual','Forecast','Previous'].every(x => macroSection.includes(`<th class="num">${x}</th>`)));
pass('貿易餘額正式值與預期／前值', macroSection.includes('-73.3B') && macroSection.includes('-73.0B') && macroSection.includes('-77.6B'));
pass('JOLTS 正式值與預期／修訂前值', /JOLTS[\s\S]*?7\.359M[\s\S]*?7\.40M[\s\S]*?7\.537M[\s\S]*?低於預期/.test(macroSection));
pass('工廠訂單正式值與預期／修訂前值', /工廠訂單[\s\S]*?-0\.3%[\s\S]*?\+0\.2%[\s\S]*?-1\.1%[\s\S]*?Miss/.test(macroSection));
pass('宏觀已公布列不再顯示待公布', !/JOLTS[\s\S]{0,500}?待公布/.test(macroSection) && !/工廠訂單[\s\S]{0,500}?待公布/.test(macroSection));
pass('PLTR 與 CAT 雙 Beat 數字完整', macroSection.includes('EPS 0.41') && macroSection.includes('營收 1.935B') && macroSection.includes('EPS 8.17') && macroSection.includes('營收 20.543B') && (macroSection.match(/Beat／Beat/g) || []).length === 2);
pass('AMD 維持待公布', /AMD 財報[\s\S]*?待公布[\s\S]*?EPS 1\.61[\s\S]*?營收 11\.3B/.test(macroSection));

const breadthSection = section('市場廣度');
pass('廣度採標準綜合版面', /breadth-diagnostic-table/.test(breadthSection) && breadthSection.includes('三大指數廣度') && breadthSection.includes('與 Stockbee 交叉驗證') && breadthSection.includes('綜合結論'));
pass('最新三大指數廣度正確', ['58.84%','64.01%','57.28%','49.51%','56.60%','60.54%'].every(x => breadthSection.includes(x)));
pass('Stockbee 最新值正確', ['1.20','1.13','579／76','1305／1164','52.78%'].every(x => breadthSection.includes(x)));

const fxSection = section('外匯與商品');
pass('DXY 未缺失且非 proxy', fxSection.includes('DXY') && fxSection.includes('99.97') && fxSection.includes('低於 102'));
pass('外匯商品逐列含趨勢與 RSI', fxSection.includes('趨勢／RSI 含義') && (fxSection.match(/RSI \d+\.\d+/g) || []).length >= 9 && (fxSection.match(/均線/g) || []).length >= 9);
pass('正式 VIX 未誤用 VIXY 20.35', !html.includes('VIX 20.35') && html.includes('Google Macro 表中的「VIX」列實為 VIXY 代理'));

const treasurySection = section('美債與 Fed 傳導');
pass('長短債與曲線數字完整', ['4.25%','4.70%','5.23%','+45bp','SHY','IEF','TLT'].every(x => treasurySection.includes(x)));
const planSection = section('交易計畫');
pass('週期望波動使用盤前價判定', planSection.includes('DIA') && planSection.includes('537.67') && planSection.includes('QQQ') && planSection.includes('708.02') && planSection.includes('PLTR') && planSection.includes('146.82'));
pass('突破狀態按盤前價重算', (planSection.match(/突破 \+1SD/g) || []).length === 5 && !planSection.includes('突破 +2SD'));

pass('資料來源連結齊全', ['ismworld.org','bea.gov','data.bls.gov','census.gov','tradingeconomics.com','home.treasury.gov','cdn.cboe.com','longbridge.com','q4cdn.com','ir.amd.com'].every(x => html.includes(x)));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前)/.test(html.replace(/<script[\s\S]*?<\/script>/g,'')));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
