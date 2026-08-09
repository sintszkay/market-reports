#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const closeRows = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-08-04.json'), 'utf8')).rows;
const thematicRaw = JSON.parse(fs.readFileSync(path.join(WORK, 'thematic_rsi_longport.json'), 'utf8')).rows;
const macroRows = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8')).rows;
const preRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0805.json'), 'utf8'));
const moverRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0805.json'), 'utf8'));

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
  LLY:['Q2 營收 22.97B、調整後 EPS 8.38，雙雙高於共識並上修全年營收指引。','醫療與減重藥物鏈領先，支撐防守成長風格。','財報量價正向，但開盤後須守住缺口一半。'],
  DIS:['調整後 EPS 2.06 高於 1.86；營收 25.25B 略低於 25.40B。','串流與樂園改善，屬 EPS Beat／營收小幅 Miss。','混合財報仍上漲，觀察 100 整數位承接。'],
  PANW:['資安板塊延續強勢，CIBR／XSW 的中期動能提供背景。','帶動 CRWD 與企業軟體風險偏好。','缺少單一新催化，須用板塊共振確認。'],
  CRWD:['跟隨資安與軟體板塊反彈。','與 PANW 同向，支持 CIBR 強勢結構。','若 PANW／CRWD 同失 VWAP，資安主線降級。'],
  NOW:['延續昨日收盤反彈，盤前再升。','企業軟體相對晶片轉強。','以 XSW 是否守昨日突破作確認。'],
  CRM:['企業軟體延續修復。','與 NOW／ADBE 同向，形成軟體板塊共振。','不把低量盤前上漲直接外推全天。'],
  ADBE:['應用軟體跟隨板塊走強。','強化 XSW／IGV 領先。','須守 VWAP，否則只視為昨日延續。'],
  NVDA:['大型 AI 權重上漲，但 AMD 財報後大跌。','顯示 AI 晶片內部是公司分化，不是全板塊崩跌。','NVDA 守穩不等於 SMH 已修復。'],
  GOOGL:['大型科技盤前走強。','支撐 QQQ，但無法抵消 AMD 與記憶體鏈壓力。','指數權重有效，仍需市場廣度配合。'],
  PLTR:['昨日財報跳空延伸至收盤後，今早續強。','AI 軟體強勢延續。','RSI 已高，避免追逐第二天加速。'],
  AMD:['Q2 營收 11.536B、非 GAAP EPS 1.66 均 Beat；高端指引門檻與資本開支引發賣壓。','拖累 SMH、記憶體與設備鏈，形成財報後估值重定價。','高成交量缺口，未收回 500 前先按弱勢處理。'],
  INTC:['受 AMD 財報後晶片風險偏好轉弱拖累。','與 MU／MRVL／SNDK 同跌，確認板塊傳導。','若 SMH 收回 VWAP再取消防守。'],
  MU:['記憶體鏈跟隨 AMD 與半導體轉弱。','拖累 SMH，和昨日強勢形成反向缺口。','成交量高，未收 VWAP 不抄底。'],
  MRVL:['AI 網通晶片在 AMD 財報後回吐。','與 MU／SNDK 同向，半導體內部壓力擴散。','關注昨日低點與 20MA。'],
  SNDK:['昨日大漲後盤前回吐。','記憶體高波動延續。','若無法守住昨日突破，視為獲利回吐擴大。'],
  ARM:['AI 晶片 beta 受 AMD 財報後的高門檻影響。','與 SMH 同向，科技內部繼續分化。','未收回 VWAP 前不追反彈。']
};
const moverTickers = ['LLY','DIS','PANW','CRWD','NOW','CRM','ADBE','NVDA','GOOGL','PLTR','AMD','INTC','MU','MRVL','SNDK','ARM'];
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
  ['S&amp;P 500 overextension／大盤過度延伸','Intermediate','SPY 距 50MA +2.70 ATR','指數已突破週 +2SD，廣度健康但追價風險升高。','mid'],
  ['Increasing downward momentum／下行動能增加','Low','四大 ETF 盤前仍全數上漲','AMD／SMH 下跌屬晶片分化，尚未擴散至四大指數。','low'],
  ['Top range breakdown／高位區間破位','Low','SPY／DIA 近新高，QQQ 收復 50MA','昨日反彈修復主要高位區間，未見指數級破位。','low'],
  ['Technical deterioration／技術惡化','Low','四大 ETF 全數站上 20／50／200MA','QQQ 已由昨日盤前的 50MA 下方轉為收盤站回。','low'],
  ['Market breadth worsening／市場廣度惡化','Low','三大指數 20MA 廣度升至 67%–71%','Stockbee 5D 1.82、10D 1.23，擴散與延續率同步改善。','low'],
  ['VIX >20／波動升溫','Low','VIX 16.50；五項分數 1/5','>20 0/1、5日>0 0/1、1月>0 1/1、20MA 0/1、50MA 0/1。','low'],
  ['Breakout win rate down／突破勝率下降','Low','4% 上漲 725、下跌 115','5D 1.82、10D 1.23，突破延續率偏多。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate','軟體 RSI 71–72；SMH 盤前 -0.94%','昨日晶片領漲被 AMD 財報打斷，主題領導權重新分化。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(x => `<div class="risk-check-row ${x[4]}"><div class="risk-check-name">${x[0]}</div><div class="risk-check-level">${badge(x[1], x[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${x[2]}</strong><small>${x[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist Score：0/8 High＝Low Risk。</strong>廣度、均線與低 VIX 仍支持低風險結構；但 SPY 已在週 +2SD 之外，AMD 財報後晶片承壓，今日屬「結構偏多、事件分化」而非無條件追高。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<span class="macro-event"><strong>ADP 私人就業</strong><small>08:15 ET｜七月</small></span>'),numTd('44K'),numTd('68K'),numTd('98K'),td(badge('Miss','red'))],
  [td('<span class="macro-event"><strong>S&amp;P Global 服務業 PMI 終值</strong><small>09:45 ET｜七月</small></span>'),numTd('待公布'),numTd('53.6'),numTd('51.2'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>ISM 服務業 PMI</strong><small>10:00 ET｜七月</small></span>'),numTd('待公布'),numTd('54.5'),numTd('54.0'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>AMD 財報</strong><small>盤後已公布｜2026 Q2</small></span>'),numTd('EPS 1.66<br>營收 11.536B'),numTd('EPS 1.61<br>營收 11.3B'),numTd('EPS 0.48<br>營收 7.69B'),td(badge('Beat／Beat','green'))],
  [td('<span class="macro-event"><strong>Disney 財報</strong><small>盤前已公布｜2026 Q3</small></span>'),numTd('EPS 2.06<br>營收 25.25B'),numTd('EPS 1.86<br>營收 25.40B'),numTd('上年同期<br>EPS 1.61'),td(badge('Beat／Miss','amber'))],
  [td('<span class="macro-event"><strong>Eli Lilly 財報</strong><small>盤前已公布｜2026 Q2</small></span>'),numTd('EPS 8.38<br>營收 22.97B'),numTd('EPS 6.01<br>營收 20.69B'),numTd('上年同期<br>營收約 15.5B'),td(badge('Beat／Beat','green'))],
  [td('<span class="macro-event"><strong>Uber 財報</strong><small>盤前已公布｜2026 Q2</small></span>'),numTd('EPS 1.17<br>營收 14.19B'),numTd('EPS 0.83<br>營收 14.26B'),numTd('上年同期<br>EPS 0.63'),td(badge('Beat／Miss','amber'))]
], 'report-data-table macro-results-table', [1,2,3]);

const priorReviewRows = [
  [
    td('<strong>晶片修復領先軟體</strong><small>8/4 盤前以 SMH／MRVL／SNDK／MU 守 VWAP 為主線。</small>'),
    td(`SMH ${pct(close.SMH.dailyPct)}、MRVL ${pct(close.MRVL.dailyPct)}、SNDK ${pct(close.SNDK.dailyPct)}、MU ${pct(close.MU.dailyPct)}；SMH 領先 XSW ${pct(close.XSW.dailyPct)}。`),
    td(badge('命中','green')),
    td('保留板塊共振與 VWAP 確認；但今日 AMD 財報後須重新檢驗，不能把昨日強勢直接延伸。')
  ],
  [
    td('<strong>PLTR／CAT 跳空同級處理</strong><small>兩者皆有 EPS／營收雙 Beat 支撐，預期缺口延續。</small>'),
    td('PLTR 收 +29.45%，跳空繼續擴大；CAT 由 922 開盤回落至 876.54，收 +5.60%，僅保留約一半開盤缺口。'),
    td(badge('失誤','red')),
    td('不能因同屬 Beat 就歸為相同續航品質；今日必須分別檢驗指引、估值與開盤缺口承接。')
  ],
  [
    td('<strong>偏弱數據先看利率反應</strong><small>JOLTS／工廠訂單低於預期，TLT、DXY 與 QQQ 同向才算溫和降溫。</small>'),
    td(`TLT ${pct(close.TLT.dailyPct)}；美國 2Y／10Y 收益率降至 4.20%／4.63%，QQQ ${pct(close.QQQ.dailyPct)}、SMH ${pct(close.SMH.dailyPct)}。`),
    td(badge('命中','green')),
    td('繼續把宏觀數字拆成成長、價格與市場反應三層，不把「低於預期」機械等同 risk-on。')
  ],
  [
    td('<strong>廣度升級門檻</strong><small>NDX &gt;50MA 回到 50%以上，Stockbee 5D／10D 維持 1 以上。</small>'),
    td('NDX &gt;50MA 升至 60.19%；SPX／NDX／IWM &gt;20MA 為 67.79%／70.87%／67.46%，Stockbee 5D／10D 為 1.82／1.23。'),
    td(badge('命中','green')),
    td('廣度已從「反彈待確認」升級為全面擴散；今日即使 AMD 下跌，也要先區分個股財報衝擊與指數廣度轉壞。')
  ],
  [
    td('<strong>AMD 財報前不加隔夜風險</strong><small>8/4 盤前明確把 AMD 盤後財報列為事件風險。</small>'),
    td(`AMD 8/4 收 ${pct(close.AMD.dailyPct)} 至 ${n(close.AMD.close)}，但財報雙 Beat 後今早跌 ${pct(pre.AMD.changePct)} 至 ${n(pre.AMD.price)}。`),
    td(badge('已觸發','amber')),
    td('財報前不加碼的紀律有效；今天把 500 與昨日收盤 518.58 作為缺口修復門檻。')
  ]
];
const priorPremarketReview = `<section class="prior-premarket-review"><h2>昨晚盤前判斷複盤（8/4）</h2>${table(['8/4 盤前主判斷','8/4 收盤事實','對賬','今日修正'], priorReviewRows, 'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬結果：3 命中、1 失誤、1 已觸發。</strong>晶片相對強勢、弱數據的利率友好反應與廣度升級均獲確認；主要失誤是把 PLTR 與 CAT 兩個財報跳空視為相同續航品質。AMD 則證明「盤前強、財報雙 Beat」仍不能替代隔夜風險管理。</div><p class="section-summary"><strong>本段結論：</strong>8/4 是廣度與指數同步擴散的一天，但個股財報缺口差異巨大。今日優先保留廣度偏多結構，同時把 AMD／SMH 的盤前弱勢視為需要單獨驗證的事件衝擊。</p></section>`;

const major = ['IWM','DIA','SPY','QQQ'].map(t => {
  const r = close[t], p = pre[t];
  const note = t === 'QQQ' ? '盤前接近週 +2SD 724.95；AMD 下跌令追價性價比下降。' : t === 'DIA' ? '盤前高於週 +2SD 538.81，保留趨勢但不追第一段。' : t === 'SPY' ? '盤前高於週 +2SD 767.83，廣度健康但位置已延伸。' : '盤前介於週 +1SD 與 +2SD，ADP 偏弱後須觀察小型股承接。';
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`, p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r), 'ma-cell'),numTd(n(r.rsi14)),td(note)];
});
const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'], major, 'report-data-table major-etf-table', [1,2,3,5]).replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrRows = ['RSP','XLE','DIA','SPY','IWM','XSW','QQQ','SMH','GLD','TLT'].map(t => close[t]).filter(Boolean).sort((a,b) => b.extension50Atr - a.extension50Atr).map(r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`),numTd(n(r.close)),numTd(n(r.ma50)),numTd(n(r.atr14)),numTd(n(r.extension50Atr),r.extension50Atr),td(Math.abs(r.extension50Atr) >= 2 ? badge('延伸','amber') : badge('正常','blue'))]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows, 'report-data-table', [1,2,3,4]);

const breadthRows = [
  ['SPX >20MA（8/4）','67.79%','58.84% → 67.79%','69.18% → 67.79%','短線參與度再升，接近一週高位。'],
  ['SPX >50MA（8/4）','68.19%','64.01% → 68.19%','71.57% → 68.19%','中期廣度維持近七成。'],
  ['NDX >20MA（8/4）','70.87%','57.28% → 70.87%','48.54% → 70.87%','科技短線廣度由弱轉為領先。'],
  ['NDX >50MA（8/4）','60.19%','49.51% → 60.19%','51.45% → 60.19%','正式站上五成，昨日缺口已修復。'],
  ['IWM >20MA（8/4）','67.46%','56.60% → 67.46%','52.57% → 67.46%','小型股擴散與指數上漲同步。'],
  ['IWM >50MA（8/4）','64.19%','60.54% → 64.19%','61.07% → 64.19%','中期參與度穩在六成以上。'],
  ['T2108（Stockbee 8/4）','55.76%','52.78% → 55.76%','55.33% → 55.76%','全市場長期廣度續升。'],
  ['Stockbee 5D ratio（8/4）','1.82','1.20 → 1.82','0.78 → 1.82','短線突破延續率明顯擴張。'],
  ['Stockbee 10D ratio（8/4）','1.23','1.13 → 1.23','0.88 → 1.23','中短線改善由單日擴散至十日。'],
  ['4%+ 上漲／下跌（8/4）','725／115','579／76 → 725／115','341／388 → 725／115','極端上漲股維持壓倒性優勢。'],
  ['季度 +25%／-25%（8/4）','1496／1057','1305／1164 → 1496／1057','1261／1231 → 1496／1057','中期強股擴散快於弱股。']
];
const breadthTable = table(['指標','最新','5日趨勢','約1月趨勢','判斷'], breadthRows.map(r => r.map((x,i) => td(x, i === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

const fxKeys = ['FXE','FXB','FXY','USDU','XAU','XAG','COPPER','CL','BTC'];
const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',XAU:'黃金代理',XAG:'白銀代理',COPPER:'銅代理',CL:'原油代理',BTC:'比特幣代理'};
const fxMeaning = r => {
  const a20=r.aboveMa20, a50=r.aboveMa50, a200=r.aboveMa200;
  const trend = a20 && a50 && a200 ? '均線多頭' : !a20 && !a50 && !a200 ? '均線空頭' : a20 && a50 ? '均線中短線偏強' : !a20 && !a50 ? '均線中短線偏弱' : '均線趨勢混合';
  const rsi = r.rsi14 >= 70 ? `RSI ${n(r.rsi14)} 過熱` : r.rsi14 >= 55 ? `RSI ${n(r.rsi14)} 偏強` : r.rsi14 <= 45 ? `RSI ${n(r.rsi14)} 偏弱` : `RSI ${n(r.rsi14)} 中性`;
  return `${trend}；${rsi}。${r.key === 'FXY' ? '日圓強勢降溫，套息交易壓力較昨日緩和。' : r.key === 'USDU' ? '與 DXY 約 99.70 共同顯示美元仍低於 102 風控門檻。' : r.key === 'CL' ? '月線仍強但短線跌破 20／50MA，油價風險溢價快速回吐。' : ''}`;
};
const fxRows = fxKeys.map(k => macro[k]).filter(Boolean).map(r => [td(`<span class="asset-pair"><strong>${r.key}</strong><small>${fxLabels[r.key]}</small></span>`),numTd(n(r.close)),numTd(pct(r.dailyPct),r.dailyPct),numTd(pct(r.oneMonthPct),r.oneMonthPct),numTd(n(r.rsi14)),td(fxMeaning(r))]);
const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong>99.70</strong><small>盤前續弱、低於 102 風控門檻</small></div><div><span>貴金屬</span><strong class="up">GLD +3.16%</strong><small>SLV +4.74%，弱就業後明顯承接</small></div><div><span>日圓代理</span><strong>FXY RSI 69.61</strong><small>仍強但已退出過熱區</small></div></div>${table(['資產','8/4收盤','1日','1月','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table',[1,2,3,4])}`;

const bondRows = ['SHY','IEF','TLT'].map(t => {
  const p=pre[t], labels={SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const signal=t==='TLT'?'長端領先，ADP 偏弱後期限壓力暫緩。':t==='IEF'?'中段溫和承接，對政策與成長均敏感。':'短端近持平，政策路徑變化仍有限。';
  return [td(`<span class="asset-pair"><strong>${t}</strong><small>${labels[t]}</small></span>`),numTd(n(p.price)),numTd(pct(p.changePct),p.changePct),td(signal)];
});
const bondTable = table(['ETF','盤前','變化','含義'],bondRows,'report-data-table bond-curve-table',[1,2]);

const expected = {
  SPY:[757.43,767.83,736.63,pre.SPY.price], QQQ:[706.47,724.95,669.51,pre.QQQ.price],
  IWM:[296.94,302.68,285.46,pre.IWM.price], DIA:[531.57,538.81,517.07,pre.DIA.price],
  SMH:[574.93,609.33,506.13,pre.SMH.price], PLTR:[137.44,151.82,108.68,pre.PLTR.price],
  AMD:[532.39,588.62,419.92,pre.AMD.price], TLT:[83.45,84.64,81.05,pre.TLT.price]
};
const expectedRows = Object.entries(expected).map(([t,v]) => {
  const [up1,up2,dn1,price]=v;
  const status=price>=up2?badge('突破 +2SD','red'):price>=up1?badge('突破 +1SD','amber'):price<=dn1?badge('跌破 -1SD','red'):badge('區間內','blue');
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(n(price)),numTd(n(up1)),numTd(n(up2)),numTd(n(dn1)),td(status)];
});
const expectedTable = table(['標的','盤前','+1SD','+2SD','-1SD','狀態'],expectedRows,'report-data-table expected-move-table',[1,2,3,4]);

const tradeRows = ['DIA','SPY','IWM','QQQ','SMH','AMD','GLD','TLT'].map(t => {
  const r=close[t], p=pre[t] || {price:r.close, changePct:r.dailyPct};
  const actions={DIA:'已高於 +2SD，不追延伸。',SPY:'已高於 +2SD，以 767.83 作第一道回踩門檻。',IWM:'廣度支持突破，守 296.94 保留多頭。',QQQ:'接近 +2SD，但 AMD 拖累晶片，須守 724.95 附近。',SMH:'昨日強、今早弱，收回 VWAP 才算財報衝擊受控。',AMD:'未收回 500 前按財報缺口弱勢處理。',GLD:'ADP 偏弱後跳升，避免追逐開盤第一段。',TLT:'偏弱就業利多長端，須守盤前升幅。'};
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r),'ma-cell'),td(actions[t])];
});

const data = {
  report_title:'2026-08-05｜美股盤前監控',
  report_eyebrow:'2026-08-05｜盤前更新',
  report_heading:'ADP 就業僅增 4.4 萬；指數偏多但 AMD 財報後重挫令晶片分化',
  qqq_reengage_20ma:n(close.QQQ.ma20), qqq_breakout_add_1sd:'724.95',
  data_timestamp_note:'長橋盤前快照約截至 08:18 ET；RSI、均線、ATR、Sector Dashboard、Thematic Sectors、Macro 與市場廣度截至 8/4 收盤。ADP Actual 已更新至 08:15 ET，S&amp;P Global／ISM 服務業 PMI 尚待公布；VIX 採 Cboe 正式指數，DXY 由即時指數資料補足。',
  risk_badge:'低風險結構／事件分化｜Checklist 0/8 High、VIX 1/5',
  summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">DIA +0.55%</span></strong><small>SPY +0.47%、IWM +0.29%、QQQ +0.08%。</small></div><div class="card"><span>晶片壓力</span><strong><span class="dn">AMD -8.86%</span></strong><small>SMH -0.94%；MU、INTC、MRVL、SNDK 同跌。</small></div><div class="card"><span>就業數據</span><strong><span class="dn">ADP 44K</span></strong><small>低於 68K 共識與 98K 前值。</small></div><div class="card"><span>跨資產</span><strong><span class="up">GLD +3.16%</span></strong><small>SLV +4.74%、TLT +0.40%，DXY 約 99.70。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把低風險結構轉成進攻：突破延續、廣度擴散、宏觀與長債同向。',
  upgrade_trigger_1:'QQQ 守住 724.95 附近、SPY 守住週 +2SD 767.83；SMH 收回 VWAP。',
  upgrade_trigger_2:'ISM 服務業接近或高於 54.5、價格分項不再加速；TLT 保持正報酬且 DXY <102。',
  upgrade_trigger_3:'NDX >50MA 維持 60%以上，Stockbee 5D／10D 保持 1 以上。',
  downgrade_trigger_rule:'任一觸發即轉防守：突破失敗、宏觀再通膨、晶片與廣度背離。',
  downgrade_trigger_1:'AMD 未收回 500、SMH 失守 VWAP，且 MU／INTC／MRVL／SNDK 同步擴大跌幅。',
  downgrade_trigger_2:'ISM 服務業跌破 50，或雖高於 54.5但價格支付再加速，導致 TLT 轉跌、DXY 反彈。',
  downgrade_trigger_3:'SPY 跌回 767.83、IWM 跌回 296.94 下方，且 NDX >50MA 快速回落。',
  core_conclusions:`<ol><li><strong>四大 ETF 盤前仍正，但科技不再領先。</strong>DIA +0.55%、SPY +0.47%、IWM +0.29%，QQQ 僅 +0.08%；AMD -8.86% 與 SMH -0.94% 令「指數穩、晶片弱」成為首要分化。</li><li><strong>AMD 是財報 Beat、股價 Miss。</strong>Q2 非 GAAP EPS 1.66、營收 11.536B 均高於 1.61／11.3B 共識；資料中心營收年增 107% 至 6.7B。市場卻對更高的 AI 指引門檻與資本開支敏感，因此不得只看 Beat／Miss 判斷方向。</li><li><strong>ADP 就業 44K 明顯低於預期。</strong>七月私人就業少於 68K 共識及 98K 前值，第一讀利多 TLT／GLD、壓低 DXY；但若 10:00 ET ISM 服務業也急降，市場可能從「降息交易」轉為「成長疑慮」。</li><li><strong>服務業 PMI 是今日真正的情景分水嶺。</strong>ISM 若約 54.5 且價格不升，屬溫和降溫；若跌破 50，IWM／工業／金融承壓；若高於 55 且價格支付升溫，長債與高估值科技反而受壓。</li><li><strong>昨晚廣度已完成確認。</strong>SPX／NDX／IWM &gt;20MA 升至 67.79%／70.87%／67.46%，NDX &gt;50MA 升至 60.19%；Stockbee 5D／10D 為 1.82／1.23。今天 AMD 下跌先視為事件分化，除非廣度與四大 ETF 同步轉弱。</li><li><strong>貴金屬與長債共同反映偏弱就業。</strong>GLD +3.16%、SLV +4.74%、TLT +0.40%，DXY 約 99.70；若 ISM 仍強，金銀急漲可能回吐，若 ISM 明顯弱，則防守與久期交易可延續。</li></ol><p class="section-summary"><strong>本段結論：</strong>今日不是單純 risk-on 或 risk-off，而是低 VIX、強廣度之上疊加 AMD 財報衝擊與 ADP 偏弱。開盤先看 SMH／AMD 是否止跌，再由 09:45／10:00 ET 服務業數據決定利率與成長風格。</p>`,
  prior_premarket_review:priorPremarketReview,
  positioning_primary:'主線：保留強廣度下的指數多頭，但把 AMD／SMH 與軟體分開處理。',
  positioning_secondary:'次線：ADP 偏弱後的 TLT／GLD／SLV 久期與防守交易，等待 ISM 確認。',
  positioning_watch:'觀察：AMD 500、SMH VWAP、QQQ 724.95，以及 09:45 ET S&amp;P Global 與 10:00 ET ISM 服務業。',
  positioning_invalidation:'ISM 跌破 50 且 IWM／DIA 轉弱，或 ISM 價格升溫令 TLT 轉跌、DXY 反彈，盤前偏多結構降級。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>下跌榜高度集中 AMD、INTC、MU、MRVL、SNDK、ARM，半導體不是單一股票異常；上漲榜則由 LLY／DIS 財報與 PANW／CRWD／NOW／CRM 軟體共振主導。AMD 114.8萬股、NVDA 114.6萬股、INTC 100.2萬股、PLTR 77.7萬股提供較高盤前可信度。</p>',
  section_pre_market_movers_primary_action:'主線：做多只選財報數字與板塊共振同時成立的 LLY／軟體；晶片先等止跌。',
  section_pre_market_movers_condition_action:'條件：同板塊至少兩檔守住／失守 VWAP，且成交量持續，才確認全天方向。',
  section_pre_market_movers_avoid_action:'避免：把 AMD 的 Beat／Beat 直接解讀為股價利多，或把 NVDA 上漲當作 SMH 已修復。',
  premarket_movers_invalidation:'AMD 收回 500、SMH 與記憶體鏈同步收復 VWAP，晶片防守主線失效。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：0/8 High，可提高戰術風險，但維持事件時點紀律。',
  section_correction_checklist_condition_action:'條件：SPY 守 767.83、QQQ 守 724.95 附近，且 NDX >50MA 維持 60%以上。',
  section_correction_checklist_avoid_action:'避免：把 VIX 1/5 解讀為財報與宏觀事件不會產生跳空。',
  checklist_invalidation:'若四大 ETF 失守 VWAP、NDX 廣度回落且 Stockbee 5D 跌回 1 下方，風險立即上調。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>情景分析：</strong>ADP 44K 已低於 68K 共識。若 ISM 服務業約 54.5、價格分項不升，屬「就業降溫、服務仍擴張」，有利 TLT 且不破壞 IWM；若 ISM 跌破 50，轉為成長疑慮；若高於 55 且價格支付升溫，則長債與高估值科技面臨再定價。</div><p class="section-summary"><strong>本段結論：</strong>宏觀列均保留 Actual／Forecast／Previous；財報明確列出 EPS 與營收 Beat／Miss。AMD、Disney、Eli Lilly、Uber 的結果與股價反應分開解讀，不以盤前漲跌替代財報結論。</p>`,
  section_macro_premarket_background_primary_action:'主線：ADP 已偏弱，觀察服務業數據把市場推向溫和降溫、成長疑慮或再通膨。',
  section_macro_premarket_background_condition_action:'條件：TLT 守升幅、DXY <102，且 ISM 服務業仍在 50 以上，才提高長久期風險。',
  section_macro_premarket_background_avoid_action:'避免：把低於預期的宏觀數字機械解讀成全面 risk-on。',
  macro_invalidation:'TLT 未因偏弱數據受益、DXY 上行且 IWM／DIA 轉弱，溫和降溫情景失效。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜長橋 44 檔＋SPY 基準，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${thematicRaw.length}" data-report-count="${thematic.length}" data-benchmark="SPY" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>IGV／XSW／CIBR 的 RSI 分別為 71.62／70.81／70.49，軟體與資安佔據前列；SMH RSI 51.10、月線 -4.73%，今早又受 AMD 拖累。完整 45 檔保留，SPY 僅出現一次作基準。</p>`,
  section_sector_thematic_etf_primary_action:'主線：軟體／資安維持中期領跑；晶片先看 AMD 財報衝擊能否被 NVDA 與 SMH 吸收。',
  section_sector_thematic_etf_condition_action:'條件：SMH 收回 VWAP 且相對 XSW 不再惡化，才確認晶片重新接棒。',
  section_sector_thematic_etf_avoid_action:'避免：用單一盤前漲幅取代 RSI、月線與均線結構。',
  sector_etf_invalidation:'SMH 與記憶體鏈擴大跌幅，同時軟體跌破 VWAP，科技內部防守失效。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 只看 IWM、DIA、SPY、QQQ；收盤均站上 20／50／200MA，盤前亦全數為正。DIA／SPY 已高於週 +2SD，QQQ 接近 +2SD，位置風險高於結構風險。</p>`,
  section_major_etf_technical_primary_action:'主線：保留四大 ETF 多頭，但不追 DIA／SPY 的 +2SD 外延伸。',
  section_major_etf_technical_condition_action:'條件：QQQ 守 724.95 附近、IWM 守 296.94，廣度偏多才可延續。',
  section_major_etf_technical_avoid_action:'避免：只看指數綠色就忽略 AMD／SMH 的財報後壓力。',
  major_etf_invalidation:'SPY 跌回 767.83、QQQ 跌回 706.47，且 IWM 同步失守 VWAP。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>RSP +3.68 ATR、DIA +3.46 ATR、SPY +2.70 ATR 已明顯正向延伸；SMH -0.72 ATR 仍低於 50MA，TLT -2.61 ATR 仍為負延伸。今日更適合等待回踩與事件確認，不適合追逐指數第一段。</p>`,
  section_50ma_atr_extension_primary_action:'主線：不追高延伸指數；以 SMH／TLT 是否收斂負延伸作事件交易。',
  section_50ma_atr_extension_condition_action:'條件：SMH 收回 VWAP、TLT 守升幅，且 SPY 不跌回 +2SD 下方。',
  section_50ma_atr_extension_avoid_action:'避免：將跌深自動等同反轉，或將高延伸自動等同續漲。',
  atr_extension_invalidation:'SPY／DIA 高延伸快速回落，或 SMH 負延伸擴大，均值收斂交易失效。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>SPX／NDX／IWM 的 20MA 廣度一日分別增加 8.95、13.59、10.86 個百分點；三者 50MA 廣度也全部高於 60%，不再只是權重股拉動。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D／10D ratio 升至 1.82／1.23，4% 上漲／下跌為 725／115，季度強股 1496 高於弱股 1057；短線、中期與極端漲跌股三個維度同向。</p><p class="section-summary"><strong>綜合結論：</strong>市場廣度已從「改善」升級為「全面擴散」。今天 AMD／SMH 的下跌若未拖累 IWM、DIA 與 NDX 廣度，應視為事件分化；只有指數與廣度同步轉弱才降級。</p>`,
  stockbee_breadth_interpretation:'<div class="callout"><strong>綜合廣度：</strong>三大指數 20／50MA 廣度與 Stockbee 5D／10D、4% 漲跌家數、季度強弱股全部同向偏多。NDX &gt;50MA 已由 49.51% 升至 60.19%，昨日唯一的中期缺口已被修復。</div>',
  section_market_breadth_primary_action:'主線：以全面擴散支持指數多頭，但把 AMD 財報衝擊視為個別風險。',
  section_market_breadth_condition_action:'條件：NDX >50MA 維持 60%以上，且 Stockbee 5D／10D 保持 1 以上。',
  section_market_breadth_avoid_action:'避免：因單一 AMD 缺口否定整體廣度，或因廣度強就無視 +2SD 延伸。',
  breadth_invalidation:'若四大指數轉弱、NDX／IWM 廣度同步回落且 5D ratio 跌破 1，視為擴散失敗。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 約 99.70 與 USDU RSI 38.71 顯示美元中短線偏弱；FXY RSI 69.61 仍強但已退出過熱。商品方面銅 RSI 63.01、均線多頭；黃金／白銀收盤仍低於 50MA，但今早在 ADP 偏弱後分別上漲 3.16%／4.74%，屬於事件驅動的強修復。</p>`,
  section_fx_commodities_primary_action:'主線：以 DXY、GLD／SLV、TLT 與服務業 PMI 交叉驗證弱就業交易。',
  section_fx_commodities_condition_action:'條件：DXY <100、TLT 守升幅，且 ISM 不出現價格再加速。',
  section_fx_commodities_avoid_action:'避免：把日圓上漲或原油下跌單獨解讀成衰退。',
  forex_commodity_invalidation:'DXY 重返 100 以上、TLT 轉跌且金銀回補盤前漲幅，弱就業交易失效。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.20%</strong><small>8/4，較前日 -5bp</small></div><div><span>美國 10Y</span><strong>4.63%</strong><small>較前日 -7bp</small></div><div><span>美國 30Y</span><strong>5.18%</strong><small>較前日 -5bp</small></div><div><span>TLT 盤前</span><strong class="up">+0.40%</strong><small>ADP 偏弱後長端領先</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>利率解讀：</strong>8/4 收盤時 2Y、10Y、30Y 同步下行，長短端都承接偏弱數據；今早 ADP 再低於預期，TLT 繼續領先 SHY／IEF。若 ISM 仍在 54.5 附近且價格不升，這是最有利長久期的溫和降溫；若 ISM 跌破 50，則長端上漲會轉為成長恐慌訊號。</div>`,
  section_treasury_fed_primary_action:'主線：比較 2Y 政策端與 10Y／30Y 長端對 ADP／ISM 的實際反應。',
  section_treasury_fed_condition_action:'條件：TLT 維持領先 IEF／SHY，DXY <102，長久期條件才改善。',
  section_treasury_fed_avoid_action:'避免：只看 TLT 小漲便宣布長端壓力解除。',
  treasury_invalidation:'ISM 強且價格升溫後 TLT 轉跌、DXY 反彈，長端緩和情景失效。',
  trading_plan:`${table(['ETF','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3])}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>DIA／SPY 已高於週 +2SD，QQQ／IWM／PLTR 高於 +1SD，SMH 盤前跌回 +1SD 下方。突破代表位置已延伸，不代表可直接追價；今日應等 PMI、VWAP 與廣度三項確認。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','AMD 未收 500、SMH 失守 VWAP','晶片財報衝擊延續','維持晶片防守；不因 NVDA 單獨上漲抄底 SMH。'],
    ['09:30 ORB','LLY／DIS 守住缺口一半','財報跳空有效','保留醫療與消費服務相對強勢。'],
    ['09:45 ET','S&amp;P Global 服務業接近 53.6','服務業仍擴張','等待 ISM 確認，不提前加碼。'],
    ['10:00 ET','ISM 約 54.5、價格分項不升','溫和降溫','保留 TLT、指數與軟體；金銀避免追第一段。'],
    ['10:00 ET','ISM <50，且 IWM／DIA 轉弱','成長疑慮','提高 TLT／防守，降低工業、金融與小型股。'],
    ['10:00 ET','ISM >55 且價格支付升溫','再通膨／利率壓力','若 TLT 轉跌、DXY 反彈，降低高估值科技。'],
    ['15:30 MOC','NDX >50MA 仍在 60%以上','廣度結構未壞','允許個股分化，但不把 AMD 下跌擴大為全面 risk-off。']
  ].map(r => `<tr>${r.map(x => td(x)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>盤前行情交叉：</strong>長橋顯示四大 ETF 全數為正，但 AMD -8.86%、SMH -0.94%、MU／INTC／MRVL／SNDK 同跌；這說明壓力集中於半導體，而非指數全面轉空。</div><div class="callout"><strong>財報交叉：</strong>AMD Q2 EPS／營收雙 Beat 卻盤前重挫；Disney 與 Uber 均為 EPS Beat／營收 Miss，Eli Lilly 雙 Beat 並上調指引。結果與股價反應必須分別記錄。</div><div class="callout"><strong>宏觀交叉：</strong>ADP 44K 低於 68K／98K，與 TLT +0.40%、GLD +3.16%、DXY 99.70 同向；但服務業 PMI 尚未公布，弱就業交易仍待第二層確認。</div><div class="callout"><strong>廣度交叉：</strong>三大指數 20／50MA 廣度、Stockbee 5D／10D、4% 漲跌家數與季度強弱股全部偏多；NDX 50MA 60.19% 已修復昨日缺口。</div><div class="callout warn"><strong>VIX 口徑 QA：</strong>Google Macro 表中的「VIX」列實為 VIXY 代理，不能當正式 VIX。本報告採 Cboe VIX 指數：8/4 收 16.50，5日 -9.39%、1月 +4.36%，低於 20／50MA，五項分數 1/5。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-08-05 約 08:18 ET 盤前價格、成交量與新聞，及截至 2026-08-04 的 RSI／MA／ATR；<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Weekly Expected Move、Data QA</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee 廣度工作簿</a>；<a href="https://adpemploymentreport.com/">ADP：七月私人就業</a>；<a href="https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/">ISM：服務業 PMI 日程</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部：8/4 收益率曲線</a>；<a href="https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv">Cboe：VIX 正式歷史</a>；<a href="https://longbridge.com/en/news/294891968.md">AMD 財報摘要</a>；<a href="https://longbridge.com/en/news/294950907.md">Disney 財報摘要</a>；<a href="https://longbridge.com/en/news/294955421.md">Eli Lilly 財報摘要</a>；<a href="https://longbridge.com/en/news/294953690.md">Uber 財報摘要</a>。</p><p class="source-note">本報告記錄 2026-08-05 美股盤前狀態，不構成投資建議。ADP Actual 已更新至 08:15 ET；S&amp;P Global／ISM 服務業 PMI 在報告截點尚未公布，因此未以估計值替代 Actual。</p>`,
  sector_momentum_chart:chartRows
};

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- OPTIONAL: prior_premarket_review -->', data.prior_premarket_review || '');
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', chartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(m => m[1]);
if (unresolved.length) throw new Error(`未解析欄位：${unresolved.join(', ')}`);
html = normalizeReportHtml(html, {reportType:'premarket'});
const validationErrors = validateReportHtml(html, {reportType:'premarket'});
if (validationErrors.length) throw new Error(`嚴格驗證失敗：\n${validationErrors.join('\n')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-05-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-05-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-05-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,unresolved:unresolved.length}, null, 2));
