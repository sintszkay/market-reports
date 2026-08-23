'use strict';

const previous = require('./premarket_20260818_overrides');
const dxy = require('../data/2026-08-18-dxy.json');

const moverTickers = ['MRNA','BNTX','EL','MRVL','MRK','NVAX','SKHY','SNDK','TJX','RKLB','AVGO','TGT','AMAT','NOW','SMCI','LOW'];
const moverMeta = {
  MRNA:['個人化 mRNA 癌症疫苗與 Keytruda 的第三期黑色素瘤試驗成功，屬改變估值框架的臨床催化。','MRK 同步上漲，生技 ETF 亦獲承接；公司事件有板塊外溢。','漲幅與成交量極端，首小時未守 VWAP 不追。'],
  BNTX:['市場把 Moderna 的成功外推至個人化癌症疫苗平台，BNTX 受同類技術重估。','屬同業映射，不是 BNTX 自己公布同一試驗結果。','必須由 XBI／IBB 與成交量共同確認。'],
  EL:['調整後 EPS 0.39 對 0.32、營收 36.3 億對 35.5 億美元，雙 Beat。','財報與指引推動公司級重估，不能外推全部非必需消費。','守 VWAP 且電話會未下修才延續。'],
  MRVL:['Google 獲最多 5,897 萬股、每股 206.58 美元的認股權，與客製 AI 晶片採購掛鉤。','MRVL 上漲而 AVGO 下跌，反映客製晶片份額重定價，不是整體半導體同步。','觀察成交條件、稀釋與收入門檻，不只看名目 121.8 億美元。'],
  MRK:['與 Moderna 共同開發的癌症疫苗第三期成功，Keytruda 組合療法直接受益。','與 MRNA 同向，是同一臨床事件的合作方確認。','漲幅低於 MRNA；以消息後量價續航驗證。'],
  NVAX:['疫苗股受到 mRNA 癌症疫苗突破的情緒外溢。','不是該第三期試驗合作方，基本面相關性低於 MRK。','按同業情緒交易，不升級為公司催化。'],
  SKHY:['記憶體代理標的反彈，承接前一日晶片急跌後的修復買盤。','SNDK、MU 同升，但 SMH 僅溫和反彈，屬記憶體強於晶片大盤。','至少兩檔記憶體股守 VWAP 才延續。'],
  SNDK:['前一日急跌後反彈，盤前成交逾百萬股。','與 SKHY、MU 同向，記憶體鏈修復可信度高於單股反彈。','仍按高波動交易；SMH 未收 50MA 不追。'],
  TJX:['EPS 1.22 對 1.19、營收 152.0 億對 151.9 億美元雖雙 Beat，但下一季 EPS 指引低於共識。','股價下跌反映前瞻利潤率，而不是本季 headline Miss。','電話會未改善利潤率敘事前不抄底。'],
  RKLB:['前期高 beta 太空股回吐，未確認同等強度的新公司公告。','屬風險偏好與擁擠倉位壓力，不外推工業板塊。','未收 VWAP 前維持相對弱勢。'],
  AVGO:['MRVL／Google 客製晶片協議引發份額競爭重估。','MRVL 上漲、AVGO 下跌形成清楚的相對價值訊號。','若 AVGO 收回 VWAP且 SMH 走強，競爭壓力敘事降級。'],
  TGT:['EPS 4.11 對 2.33、營收 265.4 億對 261.3 億美元雙 Beat，但每股約 1.65 美元來自一次性關稅退款。','股價下跌反映盈利品質折價，不是需求全面崩壞。','剔除一次性項目後再判斷，未收 VWAP 不追。'],
  AMAT:['前一日設備鏈賣壓延續，盤前落後記憶體與 SMH。','半導體內部是記憶體修復、設備偏弱，並非全面 risk-on。','設備三檔至少兩檔收 VWAP 才改善。'],
  NOW:['高久期軟體持續承壓，未確認同等強度的新公司級利空。','XSW 收盤仍強，但個股 beta 分化。','若 XSW 強而 NOW 弱，按相對弱勢管理。'],
  SMCI:['AI 伺服器高 beta 仍在消化波動，盤前未跟上記憶體反彈。','與 AMAT、AVGO 同弱，限制 SMH 修復幅度。','未收 VWAP 前不升級 AI 硬體。'],
  LOW:['調整後 EPS 4.40 對 4.22 Beat，營收 259.6 億對 261.3 億美元 Miss。','盈利與營收方向相反，屬 Mixed；住宅需求仍偏軟。','需與 TGT／TJX 分開解讀，首小時守 VWAP才改善。']
};

function build(ctx) {
  const base = previous.build(ctx);
  const {
    snapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    requireRow,requirePre,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,expectedTable
  } = ctx;
  const q = ticker => requirePre(ticker);
  const c = ticker => requireRow(ticker);
  const a = ticker => adjusted[ticker] || c(ticker);
  const quoteTime = new Date(quoteSnapshot.generatedAt).toLocaleTimeString('en-US', {timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false});
  const breadthScore = 8;
  const checklistHigh = 1;
  const maState = row => `<span class="ma-state-group"><span class="ma-state ${row.above20 ? 'ma-up' : 'ma-down'}">20<span class="ma-arrow">${row.above20 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above50 ? 'ma-up' : 'ma-down'}">50<span class="ma-arrow">${row.above50 ? '▲' : '▼'}</span></span><span class="ma-state ${row.above200 ? 'ma-up' : 'ma-down'}">200<span class="ma-arrow">${row.above200 ? '▲' : '▼'}</span></span></span>`;

  const moverRows = moverTickers.map(ticker => {
    const row = q(ticker);
    const meta = moverMeta[ticker];
    return `<tr><td><strong class="ticker-nowrap">${ticker}</strong></td><td class="num">${n(row.price)}</td><td class="num ${cls(row.changePct)}">${pct(row.changePct)}</td><td>${meta[0]}<small>${volume(row.volume)}</small></td><td>${meta[1]}</td><td>${meta[2]}</td></tr>`;
  }).join('');

  const checklist = [
    ['大盤過度延伸','Intermediate',`SPY +${n(a('SPY').distance50Atr)} ATR`,'接近高延伸，但未達機械風控高檔。','mid'],
    ['下行動能增加','Intermediate',`QQQ 5日 ${pct(c('QQQ').fiveDayPct)}；SMH 5日 ${pct(c('SMH').fiveDayPct)}`,'8/18 急跌後盤前反彈，賣壓未完全解除。','mid'],
    ['高位區間破位','Low','四大 ETF 均高於 20／50／200MA','尚未形成大型指數技術破位。','low'],
    ['技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 的四項條件均未觸發。','low'],
    ['市場廣度惡化','High',`五日惡化 ${breadthScore}/8`,'六項指數廣度與兩項 Stockbee ratio 全數下降。','high'],
    ['波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'只有五日變化為正，其餘四項未觸發。','low'],
    ['突破勝率下降','Intermediate','Stockbee 5D 1.10；10D 1.30','仍高於 1，但下降股與 T2108 已轉弱。','mid'],
    ['主題動能轉弱','Intermediate',`SMH 低於 50MA；RSI ${n(c('SMH').rsi14)}`,'記憶體反彈，設備與伺服器未同步。','mid']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1],row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High。</strong>唯一高風險項是市場廣度；指數技術未破、VIX 仍低，因此定義為內部惡化而非全面崩壞。</div>`;

  const eventCell = (name,time) => td(`<span class="macro-event"><strong>${name}</strong><small>${time}</small></span>`);
  const macroEvents = table(['宏觀／財報事件','Actual 實際','Forecast 預期','Previous 前值','訊號'],[
    [eventCell('FOMC 7月會議紀要','14:00 ET'),numTd('待公布'),numTd('關注升息門檻'),numTd('7/29：9–3 維持 3.50–3.75%'),td(badge('待公布','blue'))],
    [eventCell('Target（TGT）Q2','盤前已公布'),numTd('EPS 4.11<br>營收 26.54B'),numTd('EPS 2.33<br>營收 26.13B'),numTd('去年 EPS 2.05<br>營收 25.21B'),td(badge('Beat／Beat','green'))],
    [eventCell('Lowe’s（LOW）Q2','盤前已公布'),numTd('EPS 4.40<br>營收 25.96B'),numTd('EPS 4.22<br>營收 26.13B'),numTd('去年 EPS 4.33<br>營收 23.96B'),td(badge('Beat／Miss','amber'))],
    [eventCell('TJX Q2','盤前已公布'),numTd('EPS 1.22<br>營收 15.20B'),numTd('EPS 1.19<br>營收 15.19B'),numTd('上季 EPS 1.19'),td(badge('Beat／Beat','green'))],
    [eventCell('Estée Lauder（EL）Q4','盤前已公布'),numTd('EPS 0.39<br>營收 3.63B'),numTd('EPS 0.32<br>營收 3.55B'),numTd('上季 EPS 0.91<br>營收 3.71B'),td(badge('Beat／Beat','green'))]
  ],'report-data-table macro-results-table',[1,2,3]);

  const priorRows = [
    ['半導體負缺口未收 VWAP 前不抄底。','SMH 收跌 4.09%、QQQ 跌 1.69%，晶片賣壓延續至收盤。',badge('命中','green'),'今天反彈仍要求 SMH 收回 50MA。'],
    ['記憶體、互聯、設備至少兩組修復才升級。','三組均未形成收盤修復，設備與互聯領跌。',badge('命中','green'),'保留多組交叉驗證，不因單股反彈升級。'],
    ['弱數據後先看 TLT／10Y。','TLT 收漲 0.38%、10Y 約 4.71%，久期只溫和受益。',badge('命中','green'),'今日紀要前仍以價格反應為準。'],
    ['短線廣度轉弱但中期仍守中線。','六項指數廣度五日全部下降，T2108 跌至 47.94。',badge('失誤','red'),'中期緩衝較預期更快消失，廣度升至 High。'],
    ['QQQ／SMH 失守均線才升級系統風險。','QQQ 仍在三線上方，SMH 跌破 50MA但守 20／200MA。',badge('已觸發','amber'),'板塊風控觸發，尚未演變成全市場破位。']
  ];
  const priorReview = `<section class="prior-premarket-review"><h2>上次盤前判斷複盤（8/18）</h2>${table(['8/18 盤前主判斷','收盤事實','對賬','今日修正'],priorRows.map(row => row.map(value => td(value))),'report-data-table premarket-review-table')}<div class="callout warn"><strong>對賬：3 命中、1 已觸發、1 失誤。</strong>晶片與長債框架有效；主要低估的是廣度惡化速度，今天必須把內部數據放在指數小幅反彈之前。</div><p class="section-summary"><strong>本段結論：</strong>盤前反彈只能修復價格，不能自動修復廣度；除非 SMH、TLT 與開盤廣度共同改善，否則維持較低 beta。</p></section>`;

  const majorRows = ['IWM','DIA','SPY','QQQ'].map(ticker => {
    const row = c(ticker); const quote = q(ticker);
    const notes = {
      IWM:`盤前 ${pct(quote.changePct)}，但 IWM 20MA 廣度只剩 55.05%。`,
      DIA:`四大 ETF 收盤最抗跌；盤前 ${pct(quote.changePct)}。`,
      SPY:`仍在三線上方，距 50MA +${n(a('SPY').distance50Atr)} ATR。`,
      QQQ:`盤前反彈；20MA ${n(row.ma20)}、50MA ${n(row.ma50)} 是結構門檻。`
    };
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),numTd(n(row.rsi14)),td(notes[ticker])];
  });
  const majorTable = table(['ETF','盤前','20MA','50MA','20/50/200MA','RSI','判斷'],majorRows,'report-data-table major-etf-table',[1,2,3,5]).replace('<table class="report-data-table major-etf-table">','<table class="report-data-table major-etf-table" data-major-universe="indices-4">');

  const atrTickers = ['XLE','SHY','XSW','CIBR','SPY','USO','DIA','IWM','SMH','IEF','TLT'];
  const atrRows = atrTickers.map(ticker => a(ticker)).sort((left,right) => right.distance50Atr-left.distance50Atr).map(row => [td(`<strong class="ticker-nowrap">${row.ticker}</strong>`),numTd(n(row.close)),numTd(n(row.ma50)),numTd(n(row.atr14)),numTd(n(row.distance50Atr),row.distance50Atr),td(Math.abs(row.distance50Atr)>=2.5?badge('延伸','amber'):badge('正常','blue'))]);
  const atrTable = table(['ETF','收盤','50MA','ATR14','距50MA ATR','狀態'],atrRows,'report-data-table',[1,2,3,4]);

  const breadthRowsRaw = sheetSnapshot.marketBreadth.values.slice(2).filter(row => row[0]);
  const breadthLatest = breadthRowsRaw[0]; const breadthPrev = breadthRowsRaw[1]; const breadthFive = breadthRowsRaw.find(row => row[0] === '2026-08-14');
  const breadthNames = ['SPX >20MA','SPX >50MA','NDX >20MA','NDX >50MA','IWM >20MA','IWM >50MA'];
  const breadthRows = breadthNames.map((name,index) => [name,`${breadthLatest[index+1]}%`,`${breadthPrev[index+1]}%→${breadthLatest[index+1]}%`,`${breadthFive[index+1]}%→${breadthLatest[index+1]}%`,'五日下降，內部參與度收窄。']);
  const stockbeeRows = sheetSnapshot.stockbee.values.slice(1).filter(row => row[0]);
  const stockbeeLatest = stockbeeRows[0]; const stockbeePrev = stockbeeRows[1]; const stockbeeFive = stockbeeRows.find(row => row[0] === '8/14/2026');
  breadthRows.push(
    ['Stockbee 5D ratio',stockbeeLatest[3],`${stockbeePrev[3]}→${stockbeeLatest[3]}`,`${stockbeeFive[3]}→${stockbeeLatest[3]}`,'仍高於 1，但接近失效線。'],
    ['Stockbee 10D ratio',stockbeeLatest[4],`${stockbeePrev[4]}→${stockbeeLatest[4]}`,`${stockbeeFive[4]}→${stockbeeLatest[4]}`,'中期延續率同步降溫。'],
    ['4%+ 上漲／下跌',`${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeePrev[1]}／${stockbeePrev[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,`${stockbeeFive[1]}／${stockbeeFive[2]}→${stockbeeLatest[1]}／${stockbeeLatest[2]}`,'下跌股約為上漲股兩倍。'],
    ['季度 +25%／-25%',`${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeePrev[5]}／${stockbeePrev[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,`${stockbeeFive[5]}／${stockbeeFive[6]}→${stockbeeLatest[5]}／${stockbeeLatest[6]}`,'強股仍多，但優勢縮小。'],
    ['T2108',`${stockbeeLatest[14]}%`,`${stockbeePrev[14]}%→${stockbeeLatest[14]}%`,`${stockbeeFive[14]}%→${stockbeeLatest[14]}%`,'已跌破 50，中位股偏弱。']
  );
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'],breadthRows.map(row => row.map((value,index) => td(value,index===1?'num':''))),'report-data-table breadth-diagnostic-table',[1]);

  const fxLabels = {FXE:'歐元',FXB:'英鎊',FXY:'日圓',USDU:'美元代理',GLD:'黃金',SLV:'白銀',CPER:'銅',USO:'原油',IBIT:'比特幣'};
  const fxMeaning = row => {
    const trend = row.above20&&row.above50&&row.above200?'均線多頭':!row.above20&&!row.above50&&!row.above200?'均線空頭':row.above20&&row.above50?'中短線偏強':!row.above20&&!row.above50?'中短線偏弱':'趨勢混合';
    const momentum = row.rsi14>=70?'過熱':row.rsi14>=55?'偏強':row.rsi14<=45?'偏弱':'中性';
    return `均線趨勢：${trend}；RSI ${n(row.rsi14)} ${momentum}。`;
  };
  const fxRows = [{...dxy,ticker:'DXY'},...['FXE','FXB','FXY','USDU','GLD','SLV','CPER','USO','IBIT'].map(ticker => a(ticker))].map(row => {
    const quote = row.ticker==='DXY'?null:pre[row.ticker];
    return [td(`<span class="asset-pair"><strong>${row.ticker}</strong><small>${row.ticker==='DXY'?'美元指數':fxLabels[row.ticker]}</small></span>`),numTd(n(row.close)),numTd(pct(row.dailyPct),row.dailyPct),numTd(pct(row.fiveDayPct),row.fiveDayPct),numTd(pct(row.oneMonthPct),row.oneMonthPct),numTd(row.ticker==='DXY'?'正式日線':pct(quote.changePct),quote?.changePct),numTd(n(row.rsi14)),td(fxMeaning(row))];
  });
  const fxTable = table(['資產','8/18收盤','1日','5日','1月','8/19盤前','RSI','趨勢／RSI 含義'],fxRows,'report-data-table fx-trend-table fx-trend-table-8',[1,2,3,4,5,6]);

  const bondLabels = {SHY:'1–3年短債',IEF:'7–10年中債',TLT:'20年以上長債'};
  const bondRows = ['SHY','IEF','TLT'].map(ticker => {const row=c(ticker),quote=q(ticker); return [td(`<span class="asset-pair"><strong>${ticker}</strong><small>${bondLabels[ticker]}</small></span>`),numTd(n(quote.price)),numTd(pct(quote.changePct),quote.changePct),numTd(n(row.rsi14)),td(ticker==='SHY'?'三線多頭，短端穩定。':ticker==='IEF'?'低於三線，盤前反彈。':'深度負延伸但盤前領漲，先看紀要前能否守住。')];});
  const bondTable = table(['ETF','盤前','變化','RSI','含義'],bondRows,'report-data-table bond-curve-table',[1,2,3]);

  const tradeActions = {
    IWM:`守 20MA ${n(c('IWM').ma20)}；廣度未回升前不追盤前缺口。`,
    DIA:`四大 ETF 最抗跌；守前收 ${n(c('DIA').close)}。`,
    SPY:`距 50MA +${n(a('SPY').distance50Atr)} ATR；先看廣度是否補漲。`,
    QQQ:`守 50MA ${n(c('QQQ').ma50)}；FOMC 紀要前降低久期押注。`,
    SMH:`盤前反彈但仍低於 50MA ${n(c('SMH').ma50)}；記憶體不能代替全鏈修復。`,
    TLT:`盤前 ${pct(q('TLT').changePct)}；若 14:00 紀要偏鷹仍守 VWAP，才確認久期承接。`,
    XBI:`MRNA／MRK 催化強，但 ETF 必須守 VWAP 才外推。`,
    XSW:`軟體收盤趨勢仍強；FOMC 後 NOW 若持續落後，只保留 ETF 相對強弱。`
  };
  const tradeRows = Object.keys(tradeActions).map(ticker => {const row=c(ticker),quote=q(ticker); return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(`${n(quote.price)}<br>${pct(quote.changePct)}`,quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(tradeActions[ticker])];});
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'],tradeRows,'report-data-table trading-plan-table',[1,2,3]);
  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">',`<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);

  return {
    ...base,
    report_title:'2026-08-19｜美股盤前監控',
    report_eyebrow:'2026-08-19｜盤前更新',
    report_heading:'癌症疫苗與客製晶片事件爆發，但市場廣度 8/8 惡化：FOMC 紀要前不追指數反彈',
    report_subtitle:'8/18 收盤技術、8/19 長橋歷史盤前、三大指數廣度與 Stockbee、財報 Actual／Forecast／Previous 交叉驗證',
    data_timestamp_note:`歷史長橋盤前快照截至約 ${quoteTime} ET；技術面與市場廣度截至 8/18 收盤。FOMC 7月會議紀要將於 14:00 ET 公布；TGT、LOW、TJX、EL 財報已更新。`,
    risk_badge:`事件股極強／廣度惡化｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">IWM ${pct(q('IWM').changePct)}</span></strong><small>DIA ${pct(q('DIA').changePct)}、SPY ${pct(q('SPY').changePct)}、QQQ ${pct(q('QQQ').changePct)}。</small></div><div class="card"><span>最大事件</span><strong><span class="up">MRNA ${pct(q('MRNA').changePct)}</span></strong><small>MRK ${pct(q('MRK').changePct)}；第三期癌症疫苗試驗成功。</small></div><div class="card"><span>內部廣度</span><strong><span class="dn">8/8 惡化</span></strong><small>T2108 47.94；4% 上漲／下跌 167／335。</small></div><div class="card"><span>FOMC 風險</span><strong>14:00 ET</strong><small>紀要前 TLT ${pct(q('TLT').changePct)}；正式 VIX ${n(vix.close)}。</small></div>`,
    qqq_reengage_20ma:n(c('QQQ').ma20),
    qqq_breakout_add_1sd:'等待 FOMC 紀要後收回 VWAP 再評估',
    upgrade_trigger_rule:'滿足 2/3 才把盤前反彈升級為市場修復。',
    upgrade_trigger_1:`QQQ 守 50MA ${n(c('QQQ').ma50)}，SMH 收回 50MA ${n(c('SMH').ma50)}。`,
    upgrade_trigger_2:'開盤上漲家數改善，Stockbee 5D 未跌破 1，IWM／NDX 20MA 廣度止跌。',
    upgrade_trigger_3:'TLT 守 VWAP、10Y 下行，且 FOMC 紀要未提高近期升息風險。',
    downgrade_trigger_rule:'任一觸發即降低指數與高 beta 倉位。',
    downgrade_trigger_1:`QQQ 失守 50MA ${n(c('QQQ').ma50)}，SMH 反彈失敗並跌回前收。`,
    downgrade_trigger_2:'FOMC 紀要偏鷹、TLT 跌破 VWAP且 10Y 回升。',
    downgrade_trigger_3:'事件股以外沒有廣度跟進，IWM／SPY 同時失守 VWAP。',
    core_conclusions:`<ol><li><strong>盤前最大訊號是兩個公司級事件，不是全市場 risk-on。</strong>MRNA ${pct(q('MRNA').changePct)}、MRK ${pct(q('MRK').changePct)}源自第三期癌症疫苗試驗；MRVL ${pct(q('MRVL').changePct)}源自 Google 客製晶片與認股權協議。</li><li><strong>四大 ETF 反彈，但內部廣度明顯落後。</strong>IWM ${pct(q('IWM').changePct)}領先，然而六項指數廣度較五日前全數下降，Stockbee 5D／10D 也降至 1.10／1.30。</li><li><strong>8/18 的晶片急跌尚未完全修復。</strong>SMH 收盤跌 4.09%、仍低於 50MA；今天記憶體反彈，但 AMAT／AVGO／SMCI 偏弱，晶片內部仍分化。</li><li><strong>財報 headline 與股價反應再次分離。</strong>TGT 雙 Beat 但包含一次性關稅退款，TJX 雙 Beat 但下一季盈利指引偏弱；LOW 則是 EPS Beat、營收 Miss。</li><li><strong>14:00 ET FOMC 紀要是全日主要宏觀風險。</strong>盤前 TLT ${pct(q('TLT').changePct)}，2Y／10Y／20Y 約 4.19%／4.71%／5.28%；紀要後需觀察長債能否保留領先。</li><li><strong>VIX 沒有確認系統性風險。</strong>正式 VIX ${n(vix.close)}、五項 ${vixScore}/5，三大指數技術 ${technicalScore}/12；風控應針對廣度與板塊，而非機械全面做空。</li></ol><p class="section-summary"><strong>本段結論：</strong>以事件股做事件交易、以廣度管理指數倉位；FOMC 紀要前不把盤前小幅上漲誤判為全面修復。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：MRNA／MRK 臨床催化與 MRVL 客製晶片協議，分開按事件管理。',
    positioning_secondary:'次線：四大 ETF 盤前反彈，但廣度 8/8 惡化，指數倉位保持較低 beta。',
    positioning_watch:`觀察：QQQ 50MA ${n(c('QQQ').ma50)}、SMH 50MA ${n(c('SMH').ma50)}、TLT VWAP、10Y 4.71%、DXY 100／102、VIX 20。`,
    positioning_invalidation:'SMH 收回 50MA、開盤廣度改善且 TLT 守強，防守定位才失效。',
    pre_market_movers_rows:moverRows,
    pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>MRNA ${volume(q('MRNA').volume)}、MRVL ${volume(q('MRVL').volume)}、SKHY ${volume(q('SKHY').volume)}、SNDK ${volume(q('SNDK').volume)}成交量均足以確認異動；下跌端 TJX 與 TGT 是盈利品質／指引問題，不能寫成單純 Miss。</p>`,
    section_pre_market_movers_primary_action:'主線：事件股只按自身催化交易，指數仍需廣度確認。',
    section_pre_market_movers_condition_action:'條件：守 VWAP、成交不衰減且同業／ETF 同向才延續。',
    section_pre_market_movers_avoid_action:'避免：把 MRNA、MRVL 的極端漲幅外推為全面風險偏好。',
    premarket_movers_invalidation:'事件股失守 VWAP且 XBI／SMH 不跟，外溢敘事失效。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High，風險集中在廣度，不是指數均線。`,
    section_correction_checklist_condition_action:'條件：廣度止跌、SMH 收回 50MA、FOMC 後 TLT 守強。',
    section_correction_checklist_avoid_action:'避免：用低 VIX 忽略內部惡化，或用 8/8 廣度機械全面做空。',
    checklist_invalidation:'Stockbee 5D 重返 1.3 以上、T2108 回 50 且六項指數廣度多數回升，廣度 High 才降級。',
    macro_premarket_background_table:`${macroEvents}<div class="scenario-grid"><div class="scenario-card"><strong>偏鴿紀要／久期修復</strong><p>TLT 守盤前漲幅、10Y 下行、QQQ／SMH 收 VWAP：可提高久期與品質成長，但仍避開廣度未確認的追價。</p></div><div class="scenario-card"><strong>中性紀要／事件市</strong><p>利率與美元窄幅、指數守 VWAP：維持 MRNA／MRK、MRVL 等公司事件，降低指數方向押注。</p></div><div class="scenario-card"><strong>偏鷹紀要／期限壓力</strong><p>TLT 轉跌、10Y 回升、QQQ 失 50MA：削減高久期科技，保留現金與短債。</p></div></div><p class="section-summary"><strong>本段結論：</strong>財報數字已公布，但今日市場級變量仍是 14:00 ET FOMC 紀要；以長短債、美元與 QQQ 的同向反應判斷，而非只讀文字。</p>`,
    section_macro_premarket_background_primary_action:'主線：財報按 Beat／Miss 與盈利品質拆解，FOMC 以長債反應確認。',
    section_macro_premarket_background_condition_action:'條件：紀要、TLT／10Y、QQQ／SMH 至少兩組同向才調整倉位。',
    section_macro_premarket_background_avoid_action:'避免：把一次性退款與較弱指引埋在 headline Beat 之下。',
    macro_invalidation:'紀要文字與債券價格背離時，以 TLT／10Y 實際反應為準。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜${thematic.length} 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>完整 12 個 Sector 與 ${thematic.length} 個 Thematic ETF 均用截至 8/18 的長橋日線重算；VOO 基準在表內，ticker 只顯示英文。XLE 最強，SMH 仍低於 50MA。</p>`,
    section_sector_thematic_etf_primary_action:'主線：能源趨勢最強；生技由事件驗證，半導體仍需收回 50MA。',
    section_sector_thematic_etf_condition_action:'條件：ETF 本身守 VWAP，且成份股至少兩組同步。',
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，或把單一事件外推整個主題。',
    sector_etf_invalidation:'XLE 失 20MA，SMH 收 50MA且廣度改善，現有相對強弱失效。',
    major_etf_technical_table:`${majorTable}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM／DIA／SPY／QQQ；四者仍在 20／50／200MA 上方，技術惡化 ${technicalScore}/12。盤前 IWM 領先，但小型股內部廣度只有約 55%，不能只看 ETF 價格。</p>`,
    section_major_etf_technical_primary_action:'主線：結構未破，但新倉先等廣度確認。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 50MA ${n(c('QQQ').ma50)}、IWM 20MA 廣度止跌。`,
    section_major_etf_technical_avoid_action:'避免：用四大 ETF 全綠忽略成份股廣度惡化。',
    major_etf_invalidation:`QQQ 失 50MA ${n(c('QQQ').ma50)}且 SPY 失 20MA ${n(c('SPY').ma20)}，結構降級。`,
    fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XLE +${n(a('XLE').distance50Atr)} ATR、SHY +${n(a('SHY').distance50Atr)}、XSW +${n(a('XSW').distance50Atr)} 位於高延伸；TLT ${n(a('TLT').distance50Atr)} ATR 為深度負延伸。延伸只代表位置，不等於反轉訊號。</p>`,
    section_50ma_atr_extension_primary_action:'主線：高延伸不追，TLT 只在紀要與價格同向時參與。',
    section_50ma_atr_extension_condition_action:'條件：TLT 守 VWAP、10Y 下行、QQQ 守 50MA。',
    section_50ma_atr_extension_avoid_action:'避免：把負 ATR 延伸機械視為抄底理由。',
    atr_extension_invalidation:'高延伸資產失 20MA，或 TLT 反彈失敗時重新評估。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>SPX、NDX、IWM 的 20MA／50MA 廣度較 8/14 全部下降；最弱的是 SPX >20MA 52.98%。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D／10D 降至 1.10／1.30，4% 上漲／下跌 167／335，T2108 47.94。</p><p><strong>中期結構：</strong>季度 +25%／-25% 仍為 1469／1053，尚有緩衝，但強股優勢正在縮小。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 共同確認短線內部惡化，五日分數 ${breadthScore}/8；指數反彈若沒有廣度跟進，只按技術修復處理。</p>`,
    stockbee_breadth_interpretation:`<div class="callout warn"><strong>廣度結論：</strong>五日惡化 ${breadthScore}/8，T2108 已低於 50。價格結構仍未破，所以先降低 beta，而不是全面做空。</div>`,
    section_market_breadth_primary_action:'主線：新倉必須等開盤上漲家數與 ETF 價格共同確認。',
    section_market_breadth_condition_action:'條件：Stockbee 5D 守 1，NDX／IWM 20MA 廣度止跌。',
    section_market_breadth_avoid_action:'避免：只看 Stockbee 或只看 ETF；必須交叉驗證。',
    breadth_invalidation:'5D 跌破 1、T2108 持續低於 50且四大 ETF 失均線，風險再升級。',
    fx_commodities_table:`${fxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 正式日線截至 ${dxy.asOf} 為 ${n(dxy.close)}、RSI ${n(dxy.rsi14)}，低於 20／50MA；8/19 盤前 GLD ${pct(q('GLD').changePct)}、SLV ${pct(q('SLV').changePct)}，貴金屬與長債同升，反映紀要前的防守與久期需求。</p>`,
    section_fx_commodities_primary_action:'主線：DXY 用正式日線與 USDU 交叉驗證，商品看金銀與原油是否分化。',
    section_fx_commodities_condition_action:'條件：DXY 低於 100、TLT 守強，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 跳價替代正式 DXY。',
    forex_commodity_invalidation:'DXY 升破 100／102且 TLT 轉弱，久期友善條件失效。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.19%</strong><small>財政部 8/18</small></div><div><span>美國 10Y</span><strong>4.71%</strong><small>2s10s +52bp</small></div><div><span>美國 20Y</span><strong>5.28%</strong><small>長端仍高</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>SHY 三線多頭、IEF／TLT 低於三線；盤前 TLT 領漲，說明紀要前久期買盤增加。若 14:00 後 TLT 仍守強且 10Y 下行，才確認偏鴿；若 TLT 反轉，則是偏鷹或期限溢價重新主導。</div>`,
    section_treasury_fed_primary_action:'主線：用 TLT 相對 SHY／IEF 的強弱判斷紀要，而不是只讀新聞標題。',
    section_treasury_fed_condition_action:'條件：TLT 領先、10Y 下行、QQQ 守 50MA，三項至少兩項成立。',
    section_treasury_fed_avoid_action:'避免：在 14:00 前把盤前長債漲幅當成紀要結果。',
    treasury_invalidation:'紀要後 TLT 跌破 VWAP、10Y 回升，久期修復失效。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>使用 8/19 當日保存的 8/17–8/21 Weekly Expected Move；只列已觸發或接近 ±1SD 的標的。紀要前避免在區間邊緣追單。</p>`,
    intraday_playbook_rows:[
      ['09:30 ORB','MRNA／MRK／XBI','臨床事件','MRNA、MRK 與 XBI 同守 VWAP 才外推生技。'],
      ['09:30 ORB','MRVL／AVGO／SMH','客製晶片份額','MRVL 強、AVGO 弱的相對訊號需 SMH 守穩。'],
      ['首小時','TGT／LOW／TJX／EL','財報品質','區分 headline、一次性項目、指引與實際價格。'],
      ['全日','IWM／QQQ／廣度','指數反彈驗證','ETF 上漲但上漲家數不跟，減倉不追。'],
      ['14:00 ET','FOMC 7月會議紀要','利率情景','同步看 TLT、10Y、DXY 與 QQQ。'],
      ['14:00 後','SHY／IEF／TLT','曲線確認','TLT 領先才是久期買盤；SHY 獨強代表防守。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>截至 8/18 的長橋技術資料 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；8/19 歷史盤前行情 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用，失敗 0，快照約 ${quoteTime} ET。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔、Thematic ${thematic.length} 檔均由保存的長橋快取重算 RSI 與均線並按 RSI 降序；VOO 基準在表內。</div><div class="callout"><strong>廣度 QA：</strong>六項指數廣度與 Stockbee 截至 8/18，五日端點統一為 8/14→8/18；綜合 ${breadthScore}/8。</div><div class="callout"><strong>宏觀／財報 QA：</strong>FOMC 紀要明確標記待公布；TGT、LOW、TJX、EL 均保留 Actual／Forecast／Previous 與具體 Beat／Miss。</div><div class="callout warn"><strong>DXY QA：</strong>正式 DXY 日線只到 ${dxy.asOf}，未用後來數據冒充 8/19 當時值；以 USDU 8/18 技術交叉驗證。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 五項公式未改。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI 歷史 15 分鐘盤前與日線；<a href="https://www.federalreserve.gov/monetarypolicy/fomcpresconf20260729.htm">Federal Reserve：7月 FOMC 會議資料</a>；<a href="https://corporate.target.com/press/release/2026/08/target-corporation-reports-second-quarter-earnings">Target 官方財報</a>；<a href="https://corporate.lowes.com/newsroom/press-releases">Lowe’s 投資者關係</a>；<a href="https://investor.tjx.com/investors/press-releases">TJX 投資者關係</a>；<a href="https://www.investing.com/news/stock-market-news/moderna-shares-surge-as-melanoma-vaccine-with-merck-succeeds-in-large-trial-4867334">MRNA／MRK 第三期試驗</a>；<a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve">美國財政部收益率</a>。</p><p class="source-note">歷史數據截至 2026-08-19 約 ${quoteTime} ET；技術與廣度截至 8/18 收盤。這是依保存快照補建的本地草稿，不構成投資建議。</p>`,
    sector_momentum_chart:chartRows
  };
}

module.exports = {moverMeta,build};
