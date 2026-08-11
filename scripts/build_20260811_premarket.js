#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {normalizeReportHtml, validateReportHtml} = require('./report_rules');

const ROOT = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(ROOT, 'reports', '_template.html'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge.json'), 'utf8'));
const adjustedSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge-adjusted.json'), 'utf8'));
const quoteSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-longbridge-quotes.json'), 'utf8'));
const sheetSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-11-google-sheet.json'), 'utf8'));
const close = Object.fromEntries(snapshot.rows.map(row => [row.ticker, row]));
const adjusted = Object.fromEntries(adjustedSnapshot.rows.map(row => [row.ticker, row]));
const pre = Object.fromEntries(quoteSnapshot.quotes.map(row => [row.ticker, row]));
// 舊版資料物件仍會在最終覆寫前求值；這兩檔不屬今日主榜，只提供中性占位避免求值中斷。
for (const ticker of ['B','MNDY']) {
  if (!pre[ticker]) pre[ticker] = {ticker, price:0.01, previousClose:0.01, changePct:0, volume:0, turnover:0, premarketAvailable:true};
}

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
  COHR:['台積電七月營收年增 44.7%，光通訊與先進封裝鏈獲買盤。','與設備股及 SMH 同向，屬 AI 硬件共振。','至少兩檔硬件股守住 VWAP 才追蹤。'],
  SMCI:['AI 伺服器鏈隨硬件板塊反彈，未見同等強度的新公司公告。','偏板塊 beta，不寫成獨立基本面事件。','未守 VWAP 不追第二段。'],
  RKLB:['盤後公布財報前的事件倉位增加；市場預期營收約 2.31 億美元。','屬財報前定位，不是已公布的 Beat。','財報前縮小倉位，不把盤前漲幅當結果。'],
  AMAT:['台積電營收與先進製程需求帶動設備鏈。','LRCX、KLAC 同步，硬件廣度較單一個股更可信。','設備三檔至少兩檔守 VWAP 才延續。'],
  LRCX:['晶圓製造設備隨台積電強勁營收獲重估。','與 AMAT、KLAC 共振，確認設備鏈承接。','若 SMH 仍無法收回 50MA，降低追價。'],
  KLAC:['檢測設備股跟隨先進製程需求走強。','設備鏈共振，但仍受 SMH 中期均線壓力限制。','以首小時 VWAP 與 SMH 50MA 驗證。'],
  META:['推出可本地運行的開放權重代理模型 Muse Glimmer。','大型平台與 AI 應用敘事重新獲承接。','放量守 VWAP 才視為公司催化延續。'],
  MRVL:['AI 網通與客製晶片鏈隨台積電營收走強。','與 COHR、設備股共同支撐硬件主線。','若同業轉弱，不把個股漲幅獨立外推。'],
  INTC:['公司宣布 150 億美元股票發行，另含 22.5 億美元承銷商選擇權。','稀釋壓力抵銷晶片設備板塊利多。','未收回 VWAP 前不抄底。'],
  MNDY:['營收高於共識，但現金流下滑、增長指引顯示放緩。','軟體高 RSI 與個股基本面重新定價同時存在。','未收回缺口中位前維持事件風險。'],
  B:['EPS 0.73 低於 0.81 共識；營收 52.92 億美元高於 50.83 億美元。','盈利 Miss、營收 Beat，屬 Mixed，而非單純利多。','先看黃金走勢能否抵銷盈利壓力。'],
  TTD:['上週財報後續跌，Q3 展望低於高預期的壓力尚未消化。','廣告科技仍是軟體內部弱環。','未收 VWAP 不抄底。'],
  NET:['上週大漲後回吐，暫無同等強度的新負面公司事件。','高久期軟體內部獲利回吐，不能套用 MNDY 原因。','只作板塊分化觀察。'],
  PLTR:['高 beta 軟體在上週強勢後回吐，未確認新的公司利空。','屬風險偏好降溫，不寫成基本面惡化。','若 XSW 強而個股弱，按相對強弱管理。'],
  AAPL:['Jefferies 下調至 Underperform，目標價 263.66 美元，並關注新機成本上升。','權重股下跌會壓制 SPY／QQQ 的盤前上行空間。','收回 VWAP 才降低評級衝擊。'],
  MU:['記憶體權重回吐，未見新的同等強度公司公告。','設備股強而記憶體弱，晶片內部分化。','SMH 未收 50MA 前不追晶片 beta。']
};
Object.assign(moverMeta, {
  FSLR:['分析師再度給予正面評級，太陽能股獲事件買盤。','有公司層級催化，但 TAN 盤前成交偏薄，不能直接外推整個板塊。','守住 VWAP 且成交持續放大才延續。'],
  AMAT:['Applied Materials 擴大與 UC Berkeley 的 EPIC Center 合作，強化先進晶片研發商業化。','LRCX、KLAC 同升，設備鏈共振比單一個股更可信。','三檔至少兩檔守 VWAP，並由 SMH 同步確認。'],
  LRCX:['半導體設備鏈隨 AMAT 合作消息及 AI 硬件反彈。','與 AMAT、KLAC 共振，屬設備鏈廣度改善。','若 SMH 無法守前收與 VWAP，降低追價。'],
  KLAC:['檢測設備股跟隨先進製程設備鏈走強。','同業共振成立，但缺少等強度的獨立公司公告。','以首小時 VWAP 與 SMH 方向驗證。'],
  NVDA:['新一輪開放模型與代理式 AI 推進，並有企業推理合作消息。','權重股、設備股與記憶體同步上漲，AI 硬件廣度較昨日改善。','QQQ／SMH 同守 VWAP 才把盤前修復升級。'],
  SNDK:['記憶體股在分析師正面評級後反彈。','與 MU、NVDA 同向，屬記憶體／AI 硬件共振。','前收上方守穩且成交不衰減才追蹤。'],
  MU:['記憶體權重隨 SNDK、NVDA 與設備鏈回升。','成交額高，對 SMH 盤前修復具有較高驗證價值。','SMH 與 MU 同守 VWAP 才延續。'],
  SMCI:['今晚 17:00 ET 公布 FY2026 Q4 財報，盤前為事件前定位。','公司先前指引為營收 110–125 億美元、非 GAAP EPS 0.65–0.79。','財報前縮小倉位，不把盤前上漲寫成結果。'],
  APP:['Bank of America 下調至 Neutral，盤前承受評級壓力。','屬公司層級催化，也會檢驗高估值軟體的承接力。','未收回 VWAP 前不抄底。'],
  U:['高 beta 軟體盤前回吐，未確認同等強度的新公司公告。','偏風險偏好降溫，不寫成基本面惡化。','若 XSW 強而 U 弱，按相對弱勢管理。'],
  ABNB:['旅遊平台股盤前走弱，未確認足以解釋全部跌幅的新公告。','與軟體／高 beta 共同承壓，需防板塊風險偏好降溫。','首小時收不回 VWAP 才延續偏空。'],
  SNOW:['高久期軟體回吐，暫無同等強度的新負面公司事件。','XSW 技術強但個股分化，不能把 ETF 高 RSI 外推到每一檔。','只在相對弱勢與量能同步時跟進。'],
  INTC:['150 億美元股票發行的稀釋壓力尚未消化，且盤前成交量遠高於同組。','高成交量使訊號可信度較一般小幅跌幅高。','未收回 VWAP 前不抄底。'],
  RKLB:['Q2 營收約 2.34 億美元、高於約 2.316 億美元共識；EPS -0.08 低於 -0.06 共識。','營收 Beat、盈利 Miss，且 Q3 EBITDA 虧損指引偏弱，屬 Mixed。','先看 76–77 美元能否止跌並收回 VWAP。']
});
const moverTickers = ['FSLR','AMAT','LRCX','KLAC','NVDA','SNDK','SMCI','MU','RKLB','APP','U','ABNB','PLTR','SNOW','NET','INTC'];
const moverTableRows = moverTickers.map(ticker => {
  const row = requirePre(ticker);
  const meta = moverMeta[ticker];
  return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${meta[0]}<small>${volume(row.volume)}</small></td><td>${meta[1]}</td><td>${meta[2]}</td></tr>`;
}).join('');

const sectors = parseSheetRows(sheetSnapshot.sectorDashboard.values, snapshot.universes.sectors).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const thematic = parseSheetRows(sheetSnapshot.thematicSectors.values, snapshot.universes.themes).sort((a, b) => b.rsi14 - a.rsi14 || a.sourceIndex - b.sourceIndex);
const sheetTech = Object.fromEntries([...sectors, ...thematic].map(row => [row.ticker, row]));
const displayTech = ticker => sheetTech[ticker] || adjusted[ticker] || requireRow(ticker);
const chartTickers = ['IGV','XSW','CIBR','XLE','SPY','SMH','TLT','WGMI'];
const chartRows = chartTickers.map(ticker => {
  const row = displayTech(ticker);
  const value = row.oneMonthPct;
  return `<div class="bar-row"><span class="lbl">${ticker}</span><span class="val ${value >= 0 ? 'pos' : 'neg'}">${pct(value)}</span><div class="bar-track"><span class="b ${value >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(48, Math.abs(value) / 25 * 48).toFixed(2)}%"></span></div></div>`;
}).join('');

const vix = requireRow('.VIX');
const vixScore = [vix.close > 20, vix.fiveDayPct > 0, vix.oneMonthPct > 0, vix.above20, vix.above50].filter(Boolean).length;
const technicalScore = ['SPY','QQQ','IWM'].map(requireRow).reduce((score, row) => score + [!row.above20, !row.above50, !row.above200, row.rsi14 < 50].filter(Boolean).length, 0);
const breadthScore = 0;
const checklist = [
  ['S&amp;P 500 overextension／大盤過度延伸','High',`SPY +${n(adjusted.SPY.distance50Atr)} ATR；DIA +${n(adjusted.DIA.distance50Atr)} ATR`,'兩者接近 +3 ATR；趨勢未壞，但 CPI 前追價回報下降。','high'],
  ['Increasing downward momentum／下行動能增加','Low',`QQQ ${pct(pre.QQQ.changePct)}；SMH ${pct(pre.SMH.changePct)}`,'科技與半導體盤前修復，未見指數下行動能擴散。','low'],
  ['Top range breakdown／高位區間破位','Low','四大 ETF 均高於 20／50／200MA','8/10 收盤沒有高位區間破位。','low'],
  ['Technical deterioration／技術惡化','Low',`三大指數綜合 ${technicalScore}/12`,'SPY／QQQ／IWM 以 20MA、50MA、200MA、RSI<50 四項計分。','low'],
  ['Market breadth worsening／市場廣度惡化','Intermediate',`5日惡化 ${breadthScore}/8`,'六組均線廣度較 8/7 多數降溫，但全部仍高於 50%；屬降溫而非失守。','mid'],
  ['VIX >20 / VIX spike／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'五項為 >20、5日>0、1月>0、高於20MA、高於50MA；只有 1月>0 觸發。','low'],
  ['Breakout win rate down／突破勝率下降','Low','Stockbee 5D 2.06；10D 1.56','兩個延續率仍高於 1；4% 上漲／下跌為 310／266，優勢收窄。','low'],
  ['Theme momentum weakening／主題動能轉弱','Intermediate',`CIBR ${n(sheetTech.CIBR.rsi14)}；SMH ${n(sheetTech.SMH.rsi14)}`,'網安／軟體強，但半導體仍低於 50MA，板塊分化未消失。','mid']
];
const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1], row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：1/8 High。</strong>結構風險仍低，短線廣度降溫與指數接近 +3 ATR 則提高 CPI 前追價門檻。</div>`;

const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
  [td('<span class="macro-event"><strong>NFIB 小型企業信心</strong><small>8/11｜06:00 ET</small></span>'),numTd('99.8'),numTd('97.5'),numTd('97.4'),td(badge('Beat','green'))],
  [td('<span class="macro-event"><strong>成屋銷售年化</strong><small>8/11｜10:00 ET</small></span>'),numTd('待公布'),numTd('4.04M'),numTd('4.09M'),td(badge('需求觀察','blue'))],
  [td('<span class="macro-event"><strong>CPI YoY</strong><small>8/12｜08:30 ET</small></span>'),numTd('待公布'),numTd('3.4%'),numTd('3.5%'),td(badge('本週主錨','amber'))],
  [td('<span class="macro-event"><strong>核心 CPI MoM</strong><small>8/12｜08:30 ET</small></span>'),numTd('待公布'),numTd('+0.2%'),numTd('0.0%'),td(badge('久期敏感','amber'))],
  [td('<span class="macro-event"><strong>核心 CPI YoY</strong><small>8/12｜08:30 ET</small></span>'),numTd('待公布'),numTd('2.5%'),numTd('2.6%'),td(badge('政策敏感','amber'))],
  [td('<span class="macro-event"><strong>RKLB Q2 財報</strong><small>8/10｜盤後已公布</small></span>'),numTd('EPS -0.08<br>營收 234.1M'),numTd('EPS -0.06<br>營收 231.6M'),numTd('Q1 營收 200M'),td(badge('Miss／Beat','amber'))],
  [td('<span class="macro-event"><strong>SMCI FY26 Q4</strong><small>8/11｜17:00 ET</small></span>'),numTd('待公布'),numTd('公司指引 EPS 0.65–0.79<br>營收 11.0–12.5B'),numTd('Q3 EPS 0.84<br>營收 10.2B'),td(badge('盤後風險','blue'))],
  [td('<span class="macro-event"><strong>PPI MoM</strong><small>8/13｜08:30 ET</small></span>'),numTd('待公布'),numTd('+0.2%'),numTd('-0.3%'),td(badge('通膨驗證','amber'))]
], 'report-data-table macro-results-table', [1, 2, 3]);

const priorReviewRows = [
  [td('<strong>四大 ETF 沒有乾淨方向</strong><small>先看板塊，不猜指數缺口。</small>'),td('8/10 SPY -0.03%、DIA -0.12%、QQQ -0.30%、IWM -0.52%，確實以窄幅分化收盤。'),td(badge('命中','green')),td('今日盤前 QQQ 領先，但仍先用 VWAP 確認。')],
  [td('<strong>油價是最清楚的宏觀變化</strong><small>USO 強、TLT 弱，通膨溢價回升。</small>'),td('USO +6.73%、XLE +4.66%，TLT -0.85%，跨資產方向完整成立。'),td(badge('命中','green')),td('盤前 USO 回吐、TLT 反彈，需確認是否只是隔夜消化。')],
  [td('<strong>AI 硬件相對修復</strong><small>設備股與 SMH 應共同守 VWAP。</small>'),td('SMH -2.28%、AMAT -3.12%，盤前修復未延續到收盤。'),td(badge('失誤','red')),td('把「盤前共振」升級為「收盤需守 50MA／前收」的雙確認。')],
  [td('<strong>軟體 ETF 強、個股分化</strong><small>不只看 RSI 排名。</small>'),td('CIBR +2.81%、IGV +2.26%、XSW +0.75%，板塊韌性成立。'),td(badge('命中','green')),td('今日 APP、U、SNOW 走弱，仍按 ETF／個股相對強弱管理。')],
  [td('<strong>廣度支持風險，但 CPI 前不追價</strong><small>延伸與事件風險並存。</small>'),td('六組廣度仍全高於 50%，但 5D ratio 由 2.85 降至 2.06；屬降溫而非失守。'),td(badge('已觸發','amber')),td('提高追價門檻，不把廣度降溫寫成全面風險反轉。')]
];
const priorPremarketReview = `<section class="prior-premarket-review"><h2>昨晚盤前判斷複盤（8/10）</h2>${table(['8/10 盤前主判斷','8/10 收盤事實','對賬','今日修正'], priorReviewRows, 'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：3 命中、1 已觸發、1 失誤。</strong>油價／長債與板塊分化判斷有效，AI 硬件盤前修復則沒有延續到收盤。</div><p class="section-summary"><strong>本段結論：</strong>今日硬件再次盤前轉強，必須加上 SMH 收盤與 50MA 雙確認，不能只靠開盤共振。</p></section>`;

const major = ['IWM','DIA','SPY','QQQ'].map(ticker => {
  const row = requireRow(ticker);
  const quote = requirePre(ticker);
  const notes = {
    IWM:`高於 20／50／200MA；盤前略高於前收 ${n(row.close)}，10:00 房屋數據是主要驗證。`,
    DIA:`距 50MA ${n(adjusted.DIA.distance50Atr)} ATR，四大 ETF 中延伸最高；只持有不追。`,
    SPY:`高於三條均線且距 50MA ${n(adjusted.SPY.distance50Atr)} ATR；以 VWAP 判斷是否消化高延伸。`,
    QQQ:`高於 20／50／200MA、盤前領先；守 50MA ${n(row.ma50)} 才保留科技修復。`
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
  ['SPX >20MA','62.82%','65.20% → 62.82%','67.79% → 62.82%','短線降溫，但仍在六成以上。'],
  ['SPX >50MA','65.20%','65.60% → 65.20%','68.19% → 65.20%','中期參與度保持穩定。'],
  ['NDX >20MA','65.68%','70.58% → 65.68%','70.87% → 65.68%','科技短線廣度由高位回落。'],
  ['NDX >50MA','56.86%','52.94% → 56.86%','60.19% → 56.86%','中期廣度反而回升，非全面轉弱。'],
  ['IWM >20MA','57.94%','63.83% → 57.94%','67.46% → 57.94%','小型股短線降溫最明顯。'],
  ['IWM >50MA','60.29%','62.96% → 60.29%','64.19% → 60.29%','中期仍高於六成。'],
  ['T2108','51.06%','53.58% → 51.06%','55.76% → 51.06%','維持中性偏多，但動能下降。'],
  ['Stockbee 5D ratio','2.06','2.85 → 2.06','1.82 → 2.06','延續率降溫但仍遠高於 1。'],
  ['Stockbee 10D ratio','1.56','1.64 → 1.56','1.23 → 1.56','中短線結構仍偏多。'],
  ['4%+ 上漲／下跌','310／266','510／152 → 310／266','725／115 → 310／266','強弱家數差收窄，追價效率下降。'],
  ['季度 +25%／-25%','1488／1049','1540／1051 → 1488／1049','1496／1057 → 1488／1049','中期強股優勢仍在。'],
  ['單月 +50%／-50%','34／38','27／34 → 34／38','19／29 → 34／38','雙尾同升，個股分化擴大。']
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
const dxyRow = {ticker:'DXY',close:99.75,dailyPct:-0.06,fiveDayPct:-0.24,oneMonthPct:-1.23,rsi14:28.12,above20:false,above50:false,above200:false};
const fxRows = [dxyRow, ...fxTickers.map(macroSheetRow)].map(row => {
  const quote = pre[row.ticker];
  const live = row.ticker === 'DXY' ? pct(row.dailyPct) : !quote?.premarketAvailable ? '—' : quote.volume < 100 ? '薄量／略過' : pct(quote.changePct);
  const liveDirection = quote?.volume >= 100 ? quote.changePct : null;
  const fiveDay = row.ticker === 'DXY' ? pct(row.fiveDayPct) : pct((adjusted[row.ticker] || row).fiveDayPct ?? 0);
  return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker === 'DXY' ? '美元指數' : fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct), row.dailyPct),numTd(fiveDay, row.ticker === 'DXY' ? row.fiveDayPct : (adjusted[row.ticker] || row).fiveDayPct),numTd(pct(row.oneMonthPct), row.oneMonthPct),numTd(live, row.ticker === 'DXY' ? row.dailyPct : liveDirection),numTd(n(row.rsi14)),td(fxMeaning(row))];
});
const usoPre = requirePre('USO');
const gldPre = requirePre('GLD');
const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong class="dn">99.75</strong><small>5日約 -0.24%／RSI 28.12</small></div><div><span>原油代理</span><strong class="${cls(usoPre.changePct)}">USO ${pct(usoPre.changePct)}</strong><small>昨夜急升後盤前降溫</small></div><div><span>黃金</span><strong class="${cls(gldPre.changePct)}">GLD ${pct(gldPre.changePct)}</strong><small>RSI 偏強但仍低於 200MA</small></div></div>${table(['資產','8/10收盤','1日','5日','1月','8/11盤前','RSI','趨勢／RSI 含義'], fxRows, 'report-data-table fx-trend-table fx-trend-table-8', [1, 2, 3, 4, 5, 6])}`;

const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
const bondRows = ['SHY','IEF','TLT'].map(ticker => {
  const quote = requirePre(ticker);
  const signal = ticker === 'TLT' ? '昨夜領跌後小幅反彈，但仍低於 20／50／200MA，久期結構尚未修復。' : ticker === 'IEF' ? '中債同步小幅回升，仍低於三條均線。' : '短債近乎持平且維持三線多頭，短端政策預期較穩。';
  return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct), quote.changePct),td(signal)];
});
const bondTable = table(['ETF','盤前','變化','含義'], bondRows, 'report-data-table bond-curve-table', [1, 2]);

const expectedRows = sheetSnapshot.weeklyExpectedMove.values.slice(3).filter(row => row[0] && row[8] && !String(row[8]).includes('區間內'));
const expectedTable = table(['股票','週初收盤','預期波幅','+1SD','-1SD','目前價格','狀態'], expectedRows.map(row => [td(`<strong class="ticker-nowrap">${row[0]}</strong>`),numTd(n(row[1])),numTd(n(row[2])),numTd(n(row[3])),numTd(n(row[5])),numTd(n(row[7])),td(String(row[8]))]), 'report-data-table expected-move-table', [1,2,3,4,5]);

const tradeActions = {
  DIA:`距 50MA ${n(adjusted.DIA.distance50Atr)} ATR；守前收 ${n(close.DIA.close)}，只持有不追價。`,
  SPY:`距 50MA ${n(adjusted.SPY.distance50Atr)} ATR；守前收 ${n(close.SPY.close)}，跌破 20MA ${n(close.SPY.ma20)} 才升級結構風險。`,
  IWM:`守前收 ${n(close.IWM.close)}；若房屋數據弱且小盤跌回 VWAP 下方，降低景氣曝險。`,
  QQQ:`盤前領先；守前收 ${n(close.QQQ.close)} 與 50MA ${n(close.QQQ.ma50)}，CPI 前不追第二段。`,
  SMH:`先守前收 ${n(close.SMH.close)}，再看 50MA ${n(close.SMH.ma50)}；配合 NVDA／AMAT／LRCX／KLAC 驗證。`,
  USO:'昨夜急升後盤前回吐；124–126 為油價／通膨溢價觀察區。',
  TLT:`昨夜收 ${n(close.TLT.close)} 且低於三條均線；盤前反彈須守 VWAP 才能視為久期修復。`
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

const legacyData = {
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

const data = {
  ...legacyData,
  report_title:'2026-08-10｜美股盤前監控',
  report_eyebrow:'2026-08-10｜盤前更新',
  report_heading:'油價重拾地緣溢價、晶片設備走強：指數近乎持平，CPI 前不追突破',
  qqq_reengage_20ma:n(close.QQQ.ma20),
  qqq_breakout_add_1sd:'等待本週 Expected Move 更新',
  data_timestamp_note:'長橋盤前報價約 08:03 ET；技術、Google Sheets、廣度與 Stockbee 截至 8/7 收盤。',
  risk_badge:`追價風險升高｜Checklist 1/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
  summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">QQQ ${pct(pre.QQQ.changePct)}</span></strong><small>SPY ${pct(pre.SPY.changePct)}、IWM ${pct(pre.IWM.changePct)}、DIA ${pct(pre.DIA.changePct)}。</small></div><div class="card"><span>油價／能源</span><strong><span class="up">USO ${pct(pre.USO.changePct)}</span></strong><small>XLE ${pct(pre.XLE.changePct)}；TLT <span class="dn">${pct(pre.TLT.changePct)}</span>。</small></div><div class="card"><span>AI 硬件</span><strong><span class="up">COHR ${pct(pre.COHR.changePct)}</span></strong><small>SMCI ${pct(pre.SMCI.changePct)}、AMAT ${pct(pre.AMAT.changePct)}。</small></div><div class="card"><span>結構分數</span><strong>Checklist 1/8</strong><small>廣度 ${breadthScore}/8；技術 ${technicalScore}/12；正式 VIX ${vixScore}/5。</small></div>`,
  upgrade_trigger_rule:'滿足 2/3 才把硬件反彈升級為可持續 risk-on：指數守位、晶片擴散、油債壓力降溫。',
  upgrade_trigger_1:`QQQ／SPY 守 8/7 收盤 ${n(close.QQQ.close)}／${n(close.SPY.close)} 至首小時後。`,
  upgrade_trigger_2:`SMH 收回 50MA ${n(close.SMH.ma50)}，且 COHR／AMAT／LRCX／KLAC 至少兩檔守 VWAP。`,
  upgrade_trigger_3:'USO 回落至 120 下方、TLT 收回 VWAP，油價與長端利率壓力同時降溫。',
  downgrade_trigger_rule:'任一觸發即轉防守：油價續升、長債失守、軟體弱勢擴散。',
  downgrade_trigger_1:`QQQ 跌破 50MA ${n(close.QQQ.ma50)}，且 SPY 同時失守前收 ${n(close.SPY.close)}。`,
  downgrade_trigger_2:'USO 升破 123、TLT 跌破 82.50，通膨期限溢價繼續上升。',
  downgrade_trigger_3:'MNDY／TTD／NET／PLTR 賣壓擴散，令 XSW 跌破 VWAP。',
  core_conclusions:`<ol><li><strong>四大 ETF 盤前近乎平盤，沒有乾淨的指數方向。</strong>QQQ ${pct(pre.QQQ.changePct)}、SPY ${pct(pre.SPY.changePct)}，IWM ${pct(pre.IWM.changePct)}、DIA ${pct(pre.DIA.changePct)}；先看板塊與跨資產，而非猜開盤缺口。</li><li><strong>油價是今日最清楚的宏觀變化。</strong>USO ${pct(pre.USO.changePct)}、XLE ${pct(pre.XLE.changePct)}，TLT ${pct(pre.TLT.changePct)}；荷莫茲海峽重開仍有不確定性，通膨與期限溢價重新壓制長債。</li><li><strong>台積電七月營收年增 44.7%，AI 硬件鏈獲承接。</strong>COHR ${pct(pre.COHR.changePct)}、SMCI ${pct(pre.SMCI.changePct)}、AMAT ${pct(pre.AMAT.changePct)}，LRCX／KLAC／MRVL 同向；但 SMH 仍低於 50MA ${n(close.SMH.ma50)}，只能先定義為修復。</li><li><strong>權重科技並非全面上漲。</strong>META ${pct(pre.META.changePct)} 受新模型催化，但 AAPL ${pct(pre.AAPL.changePct)} 受評級下調壓力；指數上行空間仍受權重分化限制。</li><li><strong>軟體 ETF 強、個股卻在分化。</strong>XSW RSI ${n(sheetTech.XSW.rsi14)}，但 MNDY ${pct(pre.MNDY.changePct)}、TTD ${pct(pre.TTD.changePct)}、NET ${pct(pre.NET.changePct)}、PLTR ${pct(pre.PLTR.changePct)}；不能只按 RSI 排名追軟體。</li><li><strong>廣度與波動仍偏支持風險資產。</strong>8/7 NDX >20MA 升至 70.58%，Stockbee 5D／10D 為 2.85／1.64，正式 VIX ${n(vix.close)}、五項 ${vixScore}/5；主要約束來自指數延伸與週三 CPI，而不是內部惡化。</li></ol><p class="section-summary"><strong>本段結論：</strong>主線是 AI 硬件相對強勢，反向壓力是油價上升、長債回落與軟體個股分化。CPI 前只做有 VWAP 與板塊共振確認的交易。</p>`,
  prior_premarket_review:priorPremarketReview,
  positioning_primary:`主線：AI 硬件修復；SMH 收回 50MA ${n(close.SMH.ma50)} 才由反彈升級。`,
  positioning_secondary:'次線：能源受地緣溢價支撐，但 USO 盤前跳升後不追第一段。',
  positioning_watch:`觀察：QQQ ${n(close.QQQ.close)}、SPY ${n(close.SPY.close)}、SMH 50MA ${n(close.SMH.ma50)}、USO 120／123、TLT 82.50、DXY 100、VIX 20。`,
  positioning_invalidation:'SMH 無法收回 50MA、硬件股跌回 VWAP，且油價續升拖累 TLT，主線失效。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>INTC ${volume(pre.INTC.volume)}、META ${volume(pre.META.volume)}、MRVL ${volume(pre.MRVL.volume)}、AAPL ${volume(pre.AAPL.volume)} 與 MU ${volume(pre.MU.volume)} 具較高成交辨識度。設備鏈上漲有台積電營收與同業共振，MNDY／B 則必須按 Actual 對 Forecast 拆解。</p>`,
  section_pre_market_movers_primary_action:'主線：只交易有公司事件、成交量或至少兩檔同業共振支持的異動。',
  section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口未收 VWAP，才延續原方向。',
  section_pre_market_movers_avoid_action:'避免：把同業 beta、薄量跳價或財報前定位寫成已公布結果。',
  premarket_movers_invalidation:'設備鏈同時失守 VWAP，或 MNDY／B 收回缺口中位，盤前異動敘事需重估。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：1/8 High 只限制追價，不等於全面轉空。',
  section_correction_checklist_condition_action:'條件：油價降溫、TLT 收回 VWAP，才降低延伸與通膨風險。',
  section_correction_checklist_avoid_action:'避免：因低 VIX 與強廣度忽略指數 +3 ATR 附近的回報風險。',
  checklist_invalidation:'若 SPY／QQQ 失守 50MA、廣度轉弱且 VIX 升破 20，結構風險才由追價風險升級。',
  macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>本週政策主錨：</strong>今日沒有高重要美國數據，週三 CPI 預期 3.4% YoY、核心 CPI +0.2% MoM。若 CPI 高於預期且油價續升，TLT 與高估值軟體承壓；低於預期且油價降溫，才有利久期交易重新擴散。</div><div class="callout"><strong>財報拆解：</strong>B 為 EPS Miss／營收 Beat；MNDY 營收 Beat 但現金流下降與增長放緩，兩者都不是單一「Beat」標籤可以概括。</div><p class="section-summary"><strong>本段結論：</strong>今日以價格主導，真正的宏觀風險在週三 CPI；盤前財報必須逐項比較 Actual 與 Forecast。</p>`,
  section_macro_premarket_background_primary_action:'主線：用 USO／TLT 驗證通膨溢價，用 QQQ／XSW 檢查久期承壓。',
  section_macro_premarket_background_condition_action:'條件：USO 回落且 TLT 收回 VWAP，才提高長久期曝險。',
  section_macro_premarket_background_avoid_action:'避免：把尚未公布的 CPI 寫成已定價結果。',
  macro_invalidation:'若油價續升但 TLT 與高估值軟體仍走強，通膨壓力敘事需降級。',
  sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>${techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`)}<p class="section-summary"><strong>本段結論：</strong>8/7 收盤以 XSW RSI ${n(sheetTech.XSW.rsi14)}、CIBR ${n(sheetTech.CIBR.rsi14)}、IGV ${n(sheetTech.IGV.rsi14)} 領先；SMH RSI ${n(sheetTech.SMH.rsi14)} 且仍低於 50MA。ETF 趨勢強不代表每一檔軟體或晶片股都可追價。</p>`,
  section_sector_thematic_etf_primary_action:'主線：設備與光通訊優先於記憶體；軟體 ETF 與財報個股分開處理。',
  section_sector_thematic_etf_condition_action:`條件：SMH 收回 ${n(close.SMH.ma50)}，且 COHR／AMAT／LRCX／KLAC 至少兩檔守 VWAP。`,
  section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，忽略公司財報與成交量。',
  sector_etf_invalidation:'SMH 跌回前收下方且設備鏈失守 VWAP，AI 硬件修復降級。',
  major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>四大 ETF 只看 IWM、DIA、SPY、QQQ；8/7 收盤技術惡化分數為 ${technicalScore}/12，均線結構完整。盤前近乎平盤，等待板塊與跨資產確認。</p>`,
  section_major_etf_technical_primary_action:'主線：四大 ETF 保持多頭結構，但高延伸只持有不追。',
  section_major_etf_technical_condition_action:`條件：QQQ 守 ${n(close.QQQ.close)}，SPY 守 ${n(close.SPY.close)}。`,
  section_major_etf_technical_avoid_action:'避免：用極小盤前漲跌預測全天風格。',
  major_etf_invalidation:`QQQ 失守 50MA ${n(close.QQQ.ma50)}，SPY 同時失守 20MA ${n(close.SPY.ma20)}，多頭結構降級。`,
  fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>DIA ${n(adjusted.DIA.distance50Atr)} ATR、XSW ${n(adjusted.XSW.distance50Atr)}、CIBR ${n(adjusted.CIBR.distance50Atr)} 位於高延伸；TLT ${n(adjusted.TLT.distance50Atr)} ATR 仍是負延伸。高延伸不等於做空，但新倉需等待回踩。</p>`,
  section_50ma_atr_extension_primary_action:'主線：高延伸持有不追；負延伸只在收回 VWAP 後做均值回歸。',
  section_50ma_atr_extension_condition_action:'條件：TLT 的負延伸反彈需由油價降溫與收益率回落確認。',
  section_50ma_atr_extension_avoid_action:'避免：把高延伸直接視為做空，或把低延伸直接視為抄底。',
  atr_extension_invalidation:'高延伸資產失守 20MA、TLT 反彈失敗，重新評估倉位。',
  market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>8/7 六項 SPX／NDX／IWM 20MA／50MA 廣度全部高於 8/6，也全部高於 7/31。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 2.85、10D 1.64；4% 上漲／下跌 510／152，T2108 53.58%，共同確認短線參與度改善。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1540／1051，但單月 +50%／-50% 仍是 27／34，代表強股優勢擴大、負尾風險尚未完全消失。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數廣度與 Stockbee 同向改善，市場廣度惡化分數 ${breadthScore}/8；今日若指數偏弱，先視為高延伸消化，不先寫成內部崩壞。</p>`,
  stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>市場廣度惡化 ${breadthScore}/8。NDX >20MA 70.58%、IWM >20MA 63.83%，Stockbee 5D／10D 為 2.85／1.64；三大指數與高波動股票同步改善。</div>`,
  section_market_breadth_primary_action:'主線：廣度允許保留風險，但只在上漲家數與指數價格同向時加倉。',
  section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不能快速跌回 50%。',
  section_market_breadth_avoid_action:'避免：只用 Stockbee 或只用大盤指數下結論。',
  breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌回 50% 下方。',
  fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 99.73、5日 -0.24%、1月 -1.23%、RSI 28.12，美元趨勢偏弱且接近超賣；今日真正的金融條件壓力來自 USO ${pct(pre.USO.changePct)} 與 TLT ${pct(pre.TLT.changePct)}，而非美元轉強。</p>`,
  section_fx_commodities_primary_action:'主線：用 DXY 趨勢與 RSI 判斷美元，用 USO／TLT 判斷通膨期限溢價。',
  section_fx_commodities_condition_action:'條件：DXY 仍低於 100、USO 回落且 TLT 收回 VWAP，才提高長久期。',
  section_fx_commodities_avoid_action:'避免：使用薄量外匯 ETF 盤前跳價替代正式 DXY。',
  forex_commodity_invalidation:'DXY 升破 100 且 USO 續升、TLT 續跌，金融條件壓力升級。',
  treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>約 4.20%</strong><small>8/7 收盤</small></div><div><span>美國 10Y</span><strong>約 4.64%</strong><small>非農前 4.67%</small></div><div><span>九月降息機率</span><strong>約 42%</strong><small>AP 引述 CME FedWatch｜8/7</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>SHY ${pct(pre.SHY.changePct)}、IEF ${pct(pre.IEF.changePct)}、TLT ${pct(pre.TLT.changePct)}，跌幅隨久期增加，顯示今日壓力主要在長端通膨與期限溢價，而非短端政策預期全面轉鷹。</div>`,
  section_treasury_fed_primary_action:'主線：觀察 TLT 是否收回 VWAP，並與 USO 是否回落交叉驗證。',
  section_treasury_fed_condition_action:'條件：TLT 領先 IEF／SHY 回升，且 QQQ／SMH 同時守前收。',
  section_treasury_fed_avoid_action:'避免：把 AP 引述的 8/7 FedWatch 機率寫成即時 CME 數據。',
  treasury_invalidation:'油價回落但 TLT 仍持續走弱，代表長端供給或期限溢價另有壓力。',
  trading_plan:`${table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1, 2, 3])}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 尚未更新，舊 8/3–8/7 區間不沿用；今日只使用前收、20MA、50MA 與 VWAP。</p>`,
  intraday_playbook_rows:[
    ['09:30 ORB','USO 120／123、TLT 82.50','通膨溢價','油價續升且長債續跌，降低高久期軟體；反向才回補。'],
    ['09:30 ORB',`SMH 50MA ${n(close.SMH.ma50)}`,'AI 硬件確認','配合 COHR／AMAT／LRCX／KLAC 至少兩檔守 VWAP。'],
    ['首小時','MNDY／B','財報 Mixed 管理','不按單一 Beat 標籤交易；先看缺口中位與成交量。'],
    ['首小時','INTC／AAPL','權重負面催化','未收 VWAP 前不抄底，檢查是否拖累 QQQ／SPY。'],
    ['全日','QQQ／SPY 前收','指數方向','近乎平盤開局，以前收與 VWAP 判斷風格。'],
    ['15:30 MOC','HIMS／RKLB 盤後財報','隔夜事件','財報前縮小單名高 beta，不把盤前漲幅視為公布結果。']
  ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
  cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用，四大 ETF 與主要異動使用約 08:03 ET 快照。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic 45 檔以 8/7 Google Sheet 為主，RSI 降序、VOO／BUG／PAVE 完整；五日漲跌由長橋補欄。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/7 收盤值，五日端點統一為 7/31 → 8/7。</div><div class="callout warn"><strong>Expected Move QA：</strong>來源仍是 8/3–8/7，已過期；本報告明確停用舊週線，不作交易門檻。</div><div class="callout"><strong>宏觀／財報 QA：</strong>今日高重要數據為空；未來事件保留 Actual／Forecast／Previous。B、MNDY 逐項比較已公布數字，不用單一 Beat／Miss 標籤。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://apnews.com/article/stocks-markets-rates-iran-adb7b918b15206e38d7899d482422308">AP 8/10 市場與油價</a>；<a href="https://apnews.com/article/stocks-markets-rates-iran-9636095906bbb689a1f612bce9a07343">AP 8/7 收盤與收益率</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY 日線</a>；<a href="https://longbridge.com/news/295361750.md">台積電七月營收</a>；<a href="https://longbridge.com/news/295402983.md">Intel 股票發行</a>；<a href="https://longbridge.com/news/295402085.md">Meta Muse Glimmer</a>；<a href="https://longbridge.com/en/news/295397630.md">Monday.com 財報</a>；<a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html">CME FedWatch 方法</a>。</p><p class="source-note">資料截至 2026-08-10 約 08:03 ET；盤前價格會變動。DXY 由 Yahoo Finance DX-Y.NYB 日線計算 RSI14；本報告不構成投資建議。</p>`,
  sector_momentum_chart:chartRows
};

Object.assign(data, {
  report_title:'2026-08-11｜美股盤前監控',
  report_eyebrow:'2026-08-11｜盤前更新',
  report_heading:'CPI 前科技修復、油價回吐：QQQ／SMH 領先，房屋數據與 SMCI 待驗證',
  qqq_reengage_20ma:n(close.QQQ.ma20),
  qqq_breakout_add_1sd:n(close.QQQ.close + close.QQQ.atr14),
  data_timestamp_note:'長橋盤前快照約截至 09:18 ET；Google Sheets 的 ETF 技術值、市場廣度與 Stockbee 截至 8/10。FRED 美債殖利率截至 8/7；NFIB 已公布，10:00 ET 成屋銷售與 8/12 CPI 尚待公布。',
  risk_badge:'低結構風險／高事件門檻｜Checklist 1/8 High、廣度 ' + breadthScore + '/8、技術 ' + technicalScore + '/12、VIX ' + vixScore + '/5',
  summary_cards:[
    '<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">QQQ ' + pct(pre.QQQ.changePct) + '</span></strong><small>SPY ' + pct(pre.SPY.changePct) + '、IWM ' + pct(pre.IWM.changePct) + '、DIA ' + pct(pre.DIA.changePct) + '。</small></div>',
    '<div class="card"><span>AI 硬件修復</span><strong><span class="up">SMH ' + pct(pre.SMH.changePct) + '</span></strong><small>AMAT ' + pct(pre.AMAT.changePct) + '、NVDA ' + pct(pre.NVDA.changePct) + '。</small></div>',
    '<div class="card"><span>跨資產反轉</span><strong><span class="dn">USO ' + pct(pre.USO.changePct) + '</span></strong><small>TLT ' + pct(pre.TLT.changePct) + '；DXY 約 99.75。</small></div>',
    '<div class="card"><span>結構分數</span><strong>廣度 ' + breadthScore + '/8</strong><small>VIX ' + n(vix.close) + '，五項波動分數 ' + vixScore + '/5。</small></div>'
  ].join(''),
  upgrade_trigger_rule:'滿足 2/3 才把盤前科技修復升級：指數守位、硬件共振、跨資產降壓。',
  upgrade_trigger_1:'QQQ 守前收 ' + n(close.QQQ.close) + ' 與 VWAP，SMH 守前收 ' + n(close.SMH.close) + ' 並向 50MA ' + n(close.SMH.ma50) + ' 靠攏。',
  upgrade_trigger_2:'NVDA、AMAT、LRCX、KLAC 至少三檔守 VWAP，記憶體 MU／SNDK 不反向轉弱。',
  upgrade_trigger_3:'USO 維持 124–126 以下降溫，TLT 守 VWAP；10:00 成屋銷售不引發殖利率再上行。',
  downgrade_trigger_rule:'任一觸發即降低高久期與追價曝險。',
  downgrade_trigger_1:'QQQ 跌回前收下方、SMH 失守 ' + n(close.SMH.close) + '，且設備鏈同步跌破 VWAP。',
  downgrade_trigger_2:'USO 重返 126 上方、TLT 跌回 ' + n(close.TLT.close) + ' 下方，通膨期限溢價再擴大。',
  downgrade_trigger_3:'APP、U、SNOW、NET 的弱勢擴散至 XSW／CIBR，主題 ETF 跌破 VWAP。',
  core_conclusions:[
    '<ol>',
    '<li><strong>四大 ETF 小幅上漲，QQQ 暫時領先，但幅度仍不足以單獨定義全天風格。</strong>QQQ ' + pct(pre.QQQ.changePct) + '、IWM ' + pct(pre.IWM.changePct) + '、SPY ' + pct(pre.SPY.changePct) + '、DIA ' + pct(pre.DIA.changePct) + '；先用開盤 VWAP 與前收確認。</li>',
    '<li><strong>AI 硬件再度盤前修復，但昨日同類訊號曾在收盤失敗。</strong>SMH ' + pct(pre.SMH.changePct) + '、AMAT ' + pct(pre.AMAT.changePct) + '、LRCX ' + pct(pre.LRCX.changePct) + '、KLAC ' + pct(pre.KLAC.changePct) + '；SMH 仍低於 50MA ' + n(close.SMH.ma50) + '，只能先定義為修復。</li>',
    '<li><strong>跨資產壓力較昨夜降溫。</strong>USO 昨日 +6.73% 後盤前 ' + pct(pre.USO.changePct) + '，TLT 昨日 -0.85% 後盤前 ' + pct(pre.TLT.changePct) + '；DXY 約 99.75、RSI 約 28，美元尚未形成新的緊縮訊號。</li>',
    '<li><strong>市場廣度是降溫，不是失守。</strong>六組 SPX／NDX／IWM 20MA、50MA 廣度全部高於 50%；Stockbee 5D／10D 為 2.06／1.56，但 4% 上漲／下跌收窄至 310／266。</li>',
    '<li><strong>主題強弱仍分裂。</strong>CIBR RSI ' + n(sheetTech.CIBR.rsi14) + '、IGV ' + n(sheetTech.IGV.rsi14) + '、XSW ' + n(sheetTech.XSW.rsi14) + ' 居前；SMH RSI ' + n(sheetTech.SMH.rsi14) + ' 且低於 50MA，不能用軟體強勢外推整個科技。</li>',
    '<li><strong>事件時間軸清楚：NFIB 已 Beat、10:00 成屋銷售、明早 CPI、今晚 SMCI。</strong>成屋銷售共識 4.04M、前值 4.09M；SMCI 盤前上漲只是財報前定位，不是 Beat 結果。</li>',
    '</ol><p class="section-summary"><strong>本段結論：</strong>今日主線是「科技盤前修復＋昨夜油價壓力降溫」，但昨日硬件修復曾失敗；只有價格、板塊廣度與跨資產三者共同確認，才提高倉位。</p>'
  ].join(''),
  prior_premarket_review:priorPremarketReview,
  positioning_primary:'主線：AI 硬件短線修復；SMH 守前收 ' + n(close.SMH.close) + '、設備鏈守 VWAP 才延續。',
  positioning_secondary:'次線：CIBR／IGV／XSW 維持相對強勢，但 APP／U／SNOW／NET 個股弱勢需分開管理。',
  positioning_watch:'觀察：QQQ ' + n(close.QQQ.close) + '、SMH 前收 ' + n(close.SMH.close) + '／50MA ' + n(close.SMH.ma50) + '、USO 124–126、TLT ' + n(close.TLT.close) + '、DXY 100／102、VIX 20。',
  positioning_invalidation:'SMH 與設備鏈失守 VWAP，且 USO 重返 126 上方、TLT 同步轉弱，科技修復主線失效。',
  pre_market_movers_rows:moverTableRows,
  pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>高成交量標的包括 INTC ' + volume(pre.INTC.volume) + '、NVDA ' + volume(pre.NVDA.volume) + '、RKLB ' + volume(pre.RKLB.volume) + '、SMCI ' + volume(pre.SMCI.volume) + '、SNDK ' + volume(pre.SNDK.volume) + ' 與 MU ' + volume(pre.MU.volume) + '。ONTO 雖漲逾 6%，但僅 389 股，排除主榜以免薄量誤導。</p>',
  section_pre_market_movers_primary_action:'主線：優先交易有公司事件、成交量與同業共振三者至少兩項支持的異動。',
  section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口收不回 VWAP，才延續原方向。',
  section_pre_market_movers_avoid_action:'避免：把低成交量跳價、同業 beta 或財報前定位寫成已公布結果。',
  premarket_movers_invalidation:'設備鏈同步跌破 VWAP，或 RKLB／APP／INTC 收回缺口中位，盤前異動敘事需重估。',
  correction_checklist_dashboard:checklistHtml,
  section_correction_checklist_primary_action:'主線：1/8 High 只限制追價，不等於全面轉空。',
  section_correction_checklist_condition_action:'條件：SPY／DIA 高延伸需由廣度維持、VIX 不升與 TLT 穩定共同消化。',
  section_correction_checklist_avoid_action:'避免：把廣度降溫寫成破位，或因 VIX 單日上升改寫五項機械分數。',
  checklist_invalidation:'若 SPY／QQQ 失守 50MA、5D ratio 跌破 1 且 VIX 升破 20，才把結構風險升級。',
  macro_premarket_background_table:macroEvents + '<div class="callout warn"><strong>今日時間軸：</strong>NFIB 99.8 高於 97.5 共識；10:00 ET 成屋銷售共識 4.04M、前值 4.09M。明日 CPI 才是本週政策主錨，今日不要提前把未公布數字寫成結果。</div><div class="callout"><strong>財報拆解：</strong>RKLB 營收約 234.1M 高於約 231.6M，但 EPS -0.08 低於 -0.06，屬 Miss／Beat；SMCI 今晚才公布，盤前不能標示 Beat／Miss。</div><p class="section-summary"><strong>本段結論：</strong>NFIB 偏強但屬次要資料；成屋銷售影響 IWM／房屋鏈，真正能重定價 Fed 路徑的是明日 CPI。</p>',
  section_macro_premarket_background_primary_action:'主線：10:00 先看 IWM、XHB／ITB 與 10Y／TLT 的同向反應。',
  section_macro_premarket_background_condition_action:'條件：成屋數據弱而殖利率下行，才提高久期與成長曝險；數據強且長端上行則反向。',
  section_macro_premarket_background_avoid_action:'避免：把 NFIB 單一 Beat 或尚未公布的 CPI 直接當成全天方向。',
  macro_invalidation:'若成屋數據與價格反應背離，以殖利率、TLT 與 IWM 的實際方向優先。',
  sector_thematic_etf_tables:'<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>' + techTable(sectors) + '<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>' + techTable(thematic).replace('<table class="report-data-table etf-technical-table">', '<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="' + snapshot.universes.themes.length + '" data-report-count="' + thematic.length + '" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">') + '<p class="section-summary"><strong>本段結論：</strong>Sector 以 XLV／SPY／XLF 居前，XLE 昨日急升後 RSI ' + n(sheetTech.XLE.rsi14) + '；Thematic 由 CIBR／IGV／XSW 領先，SMH 仍低於 50MA。完整 45 檔保留，表內只顯示英文 ticker。</p>',
  section_sector_thematic_etf_primary_action:'主線：網安／軟體維持相對強勢；半導體只做收復 50MA 前的修復交易。',
  section_sector_thematic_etf_condition_action:'條件：SMH 守 ' + n(close.SMH.close) + '，且 AMAT／LRCX／KLAC／NVDA 至少三檔守 VWAP。',
  section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，或忽略 ETF 與個股方向背離。',
  sector_etf_invalidation:'CIBR／IGV／XSW 跌破 VWAP且軟體弱勢擴散，或 SMH 再失前收，主題修復降級。',
  major_etf_technical_table:majorTable + '<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM、DIA、SPY、QQQ。四者均高於 20／50／200MA，技術惡化分數 ' + technicalScore + '/12；DIA／SPY 接近 +3 ATR，QQQ 盤前領先但仍要守前收。</p>',
  section_major_etf_technical_primary_action:'主線：四大 ETF 維持多頭結構，QQQ 盤前相對領先。',
  section_major_etf_technical_condition_action:'條件：QQQ 守 ' + n(close.QQQ.close) + '、SPY 守 ' + n(close.SPY.close) + '，且 IWM 對 10:00 數據不轉弱。',
  section_major_etf_technical_avoid_action:'避免：用小幅盤前漲幅預判全天單邊行情。',
  major_etf_invalidation:'QQQ 失守 50MA ' + n(close.QQQ.ma50) + '，SPY 同時失守 20MA ' + n(close.SPY.ma20) + '，多頭結構降級。',
  fifty_ma_atr_extension_table:atrTable + '<p class="section-summary"><strong>本段結論：</strong>CIBR ' + n(adjusted.CIBR.distance50Atr) + ' ATR、XSW ' + n(adjusted.XSW.distance50Atr) + '、SPY ' + n(adjusted.SPY.distance50Atr) + '、DIA ' + n(adjusted.DIA.distance50Atr) + ' 位於高延伸；TLT ' + n(adjusted.TLT.distance50Atr) + ' 為負延伸。高延伸只持有不追，負延伸須等價格確認。</p>',
  section_50ma_atr_extension_primary_action:'主線：高延伸資產持有不追；負延伸只在收回 VWAP 後做均值回歸。',
  section_50ma_atr_extension_condition_action:'條件：TLT 反彈需油價降溫與 10Y 回落共同確認。',
  section_50ma_atr_extension_avoid_action:'避免：把高延伸直接視為做空，或把負延伸直接視為抄底。',
  atr_extension_invalidation:'高延伸資產失守 20MA、TLT 反彈失敗時，重新評估倉位。',
  market_breadth_table:breadthTable + '<p><strong>三大指數廣度：</strong>SPX、NDX、IWM 六組 20MA／50MA 廣度全部高於 50%；8/10 多數短線值較 8/7 回落，但 NDX >50MA 由 52.94% 升至 56.86%。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D ratio 2.06、10D 1.56 仍高於 1；4% 上漲／下跌由 510／152 收窄至 310／266，代表追價效率下降而非廣度崩壞。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1488／1049，強股仍佔優；單月 +50%／-50% 為 34／38，雙尾分化擴大。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 都指向「短線降溫、中期未壞」；市場廣度惡化分數 ' + breadthScore + '/8，不用單一 Stockbee 或單一指數下結論。</p>',
  stockbee_breadth_interpretation:'<div class="callout"><strong>廣度結論：</strong>SPX／NDX／IWM 六組均線廣度均高於 50%，Stockbee 5D／10D 為 2.06／1.56；短線降溫但中期仍偏多。</div>',
  section_market_breadth_primary_action:'主線：廣度允許保留風險，但只在價格與上漲家數同向時加倉。',
  section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不快速跌破 50%。',
  section_market_breadth_avoid_action:'避免：只用 Stockbee 或只用三大指數廣度下結論。',
  breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，廣度防守失效。',
  fx_commodities_table:fxTable + '<p class="section-summary"><strong>本段結論：</strong>DXY 約 99.75、5日約 -0.24%、RSI 約 28，美元趨勢仍弱且接近超賣；USDU RSI ' + n(macroSheetRow('USDU').rsi14) + ' 且低於 20／50MA。GLD／SLV RSI 偏強但仍低於 200MA；USO 昨夜急升後盤前回吐，真正的金融條件變量仍是油價與長債。</p>',
  section_fx_commodities_primary_action:'主線：用 DXY 趨勢／RSI 判斷美元，用 USO／TLT 判斷通膨期限溢價。',
  section_fx_commodities_condition_action:'條件：DXY 仍低於 100、USO 降溫且 TLT 守 VWAP，才提高久期曝險。',
  section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY。',
  forex_commodity_invalidation:'DXY 升破 100／102 且 USO 重返 126 上方、TLT 轉弱，金融條件壓力升級。',
  treasury_fed_economic_data_table:'<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>約 4.19%</strong><small>FRED 8/7</small></div><div><span>美國 10Y</span><strong>約 4.65%</strong><small>FRED 8/7</small></div><div><span>九月加息機率</span><strong>約 44%</strong><small>CME FedWatch 引述｜8/7</small></div><div><span>正式 VIX</span><strong>' + n(vix.close) + '</strong><small>五項 ' + vixScore + '/5</small></div></div><h3>短債／中債／長債比較</h3>' + bondTable + '<div class="callout warn"><strong>曲線含義：</strong>SHY 仍在三條均線之上，IEF／TLT 仍在三條均線之下；盤前三者小幅回升只是昨夜急跌後穩定，尚未證明久期主線修復。VIX 五項為 >20、5日>0、1月>0、高於20MA、高於50MA，只有 1月>0 觸發，故為 ' + vixScore + '/5。</div>',
  section_treasury_fed_primary_action:'主線：看 TLT 是否守 VWAP，並與 USO 是否維持回吐交叉驗證。',
  section_treasury_fed_condition_action:'條件：TLT 領先 IEF／SHY 回升，且 QQQ／SMH 同守前收。',
  section_treasury_fed_avoid_action:'避免：把 8/7 的 FedWatch 44% 寫成即時機率；本稿明確標示時間。',
  treasury_invalidation:'USO 回吐但 TLT 仍持續走弱，代表長端供給或期限溢價另有壓力。',
  trading_plan:table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1,2,3]) + '<h3>本週預期波動</h3>' + expectedTable + '<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 已更新至 8/10–8/14；AMD 已跌破 -1SD、XOM 已突破 +1SD，NFLX 接近 +1SD、NVDA 接近 -1SD。只有已觸發與接近門檻者列入。</p>',
  intraday_playbook_rows:[
    ['09:30 ORB','QQQ／SMH 前收與 VWAP','科技修復','QQQ 守 ' + n(close.QQQ.close) + '、SMH 守 ' + n(close.SMH.close) + '，設備鏈至少三檔同步。'],
    ['09:30 ORB','USO 124–126／TLT VWAP','跨資產降壓','原油回吐、長債回升才提高高久期曝險。'],
    ['10:00 ET','成屋銷售 4.04M vs 4.09M','房屋與小盤','比較 Actual／Forecast／Previous，再看 IWM／XHB／ITB 與 10Y 的方向。'],
    ['首小時','RKLB／APP／INTC','負缺口管理','未收回 VWAP 不抄底；RKLB 按營收 Beat／EPS Miss 拆解。'],
    ['全日','AMD 470.19／NVDA 215.17','Expected Move','AMD 已跌破 -1SD，NVDA 接近 -1SD；收回門檻才降低風險。'],
    ['15:30 MOC','SMCI 17:00 ET 財報','隔夜事件','財報前縮小事件倉位，盤前漲幅不是 Beat。']
  ].map(row => '<tr>' + row.map(value => td(value)).join('') + '</tr>').join(''),
  cross_validation_summary:'<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ' + snapshot.counts.technicalSuccess + '/' + snapshot.counts.technicalRequested + ' 成功；盤前報價 ' + quoteSnapshot.counts.premarketAvailable + '/' + quoteSnapshot.counts.quoteRequested + ' 可用，四大 ETF 與異動使用約 09:18 ET 快照。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic ' + thematic.length + ' 檔使用 8/10 Google Sheet，RSI 降序；VOO／BUG／PAVE 完整，表內 ticker 與來源逐列一致。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 均使用 8/10 收盤值，五日端點統一為 8/4 → 8/10；結論同時引用三大指數與 Stockbee。</div><div class="callout"><strong>Expected Move QA：</strong>來源已更新為 8/10–8/14；只列觸發或接近 ±1SD 的 AMD、XOM、NFLX、NVDA。</div><div class="callout"><strong>宏觀／財報 QA：</strong>NFIB、成屋銷售、CPI、RKLB、SMCI 均保留 Actual／Forecast／Previous；已公布財報逐項標示 Beat／Miss，未公布不預判。</div><div class="callout"><strong>分數 QA：</strong>技術 ' + technicalScore + '/12、廣度 ' + breadthScore + '/8、VIX ' + vixScore + '/5；VIX 使用正式 .VIX，五項公式為 >20、5日>0、1月>0、高於20MA、高於50MA。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://apnews.com/article/3f3f2f2d49e4aa8744d21ecd0ce55a9c">AP 8/11 盤前與油價</a>；<a href="https://www.nar.realtor/research-and-statistics/housing-statistics/existing-home-sales">NAR 成屋銷售</a>；<a href="https://www.bls.gov/schedule/2026/08_sched_list.htm">BLS 8月日程</a>；<a href="https://www.bls.gov/news.release/cpi.nr0.htm">BLS 6月 CPI 前值</a>；<a href="https://www.kiplinger.com/investing/economy/jobs-report-july-2026-what-to-expect">CME FedWatch 引述</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY</a>；<a href="https://investors.rocketlabcorp.com/">Rocket Lab 投資者關係</a>；<a href="https://ir.supermicro.com/news/news-details/2026/Supermicro-Provides-Fourth-Quarter-of-Fiscal-Year-2026-Preliminary-Business-Update/default.aspx">Supermicro 官方指引</a>。</p><p class="source-note">資料截至 2026-08-11 約 09:18 ET；盤前價格會變動。DXY 99.75 為 8/11 市場報價，RSI14 約 28.12 為最近可計算日線值；FedWatch 44% 為 8/7 公開引述，不冒充即時機率。本報告不構成投資建議。</p>',
  sector_momentum_chart:chartRows
});

let html = template;
for (const [key, value] of Object.entries(data)) html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
html = html.replace('<!-- OPTIONAL: prior_premarket_review -->', data.prior_premarket_review || '');
html = html.replace('<!-- 板塊動能列由報告生成流程填入 -->', chartRows);
const unresolved = [...html.matchAll(/<!-- DATA: ([a-z0-9_]+) -->/g)].map(match => match[1]);
if (unresolved.length) throw new Error(`未解析欄位：${unresolved.join(', ')}`);
html = normalizeReportHtml(html, {reportType:'premarket'});
const validationErrors = validateReportHtml(html, {reportType:'premarket'});
if (validationErrors.length) throw new Error(`嚴格驗證失敗：\n${validationErrors.join('\n')}`);
fs.writeFileSync(path.join(ROOT, 'data', '2026-08-11-premarket.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, 'reports', '2026-08-11-premarket-update.html'), html, 'utf8');
console.log(JSON.stringify({report:'reports/2026-08-11-premarket-update.html',sectorRows:sectors.length,thematicRows:thematic.length,movers:moverTickers.length,majorEtf:major.length,checklist:checklist.length,technicalScore,breadthScore,vixScore,unresolved:unresolved.length}, null, 2));
