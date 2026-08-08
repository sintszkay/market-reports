#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge.json'), 'utf8'));
const adjustedSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge-adjusted.json'), 'utf8'));
const quoteSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-longbridge-quotes.json'), 'utf8'));
const sheetSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-07-google-sheet.json'), 'utf8'));
const close = Object.fromEntries(snapshot.rows.map(row => [row.ticker, row]));
const adjusted = Object.fromEntries(adjustedSnapshot.rows.map(row => [row.ticker, row]));
const pre = Object.fromEntries(quoteSnapshot.quotes.map(row => [row.ticker, row]));

const n = (value, digits = 2) => Number(value).toFixed(digits);
const pct = (value, digits = 2) => `${Number(value) >= 0 ? '+' : ''}${n(value, digits)}%`;
const cls = value => Number(value) > 0 ? 'up' : Number(value) < 0 ? 'dn' : '';
const td = (value, klass = '') => `<td${klass ? ` class="${klass}"` : ''}>${value}</td>`;
const numTd = (value, direction = null) => td(value, `num${direction === null ? '' : ` ${cls(direction)}`}`);
const badge = (text, tone = 'blue') => `<span class="badge ${tone}">${text}</span>`;
const table = (heads, rows, klass = 'report-data-table', numeric = []) => `<div class="table-scroll"><table class="${klass}"><thead><tr>${heads.map((head, index) => `<th${numeric.includes(index) ? ' class="num"' : ''}>${head}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;
const volume = value => Number(value) >= 1e4 ? `${n(Number(value) / 1e4, 1)}萬股` : `${Number(value).toLocaleString('zh-HK')}股`;
const requireRow = ticker => {
  if (!close[ticker]) throw new Error(`缺少技術資料：${ticker}`);
  return close[ticker];
};
const requirePre = ticker => {
  const row = pre[ticker];
  if (!row || !row.premarketAvailable || !(row.price > 0)) throw new Error(`缺少盤前資料：${ticker}`);
  return row;
};
const parsePct = value => Number(String(value ?? '').replace('%', '').replace('+', ''));
const sheetTicker = label => {
  const text = String(label ?? '');
  return text.match(/\(([A-Z0-9.]+)\)\s*$/)?.[1] || text.match(/^([A-Z0-9.]+)\s*:/)?.[1] || null;
};
const sheetJudgment = value => {
  const text = String(value ?? '');
  if (text.includes('Strong Trend')) return '強勢趨勢';
  if (text.includes('Uptrend')) return '上升趨勢';
  if (text.includes('Downtrend')) return '弱勢';
  return '弱勢';
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
      close:Number(row[1]),
      dailyPct:parsePct(row[2]),
      oneMonthPct:parsePct(row[4]),
      distanceFrom52wHighPct:parsePct(row[10]),
      rsi14:Number(row[12]),
      above20:states[0] === '🟢',
      above50:states[1] === '🟢',
      above200:states[2] === '🟢',
      sheetJudgment:sheetJudgment(row[14]),
      sourceIndex
    };
  }).filter(Boolean);
  const tickers = new Set(rows.map(row => row.ticker));
  const missing = universe.filter(ticker => !tickers.has(ticker));
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
const techTable = rows => table(['ETF', '5日', '1月', '距52週高', '20/50/200MA', 'RSI', '判斷'], rows.map(techRow), 'report-data-table etf-technical-table', [1, 2, 3, 5]);

const moverMeta = {
  DOCS:['Fiscal Q1 營收超預期，並把 FY2027 營收指引上調至 6.71–6.81 億美元。','數位醫療獲得最強財報重定價，但缺口極大。','只觀察開盤區間與 VWAP，不追第一段。'],
  ONTO:['Q2 調整後 EPS 1.93 高於 1.68 共識，營收年增 35.3%。','半導體設備與 AI 硬件同步回暖。','守住盤前缺口中位才視為可持續。'],
  NET:['Q2 增長與全年營收指引上調獲市場正回饋。','利率下行又放大高久期軟體的估值彈性。','若 10Y 反彈，先看缺口是否收窄。'],
  ABNB:['Q2 營收超預期並強力上調指引，酒店與 AI 產品成為增量。','與整體消費就業轉弱形成個別公司 alpha。','高開後以 VWAP 確認，不用宏觀利多替代公司驗證。'],
  COHR:['光通訊板塊盤前共振，AI 數據中心鏈獲資金回補。','與 SMH、MRVL 同向，屬 AI 硬件風格訊號。','至少等板塊兩檔守住 VWAP。'],
  FSLR:['長端利率急跌提升長久期清潔能源估值。','TAN 同向，主要是宏觀久期交易而非單一公司財報。','10Y 回升時應快速降級。'],
  U:['Vector 環比增長與盈利提前，盤前續獲機構上調。','應用軟體並非全面走弱，市場獎勵盈利兌現。','未守 VWAP 則不追評級推動的第二段。'],
  RKLB:['高 beta 成長股跟隨利率下行獲承接。','與 QQQ／SMH 同向，未見本輪單一硬催化。','按指數 beta 管理，不獨立追價。'],
  TTD:['Q3 營收預測低於市場預期，公司並提及消費疲弱、關稅與油價壓力。','廣告科技的財報門檻明顯高於大盤。','未收回 VWAP 前不抄底。'],
  SEZL:['Q2 強勁且上調 2026 展望，仍不足以滿足高位預期。','高估值金融科技出現「好結果、不夠好」重定價。','先等賣壓縮量與缺口收斂。'],
  CPER:['銅價代理盤前回落。','與原油同步偏弱，提示市場同時交易增長降溫。','不要把 QQQ 上漲直接等同景氣 risk-on。'],
  XLE:['能源板塊跟隨油價回落。','與債券、貴金屬上漲形成清楚的跨資產分化。','USO 未收 VWAP 前保持相對弱勢。'],
  WMT:['防守零售相對落後，未見可核實的新公司催化。','資金優先回補久期與 AI，而非所有防守資產。','只作相對風格確認。'],
  CAVA:['餐飲消費股小幅落後。','非農與餐飲就業轉弱提高需求敏感度。','跌幅有限，不寫成公司基本面事件。'],
  META:['大型廣告平台相對弱於 QQQ。','與 TTD 財報壓力同向，但沒有把 TTD 原因直接套用。','看開盤後能否收回 VWAP。'],
  GOOGL:['大型廣告平台盤前小幅落後。','與 META 同向，屬廣告平台相對強弱觀察。','幅度小，只作板塊佐證。']
};
const moverTickers = ['DOCS','ONTO','NET','ABNB','COHR','FSLR','U','RKLB','TTD','SEZL','CPER','XLE','WMT','CAVA','META','GOOGL'];
const moverTableRows = moverTickers.map(ticker => {
  const row = requirePre(ticker);
  const meta = moverMeta[ticker];
  return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${meta[0]}<small>${volume(row.volume)}</small></td><td>${meta[1]}</td><td>${meta[2]}</td></tr>`;
}).join('');

const sectors = parseSheetRows(sheetSnapshot.sectorDashboard.values, snapshot.universes.sectors).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const thematic = parseSheetRows(sheetSnapshot.thematicSectors.values, snapshot.universes.themes).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const sheetTech = Object.fromEntries([...sectors, ...thematic].map(row => [row.ticker, row]));
const displayTech = ticker => sheetTech[ticker] || adjusted[ticker] || requireRow(ticker);
const chartTickers = ['XSW','XLF','CPER','SPY','XLK','SMH','TLT','REMX'];
const chartRows = chartTickers.map(ticker => {
  const row = displayTech(ticker);
  const value = row.oneMonthPct;
  return `<div class="bar-row"><span class="lbl">${ticker}</span><span class="val ${value >= 0 ? 'pos' : 'neg'}">${pct(value)}</span><div class="bar-track"><span class="b ${value >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(value) / 25 * 48).toFixed(2)}%"></span></div></div>`;
}).join('');

const vix = requireRow('.VIX');
const vixScore = [vix.close > 20, vix.dailyPct > 0, vix.fiveDayPct > 0, vix.above20, vix.above50].filter(Boolean).length;
const technicalScore = ['SPY','QQQ','IWM'].map(requireRow).reduce((score, row) => score + [!row.above20, !row.above50, !row.above200, row.rsi14 < 50].filter(Boolean).length, 0);
const breadthScore = 0;
const checklist = [
  ['S&amp;P 500 overextension／大盤過度延伸','Intermediate',`SPY +${n(adjusted.SPY.distance50Atr)} ATR；DIA +${n(adjusted.DIA.distance50Atr)} ATR`,'SPY 盤前再越週 +2SD，趨勢強但追價回報風險下降。','mid'],
  ['Increasing downward momentum／下行動能增加','Low',`QQQ ${pct(pre.QQQ.changePct)}；SMH ${pct(pre.SMH.changePct)}`,'非農後長久期與半導體轉強，未見大盤下行動能擴散。','low'],
  ['Top range breakdown／高位區間破位','Low','四大 ETF 仍在 20MA 與 200MA 上','QQQ 僅貼近未復權 50MA，盤前已回到其上。','low'],
  ['Technical deterioration／技術惡化','Low',`三大指數綜合 ${technicalScore}/12`,'SPY／QQQ／IWM 以 20MA、50MA、200MA、RSI<50 四項計分。','low'],
  ['Market breadth worsening／市場廣度惡化','Low',`5日惡化 ${breadthScore}/8`,'六組指數均線廣度與 Stockbee 5D／10D 均較 7/31 改善。','low'],
  ['VIX >20 / VIX spike／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'>20、1日上升、5日上升、高於20MA、高於50MA均未觸發。','low'],
  ['Breakout win rate down／突破勝率下降','Low','Stockbee 5D 2.28；10D 1.37','兩個延續率仍高於 1，單日降溫未破壞五日結構。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate',`XSW RSI ${n(sheetTech.XSW.rsi14)}；TTD ${pct(pre.TTD.changePct)}`,'軟體收盤趨勢仍強，但財報結果兩極，個股選擇風險上升。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1], row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：0/8 High。</strong>結構風險仍低；真正的警報是就業與工資同步轉弱，以及財報個股的巨大雙向缺口。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<span class="macro-event"><strong>非農就業</strong><small>08:30 ET｜七月</small></span>'),numTd('-23K'),numTd('+87K'),numTd('+20K<br><small>六月修正</small>'),td(badge('明顯轉弱','red'))],
  [td('<span class="macro-event"><strong>失業率</strong><small>08:30 ET｜七月</small></span>'),numTd('4.1%'),numTd('4.2%'),numTd('4.2%'),td(badge('表面下降','amber'))],
  [td('<span class="macro-event"><strong>平均時薪 MoM</strong><small>08:30 ET｜七月</small></span>'),numTd('+0.1%'),numTd('+0.3%'),numTd('+0.3%'),td(badge('低於預期','green'))],
  [td('<span class="macro-event"><strong>平均時薪 YoY</strong><small>08:30 ET｜七月</small></span>'),numTd('+3.2%'),numTd('+3.5%'),numTd('+3.5%'),td(badge('通膨降溫','green'))],
  [td('<span class="macro-event"><strong>前兩月修正</strong><small>五月＋六月</small></span>'),numTd('-103K'),numTd('—'),numTd('—'),td(badge('勞動需求更弱','red'))],
  [td('<span class="macro-event"><strong>DOCS 財報</strong><small>8/6 盤後｜FY2027 Q1</small></span>'),numTd('營收 Beat<br>FY 指引上調'),numTd('—'),numTd('—'),td(badge('正面','green'))],
  [td('<span class="macro-event"><strong>NET 財報</strong><small>8/6 盤後｜2026 Q2</small></span>'),numTd('全年營收<br>指引上調'),numTd('—'),numTd('—'),td(badge('正面','green'))],
  [td('<span class="macro-event"><strong>ABNB 財報</strong><small>8/6 盤後｜2026 Q2</small></span>'),numTd('營收 Beat<br>指引上調'),numTd('—'),numTd('—'),td(badge('正面','green'))],
  [td('<span class="macro-event"><strong>TTD 財報</strong><small>8/6 盤後｜2026 Q2</small></span>'),numTd('Q3 營收<br>展望偏低'),numTd('—'),numTd('—'),td(badge('負面','red'))]
], 'report-data-table macro-results-table', [1, 2, 3]);

const priorReviewRows = [
  [td('<strong>DIA／SPY 相對 QQQ</strong><small>8/6 盤前偏向價值與防守。</small>'),td('8/6 DIA -0.85%、SPY -0.16%，QQQ -0.37%；DIA 反而最弱。'),td(badge('失誤','red')),td('不再把單次財報分化直接外推成整日風格。')],
  [td('<strong>QQQ／SMH 修復門檻</strong><small>QQQ 50MA、SMH 574.93。</small>'),td('QQQ 收 714.65，貼近未復權 50MA 714.70；SMH 收 571.48。'),td(badge('未觸發','amber')),td('條件本身有效，今日再用盤前回升驗證。')],
  [td('<strong>五日廣度仍改善</strong><small>單日降溫不改寫五日結論。</small>'),td('8/6 六項廣度續降，但全部仍高於 7/31；5D／10D ratio 仍高於 1。'),td(badge('命中','green')),td('維持 5 日趨勢與 1 日訊號分開。')],
  [td('<strong>財報缺口不宜抄底</strong><small>先等 VWAP 與同業共振。</small>'),td('8/7 新一輪 DOCS／NET 正缺口與 TTD／SEZL 負缺口更極端。'),td(badge('已觸發','green')),td('把規則延伸到今日財報雙向分化。')]
];
const priorPremarketReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/6）</h2>${table(['8/6 盤前主判斷','8/6 收盤事實','對賬','今日修正'], priorReviewRows, 'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：1 命中、1 已觸發、1 未觸發、1 失誤。</strong>廣度與關鍵位規則保留；DIA／SPY 相對領先的風格推斷被收盤否定。</div><p class="section-summary"><strong>本段結論：</strong>今天不再先猜全天風格，改用非農後的債券、貴金屬、半導體與財報缺口共同確認。</p></section>`;

const major = ['IWM','DIA','SPY','QQQ'].map(ticker => {
  const row = requireRow(ticker);
  const quote = requirePre(ticker);
  const notes = {
    IWM:'盤前高於週 +1SD 296.94；就業轉弱令小型股同時受益於利率、承受增長疑慮。',
    DIA:'盤前貼近週 +2SD 538.81，參與但明顯落後 QQQ／IWM。',
    SPY:'盤前高於週 +2SD 767.83；守住該位才保留突破狀態。',
    QQQ:`盤前重新站上 50MA ${n(row.ma50)}，並位於週 +1SD 與 +2SD 之間。`
  };
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`, quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(ma(row), 'ma-cell'),numTd(n(row.rsi14)),td(notes[ticker])];
});
const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'], major, 'report-data-table major-etf-table', [1, 2, 3, 5]).replace('<table class="report-data-table major-etf-table">', '<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

const atrTickers = ['XLF','XSW','KWEB','CIBR','DIA','FXI','CPER','SPY','SMH','TLT','TAN','REMX'];
const atrRows = atrTickers.map(ticker => adjusted[ticker]).filter(Boolean).sort((a, b) => b.distance50Atr - a.distance50Atr).map(row => [
  td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),numTd(n(row.close)),numTd(n(row.ma50)),numTd(n(row.atr14)),numTd(n(row.distance50Atr), row.distance50Atr),td(Math.abs(row.distance50Atr) >= 2.5 ? badge('延伸','amber') : badge('正常','blue'))
]);
const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'], atrRows, 'report-data-table', [1, 2, 3, 4]);

const breadthRows = [
  ['SPX >20MA','63.02%','64.81% → 63.02%','53.28% → 63.02%','單日降溫，五日改善。'],
  ['SPX >50MA','64.21%','66.79% → 64.21%','62.02% → 64.21%','中期仍高於六成。'],
  ['NDX >20MA','61.76%','65.04% → 61.76%','53.39% → 61.76%','單日回落，五日仍擴散。'],
  ['NDX >50MA','51.96%','56.31% → 51.96%','47.57% → 51.96%','仍守五成，但緩衝較薄。'],
  ['IWM >20MA','60.45%','62.60% → 60.45%','43.93% → 60.45%','五日改善幅度最大。'],
  ['IWM >50MA','60.14%','62.80% → 60.14%','52.88% → 60.14%','小型股中期參與度偏多。'],
  ['T2108','52.52%','54.37% → 52.52%','47.36% → 52.52%','中性偏多，連續降溫。'],
  ['Stockbee 5D ratio','2.28','2.71 → 2.28','0.98 → 2.28','延續率仍明顯高於 1。'],
  ['Stockbee 10D ratio','1.37','1.28 → 1.37','0.91 → 1.37','中短線再改善。'],
  ['4%+ 上漲／下跌','300／280','264／210 → 300／280','179／216 → 300／280','雙向活躍，淨優勢有限。'],
  ['季度 +25%／-25%','1410／1087','1445／1080 → 1410／1087','1171／1235 → 1410／1087','中期強股仍多於弱股。'],
  ['單月 +50%／-50%','23／37','20／34 → 23／37','13／33 → 23／37','雙尾同增，分化維持高位。']
];
const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'], breadthRows.map(row => row.map((value, index) => td(value, index === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

const fxLabels = {FXE:'歐元代理',FXB:'英鎊代理',FXY:'日圓代理',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
const macroSheetRow = ticker => {
  const row = sheetSnapshot.macro.values.find(value => {
    const label = String(value[0] ?? '');
    return label === ticker || label.includes(`(${ticker})`) || label.startsWith(`${ticker}｜`);
  });
  if (!row) throw new Error(`Google Sheet Macro 缺列：${ticker}`);
  const states = String(row[14] ?? '').match(/🟢|⚪/gu) || [];
  return {
    ticker,
    close:Number(String(row[1]).replace('%','')),
    dailyPct:parsePct(row[2]),
    oneMonthPct:parsePct(row[4]),
    rsi14:Number(row[13]),
    above20:states[0] === '🟢',
    above50:states[1] === '🟢',
    above200:states[2] === '🟢'
  };
};
const fxMeaning = row => {
  const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '均線中短線偏強' : !row.above20 && !row.above50 ? '均線中短線偏弱' : '均線趨勢混合';
  const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
  return `${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
};
const fxTickers = ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'];
const fxRows = fxTickers.map(macroSheetRow).map(row => {
  const quote = pre[row.ticker];
  const live = !quote?.premarketAvailable ? '—' : quote.volume < 100 ? '薄量／略過' : pct(quote.changePct);
  const liveDirection = quote?.volume >= 100 ? quote.changePct : null;
  return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct), row.dailyPct),numTd(pct(row.oneMonthPct), row.oneMonthPct),numTd(live, liveDirection),numTd(n(row.rsi14)),td(fxMeaning(row))];
});
const usoPre = requirePre('USO');
const gldPre = requirePre('GLD');
const fxTable = `<div class="macro-policy-overview"><div><span>日圓代理</span><strong class="up">FXY ${pct(pre.FXY.changePct)}</strong><small>利差交易降溫</small></div><div><span>原油代理</span><strong class="dn">USO ${pct(usoPre.changePct)}</strong><small>增長敏感資產偏弱</small></div><div><span>黃金</span><strong class="up">GLD ${pct(gldPre.changePct)}</strong><small>避險與利率下行共振</small></div></div>${table(['資產','8/6收盤','1日','1月','8/7盤前','RSI','趨勢／RSI 含義'], fxRows, 'report-data-table fx-trend-table', [1, 2, 3, 4, 5])}`;

const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
const bondRows = ['SHY','IEF','TLT'].map(ticker => {
  const quote = requirePre(ticker);
  const signal = ticker === 'TLT' ? '長端隨非農轉弱上漲，先交易增長與通膨降溫。' : ticker === 'IEF' ? '中段承接，確認收益率曲線整體下移。' : '短端上漲較小，政策路徑仍受 Fed 反應函數約束。';
  return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct), quote.changePct),td(signal)];
});
const bondTable = table(['ETF','盤前','變化','含義'], bondRows, 'report-data-table bond-curve-table', [1, 2]);

const expected = {SPY:[757.43,767.83,736.63],QQQ:[706.47,724.95,669.51],IWM:[296.94,302.68,285.46],DIA:[531.57,538.81,517.07],SMH:[574.93,609.33,506.13],TLT:[83.45,84.64,81.05]};
const expectedRows = Object.entries(expected).map(([ticker, levels]) => {
  const [up1, up2, down1] = levels;
  const price = requirePre(ticker).price;
  const status = price >= up2 ? badge('突破 +2SD','red') : price >= up1 ? badge('突破 +1SD','amber') : price <= down1 ? badge('跌破 -1SD','red') : badge('區間內','blue');
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(n(price)),numTd(n(up1)),numTd(n(up2)),numTd(n(down1)),td(status)];
});
const expectedTable = table(['標的','盤前','+1SD','+2SD','-1SD','狀態'], expectedRows, 'report-data-table expected-move-table', [1, 2, 3, 4]);

const tradeActions = {
  DIA:'貼近週 +2SD 538.81；落後 QQQ／IWM，不把小幅高開當領先。',
  SPY:'守 767.83 +2SD；失守則視為非農缺口衰竭。',
  IWM:'守 296.94 +1SD；若油銅續弱，避免只按降息交易。',
  QQQ:`守 50MA ${n(close.QQQ.ma50)} 與週 +1SD 706.47；724.95 前不追第二段。`,
  SMH:'守 574.93 +1SD，配合 COHR／ONTO／MRVL 判斷 AI 硬件共振。',
  USO:'盤前回落且低於 20／50MA，未收 VWAP 前維持相對弱勢。',
  TLT:'守住非農後缺口；若 10Y 重回 4.67%，長久期交易降級。'
};
const tradeRows = Object.keys(tradeActions).map(ticker => {
  const row = requireRow(ticker);
  const quote = requirePre(ticker);
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`, quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(ma(row), 'ma-cell'),td(tradeActions[ticker])];
});

const previousLayoutData = {
  report_title:'2026-08-06｜美股盤前監控',
  report_eyebrow:'2026-08-06｜盤前更新',
  report_heading:'Dow 防守、Nasdaq 承壓：APP／DDOG／SNDK 觸發成長股重定價',
  qqq_reengage_20ma:n(close.QQQ.ma20),
  qqq_breakout_add_1sd:'706.47',
  data_timestamp_note:'長橋盤前快照約截至 07:01 ET；Google Sheets 的 ETF 技術值、市場廣度與 Stockbee 截至 8/5。50MA ATR 已用長橋前復權日線校正拆分；08:30 ET 數據仍待公布。',
  risk_badge:`低結構風險／高財報分化｜Checklist 0/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
  summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">DIA ${pct(pre.DIA.changePct)}</span></strong><small>SPY ${pct(pre.SPY.changePct)}、IWM ${pct(pre.IWM.changePct)}；QQQ <span class="dn">${pct(pre.QQQ.changePct)}</span>。</small></div><div class="card"><span>財報壓力</span><strong><span class="dn">APP ${pct(pre.APP.changePct)}</span></strong><small>DDOG ${pct(pre.DDOG.changePct)}、SNDK ${pct(pre.SNDK.changePct)}。</small></div><div class="card"><span>相對強勢</span><strong><span class="up">NVO ${pct(pre.NVO.changePct)}</span></strong><small>DASH ${pct(pre.DASH.changePct)}、LLY ${pct(pre.LLY.changePct)}。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>VIX ${n(vix.close)}，波動分數 ${vixScore}/5。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把局部財報壓力降級：科技收復關鍵位、缺口止跌、08:30 跨資產確認。',
  upgrade_trigger_1:`QQQ 收復 50MA ${n(close.QQQ.ma50)}，SMH 收復週 +1SD 574.93。`,
  upgrade_trigger_2:'APP／DDOG／SNDK 至少兩檔收回 VWAP，且 MU／CRM 不再擴大跌幅。',
  upgrade_trigger_3:'08:30 後 TLT 不跌、USDU 不轉強，SPY／IWM 仍守週上軌。',
  downgrade_trigger_rule:'任一觸發即轉防守：科技失守週上軌、財報賣壓擴散、勞動成本引發利率上行。',
  downgrade_trigger_1:'QQQ 跌破 706.47，SMH 無法守住 566 附近並續創盤前低。',
  downgrade_trigger_2:'APP／SNDK 損失擴大，MU／MRVL 與企業軟體同步下壓。',
  downgrade_trigger_3:'單位勞動成本高於 2.1%、初領低於 202K，且 TLT 下跌、USDU 上升。',
  core_conclusions:`<ol><li><strong>盤前是價值／防守領先，不是全面 risk-off。</strong>DIA ${pct(pre.DIA.changePct)}、SPY ${pct(pre.SPY.changePct)}、IWM ${pct(pre.IWM.changePct)}，QQQ ${pct(pre.QQQ.changePct)}；QQQ 與 SMH 的落後集中在軟體、廣告科技與記憶體。</li><li><strong>APP 的問題是增長斜率與現金轉換，不是營收轉負。</strong>Q2 營收 19.2 億美元仍年增 52.8%，但低於共識約 1.2%，Q3 營收與 EBITDA 指引也略低於高預期，盤前 ${pct(pre.APP.changePct)}。</li><li><strong>SNDK 是「結果很強、指引不夠強」。</strong>Q4 營收 89.65 億美元、非 GAAP EPS 39.25，但市場對下一季的高位預期未獲滿足，股價 ${pct(pre.SNDK.changePct)}，並拖累 MU ${pct(pre.MU.changePct)}。</li><li><strong>DDOG 證明 Beat 也可能被賣。</strong>調整後 EPS 0.65 高於 0.59 共識，但盤前 ${pct(pre.DDOG.changePct)}，跌幅超過財報前約 13.3% 的隱含波幅；SNOW、CRM、ORCL、NOW 同向，顯示估值壓縮正在擴散。</li><li><strong>市場廣度五日趨勢仍改善。</strong>六組 SPX／NDX／IWM 均線廣度與 Stockbee 5D／10D 均高於 7/30，惡化分數 ${breadthScore}/8；8/5 相比 8/4 的全面回落只記作單日降溫。</li><li><strong>08:30 ET 是第二個定價節點。</strong>初領 202K、非農生產力 +0.6%、單位勞動成本 +2.1% 為共識；若成本偏高且申領偏低，長端與高估值科技可能再承壓。</li></ol><p class="section-summary"><strong>本段結論：</strong>大盤結構仍由低 VIX 與改善的五日廣度支撐，但高預期成長股正接受更嚴格的財報門檻；今日先交易相對強弱，不先宣判整體趨勢反轉。</p>`,
  prior_premarket_review:priorPremarketReview,
  positioning_primary:'主線：DIA／SPY 相對 QQQ，醫療相對企業軟體；不在 APP／DDOG／SNDK 第一段缺口內抄底。',
  positioning_secondary:'次線：LLY／NVO／DASH 只在開盤守住 VWAP 時延續，避免把防守輪動追成高位缺口。',
  positioning_watch:`觀察：08:30 ET 初領／生產力／勞動成本，QQQ ${n(close.QQQ.ma50)}、706.47，SMH 574.93，以及 APP／SNDK 的首小時缺口。`,
  positioning_invalidation:`QQQ 收復 ${n(close.QQQ.ma50)}、SMH 收復 574.93，且 APP／DDOG／SNDK 至少兩檔收回 VWAP，局部防守主線失效。`,
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>負面異動的成交量集中在 MU ${volume(pre.MU.volume)}、SNDK ${volume(pre.SNDK.volume)}、APP ${volume(pre.APP.volume)}，可信度高於低量跳價；正面端以 NVO ${volume(pre.NVO.volume)} 最具量能，DASH／LLY 仍需開盤確認。</p>`,
  section_pre_market_movers_primary_action:'主線：交易有財報原因、成交量與同業共振的異動。',
  section_pre_market_movers_condition_action:'條件：同板塊至少兩檔守住或失守 VWAP，才確認擴散。',
  section_pre_market_movers_avoid_action:'避免：把同業跟跌誤寫成每家公司都有新負面消息。',
  premarket_movers_invalidation:'APP／DDOG／SNDK 收回缺口且軟體／記憶體 ETF 同步轉強，負面財報主線失效。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：0/8 High 允許保留大盤風險，但個股財報倉位需縮小。',
  section_correction_checklist_condition_action:'條件：QQQ／SMH 收復關鍵位，才把財報分化由 Intermediate 降級。',
  section_correction_checklist_avoid_action:'避免：把低 VIX 與改善廣度解讀成所有財報缺口都會回補。',
  checklist_invalidation:'若 QQQ 跌破 706.47、廣度當日續弱且 VIX 升破 20，結構風險才升級。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>08:30 ET 政策含義：</strong>單位勞動成本是長久期估值的核心變數。若低於 2.1% 且初領高於 202K，偏利 TLT 與 QQQ；若成本高於預期、初領更低，市場更可能交易「增長不弱但通膨黏性」，不利長債與高估值軟體。</div><p class="section-summary"><strong>本段結論：</strong>05:30 裁員數已公布；08:30 與 10:00 數據仍待公布。APP／SNDK／LLY 以已發布結果與盤前價格反應分開呈現。</p>`,
  section_macro_premarket_background_primary_action:'主線：先看勞動成本，再看 TLT／USDU／QQQ 的共同反應。',
  section_macro_premarket_background_condition_action:'條件：數據偏冷且 TLT 上漲、USDU 不轉強，才增加長久期。',
  section_macro_premarket_background_avoid_action:'避免：在 08:30 前用盤前小幅債券波動預判結果。',
  macro_invalidation:'數據偏冷但 TLT 仍跌、QQQ 續弱，代表市場交易成長或供給風險。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>XSW RSI ${n(sheetTech.XSW.rsi14)} 仍是收盤強勢主題，但盤前要接受 DDOG／SNOW／CRM 的壓力測試；SMH RSI ${n(sheetTech.SMH.rsi14)} 且低於 50MA，SNDK／MU 缺口令晶片修復暫停。</p>`,
  section_sector_thematic_etf_primary_action:'主線：比較醫療／金融的收盤強度與軟體／晶片的盤前壓力。',
  section_sector_thematic_etf_condition_action:'條件：XSW／SMH 收回 VWAP且至少兩檔核心股同步，才解除分化。',
  section_sector_thematic_etf_avoid_action:'避免：只依 RSI 高低追價，忽略財報缺口正在改變日內結構。',
  sector_etf_invalidation:'若軟體與記憶體缺口快速回補，防守板塊相對優勢降級。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 維持 IWM、DIA、SPY、QQQ；8/5 收盤技術惡化分數為 ${technicalScore}/12。盤前 DIA／SPY 領先，QQQ 已跌回 50MA 下方但仍守週 +1SD。</p>`,
  section_major_etf_technical_primary_action:'主線：保留 DIA／SPY 相對 QQQ，QQQ 收復 50MA 前不追科技。',
  section_major_etf_technical_condition_action:`條件：QQQ 收復 ${n(close.QQQ.ma50)}，SMH 收復 574.93。`,
  section_major_etf_technical_avoid_action:'避免：用 8/5 收盤的 0/12 覆蓋今天盤前的新資訊。',
  major_etf_invalidation:'QQQ 收復 50MA 且半導體與軟體共同轉強，相對防守失效。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XLF／XSW／KWEB／FXI／CIBR／DIA 已在 50MA 上方高延伸；REMX／TAN／TLT 在下方延伸。SPY +${n(adjusted.SPY.distance50Atr)} ATR 尚可維持趨勢，但 DIA +${n(adjusted.DIA.distance50Atr)} ATR 不宜追第一段。</p>`,
  section_50ma_atr_extension_primary_action:'主線：持有強勢、避免追高延伸；弱勢只在負延伸收斂時交易。',
  section_50ma_atr_extension_condition_action:'條件：高延伸 ETF 守 20MA，負延伸 ETF 先收回 VWAP。',
  section_50ma_atr_extension_avoid_action:'避免：把高延伸自動視為做空，或把低延伸自動視為抄底。',
  atr_extension_invalidation:'DIA／SPY 失守週上軌且 XLF／XSW 同步回吐，強勢持有邏輯失效。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>SPX／NDX／IWM 的 20MA、50MA 廣度六項均高於 7/30，五日趨勢全面改善。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D 由 0.88 升至 2.71、10D 由 0.91 升至 1.28，因此市場廣度惡化分數為 ${breadthScore}/8；中期季度強股也仍多於弱股。</p><p><strong>短線單日訊號：</strong>8/5 六項均線廣度均低於 8/4，4% 上漲／下跌由 725／115 降至 264／210，代表動能降溫，但不改寫五日結論。</p><p class="section-summary"><strong>綜合結論：</strong>廣度仍支持大盤結構，今日風險是財報分化與高估值板塊壓力，不是五日參與度崩壞。</p>`,
  stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>市場廣度惡化 ${breadthScore}/8。5D ratio 2.71、10D ratio 1.28，季度 +25% 強股 1445 高於 -25% 弱股 1080；但單月 +50%／-50% 為 20／34，雙尾分化仍高。</div>`,
  section_market_breadth_primary_action:'主線：用五日廣度支持大盤，但個股財報風險單獨管理。',
  section_market_breadth_condition_action:'條件：5D／10D ratio 維持 1 以上，六項均線廣度不連續兩日下降。',
  section_market_breadth_avoid_action:'避免：用單日降溫把五日趨勢誤判為惡化。',
  breadth_invalidation:'Stockbee 5D／10D 跌破 1，且 NDX／IWM 20MA 廣度跌回 50% 下方。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>USDU RSI ${n(adjusted.USDU.rsi14)} 且低於 20／50MA，美元代理偏弱；CPER RSI ${n(adjusted.CPER.rsi14)}、月線 ${pct(adjusted.CPER.oneMonthPct)} 顯示增長敏感商品仍強。USO 盤前反彈但收盤均線結構偏弱，GLD 則維持中期多頭。</p>`,
  section_fx_commodities_primary_action:'主線：用 USDU、TLT、CPER 與 USO 判斷 08:30 後是利率還是增長交易。',
  section_fx_commodities_condition_action:'條件：USDU 不轉強、TLT 上升且 CPER 不破 VWAP，偏向溫和降溫。',
  section_fx_commodities_avoid_action:'避免：用 ETF 代理價格推導不存在於表格中的現貨匯率。',
  forex_commodity_invalidation:'USDU 與油價同步上升、TLT 下跌，長久期友好情景失效。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.18%</strong><small>8/5，政策敏感端</small></div><div><span>美國 10Y</span><strong>4.63%</strong><small>10Y–2Y +45bp</small></div><div><span>美國 30Y</span><strong>5.17%</strong><small>長端期限溢價仍高</small></div><div><span>Fed 目標區間</span><strong>3.50–3.75%</strong><small>7/29 以 9–3 維持</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>政策與市場含義：</strong>7/29 三名反對票主張加息 25bp，說明委員會內部的分歧偏鷹。今日單位勞動成本若高於 2.1%，長端期限溢價可能再升；若低於預期且申領上升，TLT 才有較乾淨的上行催化。</div>`,
  section_treasury_fed_primary_action:'主線：08:30 後比較 TLT、USDU 與 QQQ，而不是只看數據標題。',
  section_treasury_fed_condition_action:'條件：TLT 領先 IEF／SHY、USDU 不轉強，才提高長久期曝險。',
  section_treasury_fed_avoid_action:'避免：把 Fed 維持利率解讀成政策立場中性；三張反對票方向偏鷹。',
  treasury_invalidation:'成本數據偏冷但 TLT 仍下跌，代表長端供給或增長疑慮主導。',
  trading_plan:`${table(['ETF／股票','盤前','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1, 2, 3])}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>DIA、SPY 已高於週 +2SD，IWM、QQQ 高於 +1SD；SMH 與 TLT 仍在區間內。指數位置偏高而成長股財報分化，追價門檻應高於一般盤前。</p>`,
  intraday_playbook_rows:[
    ['08:30 ET','初領／生產力／勞動成本','利率第二定價','成本低於 2.1% 且申領高於 202K：看 TLT／QQQ；反向則降長久期。'],
    ['09:30 ORB','APP／DDOG／SNDK 首小時','財報缺口確認','未收 VWAP 不抄底；至少兩檔回補才降級板塊壓力。'],
    ['09:30 ORB',`QQQ ${n(close.QQQ.ma50)}、SMH 574.93`,'科技修復門檻','雙雙收復才解除 DIA／SPY 相對領先。'],
    ['10:00 ET','批發銷售／庫存','需求確認','銷售低於 +2.2% 且 IWM 轉弱，降低景氣曝險。'],
    ['10:30 ET','EIA 天然氣庫存','能源波動','只在 USO／XLE 同向時視為板塊訊號。'],
    ['15:30 MOC','8/7 非農前隔夜風險','降低事件敞口','若財報缺口未回補、QQQ 仍低於 50MA，縮減高 beta 隔夜倉位。']
  ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 70/70 成功，盤前報價 101/116 可用；四大 ETF 與 16 檔異動來自同一 07:01 ET 快照。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic 45 檔以 8/5 Google Sheet 已調整值為主；五日漲跌由長橋補欄，ATR 使用前復權日線，已排除拆分假訊號。</div><div class="callout"><strong>廣度 QA：</strong>Market Watch 六組均線廣度與 Stockbee 5D／10D 使用 8/5 收盤值，五日端點統一為 7/30 → 8/5。</div><div class="callout"><strong>財報 QA：</strong>APP、SNDK、LLY 以公司／SEC 公布值核對；DDOG 僅使用已確認 EPS 與價格反應，不補寫尚未核實的指引數字。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX，不以 VIXY 代理取代。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI 盤前報價、未復權收盤核對與前復權技術值；<a href="https://www.sec.gov/Archives/edgar/data/1751008/000175100826000057/exhibit991-2q26earningspre.htm">AppLovin SEC</a>；<a href="https://investor.sandisk.com/news-releases/news-release-details/sandisk-reports-fiscal-fourth-quarter-2026-financial-results">Sandisk IR</a>；<a href="https://investor.lilly.com/static-files/1ce8d384-21b5-45a4-bafb-b981dc2d5e04">Lilly IR</a>；<a href="https://longbridge.com/en/news/295095177.md">Datadog 財報反應</a>；<a href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm">Fed 7/29 聲明</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部收益率</a>；<a href="https://www.bls.gov/schedule/news_release/prod2.htm">BLS 生產力日程</a>；<a href="https://www.census.gov/wholesale/release_schedule.html">Census 批發日程</a>。</p><p class="source-note">截至 2026-08-06 07:01 ET；盤前價格會變動。本報告不構成投資建議。</p>`,
  sector_momentum_chart:chartRows
};

const data = {
  ...previousLayoutData,
  report_title:'2026-08-07｜美股盤前監控',
  report_eyebrow:'2026-08-07｜盤前更新',
  report_heading:'非農轉負、久期反彈：Nasdaq 與 AI 硬件走強，但增長警報沒有消失',
  qqq_reengage_20ma:n(close.QQQ.ma20),
  qqq_breakout_add_1sd:'706.47',
  data_timestamp_note:'長橋 09:30 ET 盤前時段最後快照；Google Sheets 與 Stockbee 截至 8/6 收盤。',
  risk_badge:`結構低風險／增長預警｜Checklist 0/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
  summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">QQQ ${pct(pre.QQQ.changePct)}</span></strong><small>IWM ${pct(pre.IWM.changePct)}、SPY ${pct(pre.SPY.changePct)}、DIA ${pct(pre.DIA.changePct)}。</small></div><div class="card"><span>久期／貴金屬</span><strong><span class="up">GLD ${pct(pre.GLD.changePct)}</span></strong><small>SLV ${pct(pre.SLV.changePct)}、TLT ${pct(pre.TLT.changePct)}。</small></div><div class="card"><span>財報雙向缺口</span><strong><span class="up">DOCS ${pct(pre.DOCS.changePct)}</span></strong><small>NET ${pct(pre.NET.changePct)}；TTD <span class="dn">${pct(pre.TTD.changePct)}</span>、SEZL ${pct(pre.SEZL.changePct)}。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>技術 ${technicalScore}/12；正式 VIX ${vixScore}/5。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把非農後反彈升級為可持續 risk-on：指數守位、利率續降、內部擴散。',
  upgrade_trigger_1:'SPY 守 767.83、QQQ 守 706.47，SMH 守 574.93 至首小時後。',
  upgrade_trigger_2:'TLT 守 VWAP，10Y 不回到非農前 4.67%，金銀不出現全面缺口回補。',
  upgrade_trigger_3:'IWM 維持週 +1SD 上方，且 XSW／SMH 至少一組內部個股擴散。',
  downgrade_trigger_rule:'任一觸發即轉防守：週上軌失守、收益率反彈、增長敏感資產續弱。',
  downgrade_trigger_1:'SPY 跌回週 +2SD 767.83 下方，且 QQQ 同時失守週 +1SD 706.47。',
  downgrade_trigger_2:'10Y 回升至 4.67% 以上、TLT 跌破 VWAP，久期交易反轉。',
  downgrade_trigger_3:'CPER／USO 續弱並拖累 IWM，或 TTD／SEZL 賣壓擴散至 XSW／KRE。',
  core_conclusions:`<ol><li><strong>七月非農 -23K，遠低於約 +87K 共識。</strong>平均時薪僅 +0.1% MoM、+3.2% YoY，前兩月再合計下修 103K；這是就業與工資同步降溫，不只是單一標題 Miss。</li><li><strong>失業率降至 4.1% 不是乾淨利多。</strong>約 26.4 萬人退出勞動力，地方教育 -50K、餐飲酒吧 -26K、零售 -19K，而醫療僅 +22K；勞動需求的廣泛度偏弱。</li><li><strong>跨資產先交易「增長憂慮下的久期反彈」。</strong>10Y 由 4.67% 降至約 4.60%，TLT ${pct(pre.TLT.changePct)}、GLD ${pct(pre.GLD.changePct)}、SLV ${pct(pre.SLV.changePct)}，但 CPER ${pct(pre.CPER.changePct)}、USO ${pct(pre.USO.changePct)}；不是乾淨的全面 risk-on。</li><li><strong>Nasdaq 與 AI 硬件是利率下行的主要受益者。</strong>QQQ ${pct(pre.QQQ.changePct)}、SMH ${pct(pre.SMH.changePct)}，領先 SPY ${pct(pre.SPY.changePct)} 與 DIA ${pct(pre.DIA.changePct)}；COHR、ONTO、MRVL 同向，先看 574.93 能否守住。</li><li><strong>財報門檻仍極端分化。</strong>DOCS ${pct(pre.DOCS.changePct)}、NET ${pct(pre.NET.changePct)}、ABNB ${pct(pre.ABNB.changePct)}，對上 TTD ${pct(pre.TTD.changePct)}、SEZL ${pct(pre.SEZL.changePct)}；市場獎勵指引上修，懲罰低於高預期的展望。</li><li><strong>市場廣度五日結構沒有惡化。</strong>六組 SPX／NDX／IWM 均線廣度與 Stockbee 5D／10D 均較 7/31 改善，分數 ${breadthScore}/8；8/6 的全面單日回落只記為降溫。</li></ol><p class="section-summary"><strong>本段結論：</strong>可交易的是利率下行帶來的久期與 AI 硬件反彈，但非農本身是增長警報；只有指數、利率與市場內部同時確認，才升級為全面 risk-on。</p>`,
  prior_premarket_review:priorPremarketReview,
  positioning_primary:'主線：QQQ／SMH 的久期反彈，但只在 TLT 守 VWAP、10Y 不回 4.67% 時持續。',
  positioning_secondary:'次線：GLD／SLV 受益於利率與避險共振；缺口過大，不追第一段。',
  positioning_watch:'觀察：SPY 767.83、QQQ 706.47／724.95、SMH 574.93、10Y 4.60／4.67，以及 TTD／SEZL 的賣壓是否擴散。',
  positioning_invalidation:'10Y 回到 4.67% 以上、TLT 失守 VWAP，且 QQQ／SMH 跌回週 +1SD 下方，久期主線失效。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>DOCS ${volume(pre.DOCS.volume)} 與 TTD ${volume(pre.TTD.volume)} 的成交量最具辨識度；DOCS／NET／ABNB 是指引與增長獲獎勵，TTD／SEZL 是展望未達高預期。CPER／XLE 則負責提醒：利率利多不等於景氣利多。</p>`,
  section_pre_market_movers_primary_action:'主線：只交易有財報、成交量或跨資產共振支持的異動。',
  section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口未收 VWAP，才延續原方向。',
  section_pre_market_movers_avoid_action:'避免：把利率 beta、同業跟隨或薄量跳價寫成公司新事件。',
  premarket_movers_invalidation:'DOCS／NET／ABNB 同時回補缺口，或 TTD／SEZL 收回 VWAP，財報雙向主線降級。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：0/8 High 允許保留風險，但增長警報要求降低追價。',
  section_correction_checklist_condition_action:'條件：收益率續降且油銅止跌，才把久期反彈升級為廣泛 risk-on。',
  section_correction_checklist_avoid_action:'避免：把低 VIX 與改善廣度當成忽略非農轉負的理由。',
  checklist_invalidation:'若 SPY／QQQ 失守週上軌、廣度續降且 VIX 升破 20，結構風險升級。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>政策與市場含義：</strong>非農、工資與修正值全面偏冷，市場把九月加息機率壓至約 44%，低於報告前略高於五成；但失業率下降主要來自勞動參與退出，因此「利率利多」與「增長風險」必須同時保留。</div><div class="callout"><strong>行業拆解：</strong>地方教育 -50K、餐飲酒吧 -26K、零售 -19K、金融保險 -14K，醫療 +22K。就業弱點並非只集中在一個行業。</div><p class="section-summary"><strong>本段結論：</strong>08:30 已完成定價；下一步不是再猜數據，而是看 10Y、TLT、油銅與 QQQ 是否維持同一敘事。</p>`,
  section_macro_premarket_background_primary_action:'主線：用 10Y／TLT／QQQ 驗證利率利多，用 CPER／USO／IWM 檢查增長代價。',
  section_macro_premarket_background_condition_action:'條件：10Y 不回 4.67%、TLT 守 VWAP，才保留長久期。',
  section_macro_premarket_background_avoid_action:'避免：因失業率降至 4.1% 就把報告解讀成勞動市場強勁。',
  macro_invalidation:'收益率反彈且油銅續跌、IWM 轉弱，代表「增長風險」壓過「利率利多」。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>8/6 收盤以 XLF RSI ${n(sheetTech.XLF.rsi14)}、XSW ${n(sheetTech.XSW.rsi14)}、CIBR ${n(sheetTech.CIBR.rsi14)} 領先，XLU RSI ${n(sheetTech.XLU.rsi14)} 最弱；SMH RSI ${n(sheetTech.SMH.rsi14)} 且仍低於 50MA，但盤前 ${pct(pre.SMH.changePct)} 正接受非農後的修復測試。</p>`,
  section_sector_thematic_etf_primary_action:'主線：AI 硬件與軟體分開處理；SMH 看利率，XSW 看 NET 對 TTD 的分化。',
  section_sector_thematic_etf_condition_action:'條件：SMH 守 574.93，且 COHR／ONTO／MRVL 至少兩檔守 VWAP。',
  section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，忽略週上軌與巨大財報缺口。',
  sector_etf_invalidation:'10Y 回升、SMH 跌回 574.93 下方，AI 硬件修復降級。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 維持 IWM、DIA、SPY、QQQ；8/6 收盤技術惡化分數為 ${technicalScore}/12。QQQ 僅因未復權 50MA 一項觸發，盤前已重新站回該位。</p>`,
  section_major_etf_technical_primary_action:'主線：QQQ／IWM 領先，但 SPY 已高於週 +2SD，不追指數第二段。',
  section_major_etf_technical_condition_action:`條件：QQQ 守 ${n(close.QQQ.ma50)}，SMH 守 574.93。`,
  section_major_etf_technical_avoid_action:'避免：用盤前上漲覆蓋非農對實體增長的負面信息。',
  major_etf_invalidation:'SPY 失守週 +2SD 767.83、QQQ 失守週 +1SD 706.47，非農後指數反彈失效。',
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XLF +${n(adjusted.XLF.distance50Atr)} ATR、KWEB +${n(adjusted.KWEB.distance50Atr)}、FXI +${n(adjusted.FXI.distance50Atr)} 位於高延伸；REMX ${n(adjusted.REMX.distance50Atr)}、TAN ${n(adjusted.TAN.distance50Atr)}、TLT ${n(adjusted.TLT.distance50Atr)} 位於負延伸。SPY +${n(adjusted.SPY.distance50Atr)} ATR 再遇週 +2SD，追價門檻偏高。</p>`,
  section_50ma_atr_extension_primary_action:'主線：高延伸持有不追；負延伸只在收回 VWAP 後做均值回歸。',
  section_50ma_atr_extension_condition_action:'條件：TLT 的負延伸反彈需由 10Y 續降確認。',
  section_50ma_atr_extension_avoid_action:'避免：把高延伸直接視為做空，或把低延伸直接視為抄底。',
  atr_extension_invalidation:'SPY／XLF 失守 20MA，且 TLT 反彈失敗，高低延伸持有邏輯均需重估。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>8/6 六項 20MA／50MA 廣度都低於 8/5，但全部高於 7/31，五日趨勢仍改善。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 由 0.98 升至 2.28、10D 由 0.91 升至 1.37，因此市場廣度惡化分數為 ${breadthScore}/8。</p><p><strong>短線單日訊號：</strong>T2108 54.37% → 52.52%，4% 上漲／下跌為 300／280，代表參與度降溫且雙向波動增大。</p><p class="section-summary"><strong>綜合結論：</strong>五日廣度仍能支撐大盤，但 NDX >50MA 僅 51.96%，科技若失守週上軌，緩衝不厚。</p>`,
  stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>市場廣度惡化 ${breadthScore}/8。5D 2.28、10D 1.37，季度 +25% 強股 1410 高於 -25% 弱股 1087；單月 +50%／-50% 為 23／37，個股雙尾分化仍高。</div>`,
  section_market_breadth_primary_action:'主線：用五日廣度保留風險，但用 NDX >50MA 51.96% 管理科技緩衝。',
  section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，六項廣度不能再連續全面下降。',
  section_market_breadth_avoid_action:'避免：把一天降溫寫成五日惡化，或把五日改善寫成沒有短線風險。',
  breadth_invalidation:'Stockbee 5D／10D 跌破 1，且 NDX／IWM 20MA 廣度跌回 50% 下方。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>外匯與商品收盤值使用 Google Sheet；USDU 盤前僅 12 股，方向不採信。FXY ${pct(pre.FXY.changePct)}、GLD ${pct(pre.GLD.changePct)}、SLV ${pct(pre.SLV.changePct)}，對上 CPER ${pct(pre.CPER.changePct)}、USO ${pct(pre.USO.changePct)}，是利率下行與增長憂慮並存的訊號。</p>`,
  section_fx_commodities_primary_action:'主線：用 FXY／GLD／SLV 判斷利率交易，用 CPER／USO 檢查增長風險。',
  section_fx_commodities_condition_action:'條件：貴金屬守 VWAP、油銅止跌，才升級為較健康的風險偏好。',
  section_fx_commodities_avoid_action:'避免：採用 USDU 的 12 股薄量盤前跳價。',
  forex_commodity_invalidation:'金銀回補缺口、10Y 回升且美元轉強，利率友好情景失效。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.18%</strong><small>Google Sheet｜8/5</small></div><div><span>美國 10Y</span><strong>約 4.60%</strong><small>非農前 4.67%</small></div><div><span>美國 20Y</span><strong>5.18%</strong><small>Google Sheet｜8/5</small></div><div><span>Fed 目標區間</span><strong>3.50–3.75%</strong><small>7/29 以 9–3 維持</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>政策與市場含義：</strong>7/29 三名反對票主張加息 25bp，但本次就業與工資同時轉弱，市場把九月加息機率降至約 44%。這降低短期緊縮壓力，卻不能消除長端供給與增長風險。</div>`,
  section_treasury_fed_primary_action:'主線：TLT 守非農缺口、10Y 不回 4.67%，才維持長久期。',
  section_treasury_fed_condition_action:'條件：TLT 領先 IEF／SHY，且 QQQ／SMH 同時守週 +1SD。',
  section_treasury_fed_avoid_action:'避免：把一份弱非農直接寫成 Fed 必然轉向。',
  treasury_invalidation:'數據偏冷但 TLT 跌回 VWAP 下、10Y 反彈，代表長端供給或通膨溢價主導。',
  trading_plan:`${table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1, 2, 3])}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>SPY 已高於週 +2SD，DIA 貼近 +2SD；QQQ、IWM、SMH 位於 +1SD 與 +2SD 之間，TLT 仍在區間內。週五收盤前需同時防追價與缺口回補。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','10Y 4.60／4.67、TLT VWAP','非農第二定價','TLT 守 VWAP且 10Y 不回 4.67%，才保留久期主線。'],
    ['09:30 ORB','QQQ 706.47／724.95','週波動邊界','守 +1SD、未到 +2SD；靠近 724.95 不追第二段。'],
    ['09:30 ORB','SMH 574.93','AI 硬件確認','配合 COHR／ONTO／MRVL 至少兩檔守 VWAP。'],
    ['首小時','DOCS／NET／ABNB','正缺口管理','缺口過大，只在 VWAP 上方持續；不追開盤第一根。'],
    ['首小時','TTD／SEZL','負缺口管理','未收 VWAP 不抄底；若擴散至 XSW／KRE 才升級板塊風險。'],
    ['15:30 MOC','週 +1SD／+2SD 收盤','週末風險','SPY／DIA 高延伸，若跌回邊界內則縮減追價倉位。']
  ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用，四大 ETF 與 16 檔異動使用同一 09:30 ET pre_market 快照。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic 45 檔以 8/6 Google Sheet 為主，RSI 降序、VOO／BUG／PAVE 完整；五日漲跌由長橋補欄。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/6 收盤值，五日端點統一為 7/31 → 8/6。</div><div class="callout"><strong>宏觀／財報 QA：</strong>非農、工資、修正與收益率反應以 BLS／AP／Axios 核對；財報異動以長橋新聞及公司公開資料核對，未核實數字不補寫。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://www.bls.gov/news.release/empsit.nr0.htm">BLS 就業報告</a>；<a href="https://apnews.com/article/stocks-markets-rates-iran-9636095906bbb689a1f612bce9a07343">AP 市場反應</a>；<a href="https://www.axios.com/2026/08/07/july-jobs-report-employment-losses">Axios 就業拆解</a>；<a href="https://longbridge.cn/news/295227421">TTD 財報反應</a>；<a href="https://longbridge.cn/news/295137748">DOCS 指引</a>；<a href="https://longbridge.cn/news/295244010">NET 指引</a>；<a href="https://longbridge.cn/news/295215981">ABNB 電話會</a>；<a href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm">Fed 7/29 聲明</a>。</p><p class="source-note">資料截至 2026-08-07 09:30 ET；盤前價格會變動。本報告不構成投資建議。</p>`,
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
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-07-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-07-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-07-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,technicalScore,breadthScore,vixScore,unresolved:unresolved.length}, null, 2));
