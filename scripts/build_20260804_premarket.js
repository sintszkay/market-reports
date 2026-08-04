#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const closeRows = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-08-03.json'), 'utf8')).rows;
const thematicRaw = JSON.parse(fs.readFileSync(path.join(WORK, 'thematic_rsi_longport.json'), 'utf8')).rows;
const macroRows = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8')).rows;
const preRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0804.json'), 'utf8'));
const moverRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0804.json'), 'utf8'));

const close = Object.fromEntries(closeRows.map(r => [r.ticker, r]));
const macro = Object.fromEntries(macroRows.map(r => [r.key, r]));
const pre = Object.fromEntries(preRows.map(r => [r.ticker, r]));
const movers = Object.fromEntries(moverRows.map(r => [r.ticker, r]));

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (v, d = 2) => Number(v).toFixed(d);
const pct = (v, d = 2) => `${Number(v) >= 0 ? '+' : ''}${n(v, d)}%`;
const cls = v => Number(v) > 0 ? 'up' : Number(v) < 0 ? 'dn' : '';
const td = (value, klass = '') => `<td${klass ? ` class="${klass}"` : ''}>${value}</td>`;
const numTd = (value, direction = null) => td(value, `num${direction === null ? '' : ` ${cls(direction)}`}`);
const badge = (text, tone = 'blue') => `<span class="badge ${tone}">${text}</span>`;
const table = (heads, rows, klass = 'report-data-table', numeric = []) => `<div class="table-scroll"><table class="${klass}"><thead><tr>${heads.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;
const vol = v => Number(v) >= 1e4 ? `${n(Number(v) / 1e4, 1)}萬股` : `${Number(v).toLocaleString('zh-HK')}股`;
const ma = r => {
  const a20 = r.above20 ?? r.aboveMa20;
  const a50 = r.above50 ?? r.aboveMa50;
  const a200 = r.above200 ?? r.aboveMa200;
  return `<span class="ticker-nowrap">${a20 ? '<span class="up">20MA ▲</span>' : '<span class="dn">20MA ▼</span>'} ${a50 ? '<span class="up">50MA ▲</span>' : '<span class="dn">50MA ▼</span>'} ${a200 ? '<span class="up">200MA ▲</span>' : '<span class="dn">200MA ▼</span>'}</span>`;
};
const judgment = r => {
  const a20 = r.above20 ?? r.aboveMa20, a50 = r.above50 ?? r.aboveMa50, a200 = r.above200 ?? r.aboveMa200;
  if (a20 && a50 && a200 && r.rsi14 >= 60) return '強勢趨勢';
  if (a20 && a50 && a200) return '上升趨勢';
  if (!a20 && a50 && a200) return '短線回吐';
  if (!a20 && !a50 && a200) return '中期承壓';
  if (!a20 && !a50 && !a200) return '弱勢';
  return '混合';
};
const techRow = r => [
  td(`<strong class="ticker-nowrap">${r.ticker}</strong>`),
  numTd(pct(r.fiveDayPct), r.fiveDayPct), numTd(pct(r.oneMonthPct), r.oneMonthPct),
  numTd(pct(r.distanceFrom52wHighPct), r.distanceFrom52wHighPct), td(ma(r), 'ma-cell'),
  numTd(n(r.rsi14)), td(judgment(r))
];
const techTable = rows => table(['ETF','5日','1月','距52週高','20/50/200MA','RSI','判斷'], rows.map(techRow), 'report-data-table etf-technical-table', [1,2,3,5]);

const moverMeta = {
  PLTR:['財報雙項大幅優於預期，全年與第三季指引同步上修。','AI 軟體與政府／企業需求共振。','高量跳空，等開盤回踩而非追第一段。'],
  CAT:['EPS 與營收雙 Beat，三大主要事業部門全面成長。','工業、基建與電力需求擴散。','若守住盤前低點，工業領先可延續。'],
  MRVL:['晶片風險偏好跟隨 PLTR／CAT 後的成長交易回升。','推升 SMH 與網通晶片鏈。','仍屬板塊 beta，須守 VWAP。'],
  SNDK:['記憶體鏈由前一日賣壓轉為強力反彈。','與 MU／INTC 同步，確認不是孤立跳價。','高波動反彈，開盤量價確認優先。'],
  LRCX:['半導體設備鏈修復。','與 AMAT／KLAC 同向，支持 SMH 反彈。','守 VWAP 才保留多頭。'],
  ARM:['AI 晶片 beta 回升。','與 AMD／NVDA 同步，科技內部偏晶片。','避免在盤前高點追價。'],
  INTC:['高成交量晶片反彈。','記憶體與成熟製程同步修復。','量能最大之一，失守 VWAP 即降級。'],
  MU:['記憶體鏈反彈並收復部分前一日跌幅。','與 SNDK／INTC 共振。','需觀察是否形成持續性而非單日回補。'],
  AMAT:['設備鏈跟隨半導體回升。','與 LRCX／KLAC 同步。','成交量較小，等開盤確認。'],
  KLAC:['半導體設備同步走強。','強化 SMH 盤前領先。','不單靠盤前百分比追價。'],
  NKE:['消費品相對弱勢。','拖累 XLY 內部廣度。','未收回 VWAP 前維持防守。'],
  AMZN:['大型消費科技承壓。','令 QQQ 上漲更依賴晶片而非全科技。','高量下跌，反彈須先收回 VWAP。'],
  NOW:['企業軟體延續壓力。','與 CRM／ADBE 同向，XSW 強勢受到挑戰。','軟體弱勢需與晶片強勢對沖觀察。'],
  CRM:['企業軟體走弱。','確認不是 NOW 單一股票事件。','失守盤前低點則軟體相對弱勢延續。'],
  MSFT:['大型軟體權重承壓。','使 QQQ 內部分化加劇。','若未收復 VWAP，不把指數上漲視為全面科技走強。'],
  ADBE:['應用軟體跟跌。','與 NOW／CRM 共振，XSW 開盤是驗證重點。','低量反彈不改變主線。']
};
const moverTickers = ['PLTR','CAT','MRVL','SNDK','LRCX','ARM','INTC','MU','AMAT','KLAC','NKE','AMZN','NOW','CRM','MSFT','ADBE'];
const moverTableRows = moverTickers.map(t => {
  const r = movers[t] || pre[t];
  if (!r || !(r.price > 0)) throw new Error(`缺少盤前異動資料：${t}`);
  const m = moverMeta[t];
  return `<tr><td><strong class="ticker-nowrap">${t}</strong></td><td class="num">${n(r.price)}</td><td class="num ${cls(r.changePct)}">${pct(r.changePct)}</td><td>${m[0]}<small>${vol(r.volume)}</small></td><td>${m[1]}</td><td>${m[2]}</td></tr>`;
}).join('');

const sectorTickers = ['SPY','XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLK','XLU','XLRE','XLB'];
const sectors = sectorTickers.map(t => close[t]).filter(Boolean).sort((a,b) => b.rsi14 - a.rsi14);
const thematic = [...thematicRaw.filter(r => r.ticker !== 'SPY'), {...close.SPY, aboveMa20:close.SPY.above20, aboveMa50:close.SPY.above50, aboveMa200:close.SPY.above200}]
  .filter((r, i, a) => a.findIndex(x => x.ticker === r.ticker) === i)
  .sort((a,b) => b.rsi14 - a.rsi14);
const findTheme = t => t === 'SPY' || close[t] && ['XLE','SMH'].includes(t) ? close[t] : thematic.find(r => r.ticker === t);
const chartRows = ['FXI','KWEB','XLE','XSW','CIBR','SPY','SMH','REMX'].map(t => {
  const r = findTheme(t), v = r.oneMonthPct;
  return `<div class="bar-row"><span class="lbl">${t}</span><span class="val ${v >= 0 ? 'pos' : 'neg'}">${pct(v)}</span><div class="bar-track"><span class="b ${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(v) / 25 * 48).toFixed(2)}%"></span></div></div>`;
}).join('');

const checklist = [
  ['S&amp;P 500 overextension／大盤過度延伸','Low','SPY 距 50MA +1.42 ATR','仍未達極端過熱，接近新高不等於修正訊號。','low'],
  ['Increasing downward momentum／下行動能增加','Low','四大 ETF 盤前全數上漲','SMH +3.52%，下行動能暫時中止。','low'],
  ['Top range breakdown／高位區間破位','Intermediate','QQQ 收盤仍低於 50MA','SPY／DIA 接近高位，只有 QQQ 中期門檻未修復。','mid'],
  ['Technical deterioration／技術惡化','Intermediate','QQQ 高於 20MA、低於 50MA','四大 ETF 僅 QQQ 未同時站上 20／50MA。','mid'],
  ['Market breadth worsening／市場廣度惡化','Low','三大指數 20MA 廣度全數回升','Stockbee 5D／10D 已站上 1，短線擴散改善。','low'],
  ['VIX >20／波動升溫','Low','VIX 15.59；五項分數 1/5','>20 0/1、5日>0 0/1、1月>0 1/1、20MA 0/1、50MA 0/1。','low'],
  ['Breakout win rate down／突破勝率下降','Low','4% 上漲 579、下跌 76','5D 1.20、10D 1.13，突破延續率轉正。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate','SMH 1月 -7.91%，XSW +6.59%','盤前晶片急彈，但月線仍落後軟體與大盤。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(x => `<div class="risk-check-row ${x[4]}"><div class="risk-check-name">${x[0]}</div><div class="risk-check-level">${badge(x[1], x[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${x[2]}</strong><small>${x[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist Score：0/8 High＝Low Risk。</strong>結構風險已由廣度改善與低 VIX 緩和，但 10:00 ET 宏觀數據與 AMD 盤後財報仍帶來高事件密度；低風險不等於可忽略價格門檻。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<strong>美國貿易餘額</strong><small>08:30 ET｜六月</small>'),numTd('-73.3B'),numTd('-73.0B'),numTd('-77.6B'),td(badge('小幅 Miss','red'))],
  [td('<strong>JOLTS 職位空缺</strong><small>10:00 ET｜六月</small>'),numTd('待公布'),numTd('7.44M'),numTd('7.59M'),td(badge('待公布','blue'))],
  [td('<strong>工廠訂單 MoM</strong><small>10:00 ET｜六月</small>'),numTd('待公布'),numTd('+4.6%'),numTd('-1.3%'),td(badge('待公布','blue'))],
  [td('<strong>PLTR 財報</strong><small>盤後已公布｜2026 Q2</small>'),numTd('EPS 0.41<br>營收 1.935B'),numTd('EPS 0.35<br>營收 1.80B'),numTd('EPS 0.16<br>營收 1.004B'),td(badge('Beat／Beat','green'))],
  [td('<strong>CAT 財報</strong><small>盤前已公布｜2026 Q2</small>'),numTd('EPS 8.17<br>營收 20.543B'),numTd('EPS 6.20<br>營收 19.2B'),numTd('EPS 4.72<br>營收 16.569B'),td(badge('Beat／Beat','green'))],
  [td('<strong>AMD 財報</strong><small>盤後｜2026 Q2</small>'),numTd('待公布'),numTd('EPS 1.61<br>營收 11.3B'),numTd('EPS 0.48<br>營收 7.69B'),td(badge('待公布','blue'))]
], 'report-data-table macro-results-table', [1,2,3]);

const major = ['IWM','DIA','SPY','QQQ'].map(t => {
  const r = close[t], p = pre[t];
  const note = t === 'QQQ' ? '盤前已高於週 +1SD；50MA 714.51 是下一個中期門檻。' : t === 'DIA' ? '盤前逼近週 +2SD 538.81，不追第一段。' : t === 'SPY' ? '盤前突破週 +1SD 757.43，須看廣度是否跟上。' : '盤前突破週 +1SD 296.94，小型股廣度同步改善。';
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`, p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r), 'ma-cell'),numTd(n(r.rsi14)),td(note)];
});
const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'], major, 'report-data-table major-etf-table', [1,2,3,5]).replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrRows = ['RSP','XLE','DIA','SPY','IWM','XSW','QQQ','SMH','GLD','TLT'].map(t => close[t]).filter(Boolean).sort((a,b) => b.extension50Atr - a.extension50Atr).map(r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`),numTd(n(r.close)),numTd(n(r.ma50)),numTd(n(r.atr14)),numTd(n(r.extension50Atr),r.extension50Atr),td(Math.abs(r.extension50Atr) >= 2 ? badge('延伸','amber') : badge('正常','blue'))]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows, 'report-data-table', [1,2,3,4]);

const breadthRows = [
  ['SPX >20MA（8/3）','58.84%','69.18% → 58.84%','62.74% → 58.84%','較 7/31 回升，但仍低於一週前高位。'],
  ['SPX >50MA（8/3）','64.01%','71.57% → 64.01%','61.55% → 64.01%','中期廣度維持六成以上。'],
  ['NDX >20MA（8/3）','57.28%','48.54% → 57.28%','50.49% → 57.28%','科技短線廣度顯著改善。'],
  ['NDX >50MA（8/3）','49.51%','51.45% → 49.51%','51.48% → 49.51%','仍略低於五成，是主要缺口。'],
  ['IWM >20MA（8/3）','56.60%','52.57% → 56.60%','70.67% → 56.60%','較 7/31 大幅修復，小型股擴散回升。'],
  ['IWM >50MA（8/3）','60.54%','61.07% → 60.54%','67.44% → 60.54%','中期維持六成，但月度仍降溫。'],
  ['T2108（Stockbee 8/3）','52.78%','55.33% → 52.78%','51.14% → 52.78%','全市場長期廣度回到五成以上。'],
  ['Stockbee 5D ratio（8/3）','1.20','0.78 → 1.20','1.68 → 1.20','短線突破延續率重返多方。'],
  ['Stockbee 10D ratio（8/3）','1.13','0.88 → 1.13','1.39 → 1.13','中短線改善，但不及月初。'],
  ['4%+ 上漲／下跌（8/3）','579／76','341／388 → 579／76','325／157 → 579／76','極端上漲股明顯佔優。'],
  ['季度 +25%／-25%（8/3）','1305／1164','1261／1231 → 1305／1164','1726／1082 → 1305／1164','中期強股重新多於弱股。']
];
const breadthTable = table(['指標','最新','5日趨勢','約1月趨勢','判斷'], breadthRows.map(r => r.map((x,i) => td(x, i === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

const fxKeys = ['FXE','FXB','FXY','USDU','XAU','XAG','COPPER','CL','BTC'];
const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',XAU:'黃金代理',XAG:'白銀代理',COPPER:'銅代理',CL:'原油代理',BTC:'比特幣代理'};
const fxMeaning = r => {
  const a20=r.aboveMa20, a50=r.aboveMa50, a200=r.aboveMa200;
  const trend = a20 && a50 && a200 ? '均線多頭' : !a20 && !a50 && !a200 ? '均線空頭' : a20 && a50 ? '均線中短線偏強' : !a20 && !a50 ? '均線中短線偏弱' : '均線趨勢混合';
  const rsi = r.rsi14 >= 70 ? `RSI ${n(r.rsi14)} 過熱` : r.rsi14 >= 55 ? `RSI ${n(r.rsi14)} 偏強` : r.rsi14 <= 45 ? `RSI ${n(r.rsi14)} 偏弱` : `RSI ${n(r.rsi14)} 中性`;
  return `${trend}；${rsi}。${r.key === 'FXY' ? '日圓過熱，留意套息交易收縮對高 beta 的壓力。' : r.key === 'USDU' ? '與 DXY 約 99.97 共同顯示美元仍低於 102 風控門檻。' : r.key === 'CL' ? '收盤趨勢與盤前 USO -2.96% 背離，先視為油價回吐。' : ''}`;
};
const fxRows = fxKeys.map(k => macro[k]).filter(Boolean).map(r => [td(`<strong class="ticker-nowrap">${r.key}</strong><small>${fxLabels[r.key]}</small>`),numTd(n(r.close)),numTd(pct(r.dailyPct),r.dailyPct),numTd(pct(r.oneMonthPct),r.oneMonthPct),numTd(n(r.rsi14)),td(fxMeaning(r))]);
const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong>99.97</strong><small>低於 102 風控門檻</small></div><div><span>原油代理</span><strong class="dn">USO -2.96%</strong><small>盤前回吐、通膨尾端暫緩</small></div><div><span>日圓代理</span><strong class="up">FXY RSI 77.36</strong><small>過熱與套息交易風險並存</small></div></div>${table(['資產','8/3收盤','1日','1月','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table',[1,2,3,4])}`;

const bondRows = ['SHY','IEF','TLT'].map(t => {
  const p=pre[t], labels={SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const signal=t==='TLT'?'長端小幅領先，期限壓力暫緩。':t==='IEF'?'中段承接，對政策與成長均敏感。':'短端近持平，降息定價變化有限。';
  return [td(`<strong>${t}</strong><small>${labels[t]}</small>`),numTd(n(p.price)),numTd(pct(p.changePct),p.changePct),td(signal)];
});
const bondTable = table(['ETF','盤前','變化','含義'],bondRows,'report-data-table bond-curve-table',[1,2]);

const expected = {
  SPY:[757.43,767.83,736.63,760.27], QQQ:[706.47,724.95,669.51,708.019],
  IWM:[296.94,302.68,285.46,297.77], DIA:[531.57,538.81,517.07,537.67],
  SMH:[574.93,609.33,506.13,564.64], PLTR:[137.44,151.82,108.68,146.819],
  AMD:[532.39,588.62,419.92,484.64], TLT:[83.45,84.64,81.05,82.34]
};
const expectedRows = Object.entries(expected).map(([t,v]) => {
  const [up1,up2,dn1,price]=v;
  const status=price>=up2?badge('突破 +2SD','red'):price>=up1?badge('突破 +1SD','amber'):price<=dn1?badge('跌破 -1SD','red'):badge('區間內','blue');
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(n(price)),numTd(n(up1)),numTd(n(up2)),numTd(n(dn1)),td(status)];
});
const expectedTable = table(['標的','盤前','+1SD','+2SD','-1SD','狀態'],expectedRows,'report-data-table expected-move-table',[1,2,3,4]);

const tradeRows = ['DIA','SPY','IWM','QQQ','SMH','XSW','USO','TLT'].map(t => {
  const r=close[t], p=pre[t] || {price:r.close, changePct:r.dailyPct};
  const actions={DIA:'盤前接近 +2SD，不追第一段。',SPY:'守住 +1SD 757.43 才視為有效突破。',IWM:'廣度同步改善，守 296.94 可保留多頭。',QQQ:'守 +1SD 706.47，再挑戰 50MA 714.51。',SMH:'晶片領漲但月線仍弱，守 VWAP 才延續。',XSW:'軟體盤前落後晶片，留意相對強弱反轉。',USO:'盤前回吐，不逆勢抄底。',TLT:'長端僅小幅領先，等 10:00 數據確認。'};
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r),'ma-cell'),td(actions[t])];
});

const data = {
  report_title:'2026-08-04｜美股盤前監控',
  report_eyebrow:'2026-08-04｜盤前更新',
  report_heading:'晶片領漲、軟體分化；廣度修復後等待 JOLTS 與 AMD 驗證',
  qqq_reengage_20ma:'699.88', qqq_breakout_add_1sd:'706.47',
  data_timestamp_note:'長橋盤前快照約截至 09:10 ET；RSI、均線、ATR、Sector Dashboard、Thematic Sectors、Macro 與市場廣度截至 8/3 收盤。VIX 採 Cboe 正式指數，DXY 由即時指數資料補足。',
  risk_badge:'低風險結構／高事件密度｜Checklist 0/8 High、VIX 1/5',
  summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">DIA +1.21%</span></strong><small>QQQ +1.14%、IWM +0.52%、SPY +0.34%。</small></div><div class="card"><span>晶片領先</span><strong><span class="up">SMH +3.52%</span></strong><small>MRVL、SNDK、INTC、MU 同步反彈。</small></div><div class="card"><span>財報異動</span><strong><span class="up">PLTR +16.85%</span></strong><small>CAT +11.86%；兩者 EPS／營收雙 Beat。</small></div><div class="card"><span>跨資產</span><strong><span class="dn">USO -2.96%</span></strong><small>DXY 99.97；TLT +0.18%，長端小幅承接。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把低風險結構轉成進攻：突破延續、廣度擴散、宏觀與長債同向。',
  upgrade_trigger_1:'QQQ 守住 706.47 週 +1SD 並挑戰 50MA 714.51；SMH 守住 VWAP。',
  upgrade_trigger_2:'JOLTS 不高於 7.44M、工廠訂單不高於 +4.6%，TLT 維持上漲且 DXY <102。',
  upgrade_trigger_3:'NDX >50MA 回到 50%以上，Stockbee 5D／10D 維持 1 以上。',
  downgrade_trigger_rule:'任一觸發即轉防守：突破失敗、宏觀再通膨、晶片與廣度背離。',
  downgrade_trigger_1:'QQQ／SMH 失守 VWAP，PLTR／CAT 跳空回補超過一半。',
  downgrade_trigger_2:'JOLTS 明顯高於 7.59M 且工廠訂單強於 +4.6%，TLT 由漲轉跌。',
  downgrade_trigger_3:'SPY／IWM 跌回週 +1SD 下方，且 Stockbee 5D ratio 再跌破 1。',
  core_conclusions:`<ol><li><strong>盤前指數全面上漲，但科技內部不是齊漲。</strong>SMH +3.52% 領先，QQQ +1.14%；MSFT、AMZN、NOW、CRM 卻下跌，主線是晶片修復對軟體與消費科技的輪動。</li><li><strong>PLTR 與 CAT 是兩個有基本面支持的跳空。</strong>PLTR EPS 0.41／營收 1.935B，均高於 0.35／1.80B，並上修全年與第三季指引；CAT EPS 8.17／營收 20.543B，亦雙 Beat，三大主要事業部門同步成長。</li><li><strong>貿易逆差改善，但略差於預期。</strong>六月為 -73.3B，較修訂後前值 -77.6B 收窄，略差於 -73.0B 共識；單一數字不足以改變風格，10:00 ET 的 JOLTS 與工廠訂單更重要。</li><li><strong>10:00 ET 有兩個相反風險。</strong>JOLTS 明顯高於 7.59M 且工廠訂單強於 +4.6% 會提高再通膨與收益率壓力；JOLTS 接近或低於 7.44M、訂單溫和，較有利 TLT 與長久期資產。</li><li><strong>債券只給出溫和風險緩和，不是強烈降息交易。</strong>SHY +0.06%、IEF +0.16%、TLT +0.18%；2Y 4.25%、10Y 4.70%，10Y–2Y 為 +45bp，長端仍含較高期限溢價。</li><li><strong>廣度由弱轉強，但 NDX 中期仍差一步。</strong>SPX／NDX／IWM >20MA 分別為 58.84%／57.28%／56.60%，Stockbee 5D／10D 為 1.20／1.13；唯 NDX >50MA 49.51% 尚未站穩五成。</li></ol><p class="section-summary"><strong>本段結論：</strong>今日可交易的是「晶片修復與財報跳空」，但需要用 10:00 ET 後的 TLT、DXY、QQQ 與廣度確認；軟體權重下跌令全面科技 risk-on 尚未成立。</p>`,
  positioning_primary:'主線：SMH／MRVL／SNDK／MU 的晶片修復，只在守住 VWAP 與 QQQ +1SD 時成立。',
  positioning_secondary:'次線：PLTR／CAT 財報跳空具基本面支撐，但盤前已高延伸，等回踩而非追第一段。',
  positioning_watch:'觀察：JOLTS 7.44M、工廠訂單 +4.6%、QQQ 706.47／714.51、DXY 102、TLT 盤前方向。',
  positioning_invalidation:'晶片失守 VWAP、QQQ 跌回 706.47 下方且軟體未接力，盤前進攻主線失效。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>上漲榜集中財報股與半導體，PLTR 313.3萬股、INTC 191.5萬股、AMZN 123.5萬股、MU 119.9萬股提供較高可信度；下跌榜集中大型軟體與消費科技，證明不是全科技齊漲。</p>',
  section_pre_market_movers_primary_action:'主線：交易有成交量與板塊共振的財報／晶片異動。',
  section_pre_market_movers_condition_action:'條件：同板塊至少兩檔守住／失守 VWAP 才確認。',
  section_pre_market_movers_avoid_action:'避免：追逐低量跳價或把 PLTR 跳空外推到所有軟體。',
  premarket_movers_invalidation:'PLTR／CAT 回補超過一半缺口，或 SMH 與晶片核心同步失守 VWAP。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：0/8 High，可提高戰術風險，但維持事件時點紀律。',
  section_correction_checklist_condition_action:'條件：QQQ 守 +1SD 且 NDX >50MA 站上 50%，才由戰術轉結構進攻。',
  section_correction_checklist_avoid_action:'避免：把 VIX 1/5 解讀為財報與宏觀事件不會產生跳空。',
  checklist_invalidation:'若 QQQ／SMH 跳空回補、Stockbee 比率跌回 1 下方，風險立即上調。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>10:00 ET 情景：</strong>① JOLTS &gt;7.59M 且訂單 &gt;+4.6%：成長與通膨壓力偏強，TLT 易轉跌、QQQ 估值受壓；② JOLTS 約 7.2–7.5M、訂單接近預期：最接近溫和成長，晶片與工業可延續；③ JOLTS &lt;7.2M 且訂單弱於預期：債券受益，但 IWM／CAT 的景氣交易需降級。</div><p class="section-summary"><strong>本段結論：</strong>貿易餘額 Actual 已填正式值；JOLTS、工廠訂單與 AMD 尚未公布，維持待公布。財報以 EPS 與營收雙項明確標示 Beat／Miss，不以股價反應代替結果。</p>`,
  section_macro_premarket_background_primary_action:'主線：10:00 ET 同時看 JOLTS、工廠訂單與 TLT／DXY 反應。',
  section_macro_premarket_background_condition_action:'條件：數據溫和且長債不轉跌，才提高長久期與小型股風險。',
  section_macro_premarket_background_avoid_action:'避免：用貿易逆差改善單獨判斷全面 risk-on。',
  macro_invalidation:'JOLTS 與訂單同時過熱、TLT 轉跌且 DXY 上行，偏多宏觀情景失效。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜長橋 44 檔＋SPY 基準，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${thematicRaw.length}" data-report-count="${thematic.length}" data-benchmark="SPY" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>FXI／KWEB／XSW 仍居 RSI 前列，SMH RSI 43.93 雖盤前急彈，月線 -7.91% 仍需修復；完整 45 檔保留且 SPY 僅出現一次作基準。</p>`,
  section_sector_thematic_etf_primary_action:'主線：比較 SMH 的盤前修復與 XSW／CIBR 的中期強勢。',
  section_sector_thematic_etf_condition_action:'條件：SMH 守 VWAP 且相對 XSW 持續領先，才確認領導權切換。',
  section_sector_thematic_etf_avoid_action:'避免：用單一盤前漲幅取代 RSI、月線與均線結構。',
  sector_etf_invalidation:'SMH 回補盤前漲幅且軟體重新領先，晶片主線降級。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 只看 IWM、DIA、SPY、QQQ；盤前皆為正，但 DIA 已接近週 +2SD，QQQ 雖突破 +1SD，仍需挑戰 50MA 714.51。</p>`,
  section_major_etf_technical_primary_action:'主線：QQQ／IWM 守週 +1SD，DIA 不追接近 +2SD 的第一段。',
  section_major_etf_technical_condition_action:'條件：QQQ 守 706.47 並收復 714.51，才確認科技中期修復。',
  section_major_etf_technical_avoid_action:'避免：只因四大 ETF 全綠就忽略軟體權重下跌。',
  major_etf_invalidation:'SPY／IWM 跌回 +1SD 下方，或 QQQ 失守 706.47。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XSW +3.01 ATR、RSP +2.58 ATR 已在 50MA 上方延伸，TLT -3.68 ATR 與 SMH -1.82 ATR 仍在下方；晶片盤前反彈是在修復負延伸，軟體則面臨高位消化。</p>`,
  section_50ma_atr_extension_primary_action:'主線：偏好由負延伸收斂的晶片，不追已正向延伸的軟體。',
  section_50ma_atr_extension_condition_action:'條件：SMH 負延伸持續收窄且 XSW 不出現加速下跌。',
  section_50ma_atr_extension_avoid_action:'避免：將跌深自動等同反轉，或將高延伸自動等同續漲。',
  atr_extension_invalidation:'SMH 跳空回補且 XSW 重返領先，均值收斂交易失效。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>SPX、NDX、IWM 的 20MA 廣度較 7/31 全部回升；SPX／IWM 的 50MA 廣度高於六成，只有 NDX 50MA 49.51% 尚未站穩五成。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D／10D ratio 升至 1.20／1.13，4% 上漲／下跌為 579／76，季度強股 1305 亦高於弱股 1164，與三大指數短線改善同向。</p><p class="section-summary"><strong>綜合結論：</strong>市場廣度由中性偏弱轉為短線偏多，但 NDX 中期廣度仍是缺口；若科技指數續漲而 NDX >50MA 無法站上 50%，仍屬權重與少數主題推動。</p>`,
  stockbee_breadth_interpretation:'<div class="callout"><strong>綜合廣度：</strong>這次不是只用 Stockbee 單一總結。三大指數 20MA 廣度全數改善，Stockbee 5D／10D 同站 1 以上並有極端上漲股擴散；交叉驗證偏多。唯一保留是 NDX >50MA 49.51%，科技中期參與度仍未完全過半。</div>',
  section_market_breadth_primary_action:'主線：利用廣度改善支持突破交易，但監控 NDX 50MA 五成門檻。',
  section_market_breadth_condition_action:'條件：NDX >50MA 站上 50%，且 5D／10D ratio 維持 1 以上。',
  section_market_breadth_avoid_action:'避免：只看 579 檔大漲股便忽略科技中期廣度。',
  breadth_invalidation:'若指數創高但 NDX／IWM 廣度回落、5D ratio 跌破 1，視為權重驅動。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 99.97 與 USDU RSI 40.83 共同顯示美元中短線偏弱；FXY RSI 77.36 已過熱，留意套息交易收縮。商品方面 CPER 均線與 RSI 偏強，GLD／SLV 均線偏弱，USO 盤前回吐與其月線強勢形成背離。</p>`,
  section_fx_commodities_primary_action:'主線：以 DXY、FXY、USO 與 TLT 交叉驗證風險偏好。',
  section_fx_commodities_condition_action:'條件：DXY <102、FXY 不再加速、USO 弱而 TLT 穩。',
  section_fx_commodities_avoid_action:'避免：把日圓上漲或原油下跌單獨解讀成衰退。',
  forex_commodity_invalidation:'DXY 升破 102、FXY 再加速且 TLT 轉跌，高 beta 情景降級。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.25%</strong><small>8/3，政策敏感端</small></div><div><span>美國 10Y</span><strong>4.70%</strong><small>10Y–2Y +45bp</small></div><div><span>美國 30Y</span><strong>5.23%</strong><small>長端期限溢價仍高</small></div><div><span>TLT 盤前</span><strong class="up">+0.18%</strong><small>長端僅溫和承接</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>利率情景：</strong>JOLTS 過熱會先推高 2Y，工廠訂單強勁則可能同時抬升 10Y／30Y；若兩項溫和且 TLT 維持領先，才代表長端期限壓力實質緩和。現有 +45bp 正斜率不能簡化成降息利多。</div>`,
  section_treasury_fed_primary_action:'主線：比較 2Y 政策端與 10Y／30Y 長端對 10:00 數據的反應。',
  section_treasury_fed_condition_action:'條件：TLT 維持領先 IEF／SHY，DXY <102，長久期條件才改善。',
  section_treasury_fed_avoid_action:'避免：只看 TLT 小漲便宣布長端壓力解除。',
  treasury_invalidation:'JOLTS／訂單過熱、TLT 轉跌且 DXY 反彈，長端緩和情景失效。',
  trading_plan:`${table(['ETF','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3])}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>DIA、SPY、IWM、QQQ 與 PLTR 盤前均已觸發週 +1SD；DIA 接近 +2SD。突破只代表位置，不代表可直接追價，須由 VWAP、廣度與 10:00 宏觀反應確認。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','SMH 守 VWAP、QQQ 守 706.47','晶片修復延續','保留晶片相對多；軟體弱勢作風格對照。'],
    ['09:30 ORB','PLTR／CAT 回補少於一半缺口','財報跳空有效','等回踩確認，不追第一段。'],
    ['10:00 ET','JOLTS 7.2–7.5M、訂單接近 +4.6%','溫和成長','保留晶片／工業，觀察 TLT 不轉跌。'],
    ['10:00 ET','JOLTS >7.59M、訂單 >+4.6%','成長與利率過熱','降低長久期與已延伸突破倉位。'],
    ['10:00 ET','JOLTS <7.2M、訂單弱於預期','成長疑慮','提高債券，降低 IWM／CAT 景氣交易。'],
    ['15:30 MOC','NDX >50MA 仍低於 50%','科技中期廣度未確認','縮減隔夜風險，AMD 財報前不加碼。']
  ].map(r => `<tr>${r.map(x => td(x)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>盤前行情交叉：</strong>長橋顯示 SMH +3.52%，MRVL／SNDK／INTC／MU 同漲；同時 MSFT／NOW／CRM／ADBE 下跌，證明是晶片領先而非全科技齊漲。</div><div class="callout"><strong>財報交叉：</strong>PLTR 與 CAT 的盤前大漲均有 EPS／營收雙 Beat 支持；PLTR 另有指引上修，CAT 則有三大部門成長，並非只用股價猜原因。</div><div class="callout"><strong>廣度交叉：</strong>三大指數 20MA 廣度、Stockbee 5D／10D 與極端漲跌股同向改善；NDX 50MA 49.51% 是唯一中期保留。</div><div class="callout warn"><strong>VIX 口徑 QA：</strong>Google Macro 表中的「VIX」列實為 VIXY 代理，不能當正式 VIX。本報告採 Cboe VIX 指數：8/3 收 15.86、盤前約 15.59，五項分數 1/5。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-08-04 約 09:10 ET 盤前價格、成交量與新聞，及截至 2026-08-03 的 RSI／MA／ATR；<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Weekly Expected Move、Data QA</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee 廣度工作簿</a>；<a href="https://www.bea.gov/">BEA：六月貿易餘額</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部：8/3 收益率曲線</a>；<a href="https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv">Cboe：VIX 正式歷史</a>；<a href="https://longbridge.com/en/news/294762014.md">PLTR 財報摘要</a>；<a href="https://s25.q4cdn.com/358376879/files/doc_financials/2026/q2/2Q-2026-Earnings-Release-Final.pdf">CAT 官方財報</a>；<a href="https://ir.amd.com/news-events/press-releases/detail/1289/amd-to-report-fiscal-second-quarter-2026-financial-results">AMD 官方財報時間</a>。</p><p class="source-note">本報告為 2026-08-04 美股盤前本地草稿，不構成投資建議。尚未公布的宏觀與 AMD Actual 均未提前填值；發布前仍需使用者確認。</p>`,
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
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-04-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-04-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-04-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,unresolved:unresolved.length}, null, 2));
