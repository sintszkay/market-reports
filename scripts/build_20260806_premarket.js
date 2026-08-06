#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-longbridge.json'), 'utf8'));
const adjustedSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-longbridge-adjusted.json'), 'utf8'));
const sheetSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-06-google-sheet-etf-full.json'), 'utf8'));
const close = Object.fromEntries(snapshot.rows.map(row => [row.ticker, row]));
const adjusted = Object.fromEntries(adjustedSnapshot.rows.map(row => [row.ticker, row]));
const pre = Object.fromEntries(snapshot.quotes.map(row => [row.ticker, row]));

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
  NVO:['GLP-1 板塊獲資金承接，盤前漲幅與成交量均具辨識度。','與 LLY 同向，醫療成為科技回吐時的相對強勢。','等開盤守住 VWAP，再判斷是否屬可持續輪動。'],
  DASH:['Q2 營收 44.54 億美元優於預期，訂單與會員動能支持跳空。','消費平台財報正回饋，與軟體賣壓形成對照。','盤前量偏低，避免直接追第一段。'],
  LLY:['Q2 營收 229.74 億美元、非 GAAP EPS 8.38，並上調全年營收指引。','Mounjaro／Zepbound 高增長支持醫療權重。','缺口不大，優先觀察是否持續領先 XLV。'],
  AAPL:['大型權值獲相對買盤，未見單一新催化足以解釋全部漲幅。','緩和 QQQ 內部軟體與半導體壓力。','以 VWAP 與 QQQ 相對強弱確認。'],
  AMZN:['大型消費科技相對承接，盤前成交量較高。','為 QQQ 提供部分支撐，但不足抵銷軟體與記憶體賣壓。','未守 VWAP 則視為指數 beta。'],
  WMT:['防守型消費獲買盤。','科技財報分化下，資金偏向低波動與現金流。','量能普通，只作風格確認。'],
  META:['大型平台股相對強勢。','廣告平台未跟隨 APP 的財報缺口，顯示市場在區分商業模式。','守 VWAP 才保留相對多頭。'],
  UBER:['平台股小幅承接，未見新增硬催化。','與 DASH 同向但強度較低。','不以小幅盤前上漲作獨立交易依據。'],
  APP:['Q2 營收 19.2 億美元低於 19.5 億共識；Q3 營收與 EBITDA 指引也略低於高預期。','市場重估增長斜率與自由現金流轉換，不是營收絕對衰退。','觀察 344 附近能否守住及首小時是否收回半數缺口。'],
  DDOG:['調整後 EPS 0.65 高於 0.59 共識，股價仍跌逾原先約 13.3% 的隱含波幅。','高預期與估值壓縮向 SNOW／CRM 等雲軟體擴散。','財報 Beat 不等於價格止跌，先等 VWAP 與缺口收斂。'],
  SNDK:['季度營收 89.65 億美元、非 GAAP EPS 39.25 很強，但下一季指引未滿足高位預期。','負面反應擴散至 MU 與記憶體鏈。','先看能否守住盤前低點及 SMH 是否止跌。'],
  SNOW:['雲軟體跟隨 DDOG 與高估值成長股去風險。','擴大企業軟體內部賣壓。','沒有獨立財報催化，不把同向下跌誤寫成公司新事件。'],
  MU:['受 SNDK 指引解讀拖累，記憶體鏈同步降溫。','令 SMH 盤前落後大盤。','SNDK／MU 同時收回 VWAP 才解除板塊壓力。'],
  CRM:['企業軟體風險偏好轉弱。','與 DDOG／SNOW／ORCL／NOW 同向，屬板塊擴散。','反彈未收 VWAP 前維持防守。'],
  ORCL:['雲軟體同業賣壓擴散。','使 QQQ 的內部結構弱於 SPY／DIA。','用板塊共振確認，不單獨歸因。'],
  NOW:['高估值企業軟體回吐。','與 CRM／ORCL 同向，XSW 開盤走勢是驗證重點。','若 XSW 守強而個股收復 VWAP，弱勢需降級。']
};
const moverTickers = ['NVO','DASH','LLY','AAPL','AMZN','WMT','META','UBER','APP','DDOG','SNDK','SNOW','MU','CRM','ORCL','NOW'];
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
  ['S&amp;P 500 overextension／大盤過度延伸','Intermediate','SPY +2.42 ATR；DIA +3.47 ATR','DIA 與 SPY 已越過週 +2SD，位置偏高但未構成破位。','mid'],
  ['Increasing downward momentum／下行動能增加','Intermediate','QQQ -0.61%；SMH -0.65%','APP、DDOG、SNDK 缺口向軟體與記憶體擴散。','mid'],
  ['Top range breakdown／高位區間破位','Low','四大 ETF 8/5 收盤仍在主要均線上','QQQ 盤前跌回 50MA 下方，但仍高於 20MA 與週 +1SD。','low'],
  ['Technical deterioration／技術惡化','Low',`三大指數綜合 ${technicalScore}/12`,'SPY／QQQ／IWM 以 20MA、50MA、200MA、RSI<50 四項計分。','low'],
  ['Market breadth worsening／市場廣度惡化','Low',`5日惡化 ${breadthScore}/8`,'六組指數均線廣度與 Stockbee 5D／10D 均較 7/30 改善。','low'],
  ['VIX >20 / VIX spike／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'>20、1日上升、5日上升、高於20MA、高於50MA均未觸發。','low'],
  ['Breakout win rate down／突破勝率下降','Low','Stockbee 5D 2.71；10D 1.28','264 檔上漲 4% 對 210 檔下跌 4%，延續率仍偏多。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate',`XSW RSI ${n(sheetTech.XSW.rsi14)}，但成長股盤前分化`,'強勢收盤結構遇上 APP／DDOG／SNDK 的財報重定價。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1], row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：0/8 High。</strong>結構風險仍低，但財報缺口高度集中；今日應把「市場趨勢」與「高估值成長股重定價」分開處理。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<span class="macro-event"><strong>Challenger 計畫裁員</strong><small>05:30 ET｜七月</small></span>'),numTd('33.429K'),numTd('—'),numTd('45.849K'),td(badge('降溫','green'))],
  [td('<span class="macro-event"><strong>初領失業金</strong><small>08:30 ET｜截至 8/1</small></span>'),numTd('待公布'),numTd('202K'),numTd('197K'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>續領失業金</strong><small>08:30 ET｜截至 7/25</small></span>'),numTd('待公布'),numTd('1.790M'),numTd('1.782M'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>非農生產力初值</strong><small>08:30 ET｜2026 Q2</small></span>'),numTd('待公布'),numTd('+0.6%'),numTd('+0.3%'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>單位勞動成本初值</strong><small>08:30 ET｜2026 Q2</small></span>'),numTd('待公布'),numTd('+2.1%'),numTd('+1.8%'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>批發銷售 MoM</strong><small>10:00 ET｜六月</small></span>'),numTd('待公布'),numTd('+2.2%'),numTd('+3.4%'),td(badge('待公布','blue'))],
  [td('<span class="macro-event"><strong>APP 財報</strong><small>8/5 盤後｜2026 Q2</small></span>'),numTd('EPS 3.76<br>營收 1.92B'),numTd('EPS 3.75<br>營收 1.95B'),numTd('—'),td(badge('EPS Inline／營收 Miss','red'))],
  [td('<span class="macro-event"><strong>SNDK 財報</strong><small>8/5 盤後｜FY2026 Q4</small></span>'),numTd('EPS 39.25<br>營收 8.965B'),numTd('高位預期'),numTd('—'),td(badge('結果強／指引不夠','amber'))],
  [td('<span class="macro-event"><strong>LLY 財報</strong><small>8/6 盤前｜2026 Q2</small></span>'),numTd('EPS 8.38<br>營收 22.974B'),numTd('—'),numTd('—'),td(badge('上調全年指引','green'))]
], 'report-data-table macro-results-table', [1, 2, 3]);

const priorReviewRows = [
  [td('<strong>晶片修復主線</strong><small>8/4 盤前：SMH 守 VWAP 才延續。</small>'),td('8/4 SMH +5.55%、QQQ +3.40%，修復明確延續。'),td(badge('命中','green')),td('保留 VWAP 與板塊共振確認。')],
  [td('<strong>需求降溫利率友好</strong><small>JOLTS／工廠訂單偏弱後看 TLT。</small>'),td('8/4 TLT +0.77%、QQQ +3.40%，市場先按利率友好定價。'),td(badge('命中','green')),td('仍需區分降息利多與成長疑慮。')],
  [td('<strong>廣度確認突破</strong><small>NDX >50MA 站上 50% 才升級。</small>'),td('8/4 NDX >50MA 升至 60.19%，六組均線廣度全數上升。'),td(badge('已觸發','amber')),td('升級成立，但次日需檢查是否續擴散。')],
  [td('<strong>QQQ 中期修復</strong><small>706.47 +1SD、715.01 附近 50MA 為門檻。</small>'),td('8/4 QQQ 收 723.85，直接越過兩道門檻；原報告低估修復幅度。'),td(badge('偏保守','red')),td('強缺口日需加入收盤延續情景，而非只寫不追。')]
];
const priorPremarketReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/4）</h2>${table(['8/4 盤前主判斷','8/4 收盤事實','對賬','今日修正'], priorReviewRows, 'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：2 命中、1 已觸發、1 偏保守。</strong>晶片、QQQ、TLT 與廣度共同確認 risk-on；今日新增的風險不是趨勢全面轉空，而是 APP／DDOG／SNDK 對高預期資產的局部重定價。</div><p class="section-summary"><strong>本段結論：</strong>8/4 的方向與升級條件大致有效，但低估 QQQ 與 SMH 的收盤延續幅度；今日把強缺口日的收盤情景加入執行規則。</p></section>`;

const major = ['IWM','DIA','SPY','QQQ'].map(ticker => {
  const row = requireRow(ticker);
  const quote = requirePre(ticker);
  const notes = {
    IWM:'盤前仍高於週 +1SD 296.94；小型股五日結構保持正向。',
    DIA:'盤前高於週 +2SD 538.81，最強但位置已延伸。',
    SPY:'盤前高於週 +2SD 767.83；守住 767.83 才保留突破。',
    QQQ:`盤前低於 50MA ${n(row.ma50)}，但仍高於週 +1SD 706.47。`
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
  ['SPX >20MA','64.81%','67.79% → 64.81%','56.06% → 64.81%','單日降溫，五日改善。'],
  ['SPX >50MA','66.79%','68.19% → 66.79%','63.61% → 66.79%','中期仍高於六成。'],
  ['NDX >20MA','65.04%','70.87% → 65.04%','49.51% → 65.04%','單日回落但五日擴散明顯。'],
  ['NDX >50MA','56.31%','60.19% → 56.31%','46.60% → 56.31%','已站上五成。'],
  ['IWM >20MA','62.60%','67.46% → 62.60%','45.14% → 62.60%','五日改善幅度最大。'],
  ['IWM >50MA','62.80%','64.19% → 62.80%','55.30% → 62.80%','小型股中期廣度偏多。'],
  ['T2108','54.37%','55.76% → 54.37%','47.50% → 54.37%','中性偏多，單日略降。'],
  ['Stockbee 5D ratio','2.71','1.82 → 2.71','0.88 → 2.71','短線突破延續率很強。'],
  ['Stockbee 10D ratio','1.28','1.23 → 1.28','0.91 → 1.28','中短線已轉正。'],
  ['4%+ 上漲／下跌','264／210','725／115 → 264／210','437／189 → 264／210','單日動能降溫，但仍正。'],
  ['季度 +25%／-25%','1445／1080','1496／1057 → 1445／1080','1213／1196 → 1445／1080','中期強股仍多於弱股。'],
  ['單月 +50%／-50%','20／34','—','—','雙尾活躍，個股分化高。']
];
const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'], breadthRows.map(row => row.map((value, index) => td(value, index === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

const fxLabels = {FXE:'歐元代理',FXB:'英鎊代理',FXY:'日圓代理',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
const fxMeaning = row => {
  const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '均線中短線偏強' : !row.above20 && !row.above50 ? '均線中短線偏弱' : '均線趨勢混合';
  const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
  return `${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
};
const fxTickers = ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'];
const fxRows = fxTickers.map(ticker => adjusted[ticker]).map(row => [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct), row.dailyPct),numTd(pct(row.oneMonthPct), row.oneMonthPct),numTd(n(row.rsi14)),td(fxMeaning(row))]);
const usoPre = requirePre('USO');
const gldPre = requirePre('GLD');
const fxTable = `<div class="macro-policy-overview"><div><span>美元代理</span><strong>USDU RSI ${n(adjusted.USDU.rsi14)}</strong><small>低於 20／50MA</small></div><div><span>原油代理</span><strong class="up">USO ${pct(usoPre.changePct)}</strong><small>盤前反彈，仍低於主要均線</small></div><div><span>黃金</span><strong class="up">GLD ${pct(gldPre.changePct)}</strong><small>RSI ${n(adjusted.GLD.rsi14)}</small></div></div>${table(['資產','8/5收盤','1日','1月','RSI','趨勢／RSI 含義'], fxRows, 'report-data-table fx-trend-table', [1, 2, 3, 4])}`;

const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
const bondRows = ['SHY','IEF','TLT'].map(ticker => {
  const quote = requirePre(ticker);
  const signal = ticker === 'TLT' ? '長端近持平，等待 08:30 勞動成本與申領數據。' : ticker === 'IEF' ? '中段小幅承接，對增長與政策預期均敏感。' : '短端變化有限，政策路徑尚未重定價。';
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
  DIA:'已高於週 +2SD，不追高；守 538.81 才維持最強指數。',
  SPY:'守 767.83 +2SD；失守則回到區間交易。',
  IWM:'守 296.94 +1SD；廣度仍支持小型股。',
  QQQ:`先收復 50MA ${n(close.QQQ.ma50)}，再談追趕 DIA／SPY。`,
  SMH:'566 附近止跌且收復 574.93，才解除記憶體拖累。',
  USO:'盤前反彈但仍低於主要均線，須與 XLE 同向才確認。',
  TLT:'08:30 後若仍持平或轉強，才確認數據偏利率友好。'
};
const tradeRows = Object.keys(tradeActions).map(ticker => {
  const row = requireRow(ticker);
  const quote = requirePre(ticker);
  return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`, quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(ma(row), 'ma-cell'),td(tradeActions[ticker])];
});

const data = {
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

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- OPTIONAL: prior_premarket_review -->', data.prior_premarket_review || '');
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', chartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(match => match[1]);
if (unresolved.length) throw new Error(`未解析欄位：${unresolved.join(', ')}`);
html = normalizeReportHtml(html, {reportType:'premarket'});
const validationErrors = validateReportHtml(html, {reportType:'premarket'});
if (validationErrors.length) throw new Error(`嚴格驗證失敗：\n${validationErrors.join('\n')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-06-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-06-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-06-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,technicalScore,breadthScore,vixScore,unresolved:unresolved.length}, null, 2));
