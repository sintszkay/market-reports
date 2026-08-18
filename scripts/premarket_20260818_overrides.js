'use strict';

const previous = require('./premarket_20260817_overrides');
const dxy = require('../data/2026-08-18-dxy.json');

const moverMeta = Object.fromEntries([
  'XOS','HD','ADBE','WMT','NOW','XLE','FSLR','AAPL',
  'BIDU','COHR','MRVL','SNDK','LRCX','ALAB','AMAT','MU'
].map(ticker => [ticker, ['盤前報價已更新。','按公司事件與板塊共振拆解。','以 VWAP 與成交量確認。']]));

function build(ctx) {
  const base = previous.build(ctx);
  const {
    ROOT,snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    requireRow,requirePre,sheetTech,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,majorTable,expectedTable
  } = ctx;

  const q = ticker => requirePre(ticker);
  const c = ticker => requireRow(ticker);
  const a = ticker => adjusted[ticker] || c(ticker);
  const quoteTime = new Date(quoteSnapshot.generatedAt).toLocaleTimeString('en-US', {
    timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false
  });
  const breadthScore = 4;
  const checklistHigh = 2;
  const externalQuotes = {
    XOS:{ticker:'XOS',price:4.62,previousClose:2.09,changePct:121.05,volume:24895361},
    HD:{ticker:'HD',price:345.50,previousClose:337.88,changePct:2.26,volume:166770},
    BIDU:{ticker:'BIDU',price:94.70,previousClose:104.12,changePct:-9.05,volume:470254}
  };
  const mq = ticker => externalQuotes[ticker] || q(ticker);
  const maState = row => `<span class="ma-state-group"><span class="ma-state ${row.above20 ? 'ma-up' : 'ma-down'}">20<span class="ma-arrow">${row.above20 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above50 ? 'ma-up' : 'ma-down'}">50<span class="ma-arrow">${row.above50 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above200 ? 'ma-up' : 'ma-down'}">200<span class="ma-arrow">${row.above200 ? '▲' : '▼'}</span></span></span>`;

  const moverSignal = {
    XOS:'取得美國空軍移動充電原型協議，屬首份國防合約；小型股事件驅動。',
    HD:'調整後 EPS 4.92 對 4.73 共識、營收 478.61 億對 472.3 億美元，雙 Beat；全年指引維持。',
    ADBE:'昨日下跌後反彈，長橋未見足以解釋全部漲幅的新公司級公告。',
    WMT:'防守消費相對科技更強，且市場提前定位本週財報。',
    NOW:'昨日大跌後技術反彈；SaaS 需求穩定，但沒有新的財報結果。',
    XLE:'原油續升、長端利率偏高，能源成為盤前少數正向板塊。',
    FSLR:'防守型能源與政策題材承接，未見同等強度的新公司公告。',
    AAPL:'權重科技少數上漲；供應鏈遷移與德國反壟斷和解消息提供相對支撐。',
    BIDU:'Q2 營收 313.25 億人民幣低於 315.9 億共識；調整後每 ADS 7.22 元低於 9.75 元，雙 Miss。',
    COHR:'光通訊板塊同步賣壓；高估值 AI 互聯在長端收益率上升時被減倉。',
    MRVL:'8/27 財報前高預期去風險；市場共識仍高，但估值令股價對失望更敏感。',
    SNDK:'記憶體在昨日急升後獲利回吐；與 MU、SK Hynix 同步，屬板塊去風險。',
    LRCX:'晶片設備與記憶體同步回落，沒有單一公司事件足以解釋全部跌幅。',
    ALAB:'AI 互聯高 beta 跟随半導體去風險，昨日沒有延續強勢。',
    AMAT:'設備鏈廣泛下跌，長端利率與 AI 資本開支回報擔憂同時壓制估值。',
    MU:'成交量高且與 SNDK 同跌；由前一日逼空式上漲轉為高位獲利回吐。'
  };
  const moverTransmission = {
    XOS:'個股事件，不外推工業或 EV 板塊。',HD:'與營建許可 Beat 同向，但大型項目需求仍弱。',ADBE:'只作超跌修復，不外推全體軟體。',WMT:'與 XLP 相對強勢同向。',NOW:'反彈未帶動 XSW，板塊確認不足。',XLE:'與 USO 同向，能源共振成立。',FSLR:'和 XLE 不同驅動，不能合併成單一能源敘事。',AAPL:'相對 QQQ 抗跌，但不能抵銷半導體拖累。',
    BIDU:'公司級財報風險，並壓制中概科技情緒。',COHR:'與 MRVL／LRCX 同跌，光通訊與設備共振。',MRVL:'與 COHR／ALAB 同跌，AI 互聯去風險。',SNDK:'與 MU 同跌且成交量高，記憶體信號可靠。',LRCX:'與 AMAT／KLAC 同跌，設備鏈共振。',ALAB:'與 MRVL／COHR 同跌，高 beta 互聯承壓。',AMAT:'設備鏈與 SMH 同跌，板塊信號可靠。',MU:'與 SNDK 同跌、成交量逾百萬股，記憶體共振。'
  };
  const moverJudgment = {
    XOS:'波動極高，只觀察事件延續，不追第一段。',HD:'守 VWAP 且電話會不下修才延續。',ADBE:'收回昨日跌幅與 VWAP 才升級。',WMT:'財報前不擴大事件倉位。',NOW:'若 XSW 不跟，按個股反彈處理。',XLE:'油價守高、科技弱才保留相對強勢。',FSLR:'成交量不足時不外推板塊。',AAPL:'只作權重相對強弱確認。',
    BIDU:'未收回 VWAP 前不抄底。',COHR:'高成交量負缺口，未收 VWAP 不搶反彈。',MRVL:'財報前風險升高，收回 VWAP 才降級賣壓。',SNDK:'高波動標的，失守 VWAP 維持防守。',LRCX:'SMH 未回前收前不抄底。',ALAB:'高 beta 去風險，需 MRVL／COHR 同步修復。',AMAT:'設備三檔至少兩檔收 VWAP 才改善。',MU:'與 SNDK 同收 VWAP 才取消記憶體弱勢。'
  };
  const moverTickers = ['XOS','HD','ADBE','WMT','NOW','XLE','FSLR','AAPL','BIDU','COHR','MRVL','SNDK','LRCX','ALAB','AMAT','MU'];
  const moverRows = moverTickers.map(ticker => {
    const row = mq(ticker);
    return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${moverSignal[ticker]}<small>${volume(row.volume)}</small></td><td>${moverTransmission[ticker]}</td><td>${moverJudgment[ticker]}</td></tr>`;
  }).join('');

  const checklist = [
    ['大盤過度延伸','High',`SPY +${n(a('SPY').distance50Atr)} ATR；XLE +${n(a('XLE').distance50Atr)} ATR`,'趨勢未壞，但追價回報下降。','high'],
    ['下行動能增加','High',`QQQ ${pct(q('QQQ').changePct)}；SMH ${pct(q('SMH').changePct)}`,'半導體由記憶體、設備到互聯同步下跌。','high'],
    ['高位區間破位','Low','四大 ETF 仍高於 20／50／200MA','8/17 收盤尚未形成大型指數技術破位。','low'],
    ['技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 的均線與 RSI 條件均未觸發。','low'],
    ['市場廣度惡化','Intermediate',`五日惡化 ${breadthScore}/8`,'三項指數廣度與 Stockbee 5D 轉弱，但全部仍在中線之上。','mid'],
    ['波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'>20、5日>0、1月>0、20MA、50MA 五項均未觸發。','low'],
    ['突破勝率下降','Intermediate','Stockbee 5D 1.37；10D 1.72','5D 仍高於 1，但 4% 上漲／下跌轉為 194／305。','mid'],
    ['主題動能轉弱','Intermediate',`SMH 盤前 ${pct(q('SMH').changePct)}`,'短線共振轉弱，但 8/17 收盤仍在三條均線上方。','mid']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1],row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High。</strong>高延伸與半導體同步下跌同時出現；這不是大型指數技術破位，但開盤後需要更低 beta。</div>`;

  const eventCell = (name,time) => td(`<span class="macro-event"><strong>${name}</strong><small>${time}</small></span>`);
  const macroEvents = table(['宏觀／財報事件','Actual 實際','Forecast 預期','Previous 前值','訊號'],[
    [eventCell('美國營建許可','7月｜08:30 ET'),numTd('1.443M'),numTd('1.370M'),numTd('1.374M'),td(badge('Beat','green'))],
    [eventCell('美國新屋開工','7月｜08:30 ET'),numTd('1.239M'),numTd('1.350M'),numTd('1.415M 修正'),td(badge('Miss','red'))],
    [eventCell('美國進口價格 MoM','7月｜08:30 ET'),numTd('-0.4%'),numTd('+0.1%'),numTd('-0.3% 修正'),td(badge('低於預期','blue'))],
    [eventCell('工業生產 MoM','7月｜09:15 ET'),numTd('+0.2%'),numTd('+0.3%'),numTd('+0.3% 修正'),td(badge('Miss','red'))],
    [eventCell('產能利用率','7月｜09:15 ET'),numTd('76.3%'),numTd('76.3%'),numTd('76.1%'),td(badge('In line','blue'))],
    [eventCell('待售房屋銷售 MoM','7月｜10:00 ET'),numTd('待公布'),numTd('+0.3%'),numTd('-5.4%'),td(badge('待公布','blue'))],
    [eventCell('Home Depot（HD）Q2','盤前已公布'),numTd('EPS 4.92<br>營收 47.861B'),numTd('EPS 4.73<br>營收 47.23B'),numTd('上季 EPS 3.43<br>營收 41.8B'),td(badge('Beat／Beat','green'))],
    [eventCell('Baidu（BIDU）Q2','盤前已公布'),numTd('EPS RMB7.22<br>營收 RMB31.325B'),numTd('EPS RMB9.75<br>營收 RMB31.59B'),numTd('上季 EPS RMB8.76<br>營收 RMB32.075B'),td(badge('Miss／Miss','red'))]
  ],'report-data-table macro-results-table',[1,2,3]);

  const priorRows = [
    ['記憶體與 AI 互聯是 8/17 主線。','SNDK +8.88%、MU +4.13%、COHR +7.79%、MRVL +5.54%；SMH +1.06%。',badge('命中','green'),'今天同一批股票反向大跌，必須從趨勢主線降為高波動擁擠交易。'],
    ['只有 SMH 收復 50MA 才升級硬體。','SMH 收 594.07，站上 20／50／200MA，硬體升級條件成立。',badge('已觸發','amber'),'觸發後並未獲得隔夜延續，今早跌回 50MA 附近，需增加次日確認。'],
    ['AI 硬體內部不完整。','ALAB -0.45%、SMCI -3.92%、ARM -2.87%，明顯落後記憶體與光通訊。',badge('命中','green'),'繼續要求互聯、記憶體、伺服器至少兩組同步。'],
    ['弱數據後長債不確認，期限溢價仍主導。','Empire 20.6 與 NAHB 35 均 Beat；TLT 仍跌 0.84%，10Y 升至 4.72%。',badge('命中','green'),'今天房屋數據分化後，仍先看 TLT 是否能夠上漲。'],
    ['廣度中期仍強，不應直接轉空。','8/17 指數廣度明顯回落，Stockbee 5D 1.37 仍高於 1；四大 ETF 小跌但未破均線。',badge('失誤','red'),'中期未壞，但 4% 下跌股 305 已超過上漲股 194，短線要降低倉位。']
  ];
  const priorReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/17）</h2>${table(['8/17 盤前主判斷','收盤事實','對賬','今日修正'],priorRows.map(row => row.map(value => td(value))),'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：3 命中、1 已觸發、1 失誤。</strong>記憶體／光通訊與長端利率判斷有效，但升級後的硬體強勢未獲得次日延續，廣度風險也需要更快反映。</div><p class="section-summary"><strong>本段結論：</strong>今天必須把昨日領漲股視為擁擠倉位壓力測試；即使開盤反彈，也要同時看到 SMH、TLT 與廣度確認。</p></section>`;

  const major = ['IWM','DIA','SPY','QQQ'].map(ticker => {
    const row = c(ticker);
    const quote = q(ticker);
    const notes = {
      IWM:`高於三條均線；盤前 ${pct(quote.changePct)}，等待 10:00 房屋數據。`,
      DIA:`四大 ETF 最抗跌；距 50MA ${n(a('DIA').distance50Atr)} ATR。`,
      SPY:`距 50MA ${n(a('SPY').distance50Atr)} ATR，失守前收後不追反彈。`,
      QQQ:`盤前領跌，仍高於三條均線；守 20MA ${n(row.ma20)} 是第一結構門檻。`
    };
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),numTd(n(row.rsi14)),td(notes[ticker])];
  });
  const majorTableToday = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'],major,'report-data-table major-etf-table',[1,2,3,5]).replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

  const atrTickers = ['XLE','XSW','XLF','GLD','SPY','CIBR','CPER','IWM','SMH','IEF','TLT','REMX'];
  const atrRows = atrTickers.map(ticker => a(ticker)).filter(Boolean).sort((left,right) => right.distance50Atr - left.distance50Atr).map(row => [
    td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),numTd(n(row.close)),numTd(n(row.ma50)),numTd(n(row.atr14)),numTd(n(row.distance50Atr),row.distance50Atr),td(Math.abs(row.distance50Atr) >= 2.5 ? badge('延伸','amber') : badge('正常','blue'))
  ]);
  const atrTableToday = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'],atrRows,'report-data-table',[1,2,3,4]);

  const breadthRowsRaw = sheetSnapshot.marketBreadth.values.slice(2).filter(row => row[0]);
  const breadthLatest = breadthRowsRaw[0];
  const breadthPrev = breadthRowsRaw[1];
  const breadthFive = breadthRowsRaw.find(row => row[0] === '2026-08-10');
  const breadthNames = ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA'];
  const breadthComment = ['短線跌幅最大，SPX 參與度明顯收窄。','中期仍高於六成，但五日轉弱。','科技短線廣度仍在六成以上。','五日改善，科技中期緩衝仍在。','小型股短線五日改善。','小型股中期近乎持平。'];
  const breadthRows = breadthNames.map((name,index) => [name,`${breadthLatest[index+1]}%`,`${breadthPrev[index+1]}%→${breadthLatest[index+1]}%`,`${breadthFive[index+1]}%→${breadthLatest[index+1]}%`,breadthComment[index]]);
  const stockbeeRows = sheetSnapshot.stockbee.values.slice(2).filter(row => row[0]);
  const stockbeeLatest = stockbeeRows[0];
  const stockbeePrev = stockbeeRows[1];
  const stockbeeFive = stockbeeRows.find(row => row[0] === '8/10/2026');
  breadthRows.push(
    ['Stockbee 5D ratio',stockbeeLatest[3],`${stockbeePrev[3]}→${stockbeeLatest[3]}`,`${stockbeeFive[3]}→${stockbeeLatest[3]}`,'繼續降溫但仍高於 1。'],
    ['Stockbee 10D ratio',stockbeeLatest[4],`${stockbeePrev[4]}→${stockbeeLatest[4]}`,`${stockbeeFive[4]}→${stockbeeLatest[4]}`,'中期延續率仍偏多。'],
    ['4%+ 上漲／下跌',`${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeePrev[1]}／${stockbeePrev[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeeFive[1]}／${stockbeeFive[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,'單日強弱家數轉為空方占優。'],
    ['季度 +25%／-25%',`${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeePrev[5]}／${stockbeePrev[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeeFive[5]}／${stockbeeFive[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,'中期強股仍多於弱股。'],
    ['T2108',`${stockbeeLatest[14]}%`,`${stockbeePrev[14]}%→${stockbeeLatest[14]}%`,`${stockbeeFive[14]}%→${stockbeeLatest[14]}%`,'維持 50 上方，尚未轉空。']
  );
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'],breadthRows.map(row => row.map((value,index) => td(value,index === 1 ? 'num' : ''))),'report-data-table breadth-diagnostic-table',[1]);

  const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
  const fxMeaning = row => {
    const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '中短線偏強' : !row.above20 && !row.above50 ? '中短線偏弱' : '趨勢混合';
    const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
    return `均線趨勢：${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
  };
  const dxyRow = {...dxy,ticker:'DXY'};
  const fxTickers = ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'];
  const fxRows = [dxyRow,...fxTickers.map(ticker => a(ticker))].map(row => {
    const quote = row.ticker === 'DXY' ? null : pre[row.ticker];
    const liveValid = quote?.premarketAvailable && quote.volume >= 100;
    const live = row.ticker === 'DXY' ? '日線至 8/14' : liveValid ? pct(quote.changePct) : '薄量／略過';
    return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker === 'DXY' ? '美元指數' : fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct),row.dailyPct),numTd(pct(row.fiveDayPct),row.fiveDayPct),numTd(pct(row.oneMonthPct),row.oneMonthPct),numTd(live,liveValid ? quote.changePct : null),numTd(n(row.rsi14)),td(fxMeaning(row))];
  });
  const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong>${n(dxy.close)}</strong><small>日線至 ${dxy.asOf}／RSI ${n(dxy.rsi14)}</small></div><div><span>原油</span><strong class="up">USO ${pct(q('USO').changePct)}</strong><small>三線多頭</small></div><div><span>貴金屬</span><strong class="dn">GLD ${pct(q('GLD').changePct)}</strong><small>金銀同步回吐</small></div></div>${table(['資產','8/17收盤','1日','5日','1月','8/18盤前','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table fx-trend-table-8',[1,2,3,4,5,6])}`;

  const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const bondRows = ['SHY','IEF','TLT'].map(ticker => {
    const row = c(ticker);
    const quote = q(ticker);
    const signal = ticker === 'SHY' ? '高於 20／50MA；短端穩定。' : ticker === 'IEF' ? '低於三條均線，負延伸仍深。' : '低於三條均線、距 50MA 約 -4.67 ATR；弱增長數據尚未帶來久期買盤。';
    return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct),quote.changePct),numTd(n(row.rsi14)),td(signal)];
  });
  const bondTable = table(['ETF','盤前','變化','RSI','含義'],bondRows,'report-data-table bond-curve-table',[1,2,3]);

  const tradeActions = {
    IWM:`守前收 ${n(c('IWM').close)}；10:00 房屋數據 Miss 且失 VWAP 時降小盤 beta。`,
    DIA:`盤前最抗跌；守前收 ${n(c('DIA').close)}，不追第一段。`,
    SPY:`距 50MA +${n(a('SPY').distance50Atr)} ATR；未收回前收 ${n(c('SPY').close)} 前維持防守。`,
    QQQ:`盤前領跌；守 20MA ${n(c('QQQ').ma20)} 與 VWAP 才取消降級。`,
    SMH:`負缺口跌向 50MA ${n(c('SMH').ma50)}；至少兩組晶片鏈收回 VWAP 才修復。`,
    XLE:`油價支持但延伸 +${n(a('XLE').distance50Atr)} ATR；只持有不追。`,
    CIBR:`相對半導體抗跌，但延伸仍高；守 VWAP 才保留。`,
    TLT:`負延伸 ${n(a('TLT').distance50Atr)} ATR；弱數據後仍不漲，先按期限溢價處理。`
  };
  const tradeRows = Object.keys(tradeActions).map(ticker => {
    const row = c(ticker);
    const quote = q(ticker);
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(tradeActions[ticker])];
  });
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3]);
  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">',`<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);

  return {
    ...base,
    report_title:'2026-08-18｜美股盤前監控',
    report_eyebrow:'2026-08-18｜盤前更新',
    report_heading:'半導體擁擠交易反轉、長端利率壓估值：工業生產略遜預期後先防守',
    report_subtitle:'8/17 收盤技術、8/18 長橋盤前、最新市場廣度、宏觀 Actual／Forecast 與上次盤前複盤交叉驗證',
    qqq_reengage_20ma:n(c('QQQ').ma20),
    qqq_breakout_add_1sd:'等待收回 VWAP 與前收後再評估',
    data_timestamp_note:`長橋盤前快照約截至 ${quoteTime} ET；Google Sheets 的 Sector Dashboard、Thematic Sectors、Macro、市場廣度與 Stockbee 截至 8/17。8:30 ET 房屋與進口價格、9:15 ET 工業生產與產能利用率已更新；10:00 ET 待售房屋銷售尚待公布。`,
    risk_badge:`半導體去風險／高延伸｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="dn">QQQ ${pct(q('QQQ').changePct)}</span></strong><small>SPY ${pct(q('SPY').changePct)}、IWM ${pct(q('IWM').changePct)}、DIA ${pct(q('DIA').changePct)}。</small></div><div class="card"><span>半導體壓力</span><strong><span class="dn">SMH ${pct(q('SMH').changePct)}</span></strong><small>MRVL ${pct(q('MRVL').changePct)}、SNDK ${pct(q('SNDK').changePct)}、MU ${pct(q('MU').changePct)}。</small></div><div class="card"><span>工業生產</span><strong><span class="dn">+0.2%</span></strong><small>預期 +0.3%；產能利用率 76.3%，符合預期。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>技術 ${technicalScore}/12；正式 VIX ${n(vix.close)}，五項 ${vixScore}/5。</small></div>`,
    upgrade_trigger_rule:'滿足 2/3 才把盤前賣壓定義為可買回調。',
    upgrade_trigger_1:`QQQ 收回前收 ${n(c('QQQ').close)} 與 VWAP，SMH 重返 50MA ${n(c('SMH').ma50)}。`,
    upgrade_trigger_2:'SNDK／MU、COHR／MRVL、AMAT／LRCX 三組中至少兩組收回 VWAP。',
    upgrade_trigger_3:'10Y 回落、TLT 轉漲，且工業生產 Miss 與 10:00 房屋數據未形成滯脹組合。',
    downgrade_trigger_rule:'任一觸發即進一步降低科技 beta。',
    downgrade_trigger_1:`QQQ 失守 20MA ${n(c('QQQ').ma20)}，SMH 跌破 50MA ${n(c('SMH').ma50)}。`,
    downgrade_trigger_2:'半導體負缺口未收 VWAP，且 AAPL／MSFT 也轉弱。',
    downgrade_trigger_3:'數據偏弱但 TLT 繼續下跌、USO 上升，確認期限溢價／滯脹壓力。',
    core_conclusions:`<ol><li><strong>今天不是單一晶片股利空，而是半導體擁擠交易同步反轉。</strong>SMH ${pct(q('SMH').changePct)}，MRVL ${pct(q('MRVL').changePct)}、COHR ${pct(q('COHR').changePct)}、SNDK ${pct(q('SNDK').changePct)}、MU ${pct(q('MU').changePct)}；記憶體、設備與互聯同時下跌，板塊訊號可信。</li><li><strong>長端收益率上升正在壓制高估值科技。</strong>8/17 2Y 4.19%、10Y 4.72%、20Y 5.30%，TLT 收跌 0.84%且盤前近乎不漲；弱住房開工未立即帶來長債買盤。</li><li><strong>8:30 房屋數據是“領先強、當期弱”。</strong>營建許可 1.443M 高於 1.370M 共識，但新屋開工 1.239M 低於 1.350M；不能只寫成房地產 Beat 或 Miss。</li><li><strong>9:15 工業生產略遜預期，但不是衰退衝擊。</strong>7 月工業生產 +0.2% 低於 +0.3% 共識，前值上修至 +0.3%；產能利用率 76.3% 符合共識，訊號偏向溫和降溫。</li><li><strong>進口通脹降溫，但油價仍構成反向壓力。</strong>進口價格 -0.4% 對 +0.1% 共識，USO 盤前 ${pct(q('USO').changePct)}；貿易價格利多久期、能源價格卻限制長端下行。</li><li><strong>財報分化清楚。</strong>HD 調整後 EPS／營收雙 Beat，盤前約 +2.26%；BIDU 調整後 EPS／營收雙 Miss，盤前約 -9.05%，公司事件不能與指數 beta 混寫。</li><li><strong>廣度已經從“短線降溫”進一步轉弱，但中期尚未破壞。</strong>Stockbee 5D 1.37、10D 1.72，4% 上漲／下跌 194／305；六項指數廣度仍全部高於 57%，綜合惡化 ${breadthScore}/8。</li></ol><p class="section-summary"><strong>本段結論：</strong>開盤前定位應是降低科技 beta、保留能源與防守板塊相對強弱；只有長債、SMH 與開盤廣度共同確認，才把負缺口當作買點。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：半導體高擁擠去風險；未收回 VWAP 前不抄底。',
    positioning_secondary:'次線：HD／XLE／XLP 相對抗跌，但分別屬於財報、能源與防守消費三種驱動。',
    positioning_watch:`觀察：QQQ ${n(c('QQQ').close)}／20MA ${n(c('QQQ').ma20)}、SMH 50MA ${n(c('SMH').ma50)}、10Y 4.72%、TLT ${n(c('TLT').close)}、DXY 100／102、VIX 20。`,
    positioning_invalidation:'晶片三組中至少兩組收回 VWAP、TLT 轉漲且 QQQ 收回前收，防守定位失效。',
    pre_market_movers_rows:moverRows,
    pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>半導體賣壓有高成交量確認：INTC ${volume(q('INTC').volume)}、NVDA ${volume(q('NVDA').volume)}、MU ${volume(q('MU').volume)}、SMCI ${volume(q('SMCI').volume)}、SNDK ${volume(q('SNDK').volume)}。XOS 雖為最大漲幅，但屬於小型股單一國防合同，不能外推市場風險偏好。</p>`,
    section_pre_market_movers_primary_action:'主線：優先處理半導體負缺口與 HD／BIDU 財報，不追 XOS 第一段。',
    section_pre_market_movers_condition_action:'條件：負缺口未收 VWAP才延續；財報股需結合電話會與成交量。',
    section_pre_market_movers_avoid_action:'避免：把板塊 beta 寫成公司利空，或把小型股事件外推全市場。',
    premarket_movers_invalidation:'半導體兩組以上收回 VWAP，且 QQQ／SMH 回前收，賣壓叙事降級。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High 代表先降 beta，不是機械全面做空。`,
    section_correction_checklist_condition_action:'條件：VIX 仍低於 20、主要指數守均線，允許保留核心倉。',
    section_correction_checklist_avoid_action:'避免：用低 VIX 忽略晶片同步賣壓，或用高延伸機械做空。',
    checklist_invalidation:'QQQ／SMH 失守關鍵均線，Stockbee 5D 跌破 1 且 VIX 升破 20，才升級系統性風險。',
    macro_premarket_background_table:`${macroEvents}<div class="scenario-grid"><div class="scenario-card"><strong>軟著陸修復</strong><p>工業生產僅小幅 Miss、待售房屋接近預期、10Y 回落且 TLT 轉漲：QQQ／SMH 可嘗試收負缺口。</p></div><div class="scenario-card"><strong>增長下修</strong><p>10:00 房屋數據再 Miss、IWM／XHB 走弱，但 TLT 上漲：偏久期、防守成長。</p></div><div class="scenario-card"><strong>滯脹／期限溢價</strong><p>數據偏弱、USO 上升而 TLT 不漲：繼續降低高估值科技與高延伸倉位。</p></div></div><p class="section-summary"><strong>本段結論：</strong>房屋、貿易價格與工業生產均顯示增長溫和降溫；10:00 待售房屋銷售及 TLT／10Y 反應，決定久期能否真正受益。</p>`,
    section_macro_premarket_background_primary_action:'主線：按 Actual／Forecast／Previous 拆解，並先看 10Y／TLT 再看科技。',
    section_macro_premarket_background_condition_action:'條件：數據、長債、QQQ／SMH 至少兩項同向才調整倉位。',
    section_macro_premarket_background_avoid_action:'避免：把營建許可 Beat 寫成整體房地產強，或把新屋開工 Miss 寫成必然利多久期。',
    macro_invalidation:'數據方向與長債反應背離時，以 TLT／10Y 實際價格為準。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜${thematic.length} 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>Sector 由 XLE 領跑，防守消費與醫療相對抗跌；Thematic 以 IBB／OIH／XOP／XAR 居前。完整 ${thematic.length} 檔保留，VOO 基準在表內，ticker 只顯示英文。</p>`,
    section_sector_thematic_etf_primary_action:'主線：能源與防守板塊相對強，半導體需收回 50MA 與 VWAP。',
    section_sector_thematic_etf_condition_action:'條件：SMH 與至少兩組晶片鏈同步收回 VWAP，才恢復科技主線。',
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，或忽略板塊盤前反轉。',
    sector_etf_invalidation:'XLE／XLP／XLV 轉弱，SMH／QQQ 同時收回負缺口，防守輪動失效。',
    major_etf_technical_table:`${majorTableToday}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM／DIA／SPY／QQQ；四者 8/17 收盤仍在三條均線上方，技術惡化 ${technicalScore}/12。盤前 QQQ 領跌，DIA 最抗跌，屬於明顯風格分化。</p>`,
    section_major_etf_technical_primary_action:'主線：技術結構未破，但盤前先降低 QQQ beta。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 20MA ${n(c('QQQ').ma20)}、SPY 守前收 ${n(c('SPY').close)}。`,
    section_major_etf_technical_avoid_action:'避免：用收盤均線多頭忽略盤前行業同步賣壓。',
    major_etf_invalidation:`QQQ 失守 20MA ${n(c('QQQ').ma20)}，SPY 同時跌破 20MA ${n(c('SPY').ma20)}，結構降級。`,
    fifty_ma_atr_extension_table:`${atrTableToday}<p class="section-summary"><strong>本段結論：</strong>XLE +${n(a('XLE').distance50Atr)} ATR、XSW +${n(a('XSW').distance50Atr)}、XLF +${n(a('XLF').distance50Atr)}、SPY +${n(a('SPY').distance50Atr)} 位於高延伸；TLT ${n(a('TLT').distance50Atr)} ATR 為深度負延伸。高延伸只持有不追，負延伸不自動等於抄底。</p>`,
    section_50ma_atr_extension_primary_action:'主線：高延伸板塊等回踩，TLT 需數據與價格雙確認。',
    section_50ma_atr_extension_condition_action:'條件：TLT 回升需 10Y 下行、DXY 不升且科技守關鍵位。',
    section_50ma_atr_extension_avoid_action:'避免：把 ATR 延伸機械解釋成反轉。',
    atr_extension_invalidation:'高延伸資產失守 20MA，或 TLT 反彈失敗時重新評估。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>六項 20MA／50MA 廣度仍全部高於 57%；五日有三項下降、三項改善或近乎持平。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D 2.06→1.37 下降，10D 1.56→1.72 改善；4% 上漲／下跌 194／305，單日空方占優。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1570／1016，T2108 51.25%；中期強股優勢尚未消失。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 合併為“短線廣度轉弱，中期仍守中線”；五日惡化 ${breadthScore}/8。</p>`,
    stockbee_breadth_interpretation:`<div class="callout warn"><strong>廣度結論：</strong>五日惡化 ${breadthScore}/8。Stockbee 單日已轉空方占優，但六項指數廣度與 T2108 仍在 50 上方；先降倉，不把它寫成全面崩壞。</div>`,
    section_market_breadth_primary_action:'主線：保留核心倉，但新倉必須等開盤上漲家數與價格共同確認。',
    section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不跌破 50%。',
    section_market_breadth_avoid_action:'避免：只用 Stockbee 或單一指數下結論。',
    breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，廣度防守失效。',
    fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 日線截至 8/14 為 ${n(dxy.close)}、5日 ${pct(dxy.fiveDayPct)}、1月 ${pct(dxy.oneMonthPct)}、RSI ${n(dxy.rsi14)}，低於 20／50MA但高於 200MA；USDU 8/17 日線同樣中短線偏弱。USO 盤前上漲、金銀銅回吐，商品組合偏向能源通脹而非全面風險偏好。</p>`,
    section_fx_commodities_primary_action:'主線：DXY 以正式日線與 USDU 交叉驗證，商品重點看 USO 是否繼續抬升。',
    section_fx_commodities_condition_action:'條件：DXY 低於 100、USO 降溫且 TLT 轉漲，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY。',
    forex_commodity_invalidation:'DXY 升破 100／102、USO 加速且 TLT 轉弱，金融條件壓力升級。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.19%</strong><small>財政部 8/17</small></div><div><span>美國 10Y</span><strong>4.72%</strong><small>2s10s +53bp</small></div><div><span>美國 20Y</span><strong>5.30%</strong><small>長端延伸約 +5.8 ATR</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>2Y 4.19%、10Y 4.72%、20Y 5.30%，期限越長收益率越高；SHY 仍穩，IEF／TLT 低於三條均線。住房開工 Miss 後 TLT 盤前仍近乎持平，說明當前壓制更像長端供給與期限溢價，而非單純政策利率上調。</div>`,
    section_treasury_fed_primary_action:'主線：先比較 TLT 相對 SHY／IEF，再決定長久期科技倉位。',
    section_treasury_fed_condition_action:'條件：TLT 領先中短債、10Y 回落、QQQ／SMH 收負缺口，三項至少兩項成立。',
    section_treasury_fed_avoid_action:'避免：把房屋單項 Miss 直接等同長端趨勢反轉。',
    treasury_invalidation:'數據偏弱但 TLT 繼續走低，暫緩久期交易。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 已更新至 8/17–8/21；DIS／MCD／MSFT／NKE 已跌破 -1SD，META／NFLX／NOW／AXP／BA／HON／V／XLF／XLP／XRT 接近 -1SD，CAT 接近 +1SD。只顯示觸發或接近門檻者。</p>`,
    intraday_playbook_rows:[
      ['09:15 ET','工業生產 +0.2% 對 +0.3%','溫和 Miss／利率驗證','先看 10Y／TLT 是否上漲，再看 QQQ／SMH。'],
      ['09:30 ORB','QQQ 20MA 與 SMH 50MA','科技防守','未收 VWAP 前不抄晶片負缺口。'],
      ['09:30 ORB','SNDK／MU、COHR／MRVL、AMAT／LRCX','三組晶片鏈','至少兩組收 VWAP才取消板塊賣壓。'],
      ['10:00 ET','待售房屋銷售 Actual 對 +0.3%','住房第二驗證','比較 IWM／XHB／HD 與 10Y 的同向反應。'],
      ['首小時','HD／BIDU','財報確認','HD 守 VWAP、BIDU 未收 VWAP才延續雙 Beat／雙 Miss。'],
      ['全日','TLT／USO／DXY','滯脹監控','數據弱但 TLT 不漲、USO 上升即繼續降科技 beta。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用，主快照約 ${quoteTime} ET。HD／BIDU／XOS 另以 09:04 ET 長橋報價補齊。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic ${thematic.length} 檔使用 8/17 Google Sheet，RSI 降序；VOO 基準在表內，ticker 與來源逐列一致。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/17 收盤值，五日端點統一為 8/10→8/17；綜合分數 ${breadthScore}/8。</div><div class="callout"><strong>Expected Move QA：</strong>來源已更新為 8/17–8/21；只列觸發或接近 ±1SD 標的。</div><div class="callout"><strong>宏觀／財報 QA：</strong>營建許可、新屋開工、進口價格、工業生產、產能利用率、HD、BIDU 均保留 Actual／Forecast／Previous；10:00 未公布項目明確標記待公布。</div><div class="callout warn"><strong>DXY QA：</strong>公共 DXY 日線截至 ${dxy.asOf}，晚於該日的即時值不冒充正式收盤；以 8/17 USDU 技術值交叉驗證。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX，五項公式未變。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://www.census.gov/construction/nrc/current/index.html">美國人口普查局新屋開工／營建許可</a>；<a href="https://www.bls.gov/news.release/ximpim.nr0.htm">BLS 進口與出口價格</a>；<a href="https://www.federalreserve.gov/releases/g17/current/">聯儲工業生產</a>；<a href="https://ir.homedepot.com/news-releases/2026/08-18-2026-110040463">Home Depot 官方財報</a>；<a href="https://ir.baidu.com/static-files/e57ce78e-e47a-4c0c-8797-3cb11c8c9b0a">Baidu 官方財報</a>；<a href="https://longbridge.com/en/news/296225859.md">長橋盤前市場快訊</a>；<a href="https://longbridge.com/en/news/296225252.md">Marvell 盤前背景</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部收益率</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY</a>。</p><p class="source-note">數據截至 2026-08-18 約 ${quoteTime} ET；盤前價格會變動。DXY 正式日線截至 ${dxy.asOf}，Google Sheet 與技術數據截至 8/17。本報告為本地草稿，不構成投資建議。</p>`,
    sector_momentum_chart:chartRows
  };
}

module.exports = {moverMeta,build};
