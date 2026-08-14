#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DATE = '2026-08-14';
const CLOSE_DATE = '2026-08-13';
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-longbridge.json'), 'utf8'));
const adjustedSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-longbridge-adjusted.json'), 'utf8'));
const sheetSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-14-google-sheet.json'), 'utf8'));
const close = Object.fromEntries(snapshot.rows.map(row => [row.ticker, row]));
const adjusted = Object.fromEntries(adjustedSnapshot.rows.map(row => [row.ticker, row]));
const quotes = Object.fromEntries(snapshot.quotes.map(row => [row.ticker, row]));

const number = value => Number(value);
const n = (value, digits = 2) => Number(value).toFixed(digits);
const pct = (value, digits = 2) => `${Number(value) >= 0 ? '+' : ''}${n(value, digits)}%`;
const cls = value => Number(value) > 0 ? 'up' : Number(value) < 0 ? 'dn' : '';
const td = (value, klass = '') => `<td${klass ? ` class="${klass}"` : ''}>${value}</td>`;
const numTd = (value, direction = null) => td(value, `num${direction === null ? '' : ` ${cls(direction)}`}`);
const badge = (text, tone = 'blue') => `<span class="badge ${tone}">${text}</span>`;
const table = (heads, rows, klass = 'report-data-table', numeric = []) => `<div class="table-scroll"><table class="${klass}"><thead><tr>${heads.map((head, index) => `<th${numeric.includes(index) ? ' class="num"' : ''}>${head}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;
const volume = value => Number(value) >= 1e4 ? `${n(Number(value) / 1e4, 1)}萬股` : `${Number(value || 0).toLocaleString('zh-HK')}股`;
const parsePct = value => Number(String(value ?? '').replace('%', '').replace('+', ''));

function currentSession(row) {
  if (!row?.raw) return null;
  const candidates = [
    ['盤前', row.raw.pre_market],
    ['隔夜', row.raw.overnight]
  ];
  for (const [label, raw] of candidates) {
    if (!raw || !String(raw.timestamp || '').startsWith(REPORT_DATE)) continue;
    const price = number(raw.last);
    const previousClose = number(raw.prev_close);
    if (!(price > 0) || !(previousClose > 0)) continue;
    return {
      ticker: row.ticker,
      label,
      price,
      previousClose,
      changePct: (price / previousClose - 1) * 100,
      volume: number(raw.volume || 0),
      turnover: number(raw.turnover || 0),
      timestamp: raw.timestamp
    };
  }
  return null;
}

const sessions = Object.fromEntries(snapshot.quotes.map(row => [row.ticker, currentSession(row)]).filter(([, row]) => row));
const sessionTimestamps = Object.values(sessions).map(row => row.timestamp).filter(Boolean).sort();
const sessionCutoff = sessionTimestamps.at(-1) || snapshot.generatedAt;
const requireRow = ticker => {
  if (!close[ticker]) throw new Error(`缺少技術資料：${ticker}`);
  return close[ticker];
};
const requireSession = ticker => {
  if (!sessions[ticker]) throw new Error(`缺少當前隔夜／盤前資料：${ticker}`);
  return sessions[ticker];
};
const sessionDisplay = (ticker, minVolume = 100) => {
  const row = sessions[ticker];
  if (!row || row.volume < minVolume) return {text:'—', direction:null, note:'薄量／未形成'};
  return {text:`${n(row.price)}<br>${pct(row.changePct)}`, direction:row.changePct, note:`${row.label} ${volume(row.volume)}`};
};

const sheetTicker = label => {
  const text = String(label ?? '');
  return text.match(/\(([A-Z0-9.]+)\)\s*$/)?.[1] || text.match(/^([A-Z0-9.]+)\s*:/)?.[1] || null;
};
const sheetJudgment = value => {
  const text = String(value ?? '');
  if (text.includes('Strong Trend')) return '強勢趨勢';
  if (text.includes('Uptrend')) return '上升趨勢';
  if (text.includes('Downtrend') || text.includes('Weak')) return '弱勢';
  return '混合';
};
const parseSheetRows = (values, universe) => {
  const expected = new Set(universe);
  const rows = values.map((row, sourceIndex) => {
    const ticker = sheetTicker(row[0]);
    if (!ticker || !expected.has(ticker)) return null;
    const base = adjusted[ticker] || close[ticker];
    const states = String(row[13] ?? '').match(/🟢|⚪/gu) || [];
    if (!base || states.length !== 3) throw new Error(`Google Sheet 技術列無法解析：${ticker}`);
    return {
      ...base,
      ticker,
      close:number(row[1]),
      dailyPct:parsePct(row[2]),
      oneMonthPct:parsePct(row[4]),
      distanceFrom52wHighPct:parsePct(row[10]),
      rsi14:number(row[12]),
      above20:states[0] === '🟢',
      above50:states[1] === '🟢',
      above200:states[2] === '🟢',
      sheetJudgment:sheetJudgment(row[14]),
      sourceIndex
    };
  }).filter(Boolean);
  const found = new Set(rows.map(row => row.ticker));
  const missing = universe.filter(ticker => !found.has(ticker));
  if (rows.length !== universe.length || missing.length) throw new Error(`Google Sheet ETF 缺列：${missing.join(', ')}`);
  return rows;
};
const ma = row => `<span class="ticker-nowrap">${row.above20 ? '<span class="up">20MA ▲</span>' : '<span class="dn">20MA ▼</span>'} ${row.above50 ? '<span class="up">50MA ▲</span>' : '<span class="dn">50MA ▼</span>'} ${row.above200 ? '<span class="up">200MA ▲</span>' : '<span class="dn">200MA ▼</span>'}</span>`;
const judgment = row => {
  if (row.sheetJudgment) return row.sheetJudgment;
  if (row.above20 && row.above50 && row.above200 && row.rsi14 >= 60) return '強勢趨勢';
  if (row.above20 && row.above50 && row.above200) return '上升趨勢';
  if (!row.above20 && row.above50 && row.above200) return '短線回吐';
  if (!row.above20 && !row.above50 && row.above200) return '中期承壓';
  if (!row.above20 && !row.above50 && !row.above200) return '弱勢';
  return '混合';
};
const techRow = row => [
  td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),
  numTd(pct(row.fiveDayPct), row.fiveDayPct),
  numTd(pct(row.oneMonthPct), row.oneMonthPct),
  numTd(pct(row.distanceFrom52wHighPct), row.distanceFrom52wHighPct),
  td(ma(row), 'ma-cell'),
  numTd(n(row.rsi14)),
  td(judgment(row))
];
const techTable = rows => table(['ETF','5日','1月','距52週高','20/50/200MA','RSI','判斷'], rows.map(techRow), 'report-data-table etf-technical-table', [1,2,3,5]);

const sectors = parseSheetRows(sheetSnapshot.sectorDashboard.values, snapshot.universes.sectors).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const thematic = parseSheetRows(sheetSnapshot.thematicSectors.values, snapshot.universes.themes).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const sheetTech = Object.fromEntries([...sectors, ...thematic].map(row => [row.ticker, row]));
const displayTech = ticker => sheetTech[ticker] || adjusted[ticker] || requireRow(ticker);

const chartTickers = ['XSW','BUG','XLF','CIBR','SPY','SMH','IBIT','KWEB'];
const chartRows = chartTickers.map(ticker => {
  const row = displayTech(ticker);
  const value = row.oneMonthPct;
  return `<div class="bar-row"><span class="lbl">${ticker}</span><span class="val ${value >= 0 ? 'pos' : 'neg'}">${pct(value)}</span><div class="bar-track"><span class="b ${value >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(value) / 15 * 48).toFixed(2)}%"></span></div></div>`;
}).join('');

const moverMeta = {
  AMAT:['Q3 營收 91.15 億美元、非 GAAP EPS 3.50，雙雙高於共識；Q4 指引仍強。','財報後仍跌，市場在消化高預期與擴產／毛利節奏。','先看 505 附近隔夜低位與開盤 VWAP，不把 Beat 直接等同股價利多。'],
  LRCX:['AMAT 財報後設備股同業讀穿，未見本輪獨立公司消息。','若與 KLAC 同時落後 SMH，才確認設備鏈壓力擴散。','只按板塊 beta 管理，等待 SMH 重新站上 50MA。'],
  KLAC:['跟隨 AMAT 的半導體設備同業重估。','幅度小於 AMAT，暫時偏公司預期差而非全板塊崩壞。','與 LRCX、SMH 的 VWAP 同步確認。'],
  SNDK:['隔夜延續記憶體強勢，成交量明顯。','與 MU 同向，抵消 AMAT 對整個 AI 硬件鏈的負面外推。','高價股波動大，只在首小時守 VWAP時保留。'],
  MU:['記憶體需求仍獲承接，與 SNDK 同向。','顯示設備股壓力尚未全面傳至記憶體。','若轉負且 SMH 失守，才升級成晶片廣泛風險。'],
  INTC:['隔夜有量上漲，但未見新硬催化。','與 MU／MRVL 同向，支持晶片內部分化。','只作板塊確認，不單獨追價。'],
  MRVL:['AI 網路與資料中心鏈相對有承接。','和記憶體正向、設備股負向形成硬件內部分化。','成交量有效但幅度有限，等開盤擴散。'],
  PLTR:['高估值 AI 軟體隔夜回吐，未見新公司消息。','XSW 收盤極度延伸，個股回吐是追價風險提醒。','未失守 VWAP 前只視為正常降溫。'],
  USO:['8/13 收盤下跌後隔夜反彈。','油價重新上行會同時抬高通膨與長端利率風險。','8:30 後與 10Y、XLE 同向才採信。'],
  GLD:['PPI 後收盤走弱，隔夜再小幅回吐。','TLT 同時偏弱，顯示零售數據前利率交易尚未延續。','只在 TLT 回升且美元不轉強時做多。']
};
const moverTickers = Object.keys(moverMeta);
const moverRows = moverTickers.map(ticker => {
  const row = requireSession(ticker);
  const meta = moverMeta[ticker];
  return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${meta[0]}<small>${row.label} ${volume(row.volume)}</small></td><td>${meta[1]}</td><td>${meta[2]}</td></tr>`;
}).join('');

const vix = requireRow('.VIX');
const vixScore = [vix.close > 20, vix.dailyPct > 0, vix.fiveDayPct > 0, vix.above20, vix.above50].filter(Boolean).length;
const technicalScore = ['SPY','QQQ','IWM'].map(requireRow).reduce((score, row) => score + [!row.above20,!row.above50,!row.above200,row.rsi14 < 50].filter(Boolean).length, 0);

const breadthValues = sheetSnapshot.marketBreadth.values;
const stockbeeValues = sheetSnapshot.stockbee.values;
const breadthByDate = date => breadthValues.find(row => row[0] === date);
const stockbeeByDate = date => stockbeeValues.find(row => row[0] === date.replace(/^2026-(\d{2})-(\d{2})$/, (_, month, day) => `${Number(month)}/${Number(day)}/2026`));
const breadthLatest = breadthByDate('2026-08-13');
const breadthPrior = breadthByDate('2026-08-12');
const breadthFiveDay = breadthByDate('2026-08-07');
const stockLatest = stockbeeByDate('2026-08-13');
const stockPrior = stockbeeByDate('2026-08-12');
const stockFiveDay = stockbeeByDate('2026-08-07');
if (!breadthLatest || !breadthPrior || !breadthFiveDay || !stockLatest || !stockPrior || !stockFiveDay) throw new Error('Google Sheet 廣度端點不完整');
const breadthScore = [1,2,3,4,5,6].filter(index => number(breadthLatest[index]) < number(breadthFiveDay[index])).length
  + [3,4].filter(index => number(stockLatest[index]) < number(stockFiveDay[index])).length;

const changeText = (latest, previous, suffix = 'pp') => {
  const delta = number(latest) - number(previous);
  return `${number(previous).toFixed(2)} → ${number(latest).toFixed(2)} <span class="${cls(delta)}">(${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${suffix})</span>`;
};
const breadthRows = [
  ['SPX >20MA',`${breadthLatest[1]}%`,changeText(breadthLatest[1], breadthPrior[1]),changeText(breadthLatest[1], breadthFiveDay[1]),'短中期均改善。'],
  ['SPX >50MA',`${breadthLatest[2]}%`,changeText(breadthLatest[2], breadthPrior[2]),changeText(breadthLatest[2], breadthFiveDay[2]),'中期參與度接近七成。'],
  ['NDX >20MA',`${breadthLatest[3]}%`,changeText(breadthLatest[3], breadthPrior[3]),changeText(breadthLatest[3], breadthFiveDay[3]),'日內持平，五日小幅回落。'],
  ['NDX >50MA',`${breadthLatest[4]}%`,changeText(breadthLatest[4], breadthPrior[4]),changeText(breadthLatest[4], breadthFiveDay[4]),'五日改善最明顯。'],
  ['IWM >20MA',`${breadthLatest[5]}%`,changeText(breadthLatest[5], breadthPrior[5]),changeText(breadthLatest[5], breadthFiveDay[5]),'小型股短線參與健康。'],
  ['IWM >50MA',`${breadthLatest[6]}%`,changeText(breadthLatest[6], breadthPrior[6]),changeText(breadthLatest[6], breadthFiveDay[6]),'五日略降 0.28pp。'],
  ['T2108',`${stockLatest[14]}%`,changeText(stockLatest[14], stockPrior[14]),changeText(stockLatest[14], stockFiveDay[14]),'高於五成，中性偏多。'],
  ['Stockbee 5D ratio',stockLatest[3],changeText(stockLatest[3], stockPrior[3], ''),changeText(stockLatest[3], stockFiveDay[3], ''),'高於 1，但低於上週脈衝。'],
  ['Stockbee 10D ratio',stockLatest[4],changeText(stockLatest[4], stockPrior[4], ''),changeText(stockLatest[4], stockFiveDay[4], ''),'高於 2，利於多頭波段。'],
  ['4%+ 上漲／下跌',`${stockLatest[1]}／${stockLatest[2]}`,`${stockPrior[1]}／${stockPrior[2]} → ${stockLatest[1]}／${stockLatest[2]}`,`${stockFiveDay[1]}／${stockFiveDay[2]} → ${stockLatest[1]}／${stockLatest[2]}`,'買盤重新佔優。'],
  ['季度 +25%／-25%',`${stockLatest[5]}／${stockLatest[6]}`,`${stockPrior[5]}／${stockPrior[6]} → ${stockLatest[5]}／${stockLatest[6]}`,`${stockFiveDay[5]}／${stockFiveDay[6]} → ${stockLatest[5]}／${stockLatest[6]}`,'中期強股明顯多於弱股。'],
  ['單月 +50%／-50%',`${stockLatest[9]}／${stockLatest[10]}`,`${stockPrior[9]}／${stockPrior[10]} → ${stockLatest[9]}／${stockLatest[10]}`,`${stockFiveDay[9]}／${stockFiveDay[10]} → ${stockLatest[9]}／${stockLatest[10]}`,'強股過熱，雙尾分化高。']
];
const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'], breadthRows.map(row => row.map((value, index) => td(value, index === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

const checklist = [
  ['S&amp;P 500 overextension／大盤過度延伸','Intermediate',`SPY +${n(adjusted.SPY.distance50Atr)} ATR；XSW +${n(adjusted.XSW.distance50Atr)} ATR`,'趨勢強，但軟體與大盤追價回報風險下降。','mid'],
  ['Increasing downward momentum／下行動能增加','Low',`SPY 5日 ${pct(close.SPY.fiveDayPct)}；QQQ ${pct(close.QQQ.fiveDayPct)}`,'指數五日動能仍向上。','low'],
  ['Top range breakdown／高位區間破位','Low','SPY 創收盤新高；四大 ETF 全在 20/50/200MA 上','未見主要指數破位。','low'],
  ['Technical deterioration／技術惡化','Low',`三大指數綜合 ${technicalScore}/12`,'SPY／QQQ／IWM 各以三條均線與 RSI<50 計分。','low'],
  ['Market breadth worsening／市場廣度惡化','Intermediate',`5日惡化 ${breadthScore}/8`,'NDX >20MA、IWM >50MA、Stockbee 5D 低於 8/7；其餘五項改善。','mid'],
  ['VIX >20 / VIX spike／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'只有單日上升觸發；低於 20MA、50MA 與 20。','low'],
  ['Breakout win rate down／突破勝率下降','Low',`Stockbee 5D ${stockLatest[3]}；10D ${stockLatest[4]}`,'兩項均高於 1，10D 高於 2。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate',`SMH 低於 50MA ${n(close.SMH.ma50)}；AMAT ${pct(sessions.AMAT.changePct)}`,'軟體趨勢強但延伸高，設備股接受財報壓力測試。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1], row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：0/8 High，3 項 Intermediate。</strong>結構仍偏多；追價與半導體設備財報風險高於指數反轉風險。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<span class="macro-event"><strong>七月 CPI</strong><small>8/12 08:30 ET</small></span>'),numTd('+0.1% MoM<br>+3.4% YoY'),numTd('+0.1%<br>+3.4%'),numTd('-0.4%<br>+3.5%'),td(badge('溫和降溫','green'))],
  [td('<span class="macro-event"><strong>七月核心 CPI</strong><small>8/12 08:30 ET</small></span>'),numTd('+0.2% MoM<br>+2.5% YoY'),numTd('+0.2%<br>+2.5%'),numTd('0.0%<br>+2.6%'),td(badge('符合預期','blue'))],
  [td('<span class="macro-event"><strong>七月 PPI</strong><small>8/13 08:30 ET</small></span>'),numTd('0.0% MoM<br>+4.7% YoY'),numTd('+0.2%<br>+4.9%'),numTd('-0.1%<br>+5.5%'),td(badge('低於預期','green'))],
  [td('<span class="macro-event"><strong>PPI 去食能與貿易</strong><small>七月</small></span>'),numTd('+0.4% MoM<br>+4.7% YoY'),numTd('—'),numTd('+0.1%<br>+5.0%'),td(badge('細項仍黏','amber'))],
  [td('<span class="macro-event"><strong>七月零售銷售</strong><small>今日 08:30 ET</small></span>'),numTd('待公布'),numTd('+0.1% MoM'),numTd('+0.2%'),td(badge('今日主事件','amber'))],
  [td('<span class="macro-event"><strong>零售銷售除汽車</strong><small>今日 08:30 ET</small></span>'),numTd('待公布'),numTd('+0.2% MoM'),numTd('-0.2%'),td(badge('需求底色','amber'))],
  [td('<span class="macro-event"><strong>密大消費者信心</strong><small>今日 10:00 ET｜八月初值</small></span>'),numTd('待公布'),numTd('54.5'),numTd('55.2'),td(badge('盤中確認','blue'))],
  [td('<span class="macro-event"><strong>AMAT 財報</strong><small>8/13 盤後｜FY2026 Q3</small></span>'),numTd('營收 $9.12B<br>EPS $3.50'),numTd('$8.99B<br>$3.40'),numTd('$7.30B<br>$2.48'),td(badge('Beat、股價跌','red'))]
], 'report-data-table macro-results-table', [1,2,3]);

const priorReviewRows = [
  [td('<strong>QQQ／SMH 久期反彈</strong><small>需 TLT 與 10Y 同向確認。</small>'),td('8/7→8/13：QQQ +1.25%、SMH +1.10%，但 TLT -0.21%。'),td(badge('命中','green')),td('價格方向正確，機制由單純久期轉成通膨降溫與風險偏好。')],
  [td('<strong>油銅止跌才升級 risk-on</strong><small>檢查增長敏感資產。</small>'),td('USO 同期 +5.98%，IWM +0.64%；增長資產未拖累指數。'),td(badge('已觸發','green')),td('保留油價對通膨與長端利率的反向風險。')],
  [td('<strong>SPY 高延伸不追第二段</strong><small>高於週波動上軌。</small>'),td('SPY 同期再升 0.60% 並創收盤新高，風控有效但偏保守。'),td(badge('偏保守','amber')),td('持有與追價分開；高延伸不等於做空。')],
  [td('<strong>五日廣度不惡化</strong><small>8/7 分數 0/8。</small>'),td(`8/13 分數升至 ${breadthScore}/8，但六項均線廣度仍全高於 60%。`),td(badge('未驗證','amber')),td('結論改為中期健康、短線三項降溫，不再寫成全面改善。')]
];
const priorReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/7）</h2>${table(['盤前主判斷','收盤事實','對賬','今日修正'], priorReviewRows, 'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：1 命中、1 已觸發、1 偏保守、1 未驗證。</strong>方向判斷可用，但今天需把高延伸、廣度降溫與 AMAT 預期差重新納入。</div><p class="section-summary"><strong>本段結論：</strong>保留「跨資產確認」方法；今晚不把 PPI 利多直接外推成零售數據後仍會上漲。</p></section>`;

const majorNotes = {
  IWM:'中小盤廣度仍健康；零售偏弱時要防增長擔憂壓過利率利多。',
  DIA:'五日略跌、但三條均線仍多頭；相對動能落後 QQQ。',
  SPY:`收盤距 50MA +${n(adjusted.SPY.distance50Atr)} ATR，趨勢強但不宜追第一段。`,
  QQQ:`三線多頭；隔夜微跌，零售後先看 50MA ${n(close.QQQ.ma50)} 的中期防線。`
};
const majorRows = ['IWM','DIA','SPY','QQQ'].map(ticker => {
  const row = requireRow(ticker);
  const live = requireSession(ticker);
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(live.price)}<br>${pct(live.changePct)}`, live.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(ma(row), 'ma-cell'),numTd(n(row.rsi14)),td(majorNotes[ticker])];
});
const majorTable = table(['ETF','隔夜','20MA','50MA','20/50/200MA','RSI','判斷'], majorRows, 'report-data-table major-etf-table', [1,2,3,5]).replace('<table class="report-data-table major-etf-table">', '<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrTickers = ['XSW','BUG','XLF','CIBR','IHI','IGV','SPY','XLE','DIA','GLD','REMX','WGMI','TLT'];
const atrRows = atrTickers.map(ticker => adjusted[ticker]).filter(Boolean).sort((a,b) => b.distance50Atr - a.distance50Atr).map(row => [
  td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),numTd(n(row.close)),numTd(n(row.ma50)),numTd(n(row.atr14)),numTd(n(row.distance50Atr), row.distance50Atr),td(Math.abs(row.distance50Atr) >= 2.5 ? badge('延伸','amber') : Math.abs(row.distance50Atr) >= 2 ? badge('接近延伸','blue') : badge('正常','green'))
]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows, 'report-data-table', [1,2,3,4]);

const macroSheetRow = ticker => {
  const row = sheetSnapshot.macro.values.find(value => {
    const label = String(value[0] ?? '');
    return label === ticker || label.includes(`(${ticker})`) || label.startsWith(`${ticker}｜`);
  });
  if (!row) throw new Error(`Google Sheet Macro 缺列：${ticker}`);
  const states = String(row[14] ?? '').match(/🟢|⚪/gu) || [];
  return {ticker,close:number(String(row[1]).replace('%','')),dailyPct:parsePct(row[2]),oneMonthPct:parsePct(row[4]),rsi14:number(row[13]),above20:states[0] === '🟢',above50:states[1] === '🟢',above200:states[2] === '🟢'};
};
const fxLabels = {FXE:'歐元代理',FXB:'英鎊代理',FXY:'日圓代理',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
const fxMeaning = row => {
  const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '均線中短線偏強' : !row.above20 && !row.above50 ? '均線中短線偏弱' : '均線趨勢混合';
  const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
  return `${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
};
const fxTickers = ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'];
const fxRows = fxTickers.map(macroSheetRow).map(row => {
  const live = sessions[row.ticker];
  const valid = live && live.volume >= 100;
  return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct), row.dailyPct),numTd(pct(row.oneMonthPct), row.oneMonthPct),numTd(valid ? pct(live.changePct) : '—', valid ? live.changePct : null),numTd(n(row.rsi14)),td(fxMeaning(row))];
});
const fxTable = `<div class="macro-policy-overview"><div><span>原油代理</span><strong class="up">USO ${pct(sessions.USO.changePct)}</strong><small>隔夜反彈</small></div><div><span>黃金</span><strong class="dn">GLD ${pct(sessions.GLD.changePct)}</strong><small>利率交易未延續</small></div><div><span>比特幣</span><strong class="dn">IBIT ${pct(sessions.IBIT.changePct)}</strong><small>風險資產小幅回吐</small></div></div>${table(['資產','8/13收盤','1日','1月','隔夜','RSI','趨勢／RSI 含義'], fxRows, 'report-data-table fx-trend-table', [1,2,3,4,5])}`;

const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
const bondRows = ['SHY','IEF','TLT'].map(ticker => {
  const live = sessions[ticker];
  const valid = live && live.volume >= 100;
  const signal = ticker === 'TLT' ? '長債隔夜偏弱，零售數據前未延續 PPI 後漲勢。' : ticker === 'IEF' ? '中段接近平盤，等待 08:30 重新定價。' : '短債成交太薄，不採用隔夜方向。';
  return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(valid ? n(live.price) : n(requireRow(ticker).close)),numTd(valid ? pct(live.changePct) : '—', valid ? live.changePct : null),td(signal)];
});
const bondTable = table(['ETF','隔夜／收盤','變化','含義'], bondRows, 'report-data-table bond-curve-table', [1,2]);

const tradeActions = {
  SPY:`高於 50MA ${n(close.SPY.ma50)} 且延伸 +${n(adjusted.SPY.distance50Atr)} ATR；持有不追。`,
  QQQ:`守 50MA ${n(close.QQQ.ma50)}；零售後若長端上升，降低高久期。`,
  IWM:`守 50MA ${n(close.IWM.ma50)}；零售偏弱且失守 VWAP時降景氣曝險。`,
  DIA:`守 50MA ${n(close.DIA.ma50)}；只作大盤防守確認。`,
  SMH:`先收回 50MA ${n(close.SMH.ma50)}，再看 AMAT／LRCX／KLAC 是否止跌。`,
  XSW:`距 50MA +${n(adjusted.XSW.distance50Atr)} ATR；不追高，失守 VWAP即縮。`,
  USO:'隔夜反彈；與 10Y 同升時視為通膨風險，不當純景氣利多。',
  TLT:`仍低於 20／50／200MA；08:30 後收回 20MA ${n(close.TLT.ma20)} 才升級。`
};
const tradeRows = Object.keys(tradeActions).map(ticker => {
  const row = requireRow(ticker);
  const live = sessionDisplay(ticker);
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(live.text, live.direction),numTd(n(row.ma20)),numTd(n(row.ma50)),td(ma(row), 'ma-cell'),td(tradeActions[ticker])];
});

const data = {
  report_title:'2026-08-14｜美股盤前監控',
  report_eyebrow:'2026-08-14｜盤前更新',
  report_heading:'紀錄高位遇上零售銷售：廣度仍健康，AMAT 財報考驗半導體預期',
  qqq_reengage_20ma:n(close.QQQ.ma20),
  qqq_breakout_add_1sd:n(close.QQQ.close),
  data_timestamp_note:'長橋截至 02:42 ET（隔夜交易；正式盤前尚未開啟），技術與 Google Sheets／Stockbee 截至 8/13 收盤。',
  risk_badge:`結構偏多／事件風險｜Checklist 0/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
  summary_cards:`<div class="card"><span>8/13 收盤</span><strong><span class="up">SPY ${pct(close.SPY.dailyPct)}</span></strong><small>QQQ ${pct(close.QQQ.dailyPct)}、IWM ${pct(close.IWM.dailyPct)}；S&amp;P 500 再創收盤新高。</small></div><div class="card"><span>隔夜四大 ETF</span><strong>QQQ <span class="dn">${pct(sessions.QQQ.changePct)}</span></strong><small>SPY ${pct(sessions.SPY.changePct)}、IWM ${pct(sessions.IWM.changePct)}、DIA ${pct(sessions.DIA.changePct)}。</small></div><div class="card"><span>財報焦點</span><strong><span class="dn">AMAT ${pct(sessions.AMAT.changePct)}</span></strong><small>雙 Beat 與強指引仍被賣，市場門檻高。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>技術 ${technicalScore}/12；正式 VIX ${vixScore}/5。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把紀錄高位升級為可持續 risk-on。',
  upgrade_trigger_1:'零售銷售接近共識，10Y 不升破 4.68%，TLT 不擴大跌幅。',
  upgrade_trigger_2:`SMH 收回 50MA ${n(close.SMH.ma50)}，AMAT／LRCX／KLAC 至少兩檔收回 VWAP。`,
  upgrade_trigger_3:'IWM／XLY／XRT 同步守 VWAP，VIX 維持 16 以下。',
  downgrade_trigger_rule:'任一觸發即成立，先降低追價與高久期曝險。',
  downgrade_trigger_1:`10Y 升破 4.68%、TLT 失守 VWAP，且 QQQ 向 50MA ${n(close.QQQ.ma50)} 回落。`,
  downgrade_trigger_2:'AMAT 跌破隔夜低位，LRCX／KLAC／SMH 同時擴大跌幅。',
  downgrade_trigger_3:`市場廣度後續升至 6/8 以上，或 VIX 升破 20。`,
  core_conclusions:`<ol><li><strong>8/13 是指數與廣度共同上漲。</strong>SPY ${pct(close.SPY.dailyPct)}、QQQ ${pct(close.QQQ.dailyPct)}，三大指數技術惡化分數 ${technicalScore}/12；不是只有少數大型股撐盤。</li><li><strong>PPI 標題偏冷，但細項不是全面通膨解除。</strong>七月 PPI 0.0% MoM、4.7% YoY，低於 +0.2%／4.9% 共識；去食物、能源與貿易服務卻升 +0.4%，因此長端仍會對零售數據敏感。</li><li><strong>目前只能稱隔夜，而非正式盤前。</strong>QQQ ${pct(sessions.QQQ.changePct)}、IWM ${pct(sessions.IWM.changePct)}、SPY ${pct(sessions.SPY.changePct)}；價格接近平盤，暫無指數級方向訊號。</li><li><strong>AMAT 是今晚最清楚的預期差。</strong>營收 91.15 億美元與 EPS 3.50 雙 Beat，Q4 指引 102.5 億美元／4.02 仍強，股價卻隔夜 ${pct(sessions.AMAT.changePct)}；市場正在懲罰高預期、擴產成本與毛利節奏，而非否定 AI 設備需求。</li><li><strong>五日廣度是「3/8 降溫、整體仍健康」。</strong>NDX >20MA、IWM >50MA 與 Stockbee 5D 低於 8/7，但六項均線廣度全部高於 60%，10D ratio ${stockLatest[4]}，季度強股 ${stockLatest[5]} 仍多於弱股 ${stockLatest[6]}。</li><li><strong>08:30 ET 零售銷售是今日主要定價點。</strong>略強但不推高 10Y 最利多；大幅強於預期可能傷 QQQ／高延伸軟體，大幅偏弱則利長債、但可能壓 IWM／XLY。</li></ol><p class="section-summary"><strong>本段結論：</strong>基準情景是偏多結構中的事件盤。先用零售、10Y 與 TLT 判斷利率，再用 AMAT／SMH 判斷半導體是否只是個股預期差。</p>`,
  prior_premarket_review:priorReview,
  positioning_primary:'主線：保留大盤多頭，但在 08:30 前不追 SPY／XSW；零售後看 10Y 與 TLT 是否同意。',
  positioning_secondary:'次線：半導體內部分化，AMAT／設備股弱、記憶體與網路晶片相對有承接。',
  positioning_watch:`觀察：10Y 4.63／4.68、SMH 50MA ${n(close.SMH.ma50)}、AMAT 隔夜低位，以及 Stockbee 5D ${stockLatest[3]}。`,
  positioning_invalidation:'零售大幅偏離共識且跨資產不按利率邏輯反應時，停止沿用盤前基準情景。',
  pre_market_movers_rows:moverRows,
  pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>目前是隔夜交易。AMAT ${volume(sessions.AMAT.volume)} 的負面反應最可信；SNDK ${volume(sessions.SNDK.volume)}、MU ${volume(sessions.MU.volume)} 與 INTC ${volume(sessions.INTC.volume)} 有量承接，說明晶片鏈尚未全面同步轉弱。</p>`,
  section_pre_market_movers_primary_action:'主線：AMAT 與設備股同業只在開盤 VWAP 下方延續弱勢。',
  section_pre_market_movers_condition_action:'條件：LRCX／KLAC 同時弱於 SMH，才確認設備鏈擴散。',
  section_pre_market_movers_avoid_action:'避免：把隔夜薄量跳價寫成正式盤前共識。',
  premarket_movers_invalidation:'AMAT 收回 VWAP且 SMH 收回 50MA，設備股負面讀穿失效。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：0/8 High 允許保留風險，3 項 Intermediate 要求降低追價。',
  section_correction_checklist_condition_action:'條件：零售後收益率穩定、SMH 修復，才降低事件風險。',
  section_correction_checklist_avoid_action:'避免：把低 VIX 當成高延伸板塊可無條件追價。',
  checklist_invalidation:'VIX 升破 20、廣度達 6/8 且 SPY 失守 20MA，才升級為結構修正。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>零售數據判讀：</strong>高於共識時先看 10Y 是否升破 4.68%；若收益率不升，代表增長利多可被股市吸收。低於共識時先看 IWM／XLY，避免只因 TLT 上漲就把弱需求當成全面利多。</div><div class="callout"><strong>PPI 細項：</strong>總指數低於預期主要受能源與商品拖累，但去食能與貿易服務月增 0.4%。這也是今天仍需觀察長端而非只看標題的原因。</div><p class="section-summary"><strong>本段結論：</strong>CPI、PPI 已完成第一輪定價；零售銷售與密大信心負責確認消費韌性是否會重新抬高利率。</p>`,
  section_macro_premarket_background_primary_action:'主線：08:30 先看零售，再看 10Y／TLT／QQQ 的共同反應。',
  section_macro_premarket_background_condition_action:'條件：數據與跨資產方向一致後才增加曝險。',
  section_macro_premarket_background_avoid_action:'避免：用 AMAT 單一財報替代宏觀數據，或用 PPI 標題忽略服務細項。',
  macro_invalidation:'零售偏弱但收益率上升、TLT 下跌，代表供給或通膨溢價主導。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>XLF RSI ${n(sheetTech.XLF.rsi14)} 領先板塊；XSW ${n(sheetTech.XSW.rsi14)}、CIBR ${n(sheetTech.CIBR.rsi14)}、BUG ${n(sheetTech.BUG.rsi14)} 已高 RSI 且距 50MA 超過 +4.5 ATR。SMH RSI ${n(sheetTech.SMH.rsi14)} 仍低於 50MA，今晚以 AMAT 壓力測試判斷晶片鏈。</p>`,
  section_sector_thematic_etf_primary_action:'主線：持有金融與軟體強勢，但不追高延伸；半導體等待修復。',
  section_sector_thematic_etf_condition_action:`條件：SMH 收回 50MA ${n(close.SMH.ma50)}，且設備股至少兩檔收 VWAP。`,
  section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追價，忽略 ATR 延伸與財報預期差。',
  sector_etf_invalidation:'XSW／BUG／CIBR 同時失守 VWAP且 SMH 擴大跌幅，科技強勢結構降級。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 維持 IWM、DIA、SPY、QQQ；8/13 收盤技術惡化 ${technicalScore}/12。隔夜近乎平盤，今日方向要由零售數據後的收益率與開盤廣度決定。</p>`,
  section_major_etf_technical_primary_action:'主線：多頭結構保留，SPY 高延伸不追，QQQ 等收益率確認。',
  section_major_etf_technical_condition_action:`條件：QQQ 守 50MA ${n(close.QQQ.ma50)}，IWM 守 VWAP。`,
  section_major_etf_technical_avoid_action:'避免：把隔夜不到 0.1% 的變化當成正式盤前方向。',
  major_etf_invalidation:`QQQ 失守 50MA ${n(close.QQQ.ma50)} 且 IWM／SPY 同時跌破 20MA，指數多頭降級。`,
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XSW +${n(adjusted.XSW.distance50Atr)} ATR、BUG +${n(adjusted.BUG.distance50Atr)}、XLF +${n(adjusted.XLF.distance50Atr)}、SPY +${n(adjusted.SPY.distance50Atr)} 均高延伸；TLT ${n(adjusted.TLT.distance50Atr)}、WGMI ${n(adjusted.WGMI.distance50Atr)}、REMX ${n(adjusted.REMX.distance50Atr)} 位於負延伸。延伸用來管理追價，不直接產生反向單。</p>`,
  section_50ma_atr_extension_primary_action:'主線：高延伸持有不追；負延伸只在收回 VWAP後考慮均值回歸。',
  section_50ma_atr_extension_condition_action:'條件：TLT 的負延伸反彈必須由 10Y 下行確認。',
  section_50ma_atr_extension_avoid_action:'避免：把 +5 ATR 自動視為做空，或把 -2 ATR 自動視為抄底。',
  atr_extension_invalidation:'高延伸標的失守 20MA且廣度同步轉弱，趨勢持有邏輯失效。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>SPX 四項與 NDX／IWM 多數指標較 8/7 改善；只有 NDX >20MA 與 IWM >50MA 五日回落，六項最新值仍全高於 60%。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 由 2.85 降至 ${stockLatest[3]}，10D ratio 由 1.64 升至 ${stockLatest[4]}；季度 +25%／-25% 為 ${stockLatest[5]}／${stockLatest[6]}，中期仍偏多。</p><p><strong>短線：</strong>4%+ 上漲／下跌為 ${stockLatest[1]}／${stockLatest[2]}，買盤佔優；單月 +50% 強股 ${stockLatest[9]} 已高於 20，追價過熱風險上升。</p><p><strong>中期：</strong>10D ratio 高於 2、季度強股顯著多於弱股，暫不支持全面防守。</p><p class="section-summary"><strong>綜合結論：</strong>市場廣度惡化 ${breadthScore}/8，屬局部五日降溫而非結構崩壞；基準仍偏多，但不能忽略高延伸與個股分化。</p>`,
  stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>5D ratio ${stockLatest[3]} 仍利多但低於上週脈衝；10D ratio ${stockLatest[4]} 高於 2。季度強股 ${stockLatest[5]} 對弱股 ${stockLatest[6]}，適合多頭波段；單月 +50%／-50% 為 ${stockLatest[9]}／${stockLatest[10]}，短線避免追最熱個股。</div>`,
  section_market_breadth_primary_action:'主線：中期維持多頭，短線按 3/8 與高熱度縮小追價。',
  section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，六項均線廣度至少五項高於 60%。',
  section_market_breadth_avoid_action:'避免：用單一 5D ratio 回落覆蓋整體中期廣度。',
  breadth_invalidation:'5D／10D 同時跌破 1，且 NDX／IWM 20MA 廣度跌回 50% 下方。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>外匯與商品收盤值使用 Google Sheet；FXE／FXB／FXY／USDU 隔夜成交為零，不採用方向。有效隔夜訊號是 USO ${pct(sessions.USO.changePct)}、GLD ${pct(sessions.GLD.changePct)}、SLV ${pct(sessions.SLV.changePct)}、IBIT ${pct(sessions.IBIT.changePct)}；油升、金債弱使零售數據後的長端反應更重要。</p>`,
  section_fx_commodities_primary_action:'主線：用 USO 與 TLT 判斷通膨／利率，用 IBIT 檢查風險偏好。',
  section_fx_commodities_condition_action:'條件：油價上升但 10Y 不升，才可視為較健康的增長訊號。',
  section_fx_commodities_avoid_action:'避免：採用零成交的外匯 ETF 隔夜跳價推導現貨匯率。',
  forex_commodity_invalidation:'USO 與 10Y 同升、TLT 下跌且 QQQ 轉弱，長久期友好情景失效。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.15%</strong><small>8/13 Treasury</small></div><div><span>美國 10Y</span><strong>4.63%</strong><small>8/12 為 4.68%</small></div><div><span>美國 20Y</span><strong>5.20%</strong><small>期限溢價仍高</small></div><div><span>Fed 目標區間</span><strong>3.50–3.75%</strong><small>7/29 維持</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>政策與市場含義：</strong>PPI 令 2Y 與 10Y 分別降至 4.15%／4.63%，但長端仍顯著高於政策區間中點。零售若強於預期並把 10Y 推回 4.68% 以上，高延伸軟體與 QQQ 的估值壓力會先上升；若零售偏弱且 TLT 上漲，仍要用 IWM／XLY 判斷是否轉成增長擔憂。</div>`,
  section_treasury_fed_primary_action:'主線：以 10Y 4.63／4.68 與 TLT VWAP 作零售後的利率確認。',
  section_treasury_fed_condition_action:'條件：TLT 領先 IEF、10Y 下行且 QQQ 守 VWAP，才增加長久期。',
  section_treasury_fed_avoid_action:'避免：把一份偏冷 PPI直接寫成 Fed 必然轉向。',
  treasury_invalidation:'零售偏弱但 10Y 上升、TLT 下跌，代表長端供給或通膨溢價主導。',
  trading_plan:`${table(['ETF／資產','隔夜','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1,2,3])}<div class="callout warn"><strong>執行順序：</strong>08:30 先判斷零售與收益率，09:30 再判斷 AMAT／SMH 與指數 VWAP。今晚不使用未更新的 Weekly Expected Move 表。</div><p class="section-summary"><strong>本段結論：</strong>大盤多頭但延伸高；交易優先順序是利率確認、半導體傳導、最後才是追隨指數方向。</p>`,
  intraday_playbook_rows:[
    ['08:30 ET','七月零售銷售／除汽車','消費與利率第一定價','高於共識先看 10Y；低於共識先看 IWM／XLY，不只看 TLT。'],
    ['08:30–09:00','10Y 4.63／4.68、TLT VWAP','長久期確認','10Y 不回 4.68% 且 TLT 守 VWAP，才保留 QQQ／軟體。'],
    ['09:30 ORB',`SMH 50MA ${n(close.SMH.ma50)}`,'AMAT 傳導測試','AMAT／LRCX／KLAC 至少兩檔收 VWAP，才解除設備股壓力。'],
    ['首小時','XSW／BUG／CIBR','高延伸管理','守 VWAP可持有；失守且量增則縮減，不追第一段。'],
    ['10:00 ET','密大消費者信心 54.5 共識','需求第二確認','信心弱且通膨預期升屬最差組合，降低景氣與久期兩端。'],
    ['15:30 MOC','SPY／QQQ 收盤位置','週末風險','指數強但廣度轉弱時，降低高 beta 隔夜倉位。']
  ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；本輪正式 pre_market 為 0，隔夜報價 ${Object.keys(sessions).length}/${snapshot.counts.quoteRequested} 可識別，未混用昨日盤前。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔、Thematic 45 檔以 8/13 Google Sheet 為主，RSI 降序，VOO／BUG／PAVE 完整；五日漲跌與 ATR 由長橋補欄。</div><div class="callout"><strong>廣度 QA：</strong>Market Watch 與 Stockbee 端點統一為 8/7 → 8/13，分數八項為六組均線廣度加 5D／10D ratio。</div><div class="callout"><strong>宏觀／財報 QA：</strong>CPI／PPI 用 BLS；零售時間用 Census；AMAT 用公司 Q3 新聞稿；收益率用 Treasury 8/13 收盤。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://www.bls.gov/news.release/cpi.nr0.htm">BLS CPI</a>；<a href="https://www.bls.gov/news.release/ppi.nr0.htm">BLS PPI</a>；<a href="https://www.census.gov/economic-indicators/calendar-listview.html">Census 零售日程</a>；<a href="https://investor.appliedmaterials.com/static-files/425ac634-4ee7-4c41-a07f-fa9e3c42b797">AMAT Q3 新聞稿</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&amp;type=daily_treasury_yield_curve">U.S. Treasury</a>；<a href="https://apnews.com/article/892c5409d8ed26bfd5965eb2a89d9005">AP 8/13 收盤</a>；<a href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm">Fed 7/29 聲明</a>。</p><p class="source-note">截至 2026-08-14 02:42 ET；隔夜價格會變動。本報告不構成投資建議。</p>`,
  sector_momentum_chart:chartRows
};

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- OPTIONAL: prior_premarket_review -->', data.prior_premarket_review || '');
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', chartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(match => match[1]);
if (unresolved.length) throw new Error(`未解析欄位：${unresolved.join(', ')}`);
html = normalizeReportHtml(html, {reportType:'premarket'});
const validationErrors = validateReportHtml(html, {reportType:'premarket'});
if (validationErrors.length) throw new Error(`嚴格驗證失敗：\n${validationErrors.join('\n')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-14-premarket.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-14-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-14-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:majorRows.length,checklist:checklist.length,technicalScore,breadthScore,vixScore,sessionCount:Object.keys(sessions).length,sessionCutoff,unresolved:unresolved.length}, null, 2));
