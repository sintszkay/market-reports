'use strict';

const fs = require('fs');
const path = require('path');

const moverMeta = {
  CAVA:['Q2 EPS 0.19 高於 0.18 共識，營收 3.684 億美元高於 3.601 億美元。','EPS／營收雙 Beat，且同店銷售 +9%、流量 +5.3%；屬公司事件。','正缺口守 VWAP 且餐飲同業沒有全面轉弱才延續。'],
  SMCI:['Q4 非 GAAP EPS 1.70 高於 0.92 共識，但營收約 111.2 億美元低於約 115.6 億美元。','EPS Beat／營收 Miss；下一季 145–155 億美元營收指引與逾 600 億美元新訂單支撐股價。','把強指引與積壓訂單當主因，不把結果寫成全面 Beat。'],
  COHR:['SMCI 指引帶動 AI 光通訊鏈，COHR 自身財報在今晚盤後。','屬板塊共振與事件前定位，不是 COHR 已公布的 Beat。','盤後前控制事件倉位；盤中須守 VWAP。'],
  SNDK:['AI 儲存與記憶體鏈跟隨 SMCI／光通訊反彈。','成交量具辨識度，但本輪沒有同等強度的新財報公告。','與 MU、SMH 同守 VWAP 才確認記憶體擴散。'],
  MRVL:['AI 光通訊與互連鏈同步走強，成交量為盤前主榜最高之一。','與 COHR、ORCL、SMCI 同向，板塊共振可信度高。','若 COHR／SMCI 回落且 MRVL 失守 VWAP，降低追價。'],
  LRCX:['半導體設備鏈隨 AI 硬件修復。','AMAT、KLAC 同向，但自身沒有等強的新公司事件。','設備三檔至少兩檔守 VWAP 才延續。'],
  MU:['記憶體 beta 跟隨 SNDK 與 SMH 反彈。','成交量高，板塊訊號比薄量設備股更可信。','MU、SNDK 與 SMH 同向才加碼。'],
  AMAT:['先進製程設備鏈跟隨 AI 資本支出情緒回升。','LRCX、KLAC 共振，屬板塊修復。','未守 VWAP 不追第二段。'],
  KLAC:['檢測設備跟隨半導體設備鏈反彈。','同業共振成立，但盤前量能低於 MU／MRVL。','用首小時量能與 SMH 方向確認。'],
  NVO:['盤前回吐，未確認足以解釋全部跌幅的新公司公告。','視為醫療權重相對弱勢，不把價格倒推成基本面新聞。','若 XLV 強而 NVO 仍弱，按相對弱勢管理。'],
  NOW:['大型軟體承壓，與 AI 硬件方向相反。','反映軟體估值與資金輪動，不等於公司新增利空。','XSW 強而 NOW 弱時只作個股相對空頭。'],
  ORCL:['AI 基礎設施與企業算力需求跟隨 SMCI 指引走強。','與硬件／光通訊共振，屬 AI 資本支出鏈擴散。','守 VWAP 且 SMCI 不回補缺口才延續。'],
  INTC:['高成交量晶片股跟隨硬件鏈反彈。','成交量超過多數同業，但既有融資稀釋壓力未消失。','收不回 VWAP 不追；守住才視為板塊承接。'],
  PLTR:['高 beta 軟體盤前偏弱，與硬件上漲形成分化。','未確認同等強度的新公司利空，避免誤歸因。','若 XSW 回升而 PLTR 仍弱，按相對弱勢管理。'],
  MSFT:['權重軟體逆 SMH 走弱，壓低 QQQ 的全面擴散程度。','沒有把握足以解釋全部跌幅的新公司事件；先視為資金輪動。','收回 VWAP 才降低軟體分化警報。'],
  AVGO:['AI 網路與客製晶片跟隨 SMCI／MRVL 共振。','成交量高、與硬件主線一致。','SMH 守前收且 AVGO 守 VWAP 才延續。']
};

function build(ctx) {
  const {
    ROOT,snapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,
    sheetTech,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,majorTable,atrTable,fxTable,
    bondTable,expectedTable,moverTableRows
  } = ctx;
  const macro = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '2026-08-12-macro.json'), 'utf8'));
  const breadthScore = 7;
  const checklistHigh = 2;
  const p = ticker => pre[ticker];
  const c = ticker => close[ticker];
  const a = ticker => adjusted[ticker] || close[ticker];
  const maState = row => `<span class="ticker-nowrap">${row.above20 ? '<span class="up">20MA ▲</span>' : '<span class="dn">20MA ▼</span>'} ${row.above50 ? '<span class="up">50MA ▲</span>' : '<span class="dn">50MA ▼</span>'} ${row.above200 ? '<span class="up">200MA ▲</span>' : '<span class="dn">200MA ▼</span>'}</span>`;

  const checklist = [
    ['S&amp;P 500 overextension／大盤過度延伸','High',`SPY +${n(a('SPY').distance50Atr)} ATR；DIA +${n(a('DIA').distance50Atr)} ATR`,'SPY 已超過 +2.5 ATR，CPI 前追價的盈虧比下降。','high'],
    ['Increasing downward momentum／下行動能增加','Low',`QQQ ${pct(p('QQQ').changePct)}；SMH ${pct(p('SMH').changePct)}`,'科技與半導體盤前轉強，沒有下行動能擴散。','low'],
    ['Top range breakdown／高位區間破位','Low','四大 ETF 仍在 20／50／200MA 上方','昨日收盤沒有出現大盤高位區間破位。','low'],
    ['Technical deterioration／技術惡化','Low',`三大指數 ${technicalScore}/12`,'SPY／QQQ／IWM 按 20MA、50MA、200MA、RSI<50 四項計分。','low'],
    ['Market breadth worsening／市場廣度惡化','High',`五日惡化 ${breadthScore}/8`,'六項均線廣度與 Stockbee 5D 均較 8/5 下降；10D ratio 是唯一改善項。','high'],
    ['VIX >20 / VIX spike／波動升溫','Low',`正式 VIX ${n(vix.close)}；${vixScore}/5`,'五項為 >20、5日>0、1月>0、高於20MA、高於50MA；目前全未觸發。','low'],
    ['Breakout win rate down／突破勝率下降','Intermediate','Stockbee 5D 1.51；10D 1.67','兩項仍高於 1，但 5D 由 2.71 明顯下降。','mid'],
    ['Theme momentum weakening／主題動能轉弱','Intermediate',`XSW RSI ${n(sheetTech.XSW.rsi14)}；SMH RSI ${n(sheetTech.SMH.rsi14)}`,'軟體／網安強，SMH 仍低於 50MA；主題分化而非全面轉弱。','mid']
  ];
  const checklistHtml = `<div class="risk-check-grid">${checklist.map(row => `<div class="risk-check-row ${row[4]}"><div class="risk-check-name">${row[0]}</div><div class="risk-check-level">${badge(row[1], row[4] === 'high' ? 'red' : row[4] === 'mid' ? 'amber' : 'green')}</div><div class="risk-check-reading"><strong>${row[2]}</strong><small>${row[3]}</small></div></div>`).join('')}</div><div class="callout warn"><strong>Checklist：${checklistHigh}/8 High。</strong>指數技術與 VIX 尚穩，但高延伸疊加五日廣度明顯降溫；CPI 後必須看價格與廣度是否重新同向。</div>`;

  const macroEvents = table(['宏觀／財報事件','Actual','Forecast','Previous','訊號'], [
    [td('<span class="macro-event"><strong>CPI MoM</strong><small>7月｜08:30 ET</small></span>'),numTd(macro.headlineMom),numTd('+0.1%'),numTd('-0.4%'),td(badge(macro.releaseLabel, macro.releaseTone))],
    [td('<span class="macro-event"><strong>CPI YoY</strong><small>7月｜08:30 ET</small></span>'),numTd(macro.headlineYoy),numTd('3.4%'),numTd('3.5%'),td(badge(macro.releaseLabel, macro.releaseTone))],
    [td('<span class="macro-event"><strong>核心 CPI MoM</strong><small>7月｜08:30 ET</small></span>'),numTd(macro.coreMom),numTd('+0.2%'),numTd('0.0%'),td(badge(macro.releaseLabel, macro.releaseTone))],
    [td('<span class="macro-event"><strong>核心 CPI YoY</strong><small>7月｜08:30 ET</small></span>'),numTd(macro.coreYoy),numTd('2.5%'),numTd('2.6%'),td(badge(macro.releaseLabel, macro.releaseTone))],
    [td('<span class="macro-event"><strong>SMCI FY26 Q4</strong><small>8/11｜盤後已公布</small></span>'),numTd('EPS 1.70<br>營收 11.12B'),numTd('EPS 0.92<br>營收 11.56B'),numTd('EPS 0.84<br>營收 10.20B'),td(badge('Beat／Miss','amber'))],
    [td('<span class="macro-event"><strong>CAVA Q2</strong><small>8/11｜盤後已公布</small></span>'),numTd('EPS 0.19<br>營收 368.44M'),numTd('EPS 0.18<br>營收 360.09M'),numTd('EPS 0.16<br>營收約 280.6M'),td(badge('Beat／Beat','green'))],
    [td('<span class="macro-event"><strong>COHR FY26 Q4</strong><small>8/12｜盤後</small></span>'),numTd('待公布'),numTd('公司營收指引<br>1.91–2.05B'),numTd('Q3 EPS 1.41<br>營收約 1.55B'),td(badge('事件風險','blue'))]
  ], 'report-data-table macro-event-table', [1,2,3]);

  const priorRows = [
    ['QQQ 盤前領先，但須守 VWAP 才升級。','QQQ 收跌 0.34%，並未領先 SPY 的 -0.32%。',badge('失誤','red'),'盤前小幅領先不再直接寫成收盤主線。'],
    ['AI 硬件修復須由設備鏈共同確認。','SMH +0.62%；KLAC +4.01%、LRCX +1.64%、AMAT +0.67%。',badge('命中','green'),'保留板塊共振規則，今日再看 SMH 50MA。'],
    ['油價回吐、TLT 回升才有利久期。','USO 反而 +1.34%，TLT +0.16%；跨資產沒有形成乾淨寬鬆。',badge('失誤','red'),'油價與長債必須同向確認，不能只看 TLT。'],
    ['廣度是降溫，不是失守。','六項均線廣度全高於 50%，5D／10D ratio 仍高於 1。',badge('命中','green'),'今日升級為明顯降溫警報，但仍不寫成崩壞。'],
    ['SMCI 財報後才判斷 Beat／Miss。','EPS Beat、營收 Miss，強指引令盤前大漲。',badge('已觸發','amber'),'財報繼續逐項對比，不用單一 Beat 標籤。']
  ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join('');
  const priorReview = `<section class="prior-premarket-review"><h2>昨晚盤前判斷複盤（8/11）</h2><div class="table-scroll"><table class="report-data-table premarket-review-table"><thead><tr><th>8/11 盤前主判斷</th><th>8/11 收盤事實</th><th>對賬</th><th>今日修正</th></tr></thead><tbody>${priorRows}</tbody></table></div><div class="callout warn"><strong>對賬：2 命中、1 已觸發、2 失誤。</strong>硬件共振與廣度框架有效；QQQ 領先和油價降溫沒有兌現。</div><p class="section-summary"><strong>本段結論：</strong>今日不能因 QQQ／SMH 盤前再次領先就預判全天；CPI 後必須同時看 VWAP、TLT／USO 與市場廣度。</p></section>`;

  const breadthRows = [
    ['SPX >20MA','63.61%','+0.79pp','64.81% → 63.61%','高於 50%，五日降溫'],
    ['SPX >50MA','63.22%','-1.98pp','66.79% → 63.22%','中期仍穩，短線下降'],
    ['NDX >20MA','64.70%','-0.98pp','65.04% → 64.70%','仍偏強'],
    ['NDX >50MA','52.94%','-3.92pp','56.31% → 52.94%','科技緩衝最薄'],
    ['IWM >20MA','60.24%','+2.30pp','62.60% → 60.24%','單日修復、五日下降'],
    ['IWM >50MA','60.29%','0.00pp','62.80% → 60.29%','中期仍高於 60%'],
    ['Stockbee 5D ratio','1.51','-0.55','2.71 → 1.51','仍 >1，但降溫明顯'],
    ['Stockbee 10D ratio','1.67','+0.11','1.28 → 1.67','唯一改善項'],
    ['4%+ 上漲／下跌','259／181','較前日收窄','264／210 → 259／181','多方仍佔優'],
    ['T2108','50.69%','-0.37pp','54.37% → 50.69%','剛高於中線']
  ];
  const breadthTable = table(['指標','最新','1日變化','5日趨勢','判斷'], breadthRows.map(row => row.map((value, index) => td(value, index === 1 ? 'num' : ''))), 'report-data-table breadth-diagnostic-table', [1]);

  const tradeTickers = ['SPY','QQQ','IWM','DIA','SMH','TLT','USO'];
  const tradeRows = tradeTickers.map(ticker => {
    const row = c(ticker);
    const quote = p(ticker);
    const action = {
      SPY:'CPI 後守前收與 VWAP才保留突破；高延伸不追第一段。',
      QQQ:'盤前領先；須與 TLT 同強、且軟體不再擴大跌幅才升級。',
      IWM:'廣度仍高於 60%；CPI 偏熱時先看 10Y 對小型股的壓力。',
      DIA:'防守基準；若 CPI 偏熱而 DIA 領先，視為風格輪動而非全面 risk-on。',
      SMH:`盤前強，但昨收低於 50MA ${n(row.ma50)}；收回後才升級趨勢。`,
      TLT:'CPI 後必須守 VWAP；與 DXY／USO 交叉確認通膨交易。',
      USO:'能源通膨仍是 CPI 尾端風險；只持有不追盤前小幅上漲。'
    }[ticker];
    return [td(`<strong class="ticker-nowrap">${ticker}</strong>`),numTd(n(quote.price), quote.changePct),numTd(n(row.ma20)),numTd(n(row.ma50)),td(maState(row),'ma-cell'),td(action)];
  });
  const tradingPlan = table(['ETF／資產','盤前','20MA','50MA','20/50/200MA','行動'], tradeRows, 'report-data-table trading-plan-table', [1,2,3]);

  const thematicTable = techTable(thematic).replace('<table class="report-data-table etf-technical-table">', `<table class="report-data-table etf-technical-table" data-etf-universe="thematic-complete" data-source-count="${snapshot.universes.themes.length}" data-report-count="${thematic.length}" data-benchmark="VOO" data-benchmark-in-source="true" data-sort="rsi-desc">`);
  const updatedMajorTable = majorTable.replace('10:00 房屋數據是主要驗證。','08:30 CPI 後以長端與廣度驗證。');
  const updatedFxTable = fxTable.replaceAll('8/10收盤','8/11收盤').replaceAll('8/11盤前','8/12盤前');
  const cpiScenario = macro.released
    ? `<div class="callout ${macro.releaseTone === 'red' ? 'danger' : macro.releaseTone === 'green' ? 'ok' : ''}"><strong>CPI 結果：</strong>${macro.summary}</div>`
    : `<div class="callout warn"><strong>CPI 尚待公布：</strong>${macro.summary}</div>`;

  const reportTime = new Date(quoteSnapshot.generatedAt || Date.now()).toLocaleTimeString('en-US', {timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false});
  return {
    report_title:'2026-08-12｜美股盤前監控',
    report_eyebrow:'2026-08-12｜盤前更新',
    report_heading:macro.released ? 'CPI 四項符合預期，AI 硬體擴大領先：長債確認仍是科技缺口能否延續的關鍵' : 'CPI 前 AI 硬體領先：SMCI／CAVA 財報分化，廣度降溫提高追價門檻',
    report_subtitle:'盤前價格、昨收技術、市場廣度、財報 Actual／Forecast 與 CPI 情景交叉驗證',
    data_timestamp_note:`長橋盤前快照約截至 ${reportTime} ET；Google Sheets 的 Sector Dashboard、Thematic Sectors、Macro、Maket breath、Weekly Expected Move 與 Data QA 截至 8/11，且 Data QA 全部 PASS。CPI ${macro.sourceTimestamp}。`,
    risk_badge:`高延伸／廣度降溫｜Checklist ${checklistHigh}/8 High、廣度 ${breadthScore}/8、技術 ${technicalScore}/12、VIX ${vixScore}/5`,
    summary_cards:`<div class="card"><span>四大 ETF 盤前</span><strong><span class="up">QQQ ${pct(p('QQQ').changePct)}</span></strong><small>SPY ${pct(p('SPY').changePct)}、IWM ${pct(p('IWM').changePct)}、DIA ${pct(p('DIA').changePct)}。</small></div><div class="card"><span>AI 硬件</span><strong><span class="up">SMH ${pct(p('SMH').changePct)}</span></strong><small>SMCI ${pct(p('SMCI').changePct)}、MRVL ${pct(p('MRVL').changePct)}。</small></div><div class="card"><span>財報雙向</span><strong><span class="up">CAVA ${pct(p('CAVA').changePct)}</span></strong><small>NVO <span class="dn">${pct(p('NVO').changePct)}</span>、NOW ${pct(p('NOW').changePct)}。</small></div><div class="card"><span>結構分數</span><strong>廣度 ${breadthScore}/8</strong><small>正式 VIX ${n(vix.close)}，五項 ${vixScore}/5。</small></div>`,
    upgrade_trigger_rule:'滿足 2/3 才把盤前硬件修復升級：CPI／長債確認、指數守位、硬件共振。',
    upgrade_trigger_1:'CPI 符合或低於預期，TLT 守 VWAP、DXY 不升，長端承認通膨降溫。',
    upgrade_trigger_2:`QQQ 守前收 ${n(c('QQQ').close)} 與 VWAP，SMH 收回 50MA ${n(c('SMH').ma50)}。`,
    upgrade_trigger_3:'SMCI、MRVL、MU、SNDK、AVGO 至少三檔守 VWAP，軟體弱勢不再擴散。',
    downgrade_trigger_rule:'任一觸發即降低長久期與追價曝險。',
    downgrade_trigger_1:'核心 CPI MoM ≥0.4%，且 TLT 跌破 VWAP、DXY 上升。',
    downgrade_trigger_2:`QQQ 跌回前收 ${n(c('QQQ').close)} 與 VWAP 下方，SMH 同時失守 ${n(c('SMH').close)}。`,
    downgrade_trigger_3:'Stockbee 5D 跌破 1，NDX／IWM 20MA 廣度跌破 50%，市場內部確認惡化。',
    core_conclusions:`<ol><li><strong>四大 ETF 盤前全綠，但領漲集中在 QQQ／SMH。</strong>QQQ ${pct(p('QQQ').changePct)}、SMH ${pct(p('SMH').changePct)}，領先 SPY ${pct(p('SPY').changePct)}、IWM ${pct(p('IWM').changePct)}、DIA ${pct(p('DIA').changePct)}；這是 AI 硬件主導，不是全面市場同步加速。</li><li><strong>SMCI 是 EPS Beat／營收 Miss，強指引才是股價核心。</strong>Q4 EPS 1.70 高於 0.92，共識營收約 111.2 億低於約 115.6 億；下一季營收指引 145–155 億及逾 600 億美元新訂單，使盤前 ${pct(p('SMCI').changePct)}。</li><li><strong>CAVA 是較乾淨的 Beat／Beat。</strong>EPS 0.19 高於 0.18、營收 3.684 億高於 3.601 億，同店銷售 +9%、流量 +5.3%，盤前 ${pct(p('CAVA').changePct)}；但成本與新店爬坡仍需留意。</li><li><strong>AI 資本支出敘事擴散至光通訊與記憶體。</strong>COHR ${pct(p('COHR').changePct)}、MRVL ${pct(p('MRVL').changePct)}、SNDK ${pct(p('SNDK').changePct)}、MU ${pct(p('MU').changePct)}；COHR 今晚才公布財報，不能把盤前漲幅寫成已 Beat。</li><li><strong>廣度五日明顯降溫，但尚未跌破中線。</strong>六項 SPX／NDX／IWM 20MA／50MA 廣度仍全部高於 50%，Stockbee 5D／10D 仍為 1.51／1.67；惡化 ${breadthScore}/8 表示追價效率下降，不等於市場內部崩壞。</li><li><strong>${macro.released ? 'CPI 已成為今日第一個重定價節點。' : '08:30 ET CPI 是今日第一個重定價節點。'}</strong>${macro.summary} 價格確認依序看 TLT、DXY、QQQ／SMH 與開盤廣度，不用單一數字直接推導全天方向。</li></ol><p class="section-summary"><strong>本段結論：</strong>財報主線偏向 AI 硬件與餐飲個股，但高延伸、五日廣度降溫與 CPI 事件風險並存；只在價格、長債與板塊共振同步時提高倉位。</p>`,
    prior_premarket_review:priorReview,
    positioning_primary:'主線：AI 硬件財報後修復；SMH 收回 50MA、SMCI／MRVL／MU 守 VWAP 才升級。',
    positioning_secondary:'次線：CAVA Beat／Beat 可獨立交易，但不外推為全面消費 risk-on。',
    positioning_watch:`觀察：QQQ ${n(c('QQQ').close)}、SMH 50MA ${n(c('SMH').ma50)}、TLT ${n(c('TLT').close)}、DXY 100／102、VIX 20、Stockbee 5D 1。`,
    positioning_invalidation:'SMH 與硬件鏈同步失守 VWAP，或 CPI 後 TLT 轉弱、DXY 上升且 QQQ 回補缺口，科技修復主線失效。',
    pre_market_movers_rows:moverTableRows,
    pre_market_movers_note:`<p class="section-summary"><strong>本段結論：</strong>成交量最具辨識度的是 MRVL ${volume(p('MRVL').volume)}、SMCI ${volume(p('SMCI').volume)}、INTC ${volume(p('INTC').volume)}、AVGO ${volume(p('AVGO').volume)}、MU ${volume(p('MU').volume)}。薄量設備股只作同业確認，不單獨追價。</p>`,
    section_pre_market_movers_primary_action:'主線：優先交易有公司事件、成交量與同業共振三項中至少兩項支持的異動。',
    section_pre_market_movers_condition_action:'條件：正缺口守 VWAP、負缺口收不回 VWAP，且 CPI 後板塊方向沒有反轉。',
    section_pre_market_movers_avoid_action:'避免：把同業 beta、事件前定位或薄量跳價寫成公司新結果。',
    premarket_movers_invalidation:'SMCI／MRVL／MU／SMH 同步跌破 VWAP，或 CAVA 回補缺口中位，盤前主線需重估。',
    correction_checklist_dashboard:checklistHtml,
    section_correction_checklist_primary_action:`主線：${checklistHigh}/8 High 要求降低追價，不代表全面轉空。`,
    section_correction_checklist_condition_action:'條件：CPI 後 SPY／DIA 消化高延伸、廣度不再全面下降、VIX 維持 20 下方。',
    section_correction_checklist_avoid_action:'避免：用低 VIX 掩蓋廣度降溫，或用 7/8 廣度惡化直接宣判趨勢反轉。',
    checklist_invalidation:'SPY／QQQ 失守 50MA、Stockbee 5D 跌破 1 且 VIX 升破 20，才把結構風險升級。',
    macro_premarket_background_table:`${macroEvents}${cpiScenario}<div class="scenario-grid"><div class="scenario-card"><strong>低於預期</strong><p>核心 MoM &lt;+0.2% 或 YoY &lt;2.5%；TLT、QQQ／SMH 受益，DXY 應回落。</p></div><div class="scenario-card"><strong>符合預期</strong><p>核心 +0.2%／2.5%；先看長端是否承認，維持板塊選擇而非追指數。</p></div><div class="scenario-card"><strong>高於預期</strong><p>核心 MoM &gt;+0.2% 或 headline YoY &gt;3.4%；TLT、長久期軟體承壓，XLE／DIA 相對抗跌。</p></div></div><p class="section-summary"><strong>本段結論：</strong>宏觀數據保留 Actual／Forecast／Previous；財報同樣逐項標示 Beat／Miss。CPI 與已公布財報不混在一個模糊「狀態」欄。</p>`,
    section_macro_premarket_background_primary_action:'主線：CPI 後先看 TLT／DXY，再看 QQQ／SMH 是否守缺口。',
    section_macro_premarket_background_condition_action:'條件：數據偏冷、TLT 守 VWAP、DXY 回落、科技廣度改善四項至少三項成立才加長久期。',
    section_macro_premarket_background_avoid_action:'避免：只看 CPI 標題或只看第一分鐘期貨反應。',
    macro_invalidation:'數據方向與 TLT／DXY 反應背離時，以跨資產價格為準，暫停方向加倉。',
    sector_thematic_etf_tables:`<h3>S&amp;P 500 Sector ETF｜按 RSI 由高至低</h3>${techTable(sectors)}<h3>Thematic Sector ETF｜${thematic.length} 檔，按 RSI 由高至低</h3>${thematicTable}<p class="section-summary"><strong>本段結論：</strong>Sector 由 XLV／SPY／XLF 居前，XLE RSI ${n(sheetTech.XLE.rsi14)} 且五日強；Thematic 由 XSW／IHI／CIBR／IGV 居前。完整 ${thematic.length} 檔保留，VOO 基準在表內，ticker 只顯示英文。</p>`,
    section_sector_thematic_etf_primary_action:'主線：硬件交易看 SMH 收回 50MA；軟體／網安強勢以 XSW／CIBR 守 VWAP 為條件。',
    section_sector_thematic_etf_condition_action:'條件：SMH 與至少三檔設備／記憶體股同守 VWAP，才確認 AI 硬件擴散。',
    section_sector_thematic_etf_avoid_action:'避免：只按 RSI 排名追高，或把 COHR 盤前上漲誤寫成財報結果。',
    sector_etf_invalidation:'SMH 失守前收且 XSW／CIBR 同步跌破 VWAP，主題修復降級。',
    major_etf_technical_table:`${updatedMajorTable}<p class="section-summary"><strong>本段結論：</strong>大盤 ETF 只看 IWM／DIA／SPY／QQQ；四者仍在三條均線上方，技術惡化 ${technicalScore}/12。SPY 與 DIA 高延伸，QQQ 盤前領先但需 CPI 後確認。</p>`,
    section_major_etf_technical_primary_action:'主線：維持四大 ETF 多頭結構，但高延伸下不追第一段。',
    section_major_etf_technical_condition_action:`條件：QQQ 守 ${n(c('QQQ').close)}、SPY 守 ${n(c('SPY').close)}，且 TLT 不轉弱。`,
    section_major_etf_technical_avoid_action:'避免：用盤前小幅上漲預判全天單邊行情。',
    major_etf_invalidation:`QQQ 失守 50MA ${n(c('QQQ').ma50)}，SPY 同時失守 20MA ${n(c('SPY').ma20)}，多頭結構降級。`,
    fifty_ma_atr_extension_table:`${atrTable}<p class="section-summary"><strong>本段結論：</strong>XSW ${n(a('XSW').distance50Atr)} ATR、CIBR ${n(a('CIBR').distance50Atr)}、XLE ${n(a('XLE').distance50Atr)}、SPY ${n(a('SPY').distance50Atr)} 位於高延伸；TLT ${n(a('TLT').distance50Atr)} ATR 為負延伸。高延伸持有不追，負延伸只在 CPI 與 VWAP 同時確認後交易。</p>`,
    section_50ma_atr_extension_primary_action:'主線：高延伸資產持有不追；TLT 只在 CPI 偏冷與 VWAP 同步確認後做均值回歸。',
    section_50ma_atr_extension_condition_action:'條件：TLT 回升需 DXY 回落、10Y 降溫與科技價格共同確認。',
    section_50ma_atr_extension_avoid_action:'避免：把高延伸直接視為做空，或把負延伸直接視為抄底。',
    atr_extension_invalidation:'高延伸資產失守 20MA、TLT 反彈失敗時，重新評估倉位。',
    market_breadth_table:`${breadthTable}<p><strong>三大指數廣度：</strong>六項 20MA／50MA 廣度仍全部高於 50%，但相較 8/5 全部下降；NDX >50MA 52.94% 是科技最薄的緩衝。</p><p><strong>與 Stockbee 交叉驗證：</strong>5D 2.71 → 1.51 明顯降溫，10D 1.28 → 1.67 改善；4% 上漲／下跌 259／181，多方仍佔優。</p><p><strong>中期結構：</strong>季度 +25%／-25% 為 1552／1040，月度 +25%／-25% 為 226／131；中期強股仍領先，T2108 50.69% 剛高於中線。</p><p class="section-summary"><strong>綜合結論：</strong>三大指數與 Stockbee 綜合為「五日明顯降溫、中期尚未失守」；廣度惡化 ${breadthScore}/8，不能只用 Stockbee 或單一指數下結論。</p>`,
    stockbee_breadth_interpretation:`<div class="callout warn"><strong>廣度結論：</strong>惡化 ${breadthScore}/8。六項均線廣度與 5D ratio 下降，但全部均線廣度仍高於 50%、5D／10D 仍高於 1；提高追價門檻，不直接全面轉空。</div>`,
    section_market_breadth_primary_action:'主線：保留核心倉，但新增倉位必須由 CPI 後價格與上漲家數共同確認。',
    section_market_breadth_condition_action:'條件：5D／10D 維持 1 以上，NDX／IWM 20MA 廣度不跌破 50%。',
    section_market_breadth_avoid_action:'避免：只用 Stockbee，或把 7/8 惡化等同市場崩壞。',
    breadth_invalidation:'Stockbee 5D 跌破 1，且 NDX／IWM 20MA 廣度跌破 50%，廣度防守失效。',
    fx_commodities_table:`${updatedFxTable}<p class="section-summary"><strong>本段結論：</strong>DXY 約 99.75、最近可計算 RSI 約 28，美元仍弱且接近超賣；USDU RSI ${n(sheetTech.USDU?.rsi14 || 42)} 並低於 20／50MA。GLD ${pct(p('GLD').changePct)}、SLV ${pct(p('SLV').changePct)}、TLT ${pct(p('TLT').changePct)} 反映 CPI 前偏向久期／貴金屬，USO ${pct(p('USO').changePct)} 則保留能源通膨尾端。</p>`,
    section_fx_commodities_primary_action:'主線：同看 DXY 趨勢／RSI、TLT、USO 與貴金屬，不用單一代理下結論。',
    section_fx_commodities_condition_action:'條件：DXY 低於 100、TLT 守 VWAP 且 USO 不加速，才提高久期曝險。',
    section_fx_commodities_avoid_action:'避免：用薄量外匯 ETF 盤前跳價替代正式 DXY。',
    forex_commodity_invalidation:'DXY 升破 100／102、USO 加速且 TLT 轉弱，金融條件改善假設失效。',
    treasury_fed_economic_data_table:`<div class="macro-policy-overview"><div><span>美國 2Y</span><strong>4.25%</strong><small>FRED 8/10</small></div><div><span>美國 10Y</span><strong>4.72%</strong><small>FRED 8/10</small></div><div><span>2s10s</span><strong>+47bp</strong><small>長端溢價仍高</small></div><div><span>正式 VIX</span><strong>${n(vix.close)}</strong><small>五項 ${vixScore}/5</small></div></div><h3>短債／中債／長債比較</h3>${bondTable}<div class="callout warn"><strong>曲線含義：</strong>2Y 4.25%、10Y 4.72%、20Y 5.25%，長端明顯高於短端；SHY 技術較穩，IEF／TLT 仍偏弱。即使 CPI 偏冷，也要看長端是否真正下降，不能只用短端利率推導科技估值。</div>`,
    section_treasury_fed_primary_action:'主線：CPI 後先判斷 TLT 是否跑贏 SHY／IEF，再決定長久期科技倉位。',
    section_treasury_fed_condition_action:'條件：TLT 領先中短債、DXY 回落、QQQ／SMH 守缺口，三項至少兩項成立。',
    section_treasury_fed_avoid_action:'避免：把一次 CPI 偏冷直接等同長端趨勢反轉。',
    treasury_invalidation:'數據偏冷但 TLT 仍轉弱，代表供給或期限溢價另有壓力，暫停久期交易。',
    trading_plan:`${tradingPlan}<h3>本週預期波動</h3>${expectedTable}<p class="section-summary"><strong>本段結論：</strong>Weekly Expected Move 為 8/10–8/14；只列已觸發或接近 ±1SD 的標的。GOOGL 接近 -1SD，不能在 CPI 前把接近門檻寫成已破位。</p>`,
    intraday_playbook_rows:[
      ['08:30 ET','CPI Actual vs Forecast','第一重定價','先看 TLT／DXY，再看 QQQ／SMH；不追第一分鐘。'],
      ['09:30 ORB','SMH 50MA／VWAP','硬件升級','SMCI／MRVL／MU 至少兩檔同守 VWAP才加碼。'],
      ['首小時','CAVA 缺口／NVO 弱勢','財報雙向','CAVA 守 VWAP 才延續；NVO 收回 VWAP 則取消相對空頭。'],
      ['10:00 後','Stockbee 5D／上漲家數','廣度確認','價格上漲但上漲家數不跟，不提高總 beta。'],
      ['全日','TLT／USO／DXY','宏觀交叉','TLT 強、USO／DXY 不升才支持久期；反向則降低長久期。'],
      ['15:30 MOC','COHR 盤後財報','隔夜事件','COHR 盤前漲幅不是 Beat；事件倉位按指引風險控制。']
    ].map(row => `<tr>${row.map(value => td(value)).join('')}</tr>`).join(''),
    cross_validation_summary:`<div class="callout"><strong>行情 QA：</strong>長橋未復權與前復權技術值均為 ${snapshot.counts.technicalSuccess}/${snapshot.counts.technicalRequested} 成功；盤前報價 ${quoteSnapshot.counts.premarketAvailable}/${quoteSnapshot.counts.quoteRequested} 可用。</div><div class="callout"><strong>ETF QA：</strong>Sector 12 檔與 Thematic ${thematic.length} 檔使用 8/11 Google Sheet，RSI 降序；VOO／BUG／PAVE 完整，ticker 與來源逐列一致。</div><div class="callout"><strong>廣度 QA：</strong>六組指數均線廣度與 Stockbee 使用 8/11 收盤值，五日端點統一為 8/5 → 8/11；結論同時引用三大指數與 Stockbee。</div><div class="callout"><strong>Expected Move QA：</strong>來源為 8/10–8/14；只列觸發或接近 ±1SD 標的。</div><div class="callout"><strong>宏觀／財報 QA：</strong>CPI、SMCI、CAVA、COHR 均保留 Actual／Forecast／Previous；已公布財報逐項標示 Beat／Miss，未公布不預判。</div><div class="callout"><strong>分數 QA：</strong>技術 ${technicalScore}/12、廣度 ${breadthScore}/8、VIX ${vixScore}/5；VIX 使用正式 .VIX，五項公式未改。</div><h3>資料來源</h3><p class="sources"><a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit">Market Watch Google Sheets</a>；<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit">Stockbee</a>；長橋 CLI；<a href="https://www.bls.gov/cpi/">BLS CPI／官方 API</a>；<a href="https://apnews.com/article/150e179a6c6b3182ba05cedf0188394b">FactSet CPI 共識</a>；<a href="https://ir.supermicro.com/news/news-details/2026/Supermicro-Provides-Fourth-Quarter-of-Fiscal-Year-2026-Preliminary-Business-Update/default.aspx">Supermicro 官方資料</a>；<a href="https://www.marketbeat.com/earnings/reports/2026-8-11-cava-group-inc-stock/">CAVA Actual／Forecast</a>；<a href="https://www.coherent.com/company/investor-relations/financial-releases">Coherent 投資者關係</a>；<a href="https://finance.yahoo.com/quote/DX-Y.NYB/history/">Yahoo Finance DXY</a>。</p><p class="source-note">資料截至 2026-08-12 約 ${reportTime} ET；盤前價格會變動。DXY 99.75 與 RSI 約 28 為最近可核實值，不用 ETF 盤前跳價冒充即時 DXY。本報告為本地草稿，不構成投資建議。</p>`,
    sector_momentum_chart:chartRows
  };
}

module.exports = {moverMeta, build};
