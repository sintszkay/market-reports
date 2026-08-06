#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-06-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-longbridge.json'), 'utf8'));
const adjustedSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-longbridge-adjusted.json'), 'utf8'));
const sheetSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-google-sheet-etf-full.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-premarket.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `：${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = title => {
  const pattern = new RegExp(`<section[^>]*>[\\s\\S]*?<h2[^>]*>${title}<\\/h2>([\\s\\S]*?)<\\/section>`, 'i');
  return (html.match(pattern) || [])[1] || '';
};
const tickerOrder = fragment => [...fragment.matchAll(/<strong class="ticker-nowrap">([A-Z0-9.]+)<\/strong>/g)].map(match => match[1]);
const rsiValues = fragment => [...fragment.matchAll(/data-rsi="([0-9.]+)"/g)].map(match => Number(match[1]));
const descending = values => values.every((value, index) => index === 0 || values[index - 1] >= value);
const rowCount = fragment => ((fragment.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0].match(/<tr>/g) || []).length;
const tickerRow = (fragment, ticker) => (fragment.match(new RegExp(`<tr>[^<]*<td[^>]*><strong class="ticker-nowrap">${ticker}<\\/strong><\\/td>[\\s\\S]*?<\\/tr>`)) || [])[0] || '';

pass('報告日期與標題', /<title>2026-08-06｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-06'));
pass('無未解析欄位或舊標題', !/<!-- DATA:/.test(html) && !html.includes('2026-08-04｜美股盤前監控'));
pass('長橋技術快照完整', snapshot.asOf === '2026-08-05' && snapshot.counts.technicalRequested === 70 && snapshot.counts.technicalSuccess === 70 && snapshot.errors.length === 0, `${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested}`);
pass('長橋前復權技術快照完整', adjustedSnapshot.asOf === '2026-08-05' && adjustedSnapshot.counts.technicalRequested === 70 && adjustedSnapshot.counts.technicalSuccess === 70 && adjustedSnapshot.errors.length === 0, `${adjustedSnapshot.counts.technicalSuccess}/${adjustedSnapshot.counts.technicalRequested}`);
pass('Google Sheet ETF 快照為 8/5', sheetSnapshot.asOf === '2026-08-05' && sheetSnapshot.sectorDashboard.values.length === 30 && sheetSnapshot.thematicSectors.values.length === 56);
pass('盤前報價可用率正確', snapshot.counts.quoteRequested === 116 && snapshot.counts.premarketAvailable === 101 && snapshot.quotes.filter(row => row.premarketAvailable).every(row => row.timestamp.startsWith('2026-08-06')), `${snapshot.counts.premarketAvailable}/${snapshot.counts.quoteRequested}`);

const moverSection = section('盤前異動');
pass('盤前異動固定 16 檔', rowCount(moverSection) === 16, `${rowCount(moverSection)} 檔`);
pass('主要負面異動一致', ['APP','-17.56%','DDOG','-15.25%','SNDK','-11.23%','MU','-5.66%'].every(value => moverSection.includes(value)));
pass('主要正面異動一致', ['NVO','+3.48%','DASH','+2.49%','LLY','+0.98%'].every(value => moverSection.includes(value)));
pass('同業跟跌未誤寫成新事件', moverSection.includes('沒有獨立財報催化') && moverSection.includes('不單獨歸因'));

const etfSection = section('板塊與主題 ETF');
const etfTables = [...etfSection.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => match[0]);
const sectorTable = etfTables[0] || '';
const thematicTable = etfTables[1] || '';
const sectorOrder = tickerOrder(sectorTable);
const thematicOrder = tickerOrder(thematicTable);
pass('Sector 12 檔且 RSI 降序', sectorOrder.length === 12 && descending(rsiValues(sectorTable)), sectorOrder.join(','));
pass('Thematic 主表 45 檔完整', /data-source-count="45"/.test(thematicTable) && /data-report-count="45"/.test(thematicTable) && /data-benchmark="VOO"/.test(thematicTable) && /data-benchmark-in-source="true"/.test(thematicTable) && thematicOrder.length === 45, `${thematicOrder.length} 檔`);
pass('Thematic RSI 降序且無重複', descending(rsiValues(thematicTable)) && new Set(thematicOrder).size === 45);
pass('VOO／BUG／PAVE 皆一次', ['VOO','BUG','PAVE'].every(ticker => thematicOrder.filter(value => value === ticker).length === 1));
pass('Thematic 不額外插入 SPY', thematicOrder.filter(ticker => ticker === 'SPY').length === 0);
const xlyRow = tickerRow(sectorTable, 'XLY');
const xleRow = tickerRow(sectorTable, 'XLE');
pass('拆分後 52週高與 MA 狀態已校正', xlyRow.includes('-4.70%') && (xlyRow.match(/ma-up/g) || []).length === 3 && xleRow.includes('-9.00%') && (xleRow.match(/ma-up/g) || []).length === 2 && (xleRow.match(/ma-down/g) || []).length === 1 && !sectorTable.includes('-51.26%'));

const majorSection = section('大盤 ETF 技術');
pass('大盤 ETF 四檔順序固定', tickerOrder(majorSection).slice(0, 4).join(',') === 'IWM,DIA,SPY,QQQ' && /data-major-universe="indices-4"/.test(majorSection));
pass('Above MA 三項同列對齊', /ma-state-group/.test(majorSection) && /ma-up/.test(majorSection) && css.includes('.ma-state-group{') && css.includes('.ma-heading,.ma-cell{text-align:center}'));
pass('技術惡化量化 0/12', majorSection.includes('技術惡化分數為 0/12') && html.includes('三大指數綜合 0/12'));
pass('QQQ 盤前與 50MA 關係正確', majorSection.includes('712.96') && majorSection.includes('715.01') && majorSection.includes('低於 50MA'));

const checklistSection = section('大盤修正檢查表');
pass('修正清單 8 項且無 High', (checklistSection.match(/risk-check-row/g) || []).length === 8 && checklistSection.includes('Checklist：0/8 High'));
pass('市場廣度量化 0/8', checklistSection.includes('5日惡化 0/8') && html.includes('市場廣度惡化分數為 0/8'));
pass('正式 VIX 量化 0/5', checklistSection.includes('正式 VIX 15.81；0/5') && checklistSection.includes('>20、1日上升、5日上升、高於20MA、高於50MA均未觸發'));

const macroSection = section('宏觀事件與盤前背景');
pass('宏觀表含 Actual／Forecast／Previous', ['Actual','Forecast','Previous'].every(value => macroSection.includes(`<th class="num">${value}</th>`)));
pass('08:30 數據維持待公布', /初領失業金[\s\S]*?待公布[\s\S]*?202K[\s\S]*?197K/.test(macroSection) && /單位勞動成本[\s\S]*?待公布[\s\S]*?\+2\.1%[\s\S]*?\+1\.8%/.test(macroSection));
pass('Challenger 已填正式值', /Challenger[\s\S]*?33\.429K[\s\S]*?45\.849K/.test(macroSection));
pass('APP 財報數字與判斷', /APP 財報[\s\S]*?EPS 3\.76[\s\S]*?營收 1\.92B[\s\S]*?EPS 3\.75[\s\S]*?營收 1\.95B[\s\S]*?營收 Miss/.test(macroSection));
pass('SNDK／LLY 財報數字完整', ['EPS 39.25','營收 8.965B','EPS 8.38','營收 22.974B','上調全年指引'].every(value => macroSection.includes(value)));

const breadthSection = section('市場廣度');
pass('廣度新診斷表頭', ['指標','最新','1日變化','5日趨勢','判斷'].every(value => breadthSection.includes(`<th${value === '最新' ? ' class="num"' : ''}>${value}</th>`)));
pass('三大指數廣度最新值', ['64.81%','66.79%','65.04%','56.31%','62.60%','62.80%'].every(value => breadthSection.includes(value)));
pass('Stockbee 最新值', ['54.37%','2.71','1.28','264／210','1445／1080','20／34'].every(value => breadthSection.includes(value)));
pass('五日與單日結論分離', breadthSection.includes('三大指數廣度') && breadthSection.includes('與 Stockbee 交叉驗證') && breadthSection.includes('短線單日訊號') && breadthSection.includes('中期'));

const fxSection = section('外匯與商品');
pass('外匯商品 9 列且無多餘驅動欄', rowCount(fxSection) === 9 && !fxSection.includes('關鍵位置/驅動'));
pass('逐列含均線與 RSI 解讀', (fxSection.match(/均線/g) || []).length >= 9 && (fxSection.match(/RSI \d+\.\d+/g) || []).length >= 9);
pass('只使用表格 ETF 代理', ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].every(ticker => fxSection.includes(ticker)) && !fxSection.includes('AUD/USD') && !fxSection.includes('USD/CNH'));

const atrSection = section('50MA ATR 延伸');
pass('ATR 使用前復權技術值', ['5.20','3.77','3.72','-2.30','-3.77','-4.87'].every(value => atrSection.includes(value)) && atrSection.includes('DIA +3.55 ATR'));

const treasurySection = section('美債與 Fed 傳導');
pass('收益率曲線數字完整', ['4.18%','4.63%','5.17%','+45bp','SHY','IEF','TLT'].every(value => treasurySection.includes(value)));
pass('Fed 反對票方向正確', treasurySection.includes('三名反對票主張加息 25bp') && !treasurySection.includes('主張降息'));

const planSection = section('交易計畫');
pass('週期望波動使用盤前價', ['SPY','770.71','DIA','544.46','QQQ','712.96','IWM','300.20','SMH','566.00','TLT','82.94'].every(value => planSection.includes(value)));
pass('週波動狀態正確', (planSection.match(/突破 \+2SD/g) || []).length === 2 && (planSection.match(/突破 \+1SD/g) || []).length === 2 && (planSection.match(/>區間內</g) || []).length === 2);

const reviewSection = section('上次盤前判斷複盤（8/4）');
pass('上次盤前複盤位置與四項對賬', reviewSection.length > 0 && rowCount(reviewSection) === 4 && html.indexOf('上次盤前判斷複盤（8/4）') > html.indexOf('<h2>核心結論</h2>') && html.indexOf('上次盤前判斷複盤（8/4）') < html.indexOf('<h2>盤前異動</h2>'));
pass('複盤包含命中／已觸發／偏保守', (reviewSection.match(/>命中</g) || []).length === 2 && (reviewSection.match(/>已觸發</g) || []).length === 1 && (reviewSection.match(/>偏保守</g) || []).length === 1 && reviewSection.includes('本段結論'));

pass('資料來源齊全', ['docs.google.com','sec.gov','investor.sandisk.com','investor.lilly.com','longbridge.com','federalreserve.gov','home.treasury.gov','bls.gov','census.gov'].every(domain => html.includes(domain)));
pass('資料 QA 明示拆分修正', html.includes('Google Sheet 已調整值') && html.includes('ATR 使用前復權日線') && html.includes('已排除拆分假訊號'));
pass('無 Polymarket 事件風險欄', !html.includes('Polymarket / 預測市場事件風險') && !html.includes('Polymarket／預測市場事件風險'));
pass('讀者可見文字無簡體常見詞', !/(数据|报告|板块|市场|风险|财报|实际|预测|之前|软件)/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const ruleErrors = validateReportHtml(html, {reportType:'premarket'});
pass('共享報告規則全部通過', ruleErrors.length === 0, ruleErrors.join('；'));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
