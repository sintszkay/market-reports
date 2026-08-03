#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const closeRows = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-07-31.json'), 'utf8')).rows;
const thematicRowsRaw = JSON.parse(fs.readFileSync(path.join(WORK, 'thematic_rsi_longport_2026-07-31.json'), 'utf8')).rows;
const macroRows = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8')).rows;
const preRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0803.json'), 'utf8'));
const moverRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0803.json'), 'utf8'));

const close = Object.fromEntries(closeRows.map(r => [r.ticker, r]));
const macro = Object.fromEntries(macroRows.map(r => [r.key, r]));
const pre = Object.fromEntries(preRows.map(r => [r.ticker, r]));
const movers = Object.fromEntries(moverRows.map(r => [r.ticker, r]));

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (v, d = 2) => Number(v).toFixed(d);
const pct = v => `${Number(v) >= 0 ? '+' : ''}${n(v)}%`;
const cls = v => Number(v) > 0 ? 'up' : Number(v) < 0 ? 'dn' : '';
const td = (x, c = '') => `<td${c ? ` class="${c}"` : ''}>${x}</td>`;
const numTd = (x, v = null) => td(x, `num ${v === null ? '' : cls(v)}`.trim());
const badge = (text, tone = 'blue') => `<span class="badge ${tone}">${text}</span>`;
const vol = v => Number(v) >= 1e6 ? `${n(v / 1e6, 1)}百萬股` : Number(v) >= 1e4 ? `${n(v / 1e4, 1)}萬股` : `${Number(v).toLocaleString('zh-HK')}股`;
const numericHead = h => /^(?:價格|盤前|收盤|1日|5日|1月|距52週高|RSI|20MA|50MA|ATR14|距50MA ATR|Actual|Forecast|Previous|SPX >20MA|SPX >50MA|NDX >20MA|NDX >50MA|IWM >20MA|IWM >50MA|4% 上漲股|4% 下跌股|5D ratio|10D ratio|季度 \+25%|季度 -25%|T2108)$/.test(h);
const table = (heads, rows, klass = 'report-data-table') => `<div class="table-scroll"><table class="${klass}"><thead><tr>${heads.map((h, i) => `<th${i && numericHead(h) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;
const ma = r => `${r.above20 ?? r.aboveMa20 ? '<span class="up">20MA ▲</span>' : '<span class="dn">20MA ▼</span>'} ${r.above50 ?? r.aboveMa50 ? '<span class="up">50MA ▲</span>' : '<span class="dn">50MA ▼</span>'} ${r.above200 ?? r.aboveMa200 ? '<span class="up">200MA ▲</span>' : '<span class="dn">200MA ▼</span>'}`;
const judgment = r => {
  const a20 = r.above20 ?? r.aboveMa20, a50 = r.above50 ?? r.aboveMa50, a200 = r.above200 ?? r.aboveMa200;
  if (a20 && a50 && a200 && r.rsi14 >= 60) return '強勢趨勢';
  if (a20 && a50 && a200) return '上升趨勢';
  if (!a20 && a50 && a200) return '短線回吐';
  if (!a20 && !a50 && a200) return '中期承壓';
  if (!a20 && !a50 && !a200) return '弱勢';
  return '混合';
};
const techRow = r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`), numTd(pct(r.fiveDayPct), r.fiveDayPct), numTd(pct(r.oneMonthPct), r.oneMonthPct), numTd(pct(r.distanceFrom52wHighPct), r.distanceFrom52wHighPct), td(ma(r)), numTd(n(r.rsi14)), td(judgment(r))];
const techTable = rows => table(['ETF','5日','1月','距52週高','20/50/200MA','RSI','判斷'], rows.map(techRow), 'report-data-table etf-technical-table');

const moverInfo = {
  NOW:['企業軟體相對強勢，屬板塊輪動。','與 CRM／ORCL 同步，XSW 短線最強。','守 VWAP 才保留多頭。'],
  ADBE:['大型軟體補漲，未見單一硬催化。','支撐軟體強、晶片弱的分化。','量能較小，避免追第一段。'],
  CRM:['企業軟體資金回流。','與 NOW／ORCL 共振。','失守 VWAP 即降級。'],
  PANW:['資安軟體跟隨應用軟體走強。','CIBR／XSW 的強勢敘事延續。','需觀察開盤量價能否延續。'],
  ORCL:['雲端與企業軟體相對強勢。','強化大型軟體承接。','若 QQQ 轉弱仍需縮倉。'],
  IBM:['大型科技偏防守的資金承接。','有利 DIA 強於 QQQ。','守住盤前低點。'],
  PLTR:['盤後財報前的事件溢價。','市場預期已高，波動風險大。','不以盤前上漲取代財報情景管理。'],
  MSFT:['權重軟體承接，抵銷部分晶片跌勢。','QQQ 近乎持平的主要支撐之一。','失守 VWAP 則軟體主線降級。'],
  CRCL:['加密與高 beta 風險偏好轉弱。','與 IBIT 盤前下跌相互確認。','未收回 VWAP 前不抄底。'],
  MU:['中國記憶體供給競爭升溫。','拖累 SNDK 與整條記憶體鏈。','需 MU／SNDK 同時收回 VWAP。'],
  SNDK:['跟隨記憶體競爭疑慮下跌。','高成交量確認不是孤立跳價。','未收回 VWAP 前維持防守。'],
  ARM:['晶片 beta 跟隨記憶體賣壓。','SMH 盤前弱勢擴散。','反彈不追，等候開盤確認。'],
  MRVL:['AI／網通晶片同步承壓。','半導體弱勢不只記憶體。','站回 VWAP 才視為修復。'],
  AMAT:['設備鏈跟跌。','與 LRCX／KLAC 同步，供應鏈讀穿偏空。','等待設備鏈整體止跌。'],
  AMD:['AI beta 回落。','QQQ 平、SMH 弱的分化核心。','守住週預期下界前不擴大風險。'],
  INTC:['高成交量晶片賣壓。','半導體弱勢擴散至成熟製程。','量價未背離前不逆勢。']
};
const moverTickers = ['NOW','ADBE','CRM','PANW','ORCL','IBM','PLTR','MSFT','CRCL','MU','SNDK','ARM','MRVL','AMAT','AMD','INTC'];
const moverTableRows = moverTickers.map(t => {
  const r = movers[t] || pre[t];
  if (!r || !(r.price > 0)) throw new Error(`缺少有效盤前異動資料：${t}`);
  const m = moverInfo[t];
  return `<tr><td><strong class="ticker-nowrap">${t}</strong></td><td class="num">${n(r.price)}</td><td class="num ${cls(r.changePct)}">${pct(r.changePct)}</td><td>${m[0]}<small>長橋盤前量 ${vol(r.volume)}</small></td><td>${m[1]}</td><td>${m[2]}</td></tr>`;
}).join('');

const sectorTickers = ['SPY','XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLK','XLU','XLRE','XLB'];
const sectors = sectorTickers.map(t => close[t]).filter(Boolean).sort((a,b) => b.rsi14 - a.rsi14);
const thematic = [...thematicRowsRaw.filter(r => r.ticker !== 'SPY'), {...close.SPY, aboveMa20:close.SPY.above20, aboveMa50:close.SPY.above50, aboveMa200:close.SPY.above200}]
  .filter((r, i, a) => a.findIndex(x => x.ticker === r.ticker) === i)
  .sort((a,b) => b.rsi14 - a.rsi14);
const chartRows = ['XOP','FXI','KWEB','XLE','XSW','SPY','SMH','REMX'].map(t => {
  const r = t === 'SPY' || t === 'XLE' ? close[t] : thematic.find(x => x.ticker === t);
  const v = r.oneMonthPct;
  return `<div class="bar-row"><span class="lbl">${t}</span><span class="val ${v >= 0 ? 'pos' : 'neg'}">${pct(v)}</span><div class="bar-track"><span class="b ${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(v) / 25 * 48).toFixed(2)}%"></span></div></div>`;
}).join('');

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<strong>S&amp;P Global 製造業 PMI 終值</strong><small>09:45 ET｜待公布</small>'),numTd('待公布'),numTd('—'),numTd('53.8'),td(badge('待公布','blue'))],
  [td('<strong>ISM 製造業 PMI</strong><small>10:00 ET｜待公布</small>'),numTd('待公布'),numTd('54.0'),numTd('53.3'),td(badge('核心事件','amber'))],
  [td('<strong>ISM 價格支付</strong><small>10:00 ET｜待公布</small>'),numTd('待公布'),numTd('—'),numTd('73.0'),td(badge('通膨觀察','amber'))],
  [td('<strong>建築支出 MoM</strong><small>10:00 ET｜待公布</small>'),numTd('待公布'),numTd('+0.2%'),numTd('+0.1%'),td(badge('待公布','blue'))],
  [td('<strong>PLTR 財報</strong><small>盤後｜2026 Q2</small>'),numTd('待公布'),numTd('EPS 0.31<br>營收 1.81B'),numTd('EPS 0.34<br>營收 1.63B'),td(badge('待公布','blue'))],
  [td('<strong>ON 財報</strong><small>盤後｜2026 Q2</small>'),numTd('待公布'),numTd('EPS 0.66<br>營收 1.59B'),numTd('GAAP EPS -0.08<br>營收 1.51B'),td(badge('待公布','blue'))]
], 'report-data-table macro-results-table');

const checklist = [
  ['S&amp;P 500 overextension／大盤過度延伸','Low','SPY 距 50MA +0.31 ATR','未達向上過熱，不能以接近高位單獨判空。','low'],
  ['Increasing downward momentum／下行動能增加','High','SMH 盤前 -1.92%；MU／SNDK -4%以上','記憶體、AI 晶片與設備鏈同步走弱。','high'],
  ['Top range breakdown／高位區間破位','Intermediate','QQQ／SMH 仍低於 20MA、50MA','SPY／DIA 尚未同步破位。','mid'],
  ['Technical deterioration／技術惡化','Intermediate','四大 ETF 僅 SPY／DIA 高於 20MA、50MA','QQQ／IWM 仍須確認收復。','mid'],
  ['Market breadth worsening／市場廣度惡化','High','SPX 20MA 53.28%；IWM 20MA 43.93%','Stockbee 5D／10D 低於 1，中期弱股多於強股。','high'],
  ['VIX >20／波動升溫','Low','VIX 16.10；五項分數 0/5','>20 0/1、5日>0 0/1、1月>0 0/1、20MA 0/1、50MA 0/1。','low'],
  ['Breakout win rate down／突破勝率下降','Intermediate','Stockbee 5D 0.98、10D 0.91','極端跌勢緩和，但延續率未回到 1 以上。','mid'],
  ['Theme momentum weakening／主題動能轉弱','High','SMH 1月 -12.88%，盤前再跌','半導體主線繼續惡化；軟體強勢只是內部分化。','high']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(x => `<div class="risk-check-row ${x[4]}"><div class="risk-check-name">${x[0]}</div><div class="risk-check-level">${badge(x[1], x[4] === 'high' ? 'red' : x[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${x[2]}</strong><small>${x[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist Score：3/8 High＝Intermediate Risk。</strong>VIX 機械分數雖只有 0/5，但半導體下行、廣度與主題動能三項 High，不能用低波動掩蓋結構風險。</div>`;

const major = ['IWM','DIA','SPY','QQQ'].map(t => {
  const r = close[t], p = pre[t];
  const note = t === 'QQQ' ? '仍低於 20MA／50MA；先守 VWAP，再看 701.02。' : t === 'IWM' ? '盤前回到 50MA 上方附近，需收盤確認。' : '盤前仍在 20MA／50MA 上方。';
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r)),numTd(n(r.rsi14)),td(note)];
});
const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'], major, 'report-data-table major-etf-table').replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrRows = ['RSP','XLE','DIA','SPY','IWM','GLD','VIXY','QQQ','SMH','TLT'].map(t => close[t]).filter(Boolean).sort((a,b) => b.extension50Atr - a.extension50Atr).map(r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`),numTd(n(r.close)),numTd(n(r.ma50)),numTd(n(r.atr14)),numTd(n(r.extension50Atr),r.extension50Atr),td(Math.abs(r.extension50Atr) >= 2 ? badge('延伸','amber') : badge('正常','blue'))]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows);

const breadthTable = table(['日期','SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA'], [
  ['2026-07-31','53.28','62.02','53.39','47.57','43.93','52.88'],
  ['2026-07-30','56.06','63.61','49.51','46.60','45.14','55.30'],
  ['2026-07-29','63.02','65.80','47.57','49.51','45.14','55.00']
].map(r => r.map((x,i) => td(x, i ? 'num' : ''))), 'report-data-table breadth-history-table');
const stockbeeTable = table(['日期','4% 上漲股','4% 下跌股','5D ratio','10D ratio','季度 +25%','季度 -25%','T2108'], [
  ['2026-07-31','179','216','0.98','0.91','1171','1235','47.36'],
  ['2026-07-30','437','189','0.88','0.91','1213','1196','47.50'],
  ['2026-07-29','165','552','0.65','0.76','1172','1304','48.33']
].map(r => r.map((x,i) => td(x, i ? 'num' : ''))));

const breadthDiagnosticTable = table(['指標','最新','5日趨勢','約1月趨勢','判斷'], [
  [td('SPX >20MA（7/31）'),numTd('53.28%'),td('69.18% → 53.28%'),td('62.74% → 53.28%'),td('大型股短線參與度明顯降溫。')],
  [td('SPX >50MA（7/31）'),numTd('62.02%'),td('71.57% → 62.02%'),td('61.55% → 62.02%'),td('中期底盤仍在，但集中度提高。')],
  [td('NDX >20MA（7/31）'),numTd('53.39%'),td('48.54% → 53.39%'),td('59.40% → 53.39%'),td('科技短線修復，月度仍未轉強。')],
  [td('NDX >50MA（7/31）'),numTd('47.57%'),td('51.45% → 47.57%'),td('51.48% → 47.57%'),td('科技中期廣度仍低於五成。')],
  [td('IWM >20MA（7/31）'),numTd('43.93%'),td('52.57% → 43.93%'),td('70.67% → 43.93%'),td('小型股短線廣度最弱。')],
  [td('IWM >50MA（7/31）'),numTd('52.88%'),td('61.07% → 52.88%'),td('67.44% → 52.88%'),td('中期仍過半，但緩衝快速收窄。')],
  [td('T2108（Stockbee 7/31）'),numTd('47.36%'),td('48.33% → 47.36%'),td('51.14% → 47.36%'),td('全市場長期廣度偏中性弱。')],
  [td('Stockbee 5D ratio（7/31）'),numTd('0.98'),td('0.65 → 0.98'),td('1.68 → 0.98'),td('短線修復，但尚未站上 1。')],
  [td('Stockbee 10D ratio（7/31）'),numTd('0.91'),td('0.76 → 0.91'),td('1.39 → 0.91'),td('中短線仍未確認 risk-on。')],
  [td('4%+ 上漲／下跌（7/31）'),numTd('179／216'),td('165／552 → 179／216'),td('325／157 → 179／216'),td('拋壓大幅收斂，但跌股仍較多。')],
  [td('季度 +25%／-25%（7/31）'),numTd('1171／1235'),td('1172／1304 → 1171／1235'),td('1726／1082 → 1171／1235'),td('中期強弱股結構尚未翻多。')]
], 'report-data-table report-cols-5 breadth-diagnostic-table');
const breadthDiagnosticPanel = `${breadthDiagnosticTable}<p><strong>三大指數廣度：</strong>NDX >20MA 短線回升至 53.39%，但 SPX 與 IWM 的 20／50MA 廣度同步降溫；IWM >20MA 僅 43.93%，三者尚未形成一致擴散。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D／10D ratio 回升至 0.98／0.91，顯示極端拋壓收斂；但兩者仍低於 1，4%+ 下跌股仍多於上漲股，季度弱股也多於強股。</p><p class="section-summary"><strong>綜合結論：</strong>短線由極弱修復到中性偏弱，中期仍是價格強於廣度。不能只看 NDX 短線改善，也不能只看 Stockbee；需等待三大指數至少兩組改善且 5D ratio 站上 1。</p>`;

const fxKeys = ['FXE','FXB','FXY','USDU','XAU','XAG','COPPER','CL','BTC'];
const fxMeaning = {
  FXE:'1月 +1.47%、RSI 62.99，位於 20／50MA 上方但仍低於 200MA；歐元中短線偏強、長期尚未完全翻多，美元弱勢有利美企海外收入換算。',
  FXB:'1月 +1.66%、RSI 61.25，站上 20／50／200MA；英鎊趨勢完整偏強，與弱美元方向一致，對風險資產屬溫和順風。',
  FXY:'1月 +2.18%、RSI 69.89，位於 20／50MA 上方、接近過熱區；日圓走強若加速，可能代表套息交易收縮，對高 beta 美股偏不利。',
  USDU:'1月 -1.12%、RSI 40.07，低於 20／50MA但仍高於 200MA；美元短中線偏弱，DXY 未破 102，科技估值暫無美元端逆風。',
  XAU:'1月 +0.25%、RSI 45.80，位於三條均線下方；黃金月線近持平但技術仍弱，盤前反彈尚不能視為避險趨勢重啟。',
  XAG:'1月 -2.28%、RSI 43.99，位於三條均線下方；白銀弱勢延續，貴金屬與工業需求兩端都未確認 risk-on。',
  COPPER:'1月 +6.32%、RSI 59.24，站上 20／50／200MA；銅價趨勢偏強且未過熱，對全球需求與週期股提供正向確認。',
  CL:'1月 +25.08%、RSI 55.62，站上 20／50／200MA；收盤趨勢仍強，但盤前油價代理急跌顯示事件溢價回吐，需等是否跌破均線再判定反轉。',
  BTC:'1月 +4.82%、RSI 45.04，卻位於三條均線下方；月度報酬與技術趨勢背離，加密流動性 beta 尚未確認全面 risk-on。'
};
const fxRows = fxKeys.map(k => macro[k]).filter(Boolean).map(r => [td(`<strong class="ticker-nowrap">${r.key}</strong>`),numTd(n(r.close)),numTd(pct(r.dailyPct),r.dailyPct),numTd(pct(r.oneMonthPct),r.oneMonthPct),numTd(n(r.rsi14)),td(fxMeaning[r.key])]);
const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong class="dn">99.78</strong><small>約 -1.02%；低於 102 風控門檻</small></div><div><span>原油代理</span><strong class="dn">USO -6.77%</strong><small>美伊風險溢價快速回吐</small></div><div><span>黃金代理</span><strong class="up">GLD +0.32%</strong><small>美元走弱提供支撐</small></div></div>${table(['資產','7/31收盤','1日','1月','RSI','趨勢／RSI 含義'],fxRows,'report-data-table report-cols-6 fx-trend-table')}`;

const bondRows = ['SHY','IEF','TLT'].map(t => {
  const r = pre[t], label = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'}[t];
  const signal = t === 'TLT' ? '長端反彈最強' : t === 'IEF' ? '中段承接' : '短端近持平';
  return [td(`<strong>${t}｜${label}</strong>`),numTd(n(r.price)),numTd(pct(r.changePct),r.changePct),td(t === 'SHY' ? '政策路徑' : t === 'IEF' ? '政策＋中期通膨' : '長期通膨＋期限溢價＋財政'),td(badge(signal,t === 'TLT' ? 'green' : 'blue')),td(t === 'TLT' ? '長端升幅大於短端，先視為油價急跌後的期限溢價修復。' : '與長端比較判讀，不單看自身漲跌。')];
});
const bondTable = table(['期限代理','盤前','盤前變化','主要定價','訊號','判斷'], bondRows, 'report-data-table report-cols-6');

const expectedRows = [
  ['DIA','529.58','531.57','517.07','距 +1SD 約 -0.37%','接近上界，等待開盤確認'],
  ['SPY','750.50','757.43','736.63','區間內','未觸發'],
  ['QQQ','688.12','706.47','669.51','區間內','未觸發'],
  ['IWM','293.05','296.94','285.46','區間內','未觸發'],
  ['SMH','530.18','574.93','506.13','區間內','未觸發'],
  ['PLTR','125.76','137.44','108.68','財報前區間內','盤後事件風險']
].map(r => r.map((x,i) => td(i === 0 ? `<strong class="ticker-nowrap">${x}</strong>` : x, i > 0 && i < 4 ? 'num' : '')));
const expectedTable = table(['ETF','盤前','+1SD','-1SD','狀態','行動'], expectedRows);

const tradeRows = ['DIA','SPY','IWM','QQQ','SMH','XSW','USO','TLT'].map(t => {
  const r = close[t], p = pre[t] || null;
  const action = t === 'DIA' ? '接近週 +1SD 531.57，不追第一段。' : t === 'QQQ' ? '守 VWAP 後再挑戰 20MA 701.02。' : t === 'SMH' ? '未收回 VWAP 前只做防守。' : t === 'USO' ? '急跌後不逆勢抄底，等油價止穩。' : t === 'TLT' ? '觀察長端反彈能否延續至數據公布後。' : '以 VWAP 與盤前低點管理。';
  const quoteCell = p ? numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct) : numTd(`${n(r.close)}<br>無有效盤前成交`);
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),quoteCell,numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r)),td(action)];
});

const data = {
  report_title:'2026-08-03｜美股盤前監控', report_eyebrow:'2026-08-03｜盤前更新',
  report_heading:'軟體承接、晶片與能源走弱；10:00 ISM 決定利率與風格能否同向',
  qqq_reengage_20ma:'701.02', qqq_breakout_add_1sd:'706.47',
  data_timestamp_note:'長橋盤前快照約截至 08:00 ET；RSI、均線、ATR、三大指數廣度與 Stockbee 截至 7/31 收盤。DXY 由 Yahoo Finance 即時資料補足；Sector Dashboard、Thematic Sectors、Macro 為三個主資料表。',
  risk_badge:'中等風險｜Checklist 3/8、VIX 0/5、半導體與能源分化',
  summary_cards:`<div class="card"><span>DIA／SPY／QQQ</span><strong><span class="up">+1.00%</span>／<span class="up">+0.46%</span>／<span class="up">+0.02%</span></strong><small>道指領先，科技權重僅持平。</small></div><div class="card"><span>SMH／MU／SNDK</span><strong><span class="dn">-1.92%</span>／<span class="dn">-4.74%</span>／<span class="dn">-4.50%</span></strong><small>記憶體競爭疑慮向晶片鏈擴散。</small></div><div class="card"><span>XSW／軟體</span><strong><span class="up">NOW +3.84%</span></strong><small>CRM、PANW、ORCL 同步承接。</small></div><div class="card"><span>DXY／USO／TLT</span><strong><span class="dn">99.78</span>／<span class="dn">-6.77%</span>／<span class="up">+0.50%</span></strong><small>油價風險溢價回吐，長債反彈。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才由中等風險轉向進攻：指數確認、晶片止跌、廣度與債券同向。',
  upgrade_trigger_1:'QQQ 守住 VWAP 並收回 20MA 701.02；SMH 同時收回 VWAP。',
  upgrade_trigger_2:'ISM 不高於 54、價格支付低於 73；TLT 保持強勢、DXY 留在 102 下方。',
  upgrade_trigger_3:'NDX／IWM >20MA 回到 50%以上，Stockbee 5D／10D 同站 1 以上。',
  downgrade_trigger_rule:'任一觸發即轉防守：晶片擴散、ISM 再通膨、廣度惡化。',
  downgrade_trigger_1:'MU／SNDK／SMH 跌破盤前低點且成交量擴大。',
  downgrade_trigger_2:'ISM >54 且價格支付不低於 73，TLT 由漲轉跌。',
  downgrade_trigger_3:'QQQ 跌破 669.51 週 -1SD，或 IWM 跌回 285.46。',
  core_conclusions:`<ol><li><strong>盤前不是全面 risk-on，而是道指／軟體強、晶片／能源弱的劇烈分化。</strong>DIA +1.00%、SPY +0.46%，QQQ 幾乎持平；軟體漲幅被半導體跌勢抵銷。</li><li><strong>記憶體賣壓有事件催化與成交量。</strong>MU -4.74%、SNDK -4.50%，長橋新聞指向中國記憶體產能競爭升溫；INTC、AMD、MRVL 與設備鏈同步走弱，已超出單一股票。</li><li><strong>能源急跌來自地緣風險溢價回吐。</strong>美國暫緩對伊朗新一輪攻擊並尋求核協議，USO -6.77%、XOM -1.13%、COP -1.81%；這對通膨尾端與長債短線有利，但 XLE 月線仍偏強。</li><li><strong>10:00 ET 的 ISM 是今日主風險。</strong>共識 54.0、前值 53.3；價格支付前值 73.0。成長強而價格再熱，最不利長久期科技；溫和成長配合價格降溫，才有利軟體強勢延續。</li><li><strong>長端反彈快於短端。</strong>SHY +0.05%、IEF +0.27%、TLT +0.50%，與油價急跌、DXY 99.78 相互確認，但仍須等待 ISM 後的收益率反應。</li><li><strong>廣度仍未證明全面修復。</strong>NDX >20MA 回到 53.39%，但 NDX >50MA 僅 47.57%、IWM >20MA 僅 43.93%；Stockbee 5D 0.98、10D 0.91，短線接近中性而中期仍弱。</li></ol><p class="section-summary"><strong>本段結論：</strong>今日主線是「軟體相對多、半導體與能源防守」，但 10:00 ET 後必須重新看 TLT、DXY、QQQ 與廣度是否同向。</p>`,
  positioning_primary:'主線：軟體相對強勢只在 NOW／CRM／PANW／ORCL 守 VWAP 時成立。',
  positioning_secondary:'次線：DIA／防守板塊優於 QQQ／SMH；能源急跌先視為風險溢價回吐。',
  positioning_watch:'觀察：ISM 54.0、價格支付 73.0、QQQ 701.02、DIA +1SD 531.57、DXY 102、TLT 盤前高點。',
  positioning_invalidation:'SMH 收回 VWAP 且 ISM 價格支付降溫，晶片防守主線失效；反之軟體失 VWAP 則相對多頭失效。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>上漲榜集中企業軟體，下跌榜集中記憶體、AI 晶片與設備鏈；成交量較高的 MU、SNDK、INTC、PLTR 支持分化有效，低量跳價不列入主榜。</p>',
  section_pre_market_movers_primary_action:'主線：交易軟體相對強勢與晶片相對弱勢，不追單一低量跳價。',
  section_pre_market_movers_condition_action:'條件：同板塊至少兩檔守住／失守 VWAP 才確認。',
  section_pre_market_movers_avoid_action:'避免：把 QQQ 近乎持平解讀為科技全面穩定。',
  premarket_movers_invalidation:'SMH、MU、SNDK 同時收回 VWAP，或軟體核心集體失守 VWAP。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：3/8 High，維持中等風險與相對價差思維。',
  section_correction_checklist_condition_action:'條件：High 項降至 2 項以下且廣度修復才升級。',
  section_correction_checklist_avoid_action:'避免：因 VIX 0/5 就忽略晶片、廣度與主題三項 High。',
  checklist_invalidation:'若晶片止跌、NDX／IWM 廣度同升且 Stockbee 比率站上 1，風險可下調。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>ISM 情景：</strong>① PMI &gt;54 且價格支付 ≥73：長端收益率與 DXY 易反彈，壓縮 QQQ／軟體估值；② PMI 50–54 且價格支付 &lt;73：最接近金髮女孩，TLT 與軟體可延續；③ PMI &lt;50 或就業明顯低於 49.7：轉成成長疑慮，債券受益但 IWM／XLF／工業承壓。</div><p class="section-summary"><strong>本段結論：</strong>宏觀數據尚未公布，不提前填 Actual；PLTR／ON 盤後財報也維持待公布，公布後再用 EPS 與營收雙項判定 Beat／Miss。</p>`,
  section_macro_premarket_background_primary_action:'主線：10:00 ET 同時看 ISM 總指數、價格支付與 TLT／DXY 反應。',
  section_macro_premarket_background_condition_action:'條件：數據溫和且價格降溫，才提高軟體與長久期風險。',
  section_macro_premarket_background_avoid_action:'避免：用總指數單一數字忽略價格支付與就業分項。',
  macro_invalidation:'ISM 強於 54 且價格支付 ≥73，同時 TLT 轉跌，偏多宏觀情景失效。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜長橋 44 檔＋SPY 基準，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${thematicRowsRaw.length}" data-report-count="${thematic.length}" data-benchmark="SPY" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>XLE 月線仍強但盤前遭油價急跌反向衝擊；XSW／IGV 的軟體強勢獲盤前驗證，SMH／AIQ／ARKK 仍在弱勢端。完整 45 檔保留，SPY 僅出現一次作基準。</p>`,
  section_sector_thematic_etf_primary_action:'主線：優先比較 XSW／IGV 與 SMH／AIQ 的相對強弱。',
  section_sector_thematic_etf_condition_action:'條件：XSW 守強且 SMH 不收回 VWAP，分化交易才成立。',
  section_sector_thematic_etf_avoid_action:'避免：以 XLE 月線強勢忽略今日原油急跌。',
  sector_etf_invalidation:'SMH 收回 VWAP並領先 XSW，或油價迅速收復跌幅，需重排主題。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 只看 IWM、DIA、SPY、QQQ；DIA 最強並接近週 +1SD，QQQ 仍低於 20MA／50MA，IWM 盤前只是在 50MA 附近。</p>`,
  section_major_etf_technical_primary_action:'主線：DIA／SPY 相對強，QQQ 先以 701.02 為重新進攻門檻。',
  section_major_etf_technical_condition_action:'條件：QQQ 守 VWAP且收回 701.02，才由相對弱勢轉修復。',
  section_major_etf_technical_avoid_action:'避免：DIA 接近週 +1SD 時追第一段。',
  major_etf_invalidation:'QQQ 跌破 669.51 週 -1SD 或 DIA 失守盤前低點。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>TLT -4.06 ATR、SMH -1.99 ATR、QQQ -1.75 ATR 仍在 50MA 下方；XLE +2.55 ATR 與 RSP +1.77 ATR 位於上方，今日油價急跌令 XLE 的延伸風險升高。</p>`,
  section_50ma_atr_extension_primary_action:'主線：不追兩端延伸，等候價格向 50MA 收斂。',
  section_50ma_atr_extension_condition_action:'條件：QQQ／SMH 的負延伸收窄、TLT 延伸止跌才提高久期。',
  section_50ma_atr_extension_avoid_action:'避免：只因跌深就假設均值回歸。',
  atr_extension_invalidation:'若 SMH／QQQ 負延伸擴大且 XLE 由正轉負，風險再升級。',
  market_breadth_table:breadthDiagnosticPanel,
  stockbee_breadth_interpretation:'<div class="callout warn"><strong>綜合廣度：</strong>7/24→7/31，NDX >20MA 由 32.03% 升至 53.39%，但 NDX >50MA 仍只有 47.57%；IWM >20MA 由 39.79% 升至 43.93%，仍低於中性線；SPX >20MA 由 55.06% 降至 53.28%。Stockbee 5D／10D 為 0.98／0.91，季度 +25%／-25% 為 1171／1235、T2108 47.36。結論是科技短線修復、小型股與中期廣度仍弱，並非只有 Stockbee 的單一敘事。</div>',
  section_market_breadth_primary_action:'主線：同時看 SPX、NDX、IWM 與 Stockbee，等待四組共同改善。',
  section_market_breadth_condition_action:'條件：NDX／IWM >50MA 站上 50%，且 5D／10D ratio 站上 1。',
  section_market_breadth_avoid_action:'避免：只因 NDX >20MA 回到 50% 就宣布全面修復。',
  breadth_invalidation:'若指數上漲但 SPX／IWM 廣度續降，視為權重股驅動。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>外匯端由 FXE／FXB／FXY 的 RSI 61–70 與 USDU RSI 40.07 共同確認美元短中線偏弱；商品端只有 COPPER 維持均線多頭，XAU／XAG／BTC 技術仍弱。CL 收盤趨勢雖強，盤前油價代理急跌顯示事件溢價回吐，必須等待均線是否失守再判定反轉。</p>`,
  section_fx_commodities_primary_action:'主線：以 DXY、USO、TLT 三者交叉驗證通膨與久期。',
  section_fx_commodities_condition_action:'條件：DXY <102、USO 不收回半數跌幅、TLT 守漲幅。',
  section_fx_commodities_avoid_action:'避免：把油價急跌直接等同經濟衰退。',
  forex_commodity_invalidation:'USO 快速收復半數跌幅且 DXY 轉強，通膨壓力情景重新升級。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.23%</strong><small>7/30，較政策中點高約 61bp</small></div><div><span>美國 10Y</span><strong>4.68%</strong><small>7/30；期限溢價仍高</small></div><div><span>DXY</span><strong class="dn">99.78</strong><small>低於 102 風控門檻</small></div><div><span>TLT 盤前</span><strong class="up">+0.50%</strong><small>長端反彈快於短端</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>Fed 傳導：</strong>7/29 FOMC 維持 3.50%–3.75%，表決 9–3，三位異議支持降息 25bp。今日油價急跌暫時降低通膨尾端，但政策能否轉鬆仍取決於 ISM 的價格與就業分項；TLT 若在 10:00 後保住漲幅，才算長端壓力實質緩和。</div>`,
  section_treasury_fed_primary_action:'主線：看長端反彈是否能跨過 ISM 公布時點。',
  section_treasury_fed_condition_action:'條件：TLT 維持領先 IEF／SHY，DXY <102，政策條件才改善。',
  section_treasury_fed_avoid_action:'避免：以油價單日急跌取代 Fed 的完整反應函數。',
  treasury_invalidation:'ISM 再通膨、TLT 轉跌且 DXY 反彈，長端緩和情景失效。',
  trading_plan:`${table(['ETF','盤前','20MA','50MA','狀態','行動'],tradeRows)}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>DIA 已接近週 +1SD 531.57，其餘主要 ETF 尚未觸發 ±1SD；PLTR 盤後財報前仍在 108.68–137.44 的週區間內。未觸發者不列為突破交易，接近上界者先等開盤確認。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','軟體核心守 VWAP、SMH 未收回 VWAP','板塊分化延續','保留軟體相對多／晶片相對空。'],
    ['09:30 ORB','DIA 接近或突破 531.57','觸及週 +1SD','不追第一段，等回踩確認。'],
    ['10:00 ET','ISM 50–54、價格支付 <73','成長溫和且通膨降溫','提高 TLT 與軟體風險預算。'],
    ['10:00 ET','ISM >54、價格支付 ≥73','再通膨情景','降低 QQQ／軟體久期，觀察 DXY 與 TLT。'],
    ['10:00 ET','ISM <50 或就業明顯低於 49.7','成長疑慮','債券偏多，降低 IWM／XLF／工業。'],
    ['15:30 MOC','廣度未跟隨指數上漲','仍是權重／板塊輪動','縮減隔夜曝險，PLTR 財報前不加碼。']
  ].map(r => `<tr>${r.map(x => td(x)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout warn"><strong>異動交叉：</strong>長橋即時行情顯示 MU／SNDK 高量下跌，長橋新聞確認中國記憶體產能競爭升溫；不是把舊收盤資料當盤前。</div><div class="callout risk"><strong>能源交叉：</strong>USO -6.77%、XOM／COP 同跌，長橋新聞與 AP 均指向美伊衝突風險溢價回吐；TLT 與 GLD 同步反彈。</div><div class="callout"><strong>風格交叉：</strong>DIA +1.00%、QQQ +0.02%、SMH -1.92%，而 NOW／CRM／PANW 上漲；證明是軟體／防守領先、晶片落後，不是科技整體走強。</div><div class="callout"><strong>廣度交叉：</strong>NDX 短線廣度修復，但 IWM 20MA 廣度與 Stockbee 10D ratio 仍弱；指數與廣度尚未同向。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-08-03 約 08:00 ET 盤前價格、成交量與新聞，及截至 2026-07-31 的 RSI／MA／ATR；<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Weekly Expected Move、Data QA</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee 廣度工作簿</a>；<a href="https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/june/">ISM：六月製造業報告與 8/3 發布時間</a>；<a href="https://apnews.com/article/d19a8f9a77b6fceca41da3e4b6bf17aa">AP：油價與美伊事件</a>；Yahoo Finance：DXY 即時資料。</p><p class="source-note">本報告為 2026-08-03 美股盤前更新，不構成投資建議。宏觀 Actual 與盤後財報均未提前填值；發布前已完成資料、內容與版面 QA。</p>`,
  sector_momentum_chart:chartRows
};

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', chartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(m => m[1]);
if (unresolved.length) throw new Error(`未解析欄位：${unresolved.join(', ')}`);
html = normalizeReportHtml(html, {reportType:'premarket'});
const validationErrors = validateReportHtml(html, {reportType:'premarket'});
if (validationErrors.length) throw new Error(`嚴格驗證失敗：\n${validationErrors.join('\n')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-03-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-03-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-03-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,unresolved:unresolved.length}, null, 2));
