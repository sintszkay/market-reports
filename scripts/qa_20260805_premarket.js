#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const html = fs.readFileSync(path.join(ROOT, 'reports', '2026-08-05-premarket-update.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reports', 'report-shared.css'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-05-premarket.json'), 'utf8'));
const closeDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-08-04.json'), 'utf8'));
const thematicDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'thematic_rsi_longport.json'), 'utf8'));
const macroDoc = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0805.json'), 'utf8'));
const movers = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0805.json'), 'utf8'));

const failures = [];
const pass = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const section = label => {
  const start = html.indexOf(`<h2>${label}`);
  if (start < 0) return '';
  const end = html.indexOf('<section', start + 4);
  return html.slice(start, end < 0 ? html.length : end);
};
const rowsOf = fragment => [...fragment.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
  .flatMap(m => [...m[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(x => x[1]));
const cellsOf = row => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
  .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const tickersOf = fragment => rowsOf(fragment).map(row => cellsOf(row)[0]).filter(Boolean);
const rsiOf = fragment => rowsOf(fragment).map(row => Number(cellsOf(row)[5])).filter(Number.isFinite);
const descending = values => values.every((v, i) => i === 0 || values[i - 1] >= v);

pass('報告日期與標題', /<title>2026-08-05｜美股盤前監控<\/title>/.test(html) && data.report_eyebrow.startsWith('2026-08-05'));
pass('發布版不含草稿標記', !html.includes('本地草稿') && !html.includes('待使用者確認後再推送'));
pass('無舊日期或未解析欄位', !html.includes('2026-08-04｜美股盤前監控') && !/<!-- DATA:/.test(html));
pass('收盤快照完整且為 8/4', closeDoc.rows.length === 75 && closeDoc.rows.every(r => r.asOf === '2026-08-04') && !(closeDoc.errors || []).length, `${closeDoc.rows.length} 列`);
pass('Thematic 長橋資料完整且為 8/4', thematicDoc.rows.length === 44 && thematicDoc.rows.every(r => r.asOf === '2026-08-04') && !(thematicDoc.errors || []).length, `${thematicDoc.rows.length} 列`);
pass('Macro 長橋資料完整且為 8/4', macroDoc.rows.length === 32 && macroDoc.rows.every(r => r.asOf === '2026-08-04') && !(macroDoc.errors || []).length, `${macroDoc.rows.length} 列`);
pass('盤前快照 8/5 且可用率達標', pre.length === 96 && pre.filter(r => r.premarketAvailable).length === 95 && pre.filter(r => r.premarketAvailable).every(r => r.timestamp.startsWith('2026-08-05')), `${pre.filter(r => r.premarketAvailable).length}/${pre.length}`);
pass('異動資料為 8/5', movers.length === 68 && movers.every(r => r.timestamp.startsWith('2026-08-05')), `${movers.length} 列`);

const moversSection = section('盤前異動');
pass('盤前異動 16 檔且股票代號不換行', rowsOf(moversSection).length === 16 && css.includes('.ticker-nowrap{display:inline-block;white-space:nowrap'));
pass('盤前異動含主要上漲與下跌股', ['LLY','DIS','PANW','CRWD','AMD','INTC','MU','MRVL','SNDK','ARM'].every(t => moversSection.includes(`>${t}</strong>`)));
pass('AMD 與半導體盤前數字完整', moversSection.includes('-8.86%') && moversSection.includes('114.8萬股') && moversSection.includes('-3.13%') && moversSection.includes('-2.11%'));

const etfTables = [...html.matchAll(/<table class="report-data-table etf-technical-table[\s\S]*?<\/table>/g)].map(m => m[0]);
const sectorTable = etfTables[0] || '';
const thematicTable = etfTables[1] || '';
const sectorTickers = tickersOf(sectorTable);
const thematicTickers = tickersOf(thematicTable);
pass('S&P 500 Sector ETF 共 12 檔且按 RSI 降序', sectorTickers.length === 12 && descending(rsiOf(sectorTable)), `${sectorTickers.length} 檔`);
pass('Thematic 44＋SPY 共 45 檔', /data-source-count="44"/.test(thematicTable) && /data-report-count="45"/.test(thematicTable) && thematicTickers.length === 45, `${thematicTickers.length} 檔`);
pass('Thematic 含 SPY 一次且按 RSI 降序', thematicTickers.filter(t => t === 'SPY').length === 1 && descending(rsiOf(thematicTable)));
pass('ETF 名稱只顯示英文代號', !/(生技|軟體|半導體|保險|黃金|白銀)/.test(thematicTickers.join(' ')));
pass('MA 使用紅綠上下三角形且單行顯示', /20MA[\s\S]*?▲/.test(sectorTable) && /20MA[\s\S]*?▼/.test(sectorTable) && css.includes('.ma-cell{white-space:nowrap}'));

const majorSection = section('大盤 ETF 技術');
const majorTickers = tickersOf(majorSection);
pass('大盤 ETF 僅 IWM／DIA／SPY／QQQ', majorTickers.length === 4 && ['IWM','DIA','SPY','QQQ'].every((t, i) => majorTickers[i] === t), majorTickers.join('／'));

const recap = section('昨晚盤前判斷複盤（8/4）');
const recapRows = rowsOf(recap);
pass('昨晚盤前複盤置於核心結論後、盤前異動前', html.indexOf('昨晚盤前判斷複盤（8/4）') > html.indexOf('核心結論') && html.indexOf('昨晚盤前判斷複盤（8/4）') < html.indexOf('盤前異動'));
pass('複盤共 5 項', recapRows.length === 5, `${recapRows.length} 項`);
pass('複盤狀態為 3 命中／1 失誤／1 已觸發', (recap.match(/>命中</g) || []).length === 3 && (recap.match(/>失誤</g) || []).length === 1 && (recap.match(/>已觸發</g) || []).length === 1);
pass('複盤證據包含 SMH、CAT、TLT、廣度與 AMD', ['SMH +5.55%','876.54','TLT +0.77%','60.19%','AMD 8/4 收 +7.00%'].every(x => recap.includes(x)));
pass('複盤版面有固定欄寬且狀態不換行', css.includes('.flat-report .premarket-review-table{min-width:980px;table-layout:fixed}') && css.includes('td:nth-child(3){text-align:center;white-space:nowrap}'));

const riskSection = section('大盤修正檢查表');
pass('風險清單 8 項、0/8 High', (riskSection.match(/risk-check-row/g) || []).length === 8 && riskSection.includes('0/8 High'));
pass('VIX 採正式指數與五項 1/5', riskSection.includes('VIX 16.50') && riskSection.includes('五項分數 1/5'));

const macroSection = section('宏觀事件與盤前背景');
pass('宏觀表含 Actual／Forecast／Previous', ['Actual','Forecast','Previous'].every(x => macroSection.includes(`>${x}</th>`)));
pass('宏觀與財報共 7 項', (macroSection.match(/class="macro-event"/g) || []).length === 7);
pass('ADP 正式值、預期與前值', /ADP 私人就業[\s\S]*?44K[\s\S]*?68K[\s\S]*?98K[\s\S]*?Miss/.test(macroSection));
pass('服務業 PMI 待公布且不填估計 Actual', /S&amp;P Global 服務業 PMI[\s\S]*?待公布[\s\S]*?53\.6/.test(macroSection) && /ISM 服務業 PMI[\s\S]*?待公布[\s\S]*?54\.5/.test(macroSection));
pass('四份財報 EPS／營收與 Beat／Miss 完整', ['AMD 財報','Disney 財報','Eli Lilly 財報','Uber 財報','EPS 1.66','營收 11.536B','EPS 8.38','營收 22.97B'].every(x => macroSection.includes(x)) && (macroSection.match(/Beat／Beat/g) || []).length >= 2 && (macroSection.match(/Beat／Miss/g) || []).length >= 2);
pass('宏觀表專用寬度避免數字重疊', css.includes('.flat-report .macro-results-table{min-width:1080px;table-layout:fixed}') && css.includes('.flat-report .macro-results-table th:nth-child(2),'));

const breadth = section('市場廣度');
pass('三大指數廣度與 Stockbee 綜合分析', ['67.79%','70.87%','67.46%','60.19%','1.82','1.23','725／115'].every(x => breadth.includes(x)) && breadth.includes('交叉驗證'));
const fx = section('外匯與商品');
pass('外匯商品包含 DXY、趨勢與 RSI', ['DXY','99.70','USDU RSI 38.71','FXY RSI 69.61','銅 RSI 63.01'].every(x => fx.includes(x)) && fx.includes('趨勢／RSI 含義'));
const treasury = section('美債與 Fed 傳導');
pass('短中長債與 TLT 比較完整', ['4.20%','4.63%','5.18%','TLT','SHY','IEF'].every(x => treasury.includes(x)));

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
pass('讀者可見文字無常見簡體字', !/[与为转从后这归续质证误数务财报盘强冲击价场长扩见级构适认周门处领许无开单体视复涨医费别实]/.test(visible));
pass('交易計畫使用獨立六欄比例', css.includes('.flat-report .trading-plan-table{min-width:980px;table-layout:fixed}') && css.includes('.flat-report .trading-plan-table th:nth-child(5){width:26%}') && css.includes('.flat-report .trading-plan-table th:nth-child(6){width:34%}'));
pass('共享樣式使用 flat-8 且無舊版視覺', html.includes('report-shared.css?v=20260805-flat-8') && !/linear-gradient|box-shadow/.test(html));
pass('資料來源與報告截點說明完整', ['長橋 OpenAPI','Market Watch','Stockbee','ADP','ISM','美國財政部','Cboe'].every(x => html.includes(x)));

if (failures.length) {
  console.error(`\nQA FAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nQA PASSED');
