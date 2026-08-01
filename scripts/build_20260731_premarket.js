const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(ROOT, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const closeRows = JSON.parse(fs.readFileSync(path.join(WORK, 'postmarket_snapshot_2026-07-30.json'), 'utf8')).rows;
const thematicRowsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-07-30-thematic-longbridge.json'), 'utf8')).rows;
const macroRows = JSON.parse(fs.readFileSync(path.join(WORK, 'macro_rsi_longport.json'), 'utf8')).rows;
const preRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_quotes_0731.json'), 'utf8'));
const moverRows = JSON.parse(fs.readFileSync(path.join(WORK, 'premarket_movers_0731.json'), 'utf8'));

const close = Object.fromEntries(closeRows.map(r => [r.ticker, r]));
const pre = Object.fromEntries(preRows.map(r => [r.ticker, r]));
const movers = Object.fromEntries(moverRows.map(r => [r.ticker, r]));
const macro = Object.fromEntries(macroRows.map(r => [r.key, r]));

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (v, d = 2) => Number(v).toFixed(d);
const pct = v => `${Number(v) >= 0 ? '+' : ''}${n(v)}%`;
const cls = v => Number(v) > 0 ? 'up' : Number(v) < 0 ? 'dn' : '';
const vol = v => Number(v) >= 1e6 ? `${n(v / 1e6, 1)} 百萬股` : `${n(v / 1e4, 1)} 萬股`;
const badge = (text, tone = 'blue') => `<span class="badge ${tone}">${text}</span>`;
const numericHead = h => /^(?:盤前|盤前變化|收盤|7\/30收盤|20MA|50MA|ATR14|距50MA ATR|1日|5日|1月|離高點|RSI|Actual|Forecast|Previous|SPX >20MA|SPX >50MA|NDX >20MA|NDX >50MA|IWM >20MA|IWM >50MA|4% 上漲|4% 下跌|5D ratio|10D ratio|季度 \+25%|季度 -25%|T2108)$/.test(h);
const table = (heads, rows, klass = 'report-data-table') => `<div class="table-scroll"><table class="${klass}"><thead><tr>${heads.map((h, i) => `<th${i && numericHead(h) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;
const td = (x, c = '') => `<td${c ? ` class="${c}"` : ''}>${x}</td>`;
const numTd = (x, v = null) => td(x, `num ${v === null ? '' : cls(v)}`.trim());
const ma = r => `${r.above20 ?? r.aboveMa20 ? '<span class="up">20MA ▲</span>' : '<span class="dn">20MA ▼</span>'} ${r.above50 ?? r.aboveMa50 ? '<span class="up">50MA ▲</span>' : '<span class="dn">50MA ▼</span>'} ${r.above200 ?? r.aboveMa200 ? '<span class="up">200MA ▲</span>' : '<span class="dn">200MA ▼</span>'}`;
const techRow = r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`), numTd(pct(r.dailyPct), r.dailyPct), numTd(pct(r.fiveDayPct), r.fiveDayPct), numTd(pct(r.oneMonthPct), r.oneMonthPct), numTd(pct(r.distanceFrom52wHighPct), r.distanceFrom52wHighPct), td(ma(r)), numTd(n(r.rsi14))];

const moverMeta = {
  AMZN:['EPS 5.75、營收 200.60B，均高於預期；AWS 增長與 AI 需求推動。','雲端與大型科技情緒轉強。','突破週度 +1SD，但指引上緣仍低於共識，開盤不追第一段。'],
  MRVL:['AI／網通晶片跟隨半導體修復。','與 SMH、LRCX、AMAT 共振。','守住 VWAP 才視為修復延續。'],
  SNDK:['記憶體高彈性延續。','MU 同步上漲，記憶體鏈有板塊性。','波動很大，失守 VWAP 即減碼。'],
  ARM:['高 beta 晶片隨設備鏈反彈。','強化半導體修復廣度。','未收回 20MA 前仍是跌深修復。'],
  AMAT:['晶片設備鏈盤前領先。','LRCX、KLAC 同步。','至少兩檔守 VWAP 才保留多頭。'],
  LRCX:['設備鏈延續前日修復。','支撐 SMH 盤前走強。','不追高，等待 ORB。'],
  INTC:['高成交量半導體反彈。','晶片修復擴散至成熟製程。','若量價背離，視為補空而非趨勢。'],
  AMD:['盤前反彈，但仍在週度中樞下方。','AI beta 參與修復。','守住 VWAP 才保留。'],
  AAPL:['EPS 2.02、營收 109.42B 雙 Beat，但含每股 0.11 美元關稅退款。','高估值、記憶體成本與後續指引成為市場焦點。','跌破週度 -1SD；未收回 317.88 前不抄底。'],
  COIN:['加密 beta 轉弱。','與 IBIT 盤前下跌相互確認。','未收回 VWAP 前維持防守。'],
  MSTR:['比特幣代理隨 IBIT 走弱。','高 beta 流動性偏好降溫。','避免逆勢摸底。'],
  ABBV:['醫療個股盤前承壓。','防守板塊內部並非全面走強。','觀察 XLV 是否維持相對強勢。'],
  XOM:['原油上漲但個股回落。','能源 ETF 與權重股出現分歧。','不以油價單一訊號追能源。'],
  NFLX:['大型成長股盤前偏弱。','顯示 QQQ 上漲並非全線。','未收回 VWAP 前維持觀察。'],
  NOW:['企業軟體延續弱勢。','與 CRM 同步，軟體落後晶片。','相對弱勢不搶反彈。'],
  CRM:['大型軟體走弱。','科技內部仍是晶片強、軟體弱。','收回 VWAP 前不升級。']
};
const moverTickers = ['AMZN','MRVL','SNDK','ARM','AMAT','LRCX','INTC','AMD','AAPL','COIN','MSTR','ABBV','XOM','NFLX','NOW','CRM'];
const moverTableRows = moverTickers.map(t => {
  const r = movers[t] || pre[t]; const m = moverMeta[t];
  return `<tr><td><strong class="ticker-nowrap">${t}</strong></td><td class="num">${n(r.price, t === 'AMZN' ? 2 : 2)}</td><td class="num ${cls(r.changePct)}">${pct(r.changePct)}</td><td>${m[0]}<small>長橋盤前量 ${vol(r.volume)}</small></td><td>${m[1]}</td><td>${m[2]}</td></tr>`;
}).join('');

const sectorTickers = ['SPY','XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLK','XLU','XLRE','XLB'];
const sectors = sectorTickers.map(t => close[t]).filter(Boolean).sort((a,b) => b.rsi14 - a.rsi14);
const thematic = [...thematicRowsRaw, {...close.SPY, aboveMa20:close.SPY.above20, aboveMa50:close.SPY.above50, aboveMa200:close.SPY.above200}]
  .filter((r, i, a) => a.findIndex(x => x.ticker === r.ticker) === i).sort((a,b) => b.rsi14 - a.rsi14);
const techTable = rows => table(['ETF','1日','5日','1月','離高點','20/50/200MA','RSI'], rows.map(techRow), 'report-data-table etf-technical-table');

const thematicChartRows = [
  ['XOP',13.36],['FXI',15.61],['KWEB',14.67],['XSW',5.73],['SPY',-0.68],['SMH',-17.84],['TAN',-15.74],['REMX',-24.92]
].map(([t,v]) => `<div class="bar-row"><span class="lbl">${t}</span><span class="val ${v >= 0 ? 'pos' : 'neg'}">${pct(v)}</span><div class="bar-track"><span class="b ${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(v) / 25 * 48).toFixed(2)}%"></span></div></div>`).join('');

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<strong>Q2 就業成本指數</strong><small>08:30 ET｜已公布</small>'),numTd('+0.9%'),numTd('+0.8%'),numTd('+0.9%'),td(badge('高於預期','red'))],
  [td('<strong>Chicago PMI</strong><small>09:45 ET｜已公布</small>'),numTd('57.6'),numTd('56.0'),numTd('56.7'),td(badge('Beat','green'))],
  [td('<strong>密西根大學消費者信心終值</strong><small>10:00 ET｜已公布</small>'),numTd('55.2'),numTd('54.0'),numTd('49.5'),td(badge('Beat','green'))],
  [td('<strong>AAPL 財報</strong><small>盤後已公布</small>'),numTd('EPS 2.02<br>營收 109.42B'),numTd('EPS 1.89<br>營收 109.00B'),numTd('EPS 1.57<br>營收 94.04B'),td(badge('Beat / Beat','green'))],
  [td('<strong>AMZN 財報</strong><small>盤後已公布</small>'),numTd('EPS 5.75<br>營收 200.60B'),numTd('EPS 1.82<br>營收 197.03B'),numTd('EPS 1.68<br>營收 167.70B'),td(badge('Beat / Beat','green'))]
], 'report-data-table macro-results-table');

const checklist = [
  ['S&P 500 overextension／標普過度延伸','Low','SPY 距 50MA -0.25 ATR','並非向上過熱；主要風險仍在科技均線。','low'],
  ['Increasing downward momentum／下行動能增加','Intermediate','QQQ 5日 -1.22%、SMH -7.11%','前日反彈，但中短線動能尚未完全修復。','mid'],
  ['Top range breakdown／高位區間破位','High','QQQ、SMH 低於 20／50MA','盤前走強尚未等於收盤收復。','high'],
  ['Technical deterioration／技術惡化','Intermediate','四大 ETF 僅 DIA、IWM 高於 50MA','SPY、QQQ 仍低於 20／50MA。','mid'],
  ['Market breadth worsening／市場廣度惡化','High','SPX >20MA 63.02%→56.06%','指數反彈時廣度反而收縮。','high'],
  ['VIX >20／波動升溫','Low','VIX 17.09；五項分數 1/5','>20 0/1、5日>0 0/1、1月>0 1/1、20MA 0/1、50MA 0/1。','low'],
  ['Breakout win rate down／突破勝率下降','Intermediate','Stockbee 5D／10D 0.88／0.91','明顯回升但仍低於 1。','mid'],
  ['Theme momentum weakening／主題動能轉弱','High','SMH 1月 -17.84%','晶片反彈尚未扭轉月線弱勢。','high']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(x => `<div class="risk-check-row ${x[4]}"><div class="risk-check-name">${x[0]}</div><div class="risk-check-level">${badge(x[1], x[4] === 'high' ? 'red' : x[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${x[2]}</strong><small>${x[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist Score：3/8 High｜Intermediate Risk。</strong>VIX 機械分數降至 1/5，但均線與廣度尚未同步修復，不能只看低 VIX 宣告全面 risk-on。</div>`;

const major = ['IWM','DIA','SPY','QQQ'].map(t => {
  const r = close[t], p = pre[t];
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r)),numTd(n(r.rsi14)),td(t === 'QQQ' ? '先看 691.53 能否守 VWAP，再挑戰 20MA 702.25。' : '以 VWAP 與盤前低點管理。')];
});
const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','行動'], major, 'report-data-table major-etf-table')
  .replace('<table class="report-data-table major-etf-table">', '<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrRows = ['SPY','QQQ','DIA','IWM','RSP','SMH','XLK','GLD','SLV','USO','TLT','VIXY'].map(t => close[t]).filter(Boolean).sort((a,b) => b.extension50Atr-a.extension50Atr).map(r => [td(`<strong class="ticker-nowrap">${r.ticker}</strong>`),numTd(n(r.close)),numTd(n(r.ma50)),numTd(n(r.atr14)),numTd(n(r.extension50Atr),r.extension50Atr),td(Math.abs(r.extension50Atr)>=2?badge('延伸','amber'):badge('正常','blue'))]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows);

const breadthTable = table(['日期','SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA'], [
  ['2026-07-30','56.06','63.61','49.51','46.60','45.14','55.30'],
  ['2026-07-29','63.02','65.80','47.57','49.51','45.14','55.00'],
  ['2026-07-28','69.18','71.57','48.54','51.45','52.57','61.07']
].map(r => r.map((x,i)=>td(x,i?'num':''))), 'report-data-table breadth-history-table');
const stockbeeTable = table(['日期','4% 上漲','4% 下跌','5D ratio','10D ratio','季度 +25%','季度 -25%','T2108'], [
  ['2026-07-30','437','189','0.88','0.91','1213','1196','47.50'],
  ['2026-07-29','165','552','0.65','0.76','1172','1304','48.33'],
  ['2026-07-28','341','388','0.78','0.88','1261','1231','55.33']
].map(r => r.map((x,i)=>td(x,i?'num':''))));

const fxKeys = ['EWJ','EWY','EWG','EWU','EWZ','FXI','EWT','XAU','XAG','COPPER','CL','BTC'];
const fxRows = fxKeys.map(k => macro[k]).filter(Boolean).map(r => [td(`<strong class="ticker-nowrap">${r.key}</strong>`),numTd(n(r.close)),numTd(pct(r.dailyPct),r.dailyPct),numTd(pct(r.oneMonthPct),r.oneMonthPct),numTd(n(r.rsi14)),td(r.key === 'CL' ? '油價／通膨尾端' : r.key === 'BTC' ? '流動性 beta' : '區域或商品風險代理')]);
const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong>100.38</strong><small>10:13 ET；仍低於 102 風控門檻</small></div><div><span>原油代理</span><strong class="up">USO +2.13%</strong><small>重新抬高通膨尾端風險</small></div><div><span>黃金代理</span><strong class="dn">GLD -1.70%</strong><small>美元與實質利率壓力</small></div></div>${table(['資產','7/30收盤','1日','1月','RSI','含義'],fxRows)}`;

const bondRows = ['SHY','IEF','TLT'].map(t => {
  const r=pre[t]; const label={SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'}[t];
  const meaning={SHY:'政策路徑','IEF':'政策＋中期通膨','TLT':'長期通膨＋期限溢價＋財政'}[t];
  const signal={SHY:'近乎持平',IEF:'中段承壓',TLT:'長端最弱'}[t];
  return [td(`<strong>${t}｜${label}</strong>`),numTd(n(r.price)),numTd(pct(r.changePct),r.changePct),td(meaning),td(badge(signal,t==='TLT'?'red':t==='IEF'?'amber':'blue')),td(t==='TLT'?'ECI 偏熱與油價反彈令長端折現壓力最大。':'期限越短，盤前跌幅越小。')];
});
const bondTable = `${table(['期限代理','盤前','盤前變化','主要定價','訊號','判讀'],bondRows,'report-data-table report-cols-6')}<div class="callout warn"><strong>長短債比較：</strong>SHY -0.06%、IEF -0.25%、TLT -0.41%，期限越長跌幅越大。這代表長端承壓最重，但 ETF 久期不同，不能只憑跌幅斷言殖利率曲線陡峭化；要用 2Y／10Y 殖利率確認。</div>`;

const tradeRows = ['IWM','DIA','SPY','QQQ','SMH','XLK','USO','TLT'].map(t => {
  const r=close[t], p=pre[t] || {price:r.close,changePct:0};
  return [td(`<strong class="ticker-nowrap">${t}</strong>`),numTd(`${n(p.price)}<br>${pct(p.changePct)}`,p.changePct),numTd(n(r.ma20)),numTd(n(r.ma50)),td(ma(r)),td(t==='QQQ'?'守 VWAP 後再看 702.25。':t==='TLT'?'長端最弱，失守盤前低點即減少久期。':'以 VWAP 與盤前低點管理。')];
});

const data = {
  report_title:'2026-07-31｜美股盤前監控', report_eyebrow:'2026-07-31｜盤前補充更新',
  report_heading:'AMZN 與晶片推升 QQQ，AAPL 跌破週度下界；ECI 偏熱令長債承壓',
  qqq_reengage_20ma:'702.25', qqq_breakout_add_1sd:'706.80',
  data_timestamp_note:'長橋盤前股票快照截至 09:30 ET；RSI、均線、ATR、三大指數廣度與 Stockbee 截至 7/30 收盤；DXY 截至 10:13 ET。Sector Dashboard、Thematic Sectors、Macro 為三個主資料表。',
  risk_badge:'中等風險｜Checklist 3/8、VIX 1/5、財報高度分化',
  summary_cards:`<div class="card"><span>SPY／QQQ 盤前</span><strong><span class="up">+0.40%</span>／<span class="up">+1.17%</span></strong><small>AMZN 與晶片支撐。</small></div><div class="card"><span>AMZN／AAPL</span><strong><span class="up">+11.38%</span>／<span class="dn">-8.76%</span></strong><small>同為雙 Beat，市場交易指引與估值。</small></div><div class="card"><span>ECI Actual／Forecast</span><strong><span class="dn">0.9%</span>／0.8%</strong><small>勞動成本略熱。</small></div><div class="card"><span>SHY／IEF／TLT</span><strong>-0.06%／<span class="dn">-0.25%</span>／<span class="dn">-0.41%</span></strong><small>期限越長越弱。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才由中等風險轉向進攻：科技收復均線、廣度擴散、長端止跌。',
  upgrade_trigger_1:'QQQ 守住 VWAP 並收回 20MA 702.25；SMH 守住 VWAP。',
  upgrade_trigger_2:'NDX >20MA 維持 50% 以上，SPX >20MA 不再下降。',
  upgrade_trigger_3:'TLT 止跌、DXY 維持 102 下方，油價不再急升。',
  downgrade_trigger_rule:'任一觸發即轉防守：財報缺口失敗、長端再跌、廣度續弱。',
  downgrade_trigger_1:'QQQ 跌回 684.23 週度中樞或 AMZN 失守 VWAP。',
  downgrade_trigger_2:'AAPL 跌破 302.73（週度 -2SD）且未快速收回。',
  downgrade_trigger_3:'TLT 再破盤前低點、DXY 走向 102，長端折現壓力升級。',
  core_conclusions:`<ol><li><strong>盤前是高度分化的財報行情。</strong>AMZN +11.38%，AAPL -8.76%；兩者都雙 Beat，差別在 AWS／AI 需求與 Apple 的高估值、記憶體成本及一次性關稅退款。</li><li><strong>晶片修復有廣度。</strong>MRVL、SNDK、ARM、AMAT、LRCX、INTC、AMD 同步上漲，SMH +3.45%，比單一權重股反彈更可信。</li><li><strong>但技術結構未完成反轉。</strong>QQQ、SMH 仍低於 20／50MA，5日與1月表現仍弱。</li><li><strong>ECI 對 Fed 並不友善。</strong>0.9% 高於 0.8% 共識；芝加哥 PMI 與密大信心又偏強，降低立即轉鴿的必要性。</li><li><strong>長短債確認期限壓力。</strong>SHY -0.06%、IEF -0.25%、TLT -0.41%，長端最弱；油價 +2.13% 加重通膨尾端。</li><li><strong>廣度訊號互相矛盾。</strong>Stockbee 極端上漲家數回升，但 SPX／NDX／IWM 均線廣度未同步改善，仍不能叫全面 risk-on。</li></ol><p class="section-summary"><strong>本段結論：</strong>今天可交易科技修復，但只能以 VWAP、週度邊界和長債是否止跌確認；主線是相對強弱，不是無差別追 QQQ。</p>`,
  positioning_primary:'主線：AMZN 與晶片設備／記憶體修復；守 VWAP 才保留。', positioning_secondary:'次線：AAPL、軟體與加密 beta 偏弱，維持低配。',
  positioning_watch:'觀察：QQQ 684.23／702.25、AAPL 317.88／302.73、AMZN 249.16／266.21、DXY 102、TLT 盤前低點。', positioning_invalidation:'AMZN 與 SMH 同失 VWAP，且 TLT 再創盤前低點。',
  pre_market_movers_rows:moverTableRows, pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>上漲榜集中 AMZN 與半導體；下跌榜集中 AAPL、加密 beta 與軟體。成交量與漲跌幅均取自長橋 09:30 ET 快照。</p>',
  section_pre_market_movers_primary_action:'主線：只做 AMZN 與半導體的相對強勢，不追開盤第一段。', section_pre_market_movers_condition_action:'條件：AMZN、SMH、設備鏈至少兩檔守 VWAP。', section_pre_market_movers_avoid_action:'避免：把 AAPL 的財報 Beat 當成股價必須上漲。', premarket_movers_invalidation:'AMZN／SMH 同失 VWAP，盤前科技修復失效。',
  correction_checklist_dashboard:checklistHtml, section_correction_checklist_primary_action:'主線：3/8 High，但廣度與均線仍限制風險預算。', section_correction_checklist_condition_action:'條件：High 項降至 2 項以下再轉攻。', section_correction_checklist_avoid_action:'避免：只因 VIX 1/5 就忽略長債與廣度。', checklist_invalidation:'QQQ／SMH 收回 20MA、兩組廣度同向改善才可明顯降級。',
  macro_premarket_background_table:`${macroEvents}<p class="section-summary"><strong>本段結論：</strong>ECI 略熱、Chicago PMI 與密大信心偏強；AAPL／AMZN 都雙 Beat，但股價反應相反，必須讀指引、一次性項目與估值。</p>`,
  section_macro_premarket_background_primary_action:'主線：把 ECI 與長債反應放在財報交易旁共同判斷。', section_macro_premarket_background_condition_action:'條件：TLT 止跌且 DXY 不升破 102，科技估值壓力才算緩和。', section_macro_premarket_background_avoid_action:'避免：只看 EPS Beat／Miss，不看營收、指引與一次性收益。', macro_invalidation:'長債續跌且油價擴大升幅，偏多宏觀條件失效。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜長橋 44 檔＋SPY 基準，按 RSI 由高至低</h3>${techTable(thematic)}<p class="section-summary"><strong>本段結論：</strong>FXI／KWEB／SLX／XOP RSI 居前；SMH、TAN、REMX 位於弱勢端。完整 45 檔保留，SPY 作基準。</p>`,
  section_sector_thematic_etf_primary_action:'主線：順勢觀察中國、能源與軟體；晶片只做修復。', section_sector_thematic_etf_condition_action:'條件：SMH 收回 20MA 才由修復升級為趨勢。', section_sector_thematic_etf_avoid_action:'避免：以單日大漲取代 RSI 與均線排序。', sector_etf_invalidation:'若 FXI／KWEB 跌回 VWAP 且 XOP 轉弱，領先主題需重排。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 只看 IWM、DIA、SPY、QQQ；QQQ 盤前最強，但仍在 20MA 702.25 下方。</p>`,
  section_major_etf_technical_primary_action:'主線：QQQ 相對強，但以 702.25 為重新進攻門檻。', section_major_etf_technical_condition_action:'條件：QQQ 守 VWAP、SPY 同步轉強。', section_major_etf_technical_avoid_action:'避免：在 QQQ 低於 20／50MA 時追高。', major_etf_invalidation:'QQQ 跌破 684.23 週度中樞。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>TLT -3.30 ATR、QQQ -2.06 ATR、SMH -2.04 ATR，長債與科技仍明顯低於 50MA；RSP +2.05 ATR 顯示等權結構相對穩。</p>`,
  section_50ma_atr_extension_primary_action:'主線：做相對強弱，不追極端延伸。', section_50ma_atr_extension_condition_action:'條件：QQQ／SMH 距 50MA ATR 明顯收窄才加倉。', section_50ma_atr_extension_avoid_action:'避免：只因跌深就假設均值回歸。', atr_extension_invalidation:'若 TLT、QQQ、SMH 同時再擴大負延伸，降低總風險。',
  market_breadth_table:`${breadthTable}${stockbeeTable}`,
  stockbee_breadth_interpretation:'<div class="callout warn"><strong>綜合廣度：</strong>Stockbee 4% 上漲／下跌由 165／552 改善至 437／189，5D／10D ratio 升至 0.88／0.91；但 SPX >20MA 由 63.02% 降至 56.06%，NDX >50MA 由 49.51% 降至 46.60%，IWM >20MA 僅 45.14%。Stockbee 顯示反彈，三大指數均線廣度卻沒有確認，屬「極端跌勢緩和、結構仍弱」。</div>',
  section_market_breadth_primary_action:'主線：必須同時看三大指數與 Stockbee，今天等待兩者共同改善。', section_market_breadth_condition_action:'條件：SPX／NDX >20MA 上升且 Stockbee 5D／10D 同站 1 以上。', section_market_breadth_avoid_action:'避免：只用 437 檔大漲股宣告全面風險偏好。', breadth_invalidation:'若指數上漲但 SPX／NDX 廣度再降，視為權重股行情。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 100.38 沒有消失，仍低於 102；但油價盤前 +2.13%、黃金與白銀回落，配合長債走弱，顯示市場正在交易通膨與實質利率，而不是單純避險。</p>`,
  section_fx_commodities_primary_action:'主線：DXY、USO、GLD 與 TLT 交叉驗證。', section_fx_commodities_condition_action:'條件：DXY 守 102 下方、油價降溫、TLT 止跌。', section_fx_commodities_avoid_action:'避免：把美元低於 102 當成科技估值壓力已消失。', forex_commodity_invalidation:'DXY 升破 102 或油價與長端殖利率同步上行。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>ECI QoQ</span><strong class="dn">0.9%</strong><small>高於 0.8% 共識</small></div><div><span>DXY</span><strong>100.38</strong><small>仍低於 102</small></div><div><span>TLT 盤前</span><strong class="dn">-0.41%</strong><small>長端最弱</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>Fed 含義：</strong>ECI 略熱、密大一年通膨預期仍有 4.2%，而 7/29 FOMC 已呈偏鷹分歧。短債近乎持平而長債更弱，代表市場沒有把近期軟數據解讀為全面轉鴿。</div>`,
  section_treasury_fed_primary_action:'主線：控制久期；科技可反彈，但長端折現壓力未解除。', section_treasury_fed_condition_action:'條件：TLT 至少追上 IEF、DXY 不升破 102，才視為政策條件改善。', section_treasury_fed_avoid_action:'避免：只看 SHY 穩定就宣告 Fed 轉鴿。', treasury_invalidation:'TLT 再破盤前低點且 DXY／油價上行。',
  trading_plan:`${table(['ETF','盤前','20MA','50MA','狀態','行動'],tradeRows)}<p class="section-summary"><strong>本段結論：</strong>做 AMZN／晶片相對強，空間以週度邊界與 VWAP 管理；AAPL、軟體、加密 beta 維持防守，長債止跌前不擴大高估值曝險。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','AMZN／SMH 守 VWAP','財報與晶片修復獲確認','保留相對多頭，不追缺口第一段。'],
    ['09:30 ORB','AAPL 未收回 317.88','-1SD 破位持續','不抄底，觀察是否拖累 QQQ。'],
    ['10:00 ET','QQQ 站上 702.25','收回 20MA','小幅提高科技風險預算。'],
    ['10:00 ET','TLT 再創低、USO 擴大上漲','通膨與期限溢價升級','降低長久期與高估值。'],
    ['15:30 MOC','SPX／NDX 廣度未跟漲','仍是權重股行情','收縮隔夜曝險。']
  ].map(r=>`<tr>${r.map(x=>td(x)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout warn"><strong>宏觀交叉：</strong>ECI 0.9% 高於 0.8% 預期；Chicago PMI 57.6 與密大信心 55.2 都高於預期，並不支持立即轉鴿。</div><div class="callout risk"><strong>財報交叉：</strong>AAPL 與 AMZN 都雙 Beat，盤前卻 -8.76%／+11.38%，說明市場在交易指引、一次性收益與估值，而非標籤。</div><div class="callout"><strong>債券交叉：</strong>SHY -0.06%、IEF -0.25%、TLT -0.41%；長端最弱，與 ECI、油價相互確認。</div><div class="callout"><strong>廣度交叉：</strong>Stockbee 極端上漲家數反彈，但三大指數均線廣度未確認，不能把 QQQ 盤前上漲外推成全面 risk-on。</div><h3>資料來源</h3><p class="sources">長橋 OpenAPI：2026-07-31 09:30 ET 盤前價格與成交量、截至 2026-07-30 的 RSI／MA／ATR；<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch：Sector Dashboard、Thematic Sectors、Macro、Market Breadth、Weekly Expected Move</a>；<a href="https://www.bls.gov/news.release/eci.nr0.htm">BLS：Q2 Employment Cost Index</a>；<a href="https://www.sca.isr.umich.edu/">University of Michigan：七月消費者信心終值</a>；<a href="https://apnews.com/article/apple-earnings-revenue-iphone-ai-94102918cb3592ebc1d2a38c4d7d819a">AP：Apple 財報</a>；<a href="https://apnews.com/article/amazon-second-quarter-earnings-cloud-b4ce02b4666a35b8975823c5c22072ee">AP：Amazon 財報</a>；<a href="https://tradingeconomics.com/calendar?country=united-states">Trading Economics：Chicago PMI 即時值</a>；Yahoo Finance：VIX／DXY 即時與歷史資料。</p><p class="source-note">本報告為 2026-07-31 美股盤前補充更新，不構成投資建議。DXY 為 10:13 ET 補抓；其餘盤前股票快照固定於 09:30 ET，避免以盤中資料偽裝盤前。</p>`
};

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', thematicChartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(m => m[1]);
if (unresolved.length) throw new Error(`Unresolved placeholders: ${unresolved.join(', ')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-07-31-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-07-31-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-07-31-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,unresolved:unresolved.length},null,2));
