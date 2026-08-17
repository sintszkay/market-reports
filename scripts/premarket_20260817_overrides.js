'use strict';

const previous = require('./premarket_20260813_overrides');

const moverMeta = Object.fromEntries([
  'COHR','RKLB','PANW','ASTS','CRWD','APP','LLY','TTD','CRM','DDOG','CVNA','NVO','SMCI','NOW','RBLX','ADBE'
].map(ticker => [ticker, ['盤前報價已由長橋更新。','最終異動表由 8/17 規則重建。','以 VWAP 與板塊共振確認。']]));

function build(ctx) {
  const base = previous.build(ctx);
  const {
    snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    requireRow,requirePre,sheetTech,sectors,thematic,techTable,vix,vixScore,technicalScore,majorTable,atrTable
  } = ctx;
  const breadthScore = 2;
  const checklistHigh = 1;
  const q = ticker => requirePre(ticker);
  const c = ticker => requireRow(ticker);
  const a = ticker => adjusted[ticker] || c(ticker);
  const quoteTime = new Date(quoteSnapshot.generatedAt).toLocaleTimeString('en-US', {
    timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false
  });
  const maState = row => `<span class="ma-state-group"><span class="ma-state ${row.above20 ? 'ma-up' : 'ma-down'}">20<span class="ma-arrow">${row.above20 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above50 ? 'ma-up' : 'ma-down'}">50<span class="ma-arrow">${row.above50 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above200 ? 'ma-up' : 'ma-down'}">200<span class="ma-arrow">${row.above200 ? '▲' : '▼'}</span></span></span>`;

  const moverSignal = {
    ALAB:'Amazon 披露持有 277,777 股，疊加 AI 互聯需求，盤前成為硬體領漲。',
    SNDK:'AI 快閃與記憶體緊缺敘事延續；最新報道強調長期客戶協議與回購。',
    MU:'記憶體板塊隔夜續強，和 SNDK 同步而非單名跳價。',
    COHR:'光通訊隔夜走強，分析師上調目標價；公司財報後仍屬高預期交易。',
    MRVL:'光通訊／AI 互聯共振，跟隨 COHR 與半導體鏈上行。',
    ARM:'AI 運算 beta 跟隨 Nasdaq 期貨修復，未見新的公司級結果。',
    UBER:'高 beta 平臺股修復，缺少足以解釋全部漲幅的新催化。',
    INTC:'芯片鏈廣泛反彈且成交量突出，主線仍是板塊資金迴流。',
    TTD:'弱財報與偏軟指引的估值消化繼續，廣告科技仍是軟體弱項。',
    SHOP:'延續上週弱勢，未檢索到新的公司級催化。',
    SNOW:'Jefferies 上調目標價但股價仍跌，正面研究未獲價格確認。',
    NVO:'醫療權重偏弱，未見足以解釋盤前跌幅的新公司事件。',
    NOW:'大型軟體落後硬體，屬於風格分化而非獨立事件。',
    ADBE:'權重軟體隨 XSW 個股分化回落，尚非全面軟體破位。',
    MSFT:'大型科技內部輪動，資金更集中記憶體與硬體。',
    SMCI:'高成交量但略跌，AI 伺服器未跟隨記憶體鏈同步上行。'
  };
  const moverTransmission = {
    ALAB:'與 MRVL／COHR 同向，AI 互聯鏈確認。', SNDK:'與 MU 同向、成交量高，記憶體共振成立。', MU:'SNDK 同步且 SMH 轉強，板塊信號可靠。', COHR:'MRVL 同向，光通訊擴散。', MRVL:'COHR／ALAB 同向，硬體內部擴散。', ARM:'跟隨 QQQ／SMH，信號次於記憶體。', UBER:'個股 beta，不外推 XLY。', INTC:'和 SNDK／MU 同向，但自身敘事不同。',
    TTD:'與大型軟體弱勢同向，廣告科技壓力更深。', SHOP:'不外推整體消費，XLY 需獨立確認。', SNOW:'研究利多不漲，說明軟體承接有限。', NVO:'XLV 仍偏強，按個股相對弱勢處理。', NOW:'與 ADBE／MSFT 同弱，軟體落後硬體。', ADBE:'權重軟體分化，觀察 XSW。', MSFT:'QQQ 上漲但 MSFT 下跌，集中度升高。', SMCI:'和記憶體反向，AI 硬體並非全面同步。'
  };
  const moverJudgment = {
    ALAB:'正缺口守 VWAP 才延續。', SNDK:'高波動標的，不追第一段；守 VWAP 才保留趨勢。', MU:'守 VWAP 且 SNDK 不轉弱。', COHR:'財報後高預期，回踩不破 VWAP 才加。', MRVL:'與 COHR 同守 VWAP 才升級。', ARM:'只作 QQQ／SMH 確認。', UBER:'量價確認前只觀察。', INTC:'高成交量優先，但失守 VWAP 即降級。',
    TTD:'未收回 VWAP 前不抄底。', SHOP:'收回前收與 VWAP 才取消弱勢。', SNOW:'目標價上調不能替代價格確認。', NVO:'若 XLV 強而 NVO 弱，維持相對弱勢。', NOW:'軟體 ETF 不轉強則不搶反彈。', ADBE:'與 XSW 同步收回 VWAP 才改善。', MSFT:'不得用 QQQ 上漲掩蓋個股落後。', SMCI:'成交量高，跌破 VWAP 會削弱硬體廣度。'
  };
  const moverTickers = ['ALAB','SNDK','MU','COHR','MRVL','ARM','UBER','INTC','TTD','SHOP','SNOW','NVO','NOW','ADBE','MSFT','SMCI'];
  const moverRows = moverTickers.map(ticker => {
    const row = q(ticker);
    return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${moverSignal[ticker]}<small>${volume(row.volume)}</small></td><td>${moverTransmission[ticker]}</td><td>${moverJudgment[ticker]}</td></tr>`;
  }).join('');

  const checklist = [
    ['S&amp;P 500 overextension／大盤過度延伸','High',`SPY +${n(a('SPY').distance50Atr)} ATR；XLF +${n(a('XLF').distance50Atr)} ATR`,'價格結構仍強，但新倉追價回報下降。','high'],
    ['Increasing downward momentum／下行動能增加','Low',`QQQ ${pct(q('QQQ').changePct)}；SMH ${pct(q('SMH').changePct)}`,'科技與半導體盤前轉強，未見指數下行擴散。','low'],
    ['Top range breakdown／高位區間破位','Low','四大 ETF 全部高於 20／50／200MA','8/14 收盤沒有大型指數高位破位。','low'],
    ['Technical deterioration／技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 的 20MA、50MA、200MA、RSI<50 全未觸發。','low'],
    ['Market breadth worsening／市場廣度惡化','Intermediate',`五日惡化 ${breadthScore}/8`,'NDX >20MA 與 Stockbee 5D 下降，其餘六項改善。','mid'],
    ['VIX >20／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'>20、5日>0、1月>0、20MA、50MA 五項均未觸發。','low'],
    ['Breakout win rate down／突破勝率下降','Low','Stockbee 5D 1.55；10D 2.16','5D 降溫但兩項都高於 1，季度強股仍明顯佔優。','low'],
    ['Theme momentum weakening／主題動能轉弱','Intermediate',`SMH 仍低於 50MA ${n(c('SMH').ma50)}`,'記憶體強、伺服器與軟體分化，板塊共振尚不完整。','mid']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1],row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High。</strong>大盤不是全面危險，但高延伸與硬體內部集中度要求降低追價。</div>`;

  const eventCell = (name,time) => td(`<span class="macro-event"><strong>${name}</strong><small>${time}</small></span>`);
  const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','信號'],[
    [eventCell('美國零售銷售 MoM','7月｜8/14 已公布'),numTd('-0.6%'),numTd('+0.1%'),numTd('+0.2%'),td(badge('Miss','red'))],
    [eventCell('密歇根消費者信心初值','8月｜8/14 已公布'),numTd('51.0'),numTd('54.5'),numTd('55.2'),td(badge('Miss','red'))],
    [eventCell('Empire State 製造業指數','8月｜08:30 ET'),numTd('待公布'),numTd('10.6'),numTd('15.6'),td(badge('待公布','blue'))],
    [eventCell('NAHB 房市指數','8月｜10:00 ET'),numTd('待公布'),numTd('34'),numTd('34'),td(badge('待公布','blue'))],
    [eventCell('Fabrinet（FN）FY26 Q4','盤後｜17:00 ET 電話會'),numTd('待公布'),numTd('EPS 3.81<br>營收 1.28B'),numTd('上季 EPS 3.72<br>營收 1.214B'),td(badge('事件風險','amber'))]
  ],'report-data-table macro-results-table',[1,2,3]);

  const priorRows = [
    ['PPI 降溫後先看長債與科技是否同向確認。','8/13 TLT +0.58%、QQQ +1.16%，跨資產確認成立。',badge('命中','green'),'保留「數據→長債→科技」驗證順序。'],
    ['記憶體／AI 硬體是主要修復線。','8/13 SNDK +13.7%、MU +4.2%、SMH +0.73%。',badge('命中','green'),'今天再次領漲，但提高 VWAP 與成交量門檻。'],
    ['廣度應在通脹利多後重新擴散。','8/13 六項指數廣度五項上升、一項持平；Stockbee 5D 1.59→1.83。',badge('命中','green'),'8/14 僅短線降溫，不改寫中期結論。'],
    ['SPY 高延伸，不追第一段。','8/13 SPY +0.70% 創新高，8/14 隨弱消費數據回吐 -0.20%。',badge('已觸發','amber'),'高延伸不是做空信號，但入場必須等回踩。'],
    ['軟體／網安相對強於伺服器鏈。','8/13 XSW +4.42%、CIBR +1.80%，但當日記憶體漲幅更大。',badge('偏保守','gray'),'繼續拆開驗證，同時承認記憶體才是更強主線。']
  ];
  const priorReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/13）</h2>${table(['8/13 盤前主判斷','收盤事實','對賬','今日修正'],priorRows.map(row => row.map(value => td(value))),'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：3 命中、1 已觸發、1 偏保守。</strong>PPI、長債與科技的順序有效；高延伸風險在次日消費數據 Miss 後體現，軟體相對強勢判斷則低估了記憶體漲幅。</div><p class="section-summary"><strong>本段結論：</strong>保留跨資產與板塊共振框架；記憶體繼續領漲時，額外要求 SMH 收復 50MA、SMCI 不再落後。</p></section>`;

  const breadthRows = [
    ['SPX >20MA','66.20%','-2.58pp','65.20%→66.20%','單日降溫，五日仍改善。'],
    ['SPX >50MA','69.38%','+1.19pp','65.60%→69.38%','中期參與度擴張。'],
    ['NDX >20MA','69.60%','+0.98pp','70.58%→69.60%','五日唯一指數端降溫項。'],
    ['NDX >50MA','64.70%','+1.96pp','52.94%→64.70%','科技中期緩衝明顯增強。'],
    ['IWM >20MA','66.32%','-0.05pp','63.83%→66.32%','短線穩定。'],
    ['IWM >50MA','63.76%','+1.08pp','62.96%→63.76%','小型股中期未壞。'],
    ['Stockbee 5D ratio','1.55','-0.28','2.85→1.55','明顯降溫但仍高於 1。'],
    ['Stockbee 10D ratio','2.16','+0.11','1.64→2.16','中期延續率加速。'],
    ['4%+ 上漲／下跌','234／147','由 345／167 收窄','510／152→234／147','多方仍佔優，追價效率下降。'],
    ['T2108','54.54%','-0.48pp','53.58%→54.54%','保持中性偏多。']
  ];
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'],breadthRows.map(row => row.map((value,index) => td(value,index === 1 ? 'num' : ''))),'report-data-table breadth-diagnostic-table',[1]);

  const dxy = {ticker:'DXY',close:99.492,dailyPct:-0.1786,fiveDayPct:-0.3186,oneMonthPct:-1.2486,rsi14:36.74,above20:false,above50:false,above200:true};
  const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
  const fxTickers = ['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'];
  const fxMeaning = row => {
    const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '均線中短線偏強' : !row.above20 && !row.above50 ? '均線中短線偏弱' : '均線趨勢混合';
    const momentum = row.rsi14 >= 70 ? '過熱' : row.rsi14 >= 55 ? '偏強' : row.rsi14 <= 45 ? '偏弱' : '中性';
    return `${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
  };
  const fxRows = [dxy,...fxTickers.map(ticker => a(ticker))].map(row => {
    const quote = row.ticker === 'DXY' ? null : pre[row.ticker];
    const live = row.ticker === 'DXY' ? pct(row.dailyPct) : quote?.premarketAvailable && quote.volume >= 100 ? pct(quote.changePct) : '—';
    const liveValue = row.ticker === 'DXY' ? row.dailyPct : quote?.premarketAvailable && quote.volume >= 100 ? quote.changePct : null;
    return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker === 'DXY' ? '美元指數' : fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct),row.dailyPct),numTd(pct(row.fiveDayPct),row.fiveDayPct),numTd(pct(row.oneMonthPct),row.oneMonthPct),numTd(live,liveValue),numTd(n(row.rsi14)),td(fxMeaning(row))];
  });
  const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong class="dn">${n(dxy.close)}</strong><small>RSI ${n(dxy.rsi14)}／低於 20、50MA</small></div><div><span>工業金屬</span><strong class="up">CPER ${pct(q('CPER').changePct)}</strong><small>三線多頭</small></div><div><span>長債</span><strong class="dn">TLT ${pct(q('TLT').changePct)}</strong><small>三線空頭</small></div></div>${table(['資產','8/14收盤','1日','5日','1月','8/17盤前','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table fx-trend-table-8',[1,2,3,4,5,6])}`;

  const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const bondRows = ['SHY','IEF','TLT'].map(ticker => {
    const row = c(ticker);
    const quote = q(ticker);
    const signal = ticker === 'SHY' ? '高於 20／50MA、低於 200MA；短端較穩。' : ticker === 'IEF' ? '低於三條均線；中段未確認增長利多。' : '低於三條均線且負延伸約 -3.16 ATR；期限溢價仍是科技風險。';
    return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct),quote.changePct),numTd(n(row.rsi14)),td(signal)];
  });
  const bondTable = table(['ETF','盤前','變化','RSI','含義'],bondRows,'report-data-table bond-curve-table',[1,2,3]);

  const tradeActions = {
    IWM:`守前收 ${n(c('IWM').close)}；若 NAHB Miss 且跌破 VWAP，降低小型股 beta。`,
    DIA:`守前收 ${n(c('DIA').close)}；盤前落後 QQQ，按風格輪動處理。`,
    SPY:`距 50MA +${n(a('SPY').distance50Atr)} ATR；守 ${n(c('SPY').close)}，只持有不追第一段。`,
    QQQ:`盤前領漲；守前收 ${n(c('QQQ').close)} 與 VWAP 才延續。`,
    SMH:`盤前已越過 50MA ${n(c('SMH').ma50)}；收盤與 SNDK／MU 共振才升級。`,
    CIBR:`高延伸 +${n(a('CIBR').distance50Atr)} ATR；守 VWAP，不追第一段。`,
    USO:`五日 +${n(c('USO').fiveDayPct)}%；油價再升會削弱弱消費數據的久期利多。`,
    TLT:`負延伸 ${n(a('TLT').distance50Atr)} ATR；數據偏弱仍不漲，說明期限溢價主導。`
  };
  const tradeRowsToday = Object.keys(tradeActions).map(ticker => {
    const row = c(ticker);
    const quote = q(ticker);
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(tradeActions[ticker])];
  });
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'],tradeRowsToday,'report-data-table trading-plan-table',[1,2,3]);

  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">',`<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);

  return {
    ...base,
    report_title:'2026-08-17｜美股盤前監控',
    report_eyebrow:'2026-08-17｜盤前更新',
    report_heading:'記憶體與 AI 互聯領漲，但長債不確認：弱消費之後先看 Empire State 與 NAHB',
    report_subtitle:'8/14 收盤技術、8/17 長橋盤前、市場廣度、宏觀 Actual／Forecast 與上次盤前複盤交叉驗證',
    data_timestamp_note:`長橋盤前快照約截至 ${quoteTime} ET；Google Sheets 的 Sector Dashboard、Thematic Sectors、Macro、市場廣度與 Stockbee 截至 8/14。Weekly Expected Move 仍停留在 8/10–8/14，已停用舊週線。`,
    risk_badge:`記憶體集中領漲／高延伸｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">QQQ ${pct(q('QQQ').changePct)}</span></strong><small>SPY ${pct(q('SPY').changePct)}；IWM <span class="dn">${pct(q('IWM').changePct)}</span>、DIA <span class="dn">${pct(q('DIA').changePct)}</span>。</small></div><div class="card"><span>記憶體主線</span><strong><span class="up">SNDK ${pct(q('SNDK').changePct)}</span></strong><small>MU ${pct(q('MU').changePct)}、INTC ${pct(q('INTC').changePct)}。</small></div><div class="card"><span>宏觀驗證</span><strong>08:30 ET</strong><small>Empire State 10.6／15.6；10:00 NAHB 34／34。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>技術 ${technicalScore}/12；正式 VIX ${n(vix.close)}，五項 ${vixScore}/5。</small></div>`,
    upgrade_trigger_rule:'滿足 2/3 才把記憶體反彈升級為全面科技 risk-on。',
    upgrade_trigger_1:`QQQ 守前收 ${n(c('QQQ').close)} 與 VWAP，SMH 收盤站上 50MA ${n(c('SMH').ma50)}。`,
    upgrade_trigger_2:'SNDK／MU／INTC 至少兩檔守 VWAP，且 SMCI 不再擴大跌幅。',
    upgrade_trigger_3:'Empire State／NAHB 不形成增長雙 Miss，TLT 守 VWAP、10Y 不繼續上衝。',
    downgrade_trigger_rule:'任一觸發即降低科技 beta 與追價倉位。',
    downgrade_trigger_1:`QQQ 跌回 ${n(c('QQQ').close)} 與 VWAP 下方，SMH 同時失守 ${n(c('SMH').close)}。`,
    downgrade_trigger_2:'記憶體三強兩檔失守 VWAP，SMCI／MSFT／軟體弱勢繼續擴大。',
    downgrade_trigger_3:'數據顯著 Miss 但 TLT 仍跌、DXY 或油價上升，確認滯脹／期限溢價交易。',
    core_conclusions:`<ol><li><strong>盤前上漲集中在 Nasdaq 與記憶體，不是全面指數同步。</strong>QQQ ${pct(q('QQQ').changePct)}、SMH ${pct(q('SMH').changePct)}，而 DIA ${pct(q('DIA').changePct)}、IWM ${pct(q('IWM').changePct)}；先定義為風格輪動。</li><li><strong>SNDK／MU／ALAB 是今天最清楚的量價主線。</strong>SNDK ${pct(q('SNDK').changePct)}、MU ${pct(q('MU').changePct)}、ALAB ${pct(q('ALAB').changePct)}；SNDK 與 MU 有記憶體緊缺共振，ALAB 另有 Amazon 持股披露，不能把三者都寫成同一催化。</li><li><strong>AI 硬體內部仍不完整。</strong>COHR／MRVL 上漲，但 SMCI ${pct(q('SMCI').changePct)}、MSFT ${pct(q('MSFT').changePct)}；SMH 盤前越過 50MA 後，仍要等收盤與伺服器鏈確認。</li><li><strong>8/14 消費數據是明確雙 Miss。</strong>零售銷售 -0.6% 對 +0.1% 共識，密歇根信心 51.0 對 54.5；今日 Empire State 與 NAHB 將判斷是消費單點疲弱，還是增長降溫擴散。</li><li><strong>債市沒有給出乾淨寬鬆確認。</strong>8/14 官方 2Y 4.17%、10Y 4.68%，2s10s +51bp；TLT 盤前 ${pct(q('TLT').changePct)} 且低於三條均線。數據弱而長債不漲，代表供給／期限溢價仍壓制長久期資產。</li><li><strong>市場內部是短線降溫、中期仍強。</strong>六項指數廣度全高於 63%，Stockbee 5D 1.55、10D 2.16；五日惡化 ${breadthScore}/8，不支持把今天的集中領漲直接寫成全面風險惡化。</li></ol><p class="section-summary"><strong>本段結論：</strong>今天可交易的是記憶體與 AI 互聯，但總 beta 只有在 SMH 收復 50MA、長債不再背離、開盤廣度不收窄時才提高。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：SNDK／MU／ALAB／COHR 的記憶體與 AI 互聯；正缺口必須守 VWAP。',
    positioning_secondary:'次線：CPER／SLV 與 QQQ 同向上行，但商品強也可能抬高長端通脹溢價。',
    positioning_watch:`觀察：QQQ ${n(c('QQQ').close)}、SMH 50MA ${n(c('SMH').ma50)}、TLT ${n(c('TLT').close)}、DXY 100／102、Stockbee 5D 1、VIX 20。`,
    positioning_invalidation:'記憶體三強失守 VWAP、SMH 失守前收，且數據弱卻 TLT 繼續下跌，今日科技主線失效。',
    pre_market_movers_rows:moverRows,
    pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>成交量最具辨識度的是 INTC ${volume(q('INTC').volume)}、SMCI ${volume(q('SMCI').volume)}、TTD ${volume(q('TTD').volume)}、MU ${volume(q('MU').volume)}、SNDK ${volume(q('SNDK').volume)}。漲幅與新聞、成交量、同業共振至少滿足兩項才列為主線。</p>`,
    section_pre_market_movers_primary_action:'主線：優先 SNDK／MU／ALAB／COHR；負向看 TTD 與未跟隨的 SMCI。',
    section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口收不回 VWAP，且 SMH 維持 50MA 上方。',
    section_pre_market_movers_avoid_action:'避免：把板塊 beta、目標價新聞或薄量報價寫成新財報結果。',
    premarket_movers_invalidation:'SNDK／MU／ALAB 兩檔失守 VWAP，或 SMCI 下跌擴大且 SMH 跌破前收，主線降級。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High 代表高延伸，不代表全面轉空。`,
    section_correction_checklist_condition_action:'條件：VIX 維持 20 下方、廣度不跌破中線、QQQ／SMH 守關鍵位。',
    section_correction_checklist_avoid_action:'避免：用低 VIX 忽略集中度，或用高延伸機械做空。',
    checklist_invalidation:'SPY／QQQ 失守 50MA、Stockbee 5D 跌破 1 且 VIX 升破 20，才升級系統性風險。',
    macro_premarket_background_table:`${macroEvents}<div class="scenario-grid"><div class="scenario-card"><strong>增長韌性</strong><p>Empire ≥10.6、NAHB ≥34，且 10Y 不升：支持 IWM／工業與科技同時擴散。</p></div><div class="scenario-card"><strong>溫和降溫</strong><p>單項小幅 Miss、TLT 守 VWAP：有利 QQQ／SMH，但仍是久期選擇而非全面 risk-on。</p></div><div class="scenario-card"><strong>滯脹背離</strong><p>數據 Miss、TLT 仍跌且 USO／DXY 上升：降低長久期與高延伸倉位。</p></div></div><p class="section-summary"><strong>本段結論：</strong>8/14 已公布數據與 8/17 待公布數據分開列示；FN 盤後 Actual 尚未公布，不預寫 Beat／Miss。</p>`,
    section_macro_premarket_background_primary_action:'主線：先看 08:30 數據後 TLT／DXY，再看 QQQ／SMH 與開盤廣度。',
    section_macro_premarket_background_condition_action:'條件：數據、長債、科技價格三者至少兩項同向才加倉。',
    section_macro_premarket_background_avoid_action:'避免：只看 Empire 標題或第一分鐘期貨反應。',
    macro_invalidation:'數據方向與 TLT／DXY 反應背離時，以跨資產價格為準。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜${thematic.length} 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>Sector 由 XLE／XLF／SPY 居前；Thematic 由 XMAG／XAR／XSW／IHI／OIH 居前。完整 ${thematic.length} 檔保留，VOO 基準在表內，ticker 只顯示英文。</p>`,
    section_sector_thematic_etf_primary_action:'主線：記憶體領漲需 SMH 收復 50MA；軟體／網安高 RSI 只在守 VWAP 時延續。',
    section_sector_thematic_etf_condition_action:'條件：SMH 與至少三檔記憶體／互聯股同守 VWAP，才確認硬體擴散。',
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，或忽略高延伸。',
    sector_etf_invalidation:'SMH 失守前收，XSW／CIBR 同步跌破 VWAP，主題修復降級。',
    major_etf_technical_table:`${majorTable.replace('盤前略高於前收 305.09','盤前略低於前收 305.09')}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM／DIA／SPY／QQQ；四者全在三條均線上方，技術惡化 ${technicalScore}/12。盤前 QQQ 領先、DIA／IWM 略跌，暫定為科技風格輪動。</p>`,
    section_major_etf_technical_primary_action:'主線：維持多頭結構，但 SPY 高延伸下不追第一段。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 ${n(c('QQQ').close)}、SPY 守 ${n(c('SPY').close)}，且開盤廣度不明顯收窄。`,
    section_major_etf_technical_avoid_action:'避免：用 QQQ 盤前上漲推導四大指數全天同步。',
    major_etf_invalidation:`QQQ 失守 50MA ${n(c('QQQ').ma50)}，SPY 同時失守 20MA ${n(c('SPY').ma20)}，結構降級。`,
    fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XLF +${n(a('XLF').distance50Atr)} ATR、XSW +${n(a('XSW').distance50Atr)}、XLE +${n(a('XLE').distance50Atr)}、SPY +${n(a('SPY').distance50Atr)} 位於高延伸；TLT ${n(a('TLT').distance50Atr)} ATR 為負延伸。高延伸只持有不追，負延伸不等於自動抄底。</p>`,
    section_50ma_atr_extension_primary_action:'主線：高延伸資產等回踩，TLT 需數據與 VWAP 雙確認。',
    section_50ma_atr_extension_condition_action:'條件：TLT 回升需 10Y 降溫、DXY 不升、QQQ 守缺口。',
    section_50ma_atr_extension_avoid_action:'避免：把 ATR 延伸機械解釋成反轉。',
    atr_extension_invalidation:'高延伸資產失守 20MA，或 TLT 反彈失敗時重新評估。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>六項 20MA／50MA 廣度全部高於 63%；五日僅 NDX >20MA 小幅下降，其餘五項改善。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D 2.85→1.55 明顯降溫，但 10D 1.64→2.16 加速；4% 上漲／下跌 234／147，多方仍佔優。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1648／991，T2108 54.54%；中期強股優勢沒有被短線降溫破壞。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 合併為「短線追價效率下降，中期擴散仍強」；五日惡化 ${breadthScore}/8。</p>`,
    stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>五日惡化 ${breadthScore}/8。六項指數廣度全高於 63%、5D／10D 都高於 1；不能只用 5D 降溫判定全面轉空。</div>`,
    section_market_breadth_primary_action:'主線：保留核心倉，但新倉需要開盤上漲家數與價格共同確認。',
    section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不跌破 50%。',
    section_market_breadth_avoid_action:'避免：只用 Stockbee 或單一指數下結論。',
    breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，廣度防守失效。',
    fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY ${n(dxy.close)}、5日 ${pct(dxy.fiveDayPct)}、1月 ${pct(dxy.oneMonthPct)}、RSI ${n(dxy.rsi14)}，低於 20／50MA但仍高於 200MA；美元偏弱但未超賣。CPER／SLV 盤前強，USO 五日仍高，商品強勢會限制長債利多。</p>`,
    section_fx_commodities_primary_action:'主線：同看 DXY 趨勢／RSI、TLT、USO 與工業金屬，不用單一代理下結論。',
    section_fx_commodities_condition_action:'條件：DXY 低於 100、TLT 守 VWAP 且 USO 不加速，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY。',
    forex_commodity_invalidation:'DXY 升破 100／102、USO 加速且 TLT 轉弱，金融條件改善假設失效。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.17%</strong><small>財政部 8/14</small></div><div><span>美國 10Y</span><strong>4.68%</strong><small>2s10s +51bp</small></div><div><span>美國 20Y</span><strong>5.25%</strong><small>長端溢價仍高</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>2Y 4.17%、10Y 4.68%、20Y 5.25%，曲線長端明顯更高。SHY 結構較穩，IEF／TLT 低於三條均線；弱消費數據並未讓久期趨勢翻多，今日數據若再弱而 TLT 不漲，應優先解釋為期限溢價而非增長利多。</div>`,
    section_treasury_fed_primary_action:'主線：先比較 TLT 相對 SHY／IEF，再決定長久期科技倉位。',
    section_treasury_fed_condition_action:'條件：TLT 領先中短債、DXY 回落、QQQ／SMH 守缺口，三項至少兩項成立。',
    section_treasury_fed_avoid_action:'避免：把一次製造業 Miss 直接等同長端趨勢反轉。',
    treasury_invalidation:'數據偏弱但 TLT 繼續走低，暫緩久期交易。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3><div class="callout warn"><strong>停用舊週線：</strong>Google Sheet 仍是 8/10–8/14 Weekly Expected Move，未更新至 8/17–8/21；本報告不沿用過期的 ±1SD 門檻。</div><p class="section-summary"><strong>本段結論：</strong>今天只使用 8/14 前收、20MA、50MA、VWAP 與即時板塊共振；本週區間更新後再恢復觸發判斷。</p>`,
    intraday_playbook_rows:[
      ['08:30 ET','Empire State Actual vs 10.6','增長第一驗證','先看 TLT／DXY，再看 QQQ／SMH；不追第一分鐘。'],
      ['09:30 ORB','SNDK／MU／ALAB VWAP','記憶體主線','至少兩檔守 VWAP，SMCI 不擴大跌幅才加碼。'],
      ['10:00 ET','NAHB Actual vs 34','房市／小盤驗證','若 Miss 且 IWM 失守 VWAP，降低景氣 beta。'],
      ['首小時','SMH 50MA 591.49','硬體升級','收盤與盤中都站穩，才把集中反彈升級。'],
      ['全日','TLT／USO／DXY','跨資產確認','數據弱但 TLT 不漲，按期限溢價風險處理。'],
      ['15:30 MOC','FN 盤後財報','光通訊事件','不把 COHR／MRVL 盤前強勢預寫成 FN Beat。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用，四大 ETF 與異動使用同一 ${quoteTime} ET 快照。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic ${thematic.length} 檔使用 8/14 Google Sheet，RSI 降序；VOO 基準在表內，ticker 與來源逐列一致。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/14 收盤值，五日端點統一為 8/7→8/14；綜合分數 ${breadthScore}/8。</div><div class="callout warn"><strong>Expected Move QA：</strong>來源仍是 8/10–8/14，已過期並停用，不作為本週交易門檻。</div><div class="callout"><strong>宏觀／財報 QA：</strong>8/14 零售銷售與密歇根信心保留 Actual／Forecast／Previous；今日 Empire、NAHB 與 FN 尚未公布，不預寫 Beat／Miss。</div><div class="callout"><strong>DXY QA：</strong>Yahoo DX-Y.NYB 日線截至 8/17 為 ${n(dxy.close)}，Wilder RSI14 ${n(dxy.rsi14)}；週末空值已排除。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX，五項公式未變。</div><h3>數據來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://apnews.com/article/3e2bc5807d7396b8e6c5f599941cb2a9">AP 零售銷售</a>；<a href="https://www.newyorkfed.org/research/calendars/i-aug26.html">紐約聯儲經濟日曆</a>；<a href="https://www.nahb.org/news-and-economics/housing-economics/indices/housing-market-index">NAHB HMI</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部收益率</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY</a>；<a href="https://investor.fabrinet.com/press-releases">Fabrinet 投資者關係</a>；<a href="https://longbridge.com/news/296094967">SNDK 最新新聞</a>；<a href="https://longbridge.com/news/296067907">ALAB 持股新聞</a>。</p><p class="source-note">數據截至 2026-08-17 約 ${quoteTime} ET；盤前價格會變動。宏觀 Actual 尚未公布的項目明確標記待公布。本報告為本地草稿，不構成投資建議。</p>`
  };
}

module.exports = {moverMeta,build};
