'use strict';

const fs = require('fs');
const path = require('path');
const previous = require('./premarket_20260812_overrides');

const moverMeta = {
  COHR:['Q4 非 GAAP EPS 1.74、營收 20.5 億美元，兩項均高於共識。','Beat／Beat 後轉跌，屬高預期與獲利回吐，不是財報數字差。','未收回財報後 VWAP 前不把 Beat 等同買點。'],
  RKLB:['高 beta 太空股延續財報後消化。','盤前成交量足夠，但缺少同業同步承接。','收回 VWAP 才降低缺口風險。'],
  PANW:['網安板塊相對強勢延續。','與 CRWD、CIBR 同向，板塊共振成立。','正缺口守 VWAP 才延續。'],
  ASTS:['高 beta 太空／衛星股盤前承壓。','與 RKLB、LUNR 同向，屬板塊風險而非單名雜訊。','未收回 VWAP 前不抄底。'],
  CRWD:['網安同業跟隨 PANW 上行。','CIBR RSI 居前，板塊結構支持。','若 CIBR 與 PANW 轉弱，降低追價。'],
  APP:['軟體高 beta 修復。','XSW 強但個股分化仍大，需成交量確認。','只做守 VWAP 的延續。'],
  LLY:['大型製藥相對強。','XLV RSI 居前，防守與成長雙重支持。','量能偏低，不追第一段。'],
  TTD:['廣告軟體反彈。','仍屬低價高波動修復，不代表軟體全面轉強。','守 VWAP 且 XSW 不轉弱才延續。'],
  CRM:['大型軟體回升。','與 DDOG、APP 同向，但須和 XSW 交叉驗證。','若 QQQ 平、軟體個股轉弱，停止加碼。'],
  DDOG:['雲端軟體跟隨修復。','成交量低於 CRM／APP，訊號次級。','以 XSW 與 VWAP 作確認。'],
  CVNA:['高 beta 消費股回吐。','缺少可核實的新公司催化。','不把薄量跌幅外推整個消費板塊。'],
  NVO:['醫療權重股相對偏弱。','XLV 整體仍強，屬個股分化。','若 XLV 強而 NVO 仍弱，按相對弱勢管理。'],
  SMCI:['AI 伺服器財報後繼續高波動。','硬件主線今日更接近持平，未形成全面共振。','守 VWAP 才視為修復。'],
  NOW:['大型軟體小幅回升。','沒有足以解釋全幅度的新公司事件。','不把 beta 反彈寫成新催化。'],
  RBLX:['高 beta 網路平台反彈。','盤前量能一般，訊號低於財報股。','只觀察，不列主線。'],
  ADBE:['權重軟體小幅修復。','與 XSW 同向，但漲幅與成交量均有限。','用 QQQ／XSW 同步守位確認。']
};

function build(ctx) {
  const base = previous.build(ctx);
  const {
    ROOT,snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    sheetTech,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,majorTable,atrTable,bondTable,expectedTable,
    macroSheetRow
  } = ctx;
  const macro = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-13-macro.json'), 'utf8'));
  const breadthScore = 1;
  const checklistHigh = 1;
  const q = ticker => pre[ticker];
  const c = ticker => close[ticker];
  const a = ticker => adjusted[ticker] || close[ticker];
  const quoteTime = new Date(quoteSnapshot.generatedAt).toLocaleTimeString('en-US', {timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false});
  const custom = (ticker, price, previousClose, vol) => ({ticker,price,previousClose,volume:vol,changePct:(price / previousClose - 1) * 100});
  const specialQuotes = {
    BIRK:custom('BIRK',43.25,36.74,112269),
    TPR:custom('TPR',129.77,153.74,363484),
    LUNR:custom('LUNR',14.45,16.95,1813000),
    CSCO:custom('CSCO',114.735,123.88,878044),
    COHR:custom('COHR',341.43,355.64,384209),
    JD:custom('JD',30.75,31.61,343118),
    NBIS:custom('NBIS',252.28,259.20,872286)
  };
  const getQuote = ticker => specialQuotes[ticker] || q(ticker);
  const moverSignal = {
    BIRK:'Q3 營收年增 13%，公司上調全年營收與 EBITDA 指引。',
    PANW:'網安板塊延續相對強勢，與 CRWD 同步。',
    CRM:'大型軟體修復；需用 XSW 與 QQQ 確認。',
    APP:'高 beta 軟體反彈，暫屬風格修復。',
    TTD:'廣告軟體反彈；仍需量價確認。',
    CRWD:'與 PANW 共振，網安主題保持領先。',
    LLY:'醫療權重相對強，防守板塊承接仍在。',
    DDOG:'雲端軟體跟隨修復，成交量次級。',
    TPR:'Q4 銷售與利潤好於預期，但 FY27 營收指引偏軟、Kate Spade 仍弱。',
    LUNR:'Q2 營收 2.0617 億美元低於預期，雖積壓訂單達 18 億美元。',
    CSCO:'EPS／營收雙 Beat，但毛利率壓力蓋過 AI 訂單與 FY27 強指引。',
    COHR:'EPS／營收雙 Beat 後獲利回吐；財報數字與價格反應背離。',
    RKLB:'財報後高 beta 消化，與 LUNR／ASTS 同向承壓。',
    ASTS:'太空／衛星板塊跟隨走弱。',
    JD:'營收小幅 Beat、非 GAAP 淨利增長，但核心零售收入偏弱。',
    NBIS:'前一日財報急升後回吐，屬高波動消化。'
  };
  const upMovers = ['BIRK','PANW','CRM','APP','TTD','CRWD','LLY','DDOG'];
  const downMovers = ['TPR','LUNR','CSCO','COHR','RKLB','ASTS','JD','NBIS'];
  const moverTransmission = {
    BIRK:'與 TPR 方向相反，消費板塊是公司分化，不宜外推 XLY。', PANW:'CRWD／CIBR 同向，網安共振成立。', CRM:'與 APP／DDOG 同向，交叉驗證 XSW。', APP:'軟體高 beta 修復，需 XSW 配合。', TTD:'廣告軟體個股反彈，不代表全面擴散。', CRWD:'與 PANW／CIBR 同向，板塊訊號較可靠。', LLY:'XLV RSI 居前，醫療板塊仍有承接。', DDOG:'與 CRM／APP 同向，但量能較低。',
    TPR:'與 BIRK 反向，顯示品牌與指引差異。', LUNR:'RKLB／ASTS 同弱，太空鏈風險擴散。', CSCO:'網路設備壓力測試，不直接否定網安軟體。', COHR:'光通訊／AI 硬體高預期回吐。', RKLB:'LUNR／ASTS 同弱，板塊 beta 承壓。', ASTS:'太空／衛星同業同步回落。', JD:'中國消費與零售個股壓力。', NBIS:'AI 基建高波動消化，非新產業利空。'
  };
  const moverJudgment = {
    BIRK:'正缺口守 VWAP 才延續。', PANW:'CIBR 同守 VWAP 才追蹤。', CRM:'守 VWAP 且 QQQ 不轉弱。', APP:'只做守 VWAP 的延續。', TTD:'量價未確認前只視為反彈。', CRWD:'PANW／CIBR 轉弱即降級。', LLY:'量能偏低，不追第一段。', DDOG:'訊號次於 CRM／APP。',
    TPR:'未收回 VWAP 不抄底。', LUNR:'收回 VWAP 才降低缺口風險。', CSCO:'Beat 不等於買點，先看毛利率定價。', COHR:'未收回財報後 VWAP 不追。', RKLB:'未收 VWAP 前維持事件風險。', ASTS:'同業未止跌前不搶反彈。', JD:'以個股弱勢管理，不外推 KWEB。', NBIS:'先消化前一日急升。'
  };
  const moverRowsHtml = [...upMovers, ...downMovers]
    .map(ticker => ({ticker,row:getQuote(ticker)}))
    .sort((left,right) => right.row.changePct - left.row.changePct)
    .map(({ticker,row}) => `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${moverSignal[ticker]}<small>${volume(row.volume)}</small></td><td>${moverTransmission[ticker]}</td><td>${moverJudgment[ticker]}</td></tr>`)
    .join('');

  const maState = row => `<span class="ma-state-group"><span class="ma-state ${row.above20 ? 'ma-up' : 'ma-down'}">20<span class="ma-arrow">${row.above20 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above50 ? 'ma-up' : 'ma-down'}">50<span class="ma-arrow">${row.above50 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above200 ? 'ma-up' : 'ma-down'}">200<span class="ma-arrow">${row.above200 ? '▲' : '▼'}</span></span></span>`;
  const checklist = [
    ['S&P 500 overextension／大盤過度延伸','High',`SPY +${n(a('SPY').distance50Atr)} ATR`,'價格高於 50MA 超過 2.5 ATR，限制追價。','high'],
    ['Increasing downward momentum／下行動能增加','Low',`QQQ ${pct(q('QQQ').changePct)}；SMH ${pct(q('SMH').changePct)}`,'盤前未出現科技下行擴散。','low'],
    ['Top range breakdown／高位區間破位','Low','四大 ETF 仍高於 20／50／200MA','昨日收盤沒有大型指數破位。','low'],
    ['Technical deterioration／技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 的四項風險均未觸發。','low'],
    ['Market breadth worsening／市場廣度惡化','Low',`五日惡化 ${breadthScore}/8`,'只有 Stockbee 5D ratio 較五日前下降。','low'],
    ['VIX >20／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'>20、5日>0、1月>0、20MA、50MA 五項全未觸發。','low'],
    ['Breakout win rate down／突破勝率下降','Intermediate','5D 1.59；10D 2.08','5D 較五日前降溫，但兩項仍高於 1。','mid'],
    ['Theme momentum weakening／主題動能轉弱','Intermediate',`CIBR RSI ${n(sheetTech.CIBR.rsi14)}；SMH ${n(sheetTech.SMH.rsi14)}`,'網安／軟體強，半導體仍低於 50MA，分化未消失。','mid']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1],row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High。</strong>結構風險低，但 SPY 高延伸與今日財報缺口要求降低追價。</div>`;

  const eventCell = (name,time) => td(`<span class="macro-event"><strong>${name}</strong><small>${time}</small></span>`);
  const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'],[
    [eventCell('PPI MoM','7月｜08:30 ET'),numTd(macro.ppi.headlineMom),numTd(macro.ppi.headlineMomForecast),numTd(macro.ppi.headlineMomPrevious),td(badge('低於預期','green'))],
    [eventCell('PPI YoY','7月｜08:30 ET'),numTd(macro.ppi.headlineYoy),numTd(macro.ppi.headlineYoyForecast),numTd(macro.ppi.headlineYoyPrevious),td(badge('低於預期','green'))],
    [eventCell('核心 PPI MoM','7月｜08:30 ET'),numTd(macro.ppi.coreMom),numTd(macro.ppi.coreMomForecast),numTd(macro.ppi.coreMomPrevious),td(badge('低於預期','green'))],
    [eventCell('核心 PPI YoY','7月｜08:30 ET'),numTd(macro.ppi.coreYoy),numTd(macro.ppi.coreYoyForecast),numTd(macro.ppi.coreYoyPrevious),td(badge('高於預期','amber'))],
    [eventCell('初領失業金','截至 8/8｜08:30 ET'),numTd(macro.claims.initial),numTd(macro.claims.initialForecast),numTd(macro.claims.initialPrevious),td(badge('高於預期','amber'))],
    [eventCell('CSCO FY26 Q4','8/12｜盤後已公布'),numTd(`EPS ${macro.earnings.CSCO.epsActual}<br>營收 ${macro.earnings.CSCO.revenueActual}`),numTd(`EPS ${macro.earnings.CSCO.epsForecast}<br>營收 ${macro.earnings.CSCO.revenueForecast}`),numTd(`EPS ${macro.earnings.CSCO.epsPrevious}<br>營收 ${macro.earnings.CSCO.revenuePrevious}`),td(badge(macro.earnings.CSCO.label,'green'))],
    [eventCell('COHR FY26 Q4','8/12｜盤後已公布'),numTd(`EPS ${macro.earnings.COHR.epsActual}<br>營收 ${macro.earnings.COHR.revenueActual}`),numTd(`EPS ${macro.earnings.COHR.epsForecast}<br>營收 ${macro.earnings.COHR.revenueForecast}`),numTd(`EPS ${macro.earnings.COHR.epsPrevious}<br>營收 ${macro.earnings.COHR.revenuePrevious}`),td(badge(macro.earnings.COHR.label,'green'))],
    [eventCell('AMAT FY26 Q3','8/13｜盤後'),numTd('待公布'),numTd('EPS 3.39<br>營收 9.01B'),numTd('EPS 2.48<br>營收 7.30B'),td(badge('事件風險','blue'))]
  ],'report-data-table macro-event-table',[1,2,3]);

  const priorRows = [
    ['CPI 溫和後，QQQ／SMH 若守 VWAP 才把硬件修復升級。','QQQ +0.73%、SMH +2.08%；但 SMH 收 584.83，仍低於 50MA 593.35。',badge('命中','green'),'保留價格確認，半導體需再收復 50MA。'],
    ['長債必須與科技同向，否則 CPI 利多不完整。','TLT -0.10%，科技仍上漲，長債沒有確認。',badge('失誤','red'),'將長債改為確認條件，不再當成單日必要條件。'],
    ['市場廣度降溫但未失守。','六組均線廣度全高於 50%，且 8/12 全數較 8/11 改善。',badge('命中','green'),'從「降溫」改為「重新擴散」，但 Stockbee 5D 仍需觀察。'],
    ['COHR 財報前按事件倉位，不把盤前價格當 Beat。','EPS／營收雙 Beat，但盤後先升後跌、今日盤前約 -4%。',badge('已觸發','amber'),'財報 Beat 與價格反應必須分開記錄。'],
    ['高延伸只持有不追。','SPY 再升 0.25%，距 50MA 約 +2.89 ATR。',badge('命中','green'),'維持不追第二段；用 VWAP 與廣度消化延伸。']
  ];
  const priorReview = `<section class="prior-premarket-review"><h2>昨晚盤前判斷複盤（8/12）</h2>${table(['8/12 盤前主判斷','8/12 收盤事實','對賬','今日修正'],priorRows.map(row => row.map(value => td(value))),'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：3 命中、1 已觸發、1 失誤。</strong>硬件與廣度框架有效；長債被設成單日必要條件過嚴，今日改為跨資產確認而非否決權。</div><p class="section-summary"><strong>本段結論：</strong>保留半導體 50MA、廣度與高延伸框架；將長債由必要條件改成跨資產確認條件。</p></section>`;

  const breadthRows = [
    ['SPX >20MA','64.61%','+1.00pp','63.02% → 64.61%','短線改善'],
    ['SPX >50MA','64.61%','+1.39pp','64.21% → 64.61%','中期穩定'],
    ['NDX >20MA','68.62%','+3.92pp','61.76% → 68.62%','科技擴散最強'],
    ['NDX >50MA','56.86%','+3.92pp','51.96% → 56.86%','緩衝回升'],
    ['IWM >20MA','63.06%','+2.82pp','60.45% → 63.06%','小型股改善'],
    ['IWM >50MA','61.52%','+1.23pp','60.14% → 61.52%','中期仍穩'],
    ['Stockbee 5D ratio','1.59','+0.08','2.28 → 1.59','五日降溫但仍 >1'],
    ['Stockbee 10D ratio','2.08','+0.41','1.37 → 2.08','中期加速'],
    ['4%+ 上漲／下跌','297／172','多方擴大','300／280 → 297／172','上漲家數占優'],
    ['T2108','52.04%','+1.35pp','52.52% → 52.04%','維持中性偏多']
  ];
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'],breadthRows.map(row => row.map((value,index) => td(value,index === 1 ? 'num' : ''))),'report-data-table breadth-diagnostic-table',[1]);

  const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',GLD:'黃金代理',SLV:'白銀代理',CPER:'銅代理',USO:'原油代理',IBIT:'比特幣代理'};
  const fxRows = [
    {ticker:'DXY',close:macro.dxy.price,dailyPct:macro.dxy.changePct,fiveDayPct:-0.14,oneMonthPct:-1.39,rsi14:macro.dxy.rsi14,meaning:'低於 20／50MA；RSI 41.49，美元偏弱但未超賣。'},
    ...['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].map(ticker => {
      const row = macroSheetRow(ticker);
      const trend = row.above20 && row.above50 && row.above200 ? '均線多頭' : !row.above20 && !row.above50 && !row.above200 ? '均線空頭' : row.above20 && row.above50 ? '均線中短線偏強' : !row.above20 && !row.above50 ? '均線中短線偏弱' : '均線趨勢混合';
      return {...row,fiveDayPct:(a(ticker).fiveDayPct || 0),meaning:`${trend}；RSI ${n(row.rsi14)}${row.rsi14 >= 55 ? ' 偏強' : row.rsi14 <= 45 ? ' 偏弱' : ' 中性'}。`};
    })
  ].map(row => {
    const live = row.ticker === 'DXY' ? pct(row.dailyPct) : q(row.ticker)?.premarketAvailable ? pct(q(row.ticker).changePct) : '—';
    const liveValue = row.ticker === 'DXY' ? row.dailyPct : q(row.ticker)?.changePct;
    return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker === 'DXY' ? '美元指數' : fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct),row.dailyPct),numTd(pct(row.fiveDayPct),row.fiveDayPct),numTd(pct(row.oneMonthPct),row.oneMonthPct),numTd(live,liveValue),numTd(n(row.rsi14)),td(row.meaning)];
  });
  const fxTable = `<div class="macro-policy-overview"><div><span>DXY</span><strong class="dn">${n(macro.dxy.price)}</strong><small>RSI ${n(macro.dxy.rsi14)}／低於 20、50MA</small></div><div><span>原油</span><strong class="dn">USO ${pct(q('USO').changePct)}</strong><small>PPI 後能源通膨降溫</small></div><div><span>長債</span><strong class="up">TLT ${pct(q('TLT').changePct)}</strong><small>仍低於三條均線</small></div></div>${table(['資產','8/12收盤','1日','5日','1月','8/13盤前','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table fx-trend-table-8',[1,2,3,4,5,6])}`;

  const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const bondRowsToday = ['SHY','IEF','TLT'].map(ticker => {
    const row = macroSheetRow(ticker);
    const quote = q(ticker);
    const structure = row.above20 && row.above50 && row.above200 ? '三線多頭' : !row.above20 && !row.above50 && !row.above200 ? '三線空頭' : '均線混合';
    const implication = ticker === 'TLT'
      ? `盤前反彈幅度最大，但 ${structure}；headline PPI 利多久期，尚未構成中期翻多。`
      : ticker === 'IEF'
        ? `中債同步回升，${structure}；確認力弱於長債。`
        : `短債變化較小，${structure}；政策端預期相對穩定。`;
    return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct),quote.changePct),numTd(n(row.rsi14)),td(implication)];
  });
  const bondTableToday = table(['ETF','盤前','變化','RSI','含義'],bondRowsToday,'report-data-table bond-curve-table',[1,2,3]);

  const tradeActions = {
    IWM:`守前收 ${n(c('IWM').close)}；廣度改善但 PPI 後先看 10Y 與開盤 VWAP。`,
    DIA:`守前收 ${n(c('DIA').close)}；防守板塊仍穩，避免用小幅盤前漲幅追價。`,
    SPY:`距 50MA +${n(a('SPY').distance50Atr)} ATR；高延伸只持有不追。`,
    QQQ:`守前收 ${n(c('QQQ').close)} 與 50MA ${n(c('QQQ').ma50)}；CSCO 跌幅是網路設備壓力測試。`,
    SMH:`收 ${n(c('SMH').close)}、仍低於 50MA ${n(c('SMH').ma50)}；今晚 AMAT 才是下一個確認。`,
    TLT:`盤前 ${pct(q('TLT').changePct)}；守 VWAP 才確認 PPI 的久期利多。`,
    USO:`盤前 ${pct(q('USO').changePct)}；油價回落支持 headline PPI，但核心年率仍黏。`
  };
  const tradeRows = Object.keys(tradeActions).map(ticker => {
    const row = c(ticker); const quote = q(ticker);
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(n(quote.price),quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(tradeActions[ticker])];
  });
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3]);
  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">',`<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);

  Object.assign(base, {
    report_title:'2026-08-13｜美股盤前監控',
    report_eyebrow:'2026-08-13｜盤前更新',
    report_heading:'PPI 表面降溫、核心仍黏：長債反彈，CSCO／COHR 雙 Beat 卻轉跌',
    report_subtitle:'盤前價格、昨晚判斷複盤、市場廣度、ETF 技術、PPI／初領與財報價格反應交叉驗證',
    data_timestamp_note:`長橋盤前快照約截至 ${quoteTime} ET；Google Sheets 的 Sector Dashboard、Thematic Sectors、Macro、Maket breath、Weekly Expected Move 與 Data QA 截至 8/12，最新 QA 全部 PASS。PPI、初領與財報截至 8/13 09:30 ET。`,
    risk_badge:`低結構風險／高延伸門檻｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">IWM ${pct(q('IWM').changePct)}</span></strong><small>DIA ${pct(q('DIA').changePct)}、SPY ${pct(q('SPY').changePct)}、QQQ ${pct(q('QQQ').changePct)}。</small></div><div class="card"><span>PPI 後跨資產</span><strong><span class="up">TLT ${pct(q('TLT').changePct)}</span></strong><small>USO <span class="dn">${pct(q('USO').changePct)}</span>；DXY ${n(macro.dxy.price)}。</small></div><div class="card"><span>財報分化</span><strong><span class="dn">CSCO ${pct(specialQuotes.CSCO.changePct)}</span></strong><small>COHR ${pct(specialQuotes.COHR.changePct)}；兩者均 Beat／Beat。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>VIX ${n(vix.close)}；五項 ${vixScore}/5。</small></div>`,
    upgrade_trigger_rule:'滿足 2/3 才把 PPI 後的風險偏好升級：指數守位、長債確認、板塊擴散。',
    upgrade_trigger_1:`QQQ 守前收 ${n(c('QQQ').close)}，SPY 守 ${n(c('SPY').close)}，IWM 不跌回 VWAP 下方。`,
    upgrade_trigger_2:`TLT 守 VWAP、DXY 維持 100 下方，10Y 不再上行。`,
    upgrade_trigger_3:'PANW／CRWD 與 CIBR 同步；SMH 收復 50MA 前只算修復。',
    downgrade_trigger_rule:'任一觸發即降低高久期與追價曝險。',
    downgrade_trigger_1:`QQQ 跌回 ${n(c('QQQ').close)} 下方，且 CSCO 跌幅擴散到大型軟體／網安。`,
    downgrade_trigger_2:'TLT 跌回 VWAP、DXY 轉強，代表核心 PPI 黏性重新主導。',
    downgrade_trigger_3:'Stockbee 5D 跌破 1，或 NDX／IWM 20MA 廣度跌破 50%。',
    core_conclusions:`<ol><li><strong>PPI headline 比預期冷，但核心年率仍是 4.2%。</strong>月率 0.0% vs +0.2%、核心月率 +0.2% vs +0.3%；核心年率略高於 4.1% 共識，不能把數據寫成全面通縮。</li><li><strong>跨資產第一反應偏向降溫。</strong>TLT ${pct(q('TLT').changePct)}、USO ${pct(q('USO').changePct)}、DXY ${pct(macro.dxy.changePct)}；但 TLT 仍低於 20／50／200MA，久期主線尚未完全修復。</li><li><strong>四大 ETF 盤前小幅上漲，沒有單一指數明顯領先。</strong>IWM ${pct(q('IWM').changePct)}、DIA ${pct(q('DIA').changePct)}、SPY ${pct(q('SPY').changePct)}、QQQ ${pct(q('QQQ').changePct)}。</li><li><strong>財報“Beat”不等於股價上漲。</strong>CSCO EPS／營收雙 Beat，但盤前 ${pct(specialQuotes.CSCO.changePct)}，市場聚焦毛利率；COHR 雙 Beat 後盤前 ${pct(specialQuotes.COHR.changePct)}，屬高預期獲利回吐。</li><li><strong>廣度由降溫轉為重新擴散。</strong>六組 SPX／NDX／IWM 均線廣度全高於 50%，且昨日全數改善；Stockbee 10D 升至 2.08，5D 1.59 仍高於 1。</li><li><strong>主題仍是網安／軟體強、半導體待確認。</strong>CIBR RSI ${n(sheetTech.CIBR.rsi14)}、XSW ${n(sheetTech.XSW.rsi14)}；SMH RSI ${n(sheetTech.SMH.rsi14)} 且仍低於 50MA。</li></ol><p class="section-summary"><strong>本段結論：</strong>今日是「headline PPI 降溫＋長債反彈」，但核心通膨與財報毛利率提醒市場仍會挑選；先交易跨資產與板塊共振，不追單一 Beat 標籤。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：PPI 後 TLT 守 VWAP、DXY 低於 100，才提高久期與成長曝險。',
    positioning_secondary:'次線：網安／軟體相對強；半導體等待 SMH 50MA 與今晚 AMAT。',
    positioning_watch:`觀察：QQQ ${n(c('QQQ').close)}、SMH 50MA ${n(c('SMH').ma50)}、TLT ${n(c('TLT').close)}、DXY 100／102、VIX 20。`,
    positioning_invalidation:'TLT 失守 VWAP、DXY 轉強且 QQQ／SMH 同步跌破前收，PPI 降溫主線失效。',
    pre_market_movers_rows:moverRowsHtml,
    pre_market_movers_note:'<p class="section-summary"><strong>本段結論：</strong>主榜固定 16 檔。BIRK、TPR、LUNR、CSCO、COHR、JD 有明確財報催化；PANW／CRWD 有板塊共振。表內成交量只顯示數量，不使用冗長來源句。</p>',
    section_pre_market_movers_primary_action:'主線：先交易有財報、成交量或至少兩檔同業共振支持的異動。',
    section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口收不回 VWAP，才延續原方向。',
    section_pre_market_movers_avoid_action:'避免：把 EPS／營收 Beat 直接等同股價利多。',
    premarket_movers_invalidation:'CSCO／COHR 收回財報後 VWAP，或太空股同步收回缺口中位，原負向敘事需重估。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High 只限制高延伸追價，不等於全面轉空。`,
    section_correction_checklist_condition_action:'條件：SPY 高延伸需由廣度、VIX 與 TLT 共同消化。',
    section_correction_checklist_avoid_action:'避免：因單一 PPI 或單一財報跌幅機械提高大盤風險級別。',
    checklist_invalidation:'若 SPY／QQQ 失守 50MA、5D ratio 跌破 1 且 VIX 升破 20，才升級結構風險。',
    macro_premarket_background_table:`${macroEvents}<div class="callout warn"><strong>PPI 拆解：</strong>headline 月率 0.0% 與年率 4.7% 均低於預期；核心月率也低於預期，但核心年率 4.2% 略高於 4.1% 共識，且扣除食品、能源與貿易服務月率 +0.4% 高於 +0.3%。</div><div class="callout"><strong>價格反應：</strong>TLT 上漲、USO 下跌、DXY 回落，支持 headline 降溫；初領 20.9 萬高於預期則提供輕微就業降溫訊號。</div><p class="section-summary"><strong>本段結論：</strong>數據組合降低立即加息壓力，但核心與服務成本仍黏；CME FedWatch 在 8/12 CPI 後顯示九月維持 3.50%–3.75% 的機率約 64%，今日以實際債券價格確認，不冒充未核實的即時機率。</p>`,
    section_macro_premarket_background_primary_action:'主線：先看 TLT／DXY，再看 QQQ／SMH 是否把宏觀利多轉成價格。',
    section_macro_premarket_background_condition_action:'條件：TLT 守 VWAP、DXY 低於 100、QQQ 守前收，三者至少兩項成立。',
    section_macro_premarket_background_avoid_action:'避免：只看 headline PPI 0.0%，忽略核心年率與 ex-food-energy-trade 月率。',
    macro_invalidation:'PPI 偏冷但 TLT 轉跌、DXY 轉強時，以價格反應優先。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜45 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>Sector 由 XLF／XLV（RSI 66）、SPY（65）、XLE（64）居前；Thematic 由 CIBR／IHI（70）、IBB／IYZ（69）、XSW（68）領先。SMH RSI ${n(sheetTech.SMH.rsi14)} 且仍低於 50MA。完整 45 檔保留，表內只顯示英文 ticker。</p>`,
    section_sector_thematic_etf_primary_action:'主線：網安／軟體／生技相對強；半導體等待 50MA 與 AMAT 財報確認。',
    section_sector_thematic_etf_condition_action:`條件：CIBR／XSW 守 VWAP；SMH 收復 50MA ${n(c('SMH').ma50)}。`,
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 追高，或用 CSCO 單名跌幅否定整個網安板塊。',
    sector_etf_invalidation:'CIBR／XSW 跌破 VWAP且軟體弱勢擴散，或 SMH 再失前收，主題修復降級。',
    major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM、DIA、SPY、QQQ。四者均高於 20／50／200MA，技術惡化分數 ${technicalScore}/12；盤前均小幅上漲，沒有明顯單一領先者。</p>`,
    section_major_etf_technical_primary_action:'主線：四大 ETF 維持多頭結構，但 SPY 高延伸不追第二段。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 ${n(c('QQQ').close)}、SPY 守 ${n(c('SPY').close)}，IWM 不跌回 VWAP。`,
    section_major_etf_technical_avoid_action:'避免：用 0.2%–0.4% 的盤前漲幅預判全天單邊。',
    major_etf_invalidation:`QQQ 失守 50MA ${n(c('QQQ').ma50)}，SPY 同時失守 20MA ${n(c('SPY').ma20)}，多頭結構降級。`,
    fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>CIBR ${n(a('CIBR').distance50Atr)} ATR、XSW ${n(a('XSW').distance50Atr)}、SPY ${n(a('SPY').distance50Atr)} 處於高延伸；TLT ${n(a('TLT').distance50Atr)} ATR 為負延伸。高延伸只持有不追，負延伸須等 VWAP 確認。</p>`,
    section_50ma_atr_extension_primary_action:'主線：高延伸只持有不追；TLT 只在 PPI 後守 VWAP時做均值回歸。',
    section_50ma_atr_extension_condition_action:'條件：TLT 反彈需 DXY 回落、10Y 降溫與 QQQ 守位至少兩項確認。',
    section_50ma_atr_extension_avoid_action:'避免：把高延伸直接做空，或把負延伸直接抄底。',
    atr_extension_invalidation:'高延伸資產失守 20MA、TLT 反彈失敗時，重新評估倉位。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>六組 SPX／NDX／IWM 20MA、50MA 廣度全部高於 50%，且 8/12 較 8/11 全數改善；NDX >20MA 由 64.70% 升至 68.62%，科技擴散最明顯。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D 1.59 雖低於五日前 2.28，10D 卻由 1.37 升至 2.08；4% 上漲／下跌 297／172，多方仍占優。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1573／1011，月度 +25%／-25% 為 222／125，強股家數維持領先。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 指向「短線重新擴散、5D 動能尚未完全回到高點」；廣度惡化分數 ${breadthScore}/8。</p>`,
    stockbee_breadth_interpretation:`<div class="callout"><strong>廣度結論：</strong>六組均線廣度全高於 50%，Stockbee 5D／10D 為 1.59／2.08；價格與上漲家數仍支持風險資產，但追價需服從 SPY 高延伸。</div>`,
    section_market_breadth_primary_action:'主線：價格與廣度同向時保留風險，新增倉位仍需守 VWAP。',
    section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不跌破 50%。',
    section_market_breadth_avoid_action:'避免：只用 Stockbee 或只用三大指數廣度下結論。',
    breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，廣度防守失效。',
    fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY ${n(macro.dxy.price)}、RSI ${n(macro.dxy.rsi14)} 且低於 20／50MA，美元偏弱但未超賣；USO ${pct(q('USO').changePct)}、TLT ${pct(q('TLT').changePct)} 支持 headline PPI 降溫。GLD RSI ${n(macroSheetRow('GLD').rsi14)}、SLV ${n(macroSheetRow('SLV').rsi14)} 仍偏強。</p>`,
    section_fx_commodities_primary_action:'主線：用 DXY 趨勢／RSI判斷美元，用 USO／TLT判斷通膨期限溢價。',
    section_fx_commodities_condition_action:'條件：DXY 低於 100、USO 回落且 TLT 守 VWAP，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY。',
    forex_commodity_invalidation:'DXY 升破 100／102 且 USO 反彈、TLT 轉弱，金融條件降溫假設失效。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.20%</strong><small>8/12</small></div><div><span>美國 10Y</span><strong>4.68%</strong><small>8/12</small></div><div><span>2s10s</span><strong>+48bp</strong><small>長端仍高</small></div><div><span>CME FedWatch</span><strong>64% 維持</strong><small>8/12 CPI 後</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTableToday}<div class="callout warn"><strong>曲線含義：</strong>SHY RSI ${n(macroSheetRow('SHY').rsi14)} 且三線多頭；IEF RSI ${n(macroSheetRow('IEF').rsi14)}、TLT RSI ${n(macroSheetRow('TLT').rsi14)} 且三線空頭。盤前 TLT 反彈幅度大於 SHY／IEF，表示 PPI 降溫先利多久期，但長端結構尚未翻多。</div>`,
    section_treasury_fed_primary_action:'主線：比較 TLT、IEF、SHY 的相對強弱，再決定是否延長久期。',
    section_treasury_fed_condition_action:'條件：TLT 領先中短債並守 VWAP，DXY 同步低於 100。',
    section_treasury_fed_avoid_action:'避免：把 8/12 FedWatch 64% 寫成今日即時值；本稿明確標示時間。',
    treasury_invalidation:'PPI 偏冷但 TLT 仍轉弱，代表期限溢價或供給壓力另有來源。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 為 8/10–8/14；XLE、XOP 已超過 +2SD，AAPL、HD、HON、XLY 跌破 -1SD，AMZN、GOOGL、NKE、XHB 接近 -1SD。只列已觸發或接近門檻者。</p>`,
    intraday_playbook_rows:[
      ['09:30 ORB','TLT／DXY／QQQ','PPI 轉化','TLT 守 VWAP、DXY 低於 100、QQQ 守前收，三者至少兩項成立才加久期。'],
      ['09:30 ORB','CSCO／COHR 財報缺口','Beat 後價格反應','未收回財報後 VWAP 不抄底；毛利率與預期差優先。'],
      ['首小時','PANW／CRWD／CIBR','網安共振','兩檔個股與 ETF 同守 VWAP，才把相對強勢升級。'],
      ['首小時','TPR／BIRK／XLY','消費分化','財報股方向相反，不用單一公司外推 XLY。'],
      ['全日','Stockbee 5D／NDX >20MA','廣度確認','價格上漲但上漲家數不跟，不提高高 beta。'],
      ['15:30 MOC','AMAT 財報','隔夜事件','共識 EPS 3.39、營收 9.01B；財報前縮小事件倉位。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic ${thematic.length} 檔使用 8/12 Google Sheet，RSI 降序；VOO／BUG／PAVE 完整，ticker 與來源逐列一致。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/12 收盤值，五日端點統一為 8/6 → 8/12；結論同時引用三大指數與 Stockbee。</div><div class="callout"><strong>Expected Move QA：</strong>來源為 8/10–8/14；只列觸發或接近 ±1SD 標的。</div><div class="callout"><strong>宏觀／財報 QA：</strong>PPI、初領、CSCO、COHR、AMAT 均保留 Actual／Forecast／Previous；已公布財報逐項標示 Beat／Miss，未公布不預判。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX，五項公式未改。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="${macro.ppi.source}">BLS PPI</a>；<a href="${macro.claims.source}">AP 初領失業金</a>；<a href="${macro.earnings.CSCO.source}">CSCO 財報</a>；<a href="${macro.earnings.COHR.source}">COHR 官方財報</a>；<a href="https://www.kiplinger.com/investing/stocks/17494/next-week-earnings-calendar-stocks">AMAT 共識</a>；<a href="${macro.dxy.source}">Yahoo Finance DXY</a>；<a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html">CME FedWatch</a>。</p><p class="source-note">資料截至 2026-08-13 約 ${quoteTime} ET；盤前價格會變動。DXY 由 Yahoo Finance 日線計算 RSI14；FedWatch 64% 為 8/12 CPI 後公開引述，不冒充即時機率。本報告為本地草稿，不構成投資建議。</p>`,
    sector_momentum_chart:chartRows
  });
  return base;
}

module.exports = {moverMeta,build};
