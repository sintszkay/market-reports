'use strict';

const previous = require('./premarket_20260818_overrides');
const dxy = require('../data/2026-08-20-dxy.json');
const externalQuoteSnapshot = require('../data/2026-08-20-extra-quotes.json');

const moverMeta = Object.fromEntries([
  'MSTR','COIN','CRCL','HOOD','NDSN','DE','COHR','RKLB',
  'WMT','NTES','BABA','CRWD','PANW','TSLA','LRCX','MU'
].map(ticker => [ticker, ['長橋盤前報價已更新。','按公司事件與板塊共振拆解。','以 VWAP 與成交量確認。']]));

function build(ctx) {
  const base = previous.build(ctx);
  const {
    snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    requireRow,requirePre,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,expectedTable
  } = ctx;
  const q = ticker => requirePre(ticker);
  const c = ticker => requireRow(ticker);
  const a = ticker => adjusted[ticker] || c(ticker);
  const eq = ticker => externalQuoteSnapshot.quotes[ticker] || q(ticker);
  const breadthScore = 8;
  const checklistHigh = 3;
  const maState = row => `<span class="ma-state-group"><span class="ma-state ${row.above20 ? 'ma-up' : 'ma-down'}">20<span class="ma-arrow">${row.above20 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above50 ? 'ma-up' : 'ma-down'}">50<span class="ma-arrow">${row.above50 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above200 ? 'ma-up' : 'ma-down'}">200<span class="ma-arrow">${row.above200 ? '▲' : '▼'}</span></span></span>`;
  const dayPct = (ticker,date) => {
    const history = c(ticker).history || [];
    const index = history.findIndex(row => row.date === date);
    if (index <= 0) return null;
    return (history[index].close / history[index - 1].close - 1) * 100;
  };

  const moverSignal = {
    MSTR:'比特幣升破 72,000 美元，槓桿型加密 beta 領漲。',
    COIN:'加密交易活躍度與立法預期同步升溫。',
    CRCL:'穩定幣監管敘事與加密風險偏好共振。',
    HOOD:'散戶交易 beta 跟隨加密板塊回升。',
    NDSN:'非 GAAP EPS 3.25 對 3.09、營收 817.67M 對 779.44M，雙 Beat 並上調展望。',
    DE:'季度盈利與銷售增長，並上調全年盈利預期。',
    COHR:'光通訊相對晶片設備抗跌，但未形成整體半導體反轉。',
    RKLB:'高 beta 太空股逆勢相對強，仍屬事件／動量交易。',
    WMT:'EPS 0.81 對 0.74、營收 187.94B 對 186.62B 雙 Beat；但美國同店銷售 2.6% 低於 3.8% 共識，Q3 指引偏弱。',
    NTES:'收入較有韌性，但投資損失拖累利潤，盤前重新定價。',
    BABA:'調整後淨利 RMB20.715B 低於 RMB25.35B 共識；雲收入增長 45% 仍不足以抵銷利潤與 AI 投入壓力。',
    CRWD:'資安相對強勢後回吐，未見同等強度的新公司級利空。',
    PANW:'資安板塊獲利回吐，CIBR 需共同轉弱才可外推。',
    TSLA:'高 beta 成長股隨指數期貨走弱，並無單一新事件解釋全部跌幅。',
    LRCX:'設備鏈延續弱勢，SMH 仍低於 20／50MA。',
    MU:'記憶體與設備鏈分化，未見全面風險偏好修復。'
  };
  const moverTransmission = {
    MSTR:'與 COIN／CRCL／HOOD 同漲，加密共振成立。',COIN:'IBIT 盤前同步上漲，板塊確認充分。',CRCL:'與 COIN／HOOD 同向，監管敘事擴散。',HOOD:'與加密交易鏈同向，但 beta 高於基本面。',NDSN:'公司級財報事件，不外推整體工業。',DE:'可觀察 XLI／農機供應鏈是否跟隨。',COHR:'單一光通訊反彈，SMH 尚未確認。',RKLB:'小型高 beta，不外推大盤。',
    WMT:'拖累 XLP／DIA 情緒，反映消費與指引風險。',NTES:'公司級財報壓力，亦壓中概遊戲情緒。',BABA:'中概權重壓力，但雲業務仍是結構亮點。',CRWD:'CIBR 未同步破位前只作回吐。',PANW:'與 CRWD 同跌才構成資安板塊壓力。',TSLA:'放大 QQQ／成長 beta 壓力。',LRCX:'與 SMH 低於短中期均線同向。',MU:'需與 SNDK／SMH 同步才升級記憶體弱勢。'
  };
  const moverJudgment = Object.fromEntries(Object.keys(moverSignal).map(ticker => [ticker,
    ['MSTR','COIN','CRCL','HOOD'].includes(ticker) ? '守 VWAP 才保留加密動量，不追第一段。' :
    ['WMT','NTES','BABA'].includes(ticker) ? '財報負缺口未收 VWAP 前不抄底。' :
    ['CRWD','PANW','LRCX','MU'].includes(ticker) ? '需板塊 ETF 與同業同步收回 VWAP 才降級賣壓。' :
    '以 VWAP、成交量與同業確認，不用單股外推市場。'
  ]));
  const moverTickers = ['MSTR','COIN','CRCL','HOOD','NDSN','DE','COHR','RKLB','WMT','NTES','BABA','CRWD','PANW','TSLA','LRCX','MU'];
  const moverRows = moverTickers.map(ticker => {
    const row = eq(ticker);
    return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${moverSignal[ticker]}<small>${volume(row.volume)}</small></td><td>${moverTransmission[ticker]}</td><td>${moverJudgment[ticker]}</td></tr>`;
  }).join('');

  const checklist = [
    ['大盤過度延伸','Intermediate',`SPY ${n(a('SPY').distance50Atr)} ATR；XLE ${n(a('XLE').distance50Atr)} ATR`,'大盤未極端，但能源追價風險高。','mid'],
    ['下行動能增加','High',`四大 ETF 盤前全跌；QQQ ${pct(q('QQQ').changePct)}`,'期貨與長債同步走弱，短線風險升高。','high'],
    ['高位區間破位','Low','IWM／DIA／SPY／QQQ 仍高於 20／50／200MA','大型指數尚未確認技術破位。','low'],
    ['技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 的均線與 RSI 條件均未觸發。','low'],
    ['市場廣度惡化','High',`五日惡化 ${breadthScore}/8`,'六項指數廣度與 Stockbee 5D／10D 均低於 8/14。','high'],
    ['波動升溫','Low',`VIX ${n(vix.close)}；五項 ${vixScore}/5`,'只有 5 日漲幅為正，VIX 仍低於 20 與均線。','low'],
    ['突破勝率下降','Low','Stockbee 5D 1.31；10D 1.45','兩者仍高於 1，8/19 上漲／下跌股 556／190。','low'],
    ['主題動能轉弱','High',`SMH 5日 ${pct(a('SMH').fiveDayPct)}；低於 20／50MA`,'科技硬體仍弱，加密反彈屬另一條高 beta 主線。','high']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1],row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High＝Intermediate Risk。</strong>五日廣度與科技硬體轉弱，但主要指數仍守三條均線、VIX 僅 1/5，不把風險機械升級為全面做空。</div>`;

  const eventCell = (name,time) => td(`<span class="macro-event"><strong>${name}</strong><small>${time}</small></span>`);
  const macroEvents = table(['宏觀／財報事件','Actual 實際','Forecast 預期','Previous 前值','訊號'],[
    [eventCell('初領失業救濟金','截至 8/15｜08:30 ET'),numTd('206K'),numTd('210K'),numTd('212K 修正'),td(badge('優於預期','green'))],
    [eventCell('續領失業救濟金','截至 8/8｜08:30 ET'),numTd('1.800M'),numTd('1.808M'),numTd('1.780M'),td(badge('略優預期','green'))],
    [eventCell('Philadelphia Fed 製造業指數','8月｜08:30 ET'),numTd('47.4'),numTd('24.1'),numTd('41.4'),td(badge('Beat','green'))],
    [eventCell('Conference Board 領先指數 MoM','7月｜10:00 ET'),numTd('+0.2%'),numTd('+0.1%'),numTd('-0.1% 修正'),td(badge('Beat','green'))],
    [eventCell('Walmart（WMT）Q2 FY27','盤前已公布'),numTd('EPS 0.81<br>營收 187.94B'),numTd('EPS 0.74<br>營收 186.62B'),numTd('上季 EPS 0.66<br>營收 177.8B'),td(badge('Beat／Beat','green'))],
    [eventCell('WMT 美國同店銷售／Q3 EPS 指引','盤前已公布'),numTd('2.6%<br>0.62–0.64'),numTd('3.8%<br>0.68'),numTd('上季同店 4.5%'),td(badge('Miss／Miss','red'))],
    [eventCell('Alibaba（BABA）Q1 FY27','盤前已公布'),numTd('調整後淨利 RMB20.715B<br>營收 RMB268.953B'),numTd('淨利 RMB25.35B<br>營收約 RMB267.7B'),numTd('上季淨利 RMB34.26B'),td(badge('Miss／Beat','amber'))],
    [eventCell('Nordson（NDSN）Q3','盤前已公布'),numTd('EPS 3.25<br>營收 817.67M'),numTd('EPS 3.09<br>營收 779.44M'),numTd('上季 EPS 2.73<br>營收 745M'),td(badge('Beat／Beat','green'))]
  ],'report-data-table macro-results-table',[1,2,3]);

  const priorRows = [
    ['盤前半導體負缺口未收 VWAP 前不抄底。',`8/18 SMH ${pct(dayPct('SMH','2026-08-18'))}、QQQ ${pct(dayPct('QQQ','2026-08-18'))}，賣壓延續。`,badge('命中','green'),'今天 SMH 仍低於 20／50MA，維持板塊確認門檻。'],
    ['能源與防守板塊相對強。',`8/18 XLE ${pct(dayPct('XLE','2026-08-18'))}、XLP ${pct(dayPct('XLP','2026-08-18'))}，均跑贏 SPY ${pct(dayPct('SPY','2026-08-18'))}。`,badge('命中','green'),'XLE 已高延伸，只持有不追；WMT 財報令 XLP 面臨個股拖累。'],
    ['弱數據後先看 TLT 是否確認。',`8/18 TLT ${pct(dayPct('TLT','2026-08-18'))}，有反彈但幅度不足以扭轉中期弱勢。`,badge('已觸發','amber'),'今日強數據與鷹派紀要後，長債盤前再跌，久期交易降級。'],
    ['中期廣度尚未全面破壞。','8/18 六項指數廣度仍多數高於 50%，但 8/19 相對 8/14 已形成 8/8 五日惡化。',badge('命中','green'),'保留“中期未壞”結論，同時把五日惡化升為高風險項。'],
    ['VIX 低於 20，不機械轉空。',`8/18 VIX 未升破 20；8/19 收 ${n(vix.close)}，五項僅 ${vixScore}/5。`,badge('偏保守','blue'),'低 VIX 判斷正確，但應更早把廣度 8/8 惡化納入短線風控。']
  ];
  const priorReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/18）</h2>${table(['8/18 盤前主判斷','收盤事實','對賬','今日修正'],priorRows.map(row => row.map(value => td(value))),'report-data-table premarket-review-table')}<div class="callout"><strong>對賬：3 命中、1 已觸發、1 偏保守。</strong>半導體與防守輪動判斷有效；最大修正是五日廣度已惡化至 8/8，低 VIX 不能單獨抵銷廣度風險。</div><p class="section-summary"><strong>本段結論：</strong>延續半導體防守與長債確認框架，同時提高廣度在日內決策中的權重。</p></section>`;

  const majorRows = ['IWM','DIA','SPY','QQQ'].map(ticker => {
    const row = c(ticker); const quote = q(ticker);
    const notes = ticker === 'QQQ' ? `高於三線但距 50MA 僅 ${n(a(ticker).distance50Atr)} ATR；盤前領跌。` : ticker === 'SPY' ? `高於三線；盤前失守前收，先看 VWAP。` : ticker === 'IWM' ? '高於三線但盤前最弱，強數據未轉化為小盤優勢。' : '高於三線；WMT 負缺口拖累防守權重。';
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),numTd(n(row.rsi14)),td(notes)];
  });
  const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'],majorRows,'report-data-table major-etf-table',[1,2,3,5]).replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

  const atrTickers = ['XLE','XLV','XSW','IBIT','SPY','CIBR','GLD','IWM','QQQ','SMH','IEF','TLT'];
  const atrRows = atrTickers.map(ticker => a(ticker)).filter(Boolean).sort((left,right) => right.distance50Atr - left.distance50Atr).map(row => [td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),numTd(n(row.close)),numTd(n(row.ma50)),numTd(n(row.atr14)),numTd(n(row.distance50Atr),row.distance50Atr),td(Math.abs(row.distance50Atr) >= 2.5 ? badge('延伸','amber') : badge('正常','blue'))]);
  const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'],atrRows,'report-data-table',[1,2,3,4]);

  const breadthRowsRaw = sheetSnapshot.marketBreadth.values.slice(2).filter(row => row[0]);
  const breadthLatest = breadthRowsRaw[0], breadthPrev = breadthRowsRaw[1], breadthFive = breadthRowsRaw.find(row => row[0] === '2026-08-14');
  const breadthNames = ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA'];
  const breadthRows = breadthNames.map((name,index) => [name,`${breadthLatest[index+1]}%`,`${breadthPrev[index+1]}%→${breadthLatest[index+1]}%`,`${breadthFive[index+1]}%→${breadthLatest[index+1]}%`,index < 2 ? 'SPX 短中期均較五日前下降。' : index < 4 ? 'NDX 最新略修復，但仍低於五日前。' : 'IWM 參與度較五日前明顯收窄。']);
  const stockbeeRows = sheetSnapshot.stockbee.values.slice(2).filter(row => row[0]);
  const stockbeeLatest = stockbeeRows[0], stockbeePrev = stockbeeRows[1], stockbeeFive = stockbeeRows.find(row => row[0] === '8/14/2026');
  breadthRows.push(
    ['Stockbee 5D ratio',stockbeeLatest[3],`${stockbeePrev[3]}→${stockbeeLatest[3]}`,`${stockbeeFive[3]}→${stockbeeLatest[3]}`,'高於 1，但低於五日前。'],
    ['Stockbee 10D ratio',stockbeeLatest[4],`${stockbeePrev[4]}→${stockbeeLatest[4]}`,`${stockbeeFive[4]}→${stockbeeLatest[4]}`,'中期仍偏多但降溫。'],
    ['4%+ 上漲／下跌',`${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeePrev[1]}／${stockbeePrev[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeeFive[1]}／${stockbeeFive[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,'8/19 單日反彈強，但未修復五日趨勢。'],
    ['季度 +25%／-25%',`${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeePrev[5]}／${stockbeePrev[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeeFive[5]}／${stockbeeFive[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,'中期強股仍多於弱股。'],
    ['T2108',`${stockbeeLatest[14]}%`,`${stockbeePrev[14]}%→${stockbeeLatest[14]}%`,`${stockbeeFive[14]}%→${stockbeeLatest[14]}%`,'低於 50，中期廣度尚未確認轉強。']
  );
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'],breadthRows.map(row => row.map((value,index) => td(value,index === 1 ? 'num' : ''))),'report-data-table breadth-diagnostic-table',[1]);

  const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
  const fxMeaning = row => {
    const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '中短線偏強' : !row.above20 && !row.above50 ? '中短線偏弱' : '趨勢混合';
    const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
    return `均線趨勢：${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
  };
  const fxRows = [{...dxy,ticker:'DXY'},...['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].map(ticker => a(ticker))].map(row => {
    const quote = row.ticker === 'DXY' ? null : pre[row.ticker];
    const live = row.ticker === 'DXY' ? '日線至 8/19' : quote?.premarketAvailable ? pct(quote.changePct) : '薄量／略過';
    return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker === 'DXY' ? '美元指數' : fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct),row.dailyPct),numTd(pct(row.fiveDayPct),row.fiveDayPct),numTd(pct(row.oneMonthPct),row.oneMonthPct),numTd(live,quote?.changePct),numTd(n(row.rsi14)),td(fxMeaning(row))];
  });
  const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong>${n(dxy.close)}</strong><small>RSI ${n(dxy.rsi14)}／三線下方</small></div><div><span>原油</span><strong class="up">USO ${pct(q('USO').changePct)}</strong><small>能源通脹反彈</small></div><div><span>比特幣</span><strong class="up">IBIT ${pct(q('IBIT').changePct)}</strong><small>加密風險偏好</small></div></div>${table(['資產','8/19收盤','1日','5日','1月','8/20盤前','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table fx-trend-table-8',[1,2,3,4,5,6])}`;

  const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const bondRows = ['SHY','IEF','TLT'].map(ticker => { const row=c(ticker), quote=q(ticker); const signal=ticker==='SHY'?'盤前近持平，前端政策路徑變化有限。':ticker==='IEF'?'中債下跌，強數據推高利率。':'跌幅隨久期放大，期限溢價／通脹壓力更明顯。'; return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct),quote.changePct),numTd(n(row.rsi14)),td(signal)]; });
  const bondTable = table(['ETF','盤前','變化','RSI','含義'],bondRows,'report-data-table bond-curve-table',[1,2,3]);

  const tradeActions = {
    IWM:'守 20MA 與 VWAP；強數據若仍不能跑贏，降低小盤 beta。',DIA:'WMT 拖累防守權重，需其他工業／金融承接。',SPY:'高於三線；收回前收與 VWAP 才加倉。',QQQ:'50MA 緩衝很薄；失守 50MA 即降級。',SMH:'低於 20／50MA；未收回 50MA 前不升級硬體。',XLE:'RSI 過熱且高延伸，只持有不追。',IBIT:'加密主線強，但只在守 VWAP 時保留。',TLT:'盤前長債領跌；強數據後不做機械超跌反彈。'
  };
  const tradeRows = Object.keys(tradeActions).map(ticker => { const row=c(ticker), quote=q(ticker); return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(tradeActions[ticker])]; });
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3]);
  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">',`<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);

  return {
    ...base,
    report_title:'2026-08-20｜美股盤前監控',
    report_eyebrow:'2026-08-20｜盤前更新（補更）',
    report_heading:'強數據與鷹派紀要壓長債，WMT 指引拖累防守；加密鏈逆勢領漲',
    report_subtitle:'8/19 收盤技術、8/20 長橋盤前、三大指數廣度、Stockbee、宏觀 Actual／Forecast 與 8/18 盤前複盤交叉驗證',
    qqq_reengage_20ma:n(c('QQQ').ma20),
    qqq_breakout_add_1sd:'收回盤前 VWAP 與前收後再評估',
    data_timestamp_note:'長橋主快照於 12:11 ET 收集，但盤前欄位保存 09:30 ET 快照；Google Sheets 的 Sector Dashboard、Thematic Sectors、Macro、市場廣度、Stockbee 與 Data QA 已更新至 8/19／8/20。8:30 ET 初領失業救濟金與 Philadelphia Fed 已公布；10:00 ET 領先指數亦已更新。',
    risk_badge:`條件式防守｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="dn">IWM ${pct(q('IWM').changePct)}</span></strong><small>DIA ${pct(q('DIA').changePct)}、QQQ ${pct(q('QQQ').changePct)}、SPY ${pct(q('SPY').changePct)}。</small></div><div class="card"><span>長短債分化</span><strong><span class="dn">TLT ${pct(q('TLT').changePct)}</span></strong><small>IEF ${pct(q('IEF').changePct)}、SHY ${pct(q('SHY').changePct)}；跌幅隨久期放大。</small></div><div class="card"><span>加密鏈</span><strong><span class="up">MSTR ${pct(q('MSTR').changePct)}</span></strong><small>COIN ${pct(q('COIN').changePct)}、CRCL ${pct(q('CRCL').changePct)}、HOOD ${pct(q('HOOD').changePct)}。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>技術 ${technicalScore}/12；VIX ${n(vix.close)}，五項 ${vixScore}/5。</small></div>`,
    upgrade_trigger_rule:'滿足 2/3 才把盤前賣壓定義為可買回調。',
    upgrade_trigger_1:`QQQ 收回前收 ${n(c('QQQ').close)} 與 VWAP，SMH 重返 50MA ${n(c('SMH').ma50)}。`,
    upgrade_trigger_2:'TLT 收回前收、10Y 回落，且長債重新領先 SHY／IEF。',
    upgrade_trigger_3:'開盤廣度擴張，加密鏈守 VWAP但不以科技硬體續跌為代價。',
    downgrade_trigger_rule:'任一觸發即降低高 beta。',
    downgrade_trigger_1:`QQQ 失守 50MA ${n(c('QQQ').ma50)}，SMH 未收回 20MA ${n(c('SMH').ma20)}。`,
    downgrade_trigger_2:'TLT 繼續領跌、USO 上升，強數據與能源形成再通脹組合。',
    downgrade_trigger_3:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%。',
    core_conclusions:`<ol><li><strong>宏觀不是單純“強數據利多”。</strong>初領 206K 優於 210K 共識、Philadelphia Fed 47.4 大幅高於 24.1、領先指數 +0.2% 也 Beat；結果是長債跌幅大於中短債，估值折現率壓力上升。</li><li><strong>7 月 FOMC 紀要提高政策尾部風險。</strong>多位官員認為若通脹不降，進一步收緊可能必要；部分官員已準備升息。這與今日強數據共振，不利長久期資產。</li><li><strong>WMT 是“財報雙 Beat、股價仍大跌”的典型。</strong>EPS／營收勝預期，但同店銷售與 Q3 EPS 指引 Miss，盤前 ${pct(q('WMT').changePct)}；市場交易的是未來增長，不是標題 Beat。</li><li><strong>加密鏈是今日最完整的風險偏好主線。</strong>MSTR、COIN、CRCL、HOOD 同漲，IBIT 盤前 ${pct(q('IBIT').changePct)}；但這沒有修復 SMH 低於 20／50MA 的科技硬體弱勢。</li><li><strong>廣度短線反彈、五日仍惡化。</strong>8/19 Stockbee 4% 上漲／下跌 556／190，但相對 8/14，六項指數廣度與 5D／10D ratio 全部下降，綜合 ${breadthScore}/8。</li><li><strong>DXY 弱、油價強、長債跌是一組重要背離。</strong>DXY ${n(dxy.close)}、RSI ${n(dxy.rsi14)} 且低於三線，USO 盤前 ${pct(q('USO').changePct)}、TLT ${pct(q('TLT').changePct)}；長端壓力更像期限溢價與能源通脹，而非全面美元緊縮。</li></ol><p class="section-summary"><strong>本段結論：</strong>今天採條件式防守：不全面做空，但在 QQQ／SMH、TLT 與開盤廣度未共同確認前，不追高 beta。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：長債領跌與科技硬體弱勢；QQQ／SMH 未收回關鍵位前降低 beta。',
    positioning_secondary:'次線：加密鏈共振，但只在 MSTR／COIN／CRCL／HOOD 守 VWAP 時保留。',
    positioning_watch:`觀察：QQQ 50MA ${n(c('QQQ').ma50)}、SMH 20／50MA ${n(c('SMH').ma20)}／${n(c('SMH').ma50)}、TLT 前收 ${n(c('TLT').close)}、DXY 100／102、VIX 20。`,
    positioning_invalidation:'TLT 收回前收、QQQ／SMH 收回 VWAP與關鍵均線，且開盤廣度擴張，防守定位失效。',
    pre_market_movers_rows:moverRows,
    pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>加密鏈四檔同向且成交量充足；WMT／BABA／NTES 是財報負缺口，NDSN／DE 是公司級正面事件。成交量只顯示數量，不把薄量跳價當主訊號。</p>`,
    section_pre_market_movers_primary_action:'主線：先處理加密共振與 WMT／BABA／NTES 財報負缺口。',
    section_pre_market_movers_condition_action:'條件：加密四檔至少三檔守 VWAP；財報負缺口需收回 VWAP 才降級。',
    section_pre_market_movers_avoid_action:'避免：把薄量跳價列為主線，或把單一公司財報外推整個板塊。',
    premarket_movers_invalidation:'MSTR／COIN／CRCL／HOOD 多數失守 VWAP，且 QQQ／SMH 繼續轉弱，加密 risk-on 敘事失效。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High 代表條件式防守，不是機械全面做空。`,
    section_correction_checklist_condition_action:'條件：主要指數仍守三線且 VIX 低於 20，允許保留核心倉；新倉等廣度確認。',
    section_correction_checklist_avoid_action:'避免：用低 VIX 抵銷廣度 8/8 惡化，或只因 XLE 高延伸而做空大盤。',
    checklist_invalidation:'QQQ／SMH 收回關鍵均線、TLT 轉強且開盤廣度擴張，短線防守條件失效。',
    macro_premarket_background_table:`${macroEvents}<div class="scenario-grid"><div class="scenario-card"><strong>風險修復</strong><p>TLT 收回前收、QQQ／SMH 收 VWAP，加密鏈守住第一小時：負缺口可視為回調。</p></div><div class="scenario-card"><strong>利率壓估值</strong><p>TLT 繼續領跌、10Y 上升、QQQ 失守 50MA：降低科技與高估值 beta。</p></div><div class="scenario-card"><strong>再通脹分化</strong><p>USO 上升、DXY 仍弱、XLE 強而長債跌：偏能源，不等同全面 risk-on。</p></div></div><p class="section-summary"><strong>本段結論：</strong>宏觀 Actual 整體偏強，但交易含義由長短債與科技反應決定；WMT 更凸顯“當期 Beat、前瞻 Miss”的分化。</p>`,
    section_macro_premarket_background_primary_action:'主線：初領、Philly Fed、LEI 與 FOMC 紀要合併解讀，先看長短債反應。',
    section_macro_premarket_background_condition_action:'條件：TLT／10Y 與 QQQ／SMH 至少兩組同向，才調整久期與科技倉位。',
    section_macro_premarket_background_avoid_action:'避免：把強數據直接寫成股市利多，或只看 WMT 標題雙 Beat。',
    macro_invalidation:'若長債收復失地且 QQQ／SMH 收回 VWAP，強數據壓估值情景失效。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜${thematic.length} 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>Sector 由 XLV／XLE 居前；Thematic 由 IBB／XBI／PPH 領先，醫療與生技成為新強勢群。完整 ${thematic.length} 檔保留，VOO 基準在表內，ticker 只顯示英文。</p>`,
    section_sector_thematic_etf_primary_action:'主線：醫療／生技與能源相對強，科技硬體仍需均線與 VWAP 確認。',
    section_sector_thematic_etf_condition_action:'條件：XLV／IBB／XBI 守 20MA 才延續；SMH 收回 20／50MA 才恢復硬體主線。',
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 追高 IBB／XLE，或忽略 WMT 對 XLP 的個股拖累。',
    sector_etf_invalidation:'XLV／IBB／XBI 失守 20MA，且 SMH／QQQ 同時收回關鍵位，防守輪動失效。',
    major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 僅保留 IWM／DIA／SPY／QQQ；四者仍高於三條均線，技術惡化 ${technicalScore}/12，但盤前全跌，先看 VWAP 與 QQQ 50MA。</p>`,
    section_major_etf_technical_primary_action:'主線：四大 ETF 結構未破，但盤前全跌，先守不追。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 50MA ${n(c('QQQ').ma50)}，SPY 收回前收 ${n(c('SPY').close)} 與 VWAP。`,
    section_major_etf_technical_avoid_action:'避免：因收盤高於三線就忽略盤前長債與科技同步走弱。',
    major_etf_invalidation:`QQQ 失守 50MA ${n(c('QQQ').ma50)}、SPY 跌破 20MA ${n(c('SPY').ma20)}，結構降級。`,
    fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XLE +${n(a('XLE').distance50Atr)} ATR 為最明顯正延伸；SMH ${n(a('SMH').distance50Atr)} ATR、TLT ${n(a('TLT').distance50Atr)} ATR。延伸只作風險定位，不機械預測反轉。</p>`,
    section_50ma_atr_extension_primary_action:'主線：XLE 高延伸只持有不追；SMH／TLT 負延伸等待價格確認。',
    section_50ma_atr_extension_condition_action:'條件：TLT 回升需 10Y 下行；SMH 回升需同業與 QQQ 同步。',
    section_50ma_atr_extension_avoid_action:'避免：把 ATR 正延伸當成必跌，或把負延伸當成必買。',
    atr_extension_invalidation:'延伸資產穿越 20MA 且獲得板塊確認時，重新評估風險方向。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>8/19 六項均高於 53%，但全部低於 8/14；NDX 短線相較 8/18 回升，IWM 仍收窄。</p><p><strong>與 Stockbee 交叉驗證：</strong>8/19 4% 上漲／下跌 556／190，單日反彈強；5D 1.31、10D 1.45 仍高於 1，但低於 8/14 的 1.55／2.16。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1535／1042，T2108 48.45%；強股仍多，但中期廣度尚未重新站穩 50。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 合併為“單日修復、五日惡化、中期未崩”；綜合 ${breadthScore}/8。</p>`,
    stockbee_breadth_interpretation:`<div class="callout warn"><strong>廣度結論：</strong>五日惡化 ${breadthScore}/8。不能只看 556／190 就說全面 risk-on，也不能忽略六項廣度仍高於 50%；今日以開盤後延續性決定倉位。</div>`,
    section_market_breadth_primary_action:'主線：保留核心倉，新倉等待開盤上漲家數與價格延續共同確認。',
    section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度守 50%。',
    section_market_breadth_avoid_action:'避免：只用 556／190 判斷全面 risk-on，或只用五日分數判斷全面崩壞。',
    breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，中期未崩結論失效。',
    fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY ${n(dxy.close)}、5日 ${pct(dxy.fiveDayPct)}、1月 ${pct(dxy.oneMonthPct)}、RSI ${n(dxy.rsi14)}，低於 20／50／200MA；USO 上漲與 IBIT 急升同時存在，分別代表能源通脹與加密風險偏好，不能合併成單一商品行情。</p>`,
    section_fx_commodities_primary_action:'主線：DXY 用正式日線判斷，商品分拆能源通脹與加密風險偏好。',
    section_fx_commodities_condition_action:'條件：DXY 仍低於 100、USO 降溫且 TLT 轉漲，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY，或把 USO／IBIT 同漲合併為單一 risk-on。',
    forex_commodity_invalidation:'DXY 升破 100／102、USO 加速且 TLT 轉弱，金融條件壓力升級。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.19%</strong><small>8/19 財政部</small></div><div><span>美國 10Y</span><strong>4.65%</strong><small>2s10s +46bp</small></div><div><span>美國 20Y</span><strong>5.17%</strong><small>2s20s +98bp</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>盤前 SHY ${pct(q('SHY').changePct)}、IEF ${pct(q('IEF').changePct)}、TLT ${pct(q('TLT').changePct)}，跌幅隨久期放大。初領與 Philly Fed 偏強，加上 7 月 FOMC 紀要的升息尾部風險，壓力集中在長端；這不是純粹的前端升息交易。</div>`,
    section_treasury_fed_primary_action:'主線：比較 TLT 相對 IEF／SHY 的跌幅，再決定長久期科技倉位。',
    section_treasury_fed_condition_action:'條件：TLT 收回前收、10Y 回落、QQQ／SMH 收 VWAP，三項至少兩項成立。',
    section_treasury_fed_avoid_action:'避免：把強數據或鷹派紀要機械等同全面股市下跌。',
    treasury_invalidation:'TLT 轉強且 QQQ／SMH 同步收回關鍵位，利率壓估值情景失效。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 為 8/17–8/21；只追蹤觸發或接近 ±1SD 的標的，技術位與事件反應優先於機械門檻。</p>`,
    intraday_playbook_rows:[
      ['09:30 ORB','TLT／IEF／SHY','長短債確認','若跌幅持續隨久期放大，降低長久期科技。'],
      ['09:30 ORB','QQQ 50MA／SMH 20與50MA','科技防守','未收 VWAP與均線前不抄硬體。'],
      ['首小時','MSTR／COIN／CRCL／HOOD','加密共振','四檔至少三檔守 VWAP 才保留。'],
      ['首小時','WMT／XLP／DIA','消費指引風險','WMT 未收 VWAP、XLP 跑輸即擴大防守板塊壓力。'],
      ['全日','USO／DXY／TLT','再通脹背離','油升、美元弱、長債跌＝期限溢價風險。'],
      ['全日','Stockbee／NDX／IWM 廣度','五日惡化驗證','反彈若無上漲家數延續，不提高 beta。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用、錯誤 0。主收集器在 12:11 ET 執行，但使用長橋保留的 09:30 ET 盤前欄位。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔、Thematic ${thematic.length} 檔，按 RSI 降序；VOO 基準在 Thematic 表內。</div><div class="callout"><strong>廣度 QA：</strong>六組指數廣度、Stockbee、Data QA 全部更新至 8/19／8/20；五日端點統一為 8/14→8/19，分數 ${breadthScore}/8。</div><div class="callout"><strong>宏觀／財報 QA：</strong>初領、續領、Philly Fed、領先指數、WMT、BABA、NDSN 均保留 Actual／Forecast／Previous 與具體 Beat／Miss。</div><div class="callout"><strong>DXY QA：</strong>正式日線截至 ${dxy.asOf}，RSI 與三條均線完整；外匯 ETF 只作交叉驗證。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 五項公式未變。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://www.dol.gov/ui/data.pdf">美國勞工部失業救濟金</a>；<a href="https://www.philadelphiafed.org/surveys-and-data/regional-economic-analysis/manufacturing-business-outlook-survey">Philadelphia Fed</a>；<a href="https://www.conference-board.org/topics/us-leading-indicators">Conference Board LEI</a>；<a href="https://www.federalreserve.gov/monetarypolicy/fomcminutes20260729.htm">FOMC 7 月會議紀要</a>；<a href="https://corporate.walmart.com/news/2026/08/20/walmart-releases-q2-fy27-earnings">Walmart 官方財報</a>；<a href="https://longbridge.com/en/news/296478064.md">Alibaba 財報快訊</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部收益率</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY</a>。</p><p class="source-note">數據截至 2026-08-20 09:30 ET 左右；盤前價格會變動。技術、DXY、Google Sheet 與廣度截至 8/19。本報告為本地補更草稿，不構成投資建議。</p>`,
    sector_momentum_chart:chartRows
  };
}

module.exports = {moverMeta,build};
