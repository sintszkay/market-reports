"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const work = path.resolve(root, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function number(value) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[%+,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function fixed(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function moveClass(value) {
  return value > 0 ? "up" : value < 0 ? "dn" : "";
}

function compactVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric >= 10000) return `${(numeric / 10000).toFixed(1)}萬股`;
  return `${Math.round(numeric).toLocaleString("en-US")}股`;
}

function rowMap(rows) {
  return new Map(rows.map((row) => [row.ticker, row]));
}

function normalizeTechnical(row) {
  if (!row) return null;
  return {
    ticker: row.ticker,
    asOf: row.asOf,
    close: number(row.close),
    dailyPct: number(row.dailyPct),
    fiveDayPct: number(row.fiveDayPct),
    oneMonthPct: number(row.oneMonthPct),
    ma20: number(row.ma20),
    ma50: number(row.ma50),
    ma200: number(row.ma200),
    above20: row.above20 ?? row.aboveMa20,
    above50: row.above50 ?? row.aboveMa50,
    above200: row.above200 ?? row.aboveMa200,
    rsi14: number(row.rsi14),
    atr14: number(row.atr14),
    extension50Atr: number(row.extension50Atr),
  };
}

function maStates(row) {
  return [
    ["20", row.above20],
    ["50", row.above50],
    ["200", row.above200],
  ].map(([period, isUp]) => {
    const stateClass = isUp ? "ma-up" : "ma-down";
    const arrow = isUp ? "▲" : "▼";
    return `<span class="ma-state ${stateClass}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${arrow}</span></span>`;
  }).join("");
}

function etfRow(row, judgment) {
  return `<tr><td class="etf-symbol"><strong>${row.ticker}</strong></td>` +
    `<td class="etf-momentum-cell"><div class="etf-momentum">` +
    `<span><strong class="${moveClass(row.dailyPct)}">${signed(row.dailyPct)}</strong></span>` +
    `<span><strong class="${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</strong></span>` +
    `<span><strong class="${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</strong></span>` +
    `</div></td><td class="ma-cell">${maStates(row)}</td>` +
    `<td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td>` +
    `<td class="etf-judgment">${judgment}</td></tr>`;
}

function etfGroup(rows, title, judgments, split = false) {
  const sorted = [...rows].sort((left, right) => right.rsi14 - left.rsi14);
  const leader = [...rows].sort((left, right) => right.oneMonthPct - left.oneMonthPct)[0];
  const laggard = [...rows].sort((left, right) => left.oneMonthPct - right.oneMonthPct)[0];
  const above20 = rows.filter((row) => row.above20).length;
  const head = `<div class="etf-group"><div class="etf-group-head"><div class="etf-group-title"><small>${rows.length} 檔 ETF</small><h3>${title}</h3></div>` +
    `<div class="etf-group-stats"><div><span>1月領先</span><strong class="up">${leader.ticker} ${signed(leader.oneMonthPct)}</strong></div>` +
    `<div><span>1月落後</span><strong class="dn">${laggard.ticker} ${signed(laggard.oneMonthPct)}</strong></div>` +
    `<div><span>20MA 上方</span><strong>${above20}/${rows.length}</strong></div></div></div>`;
  const tableHead = `<div class="table-scroll etf-table-scroll"><table class="etf-overview-table report-data-table report-cols-5"><thead><tr>` +
    `<th>ETF</th><th class="etf-momentum-head"><span>動能</span><div><small>1日</small><small>5日</small><small>1月</small></div></th>` +
    `<th class="ma-heading">20/50/200MA</th><th class="num">RSI</th><th>判斷</th></tr></thead>`;
  if (!split) {
    return `${head}${tableHead}<tbody>${sorted.map((row) => etfRow(row, judgments[row.ticker] || "以均線與 RSI 判斷。")).join("")}</tbody></table></div></div>`;
  }
  const positive = sorted.filter((row) => row.oneMonthPct >= 0);
  const negative = sorted.filter((row) => row.oneMonthPct < 0);
  return `${head}<div class="etf-subhead"><span>1月正報酬／相對強勢</span><strong>${positive.length} 檔</strong></div>` +
    `${tableHead}<tbody>${positive.map((row) => etfRow(row, judgments[row.ticker] || "月線相對強，仍需價格確認。")).join("")}</tbody></table></div>` +
    `<div class="etf-subhead"><span>1月負報酬／修復觀察</span><strong>${negative.length} 檔</strong></div>` +
    `${tableHead}<tbody>${negative.map((row) => etfRow(row, judgments[row.ticker] || "月線偏弱，反彈先視為修復。")).join("")}</tbody></table></div></div>`;
}

function momentumChart(rows) {
  const ordered = [...rows].sort((left, right) => right.oneMonthPct - left.oneMonthPct);
  const selected = [...ordered.slice(0, 4), ...ordered.slice(-4)];
  const maxPositive = Math.max(0, ...selected.map((row) => row.oneMonthPct));
  const maxNegative = Math.max(0, ...selected.map((row) => -row.oneMonthPct));
  const total = maxPositive + maxNegative || 1;
  const zero = (maxNegative / total) * 100;
  return selected.map((row) => {
    const positive = row.oneMonthPct >= 0;
    const width = Math.abs(row.oneMonthPct) / total * 100;
    return `<div class="bar-row"><span class="lbl">${row.ticker}</span><span class="val ${positive ? "pos" : "neg"}">${signed(row.oneMonthPct)}</span>` +
      `<span class="bar-track" style="--zero:${zero.toFixed(2)}%"><span class="b ${positive ? "pos" : "neg"}" style="width:${width.toFixed(2)}%"></span></span></div>`;
  }).join("");
}

function riskCheckRow(level, name, reading, note = "") {
  const label = level === "high" ? "High" : level === "mid" ? "Intermediate" : "Low";
  const badge = level === "high" ? "red" : level === "mid" ? "amber" : "blue";
  return `<div class="risk-check-row ${level}"><div class="risk-check-name">${name}</div>` +
    `<div class="risk-check-level"><span class="badge ${badge}">${label}</span></div>` +
    `<div class="risk-check-reading"><strong>${reading}</strong>${note ? `<small>${note}</small>` : ""}</div></div>`;
}

function macroRow(event, actual, forecast, previous, badge, badgeClass, policy, market, time, options = {}) {
  const actualMissing = options.actualMissing ? " data-allow-missing" : "";
  const forecastMissing = options.forecastMissing ? " data-allow-missing" : "";
  const previousMissing = options.previousMissing ? " data-allow-missing" : "";
  const gridClass = options.wideForecast ? " macro-data-grid--wide-forecast" : "";
  return `<tr><td class="macro-event"><strong>${event}</strong><small>${time}</small></td><td><div class="macro-data-grid${gridClass}">` +
    `<span${actualMissing}><small>Actual</small><strong>${actual}</strong></span>` +
    `<span${forecastMissing}><small>Forecast</small><strong>${forecast}</strong></span>` +
    `<span${previousMissing}><small>Previous</small><strong>${previous}</strong></span></div></td>` +
    `<td class="macro-signal"><span class="badge ${badgeClass}">${badge}</span></td>` +
    `<td class="macro-policy-copy">${policy}</td><td class="macro-market-copy">${market}</td></tr>`;
}

const snapshot = readJson(path.join(work, "postmarket_snapshot_2026-07-24.json"));
const thematicSnapshot = readJson(path.join(work, "thematic_rsi_longport.json"));
const quotes = readJson(path.join(work, "premarket_quotes_0727.json"));
const scan = readJson(path.join(work, "premarket_movers_0727.json"));
const technical = rowMap(snapshot.rows.map(normalizeTechnical));
const thematicTechnical = rowMap(thematicSnapshot.rows.map(normalizeTechnical));
const quoteByTicker = rowMap(quotes);
const scanByTicker = rowMap(scan);

const supplement = new Map([
  ["AAL", { ticker: "AAL", price: 15.04, prevClose: 14.475, changePct: 3.9033, volume: 896098 }],
  ["UAL", { ticker: "UAL", price: 122.449, prevClose: 118.27, changePct: 3.5332, volume: 12253 }],
  ["CCL", { ticker: "CCL", price: 27.085, prevClose: 26.33, changePct: 2.8675, volume: 58901 }],
  ["OXY", { ticker: "OXY", price: 55.439, prevClose: 57.30, changePct: -3.248, volume: 58890 }],
  ["RSP", { ticker: "RSP", price: 214.595, prevClose: 213.57, changePct: 0.4799, volume: 4741 }],
  ["QQQE", { ticker: "QQQE", price: 115.74, prevClose: 115.41, changePct: 0.2860, volume: 3 }],
]);

function currentQuote(ticker) {
  return quoteByTicker.get(ticker) || scanByTicker.get(ticker) || supplement.get(ticker);
}

function currentPrice(ticker) {
  return number(currentQuote(ticker)?.price);
}

function currentMove(ticker) {
  return number(currentQuote(ticker)?.changePct);
}

function currentVolume(ticker) {
  return number(currentQuote(ticker)?.volume);
}

const sectorTickers = ["XLE", "XLV", "XLF", "XLRE", "XLU", "XLP", "XLI", "XLC", "XLB", "XLY", "XLK", "SPY"];
const thematicTickers = ["USO", "XOP", "IBIT", "CPER", "KRE", "SPY", "CIBR", "IBB", "IHI", "XBI", "WGMI", "COPX", "SMH", "GLD", "AIQ", "URA", "SLV", "TAN", "XHB", "ARKK", "ITB", "IGV", "LIT", "UFO"];

const sectorRows = sectorTickers.map((ticker) => technical.get(ticker)).filter(Boolean);
const thematicRows = thematicTickers.map((ticker) => thematicTechnical.get(ticker) || technical.get(ticker)).filter(Boolean);

if (sectorRows.length !== 12) throw new Error(`S&P 500 Sector ETF 預期 12 檔，實際 ${sectorRows.length}`);
if (thematicRows.length !== 24 || thematicRows.filter((row) => row.ticker === "SPY").length !== 1) {
  throw new Error(`Thematic ETF 預期 24 檔並含 SPY 一次，實際 ${thematicRows.length}`);
}
if (![...sectorRows, ...thematicRows].every((row) => row.asOf === "2026-07-24")) {
  throw new Error("ETF 技術資料不是 2026-07-24 完整日線");
}

const sectorJudgments = {
  XLE: "油價急跌使能源盤前承壓；持有但不追價。",
  XLV: "醫療相對防守，RSI 中性。",
  XLF: "金融仍守主要均線，留意 2 年期標售。",
  XLRE: "利率回落提供緩衝，需守 20MA。",
  XLU: "防守結構完整，但風險偏好回升限制彈性。",
  XLP: "必需消費穩定，屬低 beta 緩衝。",
  XLI: "接近週度 +1SD，追價需等開盤確認。",
  XLC: "大型平台股財報前，反彈仍屬事件前定價。",
  XLB: "銅價偏強，但能源急跌使商品訊號分化。",
  XLY: "油價回落有利消費，但技術仍偏弱。",
  XLK: "盤前反彈，完整日線仍低於 20/50MA。",
  SPY: "基準反彈至 50MA 附近，20MA 尚未收復。",
};

const thematicJudgments = {
  USO: "盤前跌逾 6%，地緣溢價快速回吐。",
  XOP: "油氣勘探受原油急跌直接壓制。",
  IBIT: "風險偏好回升，但仍低於 50/200MA。",
  CPER: "月線偏強，短線受成長預期支撐。",
  KRE: "小型金融受利率與風險偏好共同影響。",
  SPY: "基準只收復 50MA 附近，尚未站回 20MA。",
  CIBR: "網安相對抗跌，等待財報擴散。",
  IBB: "生技保持中性，未參與高 beta 主升。",
  IHI: "醫療器材相對穩定，屬防守輪動。",
  XBI: "高 beta 生技反彈需成交量確認。",
  WGMI: "礦股高波動，反彈仍先視為修復。",
  COPX: "銅礦月線偏強，但不代表全面商品 risk-on。",
  SMH: "盤前反彈，月線仍深度負報酬。",
  GLD: "金價反彈，但三條主要均線仍偏弱。",
  AIQ: "AI 主題未收復關鍵均線。",
  URA: "鈾礦月線偏弱，等待趨勢修復。",
  SLV: "白銀反彈，仍低於 20/50/200MA。",
  TAN: "太陽能弱勢結構未改。",
  XHB: "利率回落有利房屋股，但需開盤確認。",
  ARKK: "高 beta 反彈不等同趨勢反轉。",
  ITB: "房屋股受債券反彈支撐。",
  IGV: "軟體財報週前反彈，仍需價格確認。",
  LIT: "鋰電主題維持弱勢，反彈不追。",
  UFO: "太空主題高 beta，先看 VWAP。",
};

const moverSpecs = [
  ["AAL", "油價急跌改善燃油成本預期", "航空與消費服務受益", "成交量最具代表性；守住 VWAP 才延續。"],
  ["UAL", "油價急跌改善燃油成本預期", "航空股同步反彈", "成交量較低，與 AAL 同向才有確認力。"],
  ["COP", "美國與伊朗暫停攻擊，油價回落", "能源勘探股承壓", "若 USO 未收復 130，能源先低於基準。"],
  ["OXY", "原油地緣溢價快速回吐", "高油價敏感能源股下跌", "盤前跌幅與成交量同步，先不抄底。"],
  ["XOM", "油價與通膨風險同步降溫", "大型能源權重拖累 XLE", "未收回 VWAP 前按板塊去風險處理。"],
  ["CVX", "油價急跌壓低上游盈利預期", "能源巨頭同步承壓", "與 XOM 同向，屬於板塊訊號。"],
  ["MRVL", "地緣風險緩和帶動晶片 beta 反彈", "AI／網通晶片修復", "成交活躍；需與 SMH 同時守 VWAP。"],
  ["KLAC", "晶片設備鏈隨風險偏好回升", "設備鏈同步修復", "未收回 20MA 前只按反彈交易。"],
  ["AMAT", "晶片設備鏈廣泛反彈", "支持 SMH 盤前修復", "開盤後守住 VWAP 才可提高倉位。"],
  ["SNDK", "記憶體高 beta 隨科技反彈", "記憶體鏈領漲", "成交量高；避免在 20MA 下方追價。"],
  ["LRCX", "設備鏈隨晶片板塊回升", "半導體資本開支主題改善", "需與 KLAC／AMAT 同步確認。"],
  ["CCL", "油價下跌降低郵輪燃料成本", "旅遊與郵輪獲得成本利多", "成交量足夠，守 VWAP 才延續。"],
  ["ORCL", "企業軟體隨大型科技風險偏好回升", "軟體與雲端修復", "不外推為整個軟體板塊趨勢反轉。"],
  ["CRCL", "風險資產反彈帶動加密支付", "加密交易鏈回暖", "高 beta，只適合確認後的短線交易。"],
  ["COIN", "加密資產風險偏好回升", "交易平台與 IBIT 同步", "若 IBIT 轉弱，COIN 反彈可信度下降。"],
  ["AMD", "晶片板塊隨油價與利率壓力緩和", "高 beta 晶片修復", "仍低於主要均線，先看開盤區間。"],
  ["ARM", "AI 晶片授權鏈跟隨反彈", "高 beta 科技回升", "未收復 20MA 前不追價。"],
  ["AVGO", "大型 AI 權重隨 Nasdaq 反彈", "為 QQQ／SMH 提供支撐", "需與 NVDA 同向並守住 VWAP。"],
];

const preMarketMovers = moverSpecs.map(([ticker, catalyst, readThrough, judgment]) => {
  const quote = currentQuote(ticker);
  if (!quote) throw new Error(`缺少 ${ticker} 盤前報價`);
  return {
    ticker,
    price: fixed(number(quote.price), number(quote.price) >= 100 ? 2 : 3),
    premarket_change: signed(number(quote.changePct)),
    catalyst: `${catalyst}；${compactVolume(quote.volume)}`,
    read_through: readThrough,
    judgment,
  };
});

const breadthRows = parseCsv(fs.readFileSync(path.join(work, "breadth_0727.csv"), "utf8"));
const breadthLatest = breadthRows.find((row) => row[0] === "2026-07-24");
const breadthFive = breadthRows.find((row) => row[0] === "2026-07-17");
if (!breadthLatest || !breadthFive) throw new Error("Market Breath 缺少 7/24 或 7/17");
const b = {
  spx20: number(breadthLatest[1]), spx50: number(breadthLatest[2]),
  ndx20: number(breadthLatest[3]), ndx50: number(breadthLatest[4]),
  iwm20: number(breadthLatest[5]), iwm50: number(breadthLatest[6]),
};
const b5 = {
  spx20: number(breadthFive[1]), spx50: number(breadthFive[2]),
  ndx20: number(breadthFive[3]), ndx50: number(breadthFive[4]),
  iwm20: number(breadthFive[5]), iwm50: number(breadthFive[6]),
};

const stockbeeRows = parseCsv(fs.readFileSync(path.join(work, "stockbee_0727.csv"), "utf8"));
const stockLatest = stockbeeRows.find((row) => row[0] === "7/24/2026");
const stockFive = stockbeeRows.find((row) => row[0] === "7/17/2026");
if (!stockLatest || !stockFive) throw new Error("Stockbee 缺少 7/24 或 7/17");
const stock = {
  up4: number(stockLatest[1]), down4: number(stockLatest[2]),
  ratio5: number(stockLatest[3]), ratio10: number(stockLatest[4]),
  quarterUp: number(stockLatest[5]), quarterDown: number(stockLatest[6]),
  day34Up: number(stockLatest[11]), day34Down: number(stockLatest[12]),
  t2108: number(stockLatest[14]),
};
const stock5 = {
  up4: number(stockFive[1]), down4: number(stockFive[2]),
  ratio5: number(stockFive[3]), ratio10: number(stockFive[4]),
  t2108: number(stockFive[14]),
};

const spxScore = Number(b.spx20 < b5.spx20) + Number(b.spx50 < b5.spx50);
const ndxScore = Number(b.ndx20 < b5.ndx20) + Number(b.ndx50 < b5.ndx50);
const t2108Score = Number(stock.t2108 < stock5.t2108);
const stockScore = Number(stock.ratio5 < 1) + Number(stock.ratio10 < 1) + Number(stock.down4 > stock.up4);
const breadthScore = spxScore + ndxScore + t2108Score + stockScore;

const spy = technical.get("SPY");
const qqq = technical.get("QQQ");
const dia = technical.get("DIA");
const smh = technical.get("SMH");
const aiq = technical.get("AIQ");
const vixy = technical.get("VIXY");
const technicalScoreFor = (row) =>
  Number(row.fiveDayPct < 0) + Number(!row.above20) + Number(!row.above50) + Number(row.rsi14 < 50);
const spyScore = technicalScoreFor(spy);
const qqqScore = technicalScoreFor(qqq);
const diaScore = technicalScoreFor(dia);
const technicalScore = spyScore + qqqScore + diaScore;
const vixSpot = 17.59;
const vixComponents = {
  spotGt20: Number(vixSpot > 20),
  fiveDayGt0: Number(vixy.fiveDayPct > 0),
  oneMonthGt0: Number(vixy.oneMonthPct > 0),
  above20ma: Number(vixy.above20),
  above50ma: Number(vixy.above50),
};
const vixScore = Object.values(vixComponents).reduce((sum, value) => sum + value, 0);
const vixRisk = vixScore >= 4
  ? { level: "high", label: "High" }
  : vixScore >= 2
    ? { level: "mid", label: "Intermediate" }
    : { level: "low", label: "Low" };

const checklist = `<div class="risk-overview risk-overview--high"><div class="risk-overview-score"><span>Checklist Score</span>` +
  `<strong>6<small>/8</small></strong><em>High Risk</em></div><div class="risk-overview-body"><div class="risk-meter" aria-hidden="true"><span style="width:75%"></span></div>` +
  `<p><strong>總體判斷：</strong>地緣風險緩和帶動盤前反彈，但技術與五日廣度仍未完成修復。</p>` +
  `<small>High 項目 6 項；油價急跌與 VIX 波動結構為 Low 是利多，但不能取代 20MA 與廣度確認。</small></div></div>` +
  `<div class="risk-checklist" data-vix-scoring="composite-5"><div class="risk-checklist-head"><span>檢查項目</span><span>級別</span><span>判讀</span></div>` +
  riskCheckRow("low", "S&amp;P 500 overextension／大盤過度延伸", `SPY 距 50MA 約 ${spy.extension50Atr.toFixed(2)} ATR，沒有過熱。`) +
  riskCheckRow("high", "Increasing downward momentum／下跌動能增加", `QQQ 5日 ${signed(qqq.fiveDayPct)}、SPY ${signed(spy.fiveDayPct)}；盤前反彈前仍是弱勢動能。`) +
  riskCheckRow("high", "Top range formation &amp; breakdown／高位區間跌破", "SPY、QQQ 與 SMH 的 7/24 收盤仍低於 20MA。") +
  riskCheckRow("high", "Technical indicators deteriorating／技術指標惡化", `三大指數技術惡化分數 ${technicalScore}/12（SPY ${spyScore}/4、QQQ ${qqqScore}/4、DIA ${diaScore}/4）。`, "每個指數按 5日報酬 <0、低於20MA、低於50MA、RSI <50 各計1分；0–3 Low、4–7 Intermediate、8–12 High。") +
  riskCheckRow("high", "Market breadth worsening／市場廣度惡化", `5日廣度惡化分數 ${breadthScore}/8（SPX ${spxScore}/2、NDX ${ndxScore}/2、T2108 ${t2108Score}/1、Stockbee ${stockScore}/3）。`, "SPX／NDX 20/50MA 與 T2108 較5日前下降各計1分；5日 ratio <1、10日 ratio <1、4%下跌家數多於上漲家數各計1分。") +
  riskCheckRow(vixRisk.level, "VIX volatility structure／VIX 波動結構", `VIX 波動分數 ${vixScore}/5（>20 ${vixComponents.spotGt20}/1、5日>0 ${vixComponents.fiveDayGt0}/1、1月>0 ${vixComponents.oneMonthGt0}/1、20MA ${vixComponents.above20ma}/1、50MA ${vixComponents.above50ma}/1）= ${vixRisk.label}。`, `現貨 ${fixed(vixSpot)}；VIXY 5日 ${signed(vixy.fiveDayPct)}、1月 ${signed(vixy.oneMonthPct)}。0–1 Low、2–3 Intermediate、4–5 High。`) +
  riskCheckRow("high", "Breakout win rate down／突破勝率下降", `4%+ 下跌家數 ${stock.down4} 高於上漲家數 ${stock.up4}。`) +
  riskCheckRow("high", "Theme stocks momentum weakening／主題動能轉弱", `SMH 1月 ${signed(smh.oneMonthPct)}、AIQ 1月 ${signed(aiq.oneMonthPct)}，AI 主題仍在降溫。`) +
  `</div><p class="section-summary"><strong>本段結論：</strong>短線修正風險仍高，但 SPY／RSP／DIA 均高於 200MA，尚不等同中期熊市；今天先驗證反彈能否收復 20MA。</p>`;

const macroRows = [
  macroRow("耐用品訂單", "+0.3%", "+2.5%", "-4.0%", "Headline Miss", "red",
    "六月 headline 明顯低於預期，運輸項目波動仍大。", "弱於預期利多債券，但也提醒製造需求不強。", "08:30 ET｜6月"),
  macroRow("扣除運輸耐用品訂單", "+0.6%", "+0.8%", "+1.3%", "小幅 Miss", "amber",
    "核心訂單仍成長，但低於市場預期。", "若 TLT 維持上漲、QQQ 守 VWAP，估值利多可延續。", "08:30 ET｜6月"),
  macroRow("達拉斯聯儲製造業指數", "待公布", "—", "0.0", "盤中驗證", "blue",
    "預測缺乏可靠共識，不能用估算取代 Actual。", "同看工業股與 2 年期殖利率反應。", "10:30 ET｜7月", { actualMissing: true, forecastMissing: true }),
  macroRow("FOMC 利率決議", "待公布", "3.50%–<br>3.75%", "3.50%–<br>3.75%", "本週核心", "amber",
    "會議在 7/28–7/29；市場對是否升息仍有分歧。", "週一反彈不宜忽略週三政策跳空風險。", "7/29 14:00 ET", { actualMissing: true }),
  macroRow("MSFT／META 財報", "待公布", "EPS 4.22／7.21；<br>營收 877億／603億", "—", "待判定", "blue",
    "Actual 未公布，不能先標示 Beat 或 Miss。", "7/29 盤後將直接影響 QQQ、XLK、AI 與廣告鏈。", "7/29 盤後", { actualMissing: true, previousMissing: true, wideForecast: true }),
  macroRow("AAPL／AMZN 財報", "待公布", "EPS 1.89／1.82；<br>營收 1,090億／1,962億", "—", "待判定", "blue",
    "Actual 未公布，Beat／Miss 需逐項按 EPS 與營收對帳。", "7/30 盤後決定大型科技反彈能否擴散。", "7/30 盤後", { actualMissing: true, previousMissing: true, wideForecast: true }),
].join("");

const expectedRows = parseCsv(fs.readFileSync(path.join(work, "expected_0727.csv"), "utf8"))
  .slice(3)
  .filter((row) => /^[A-Z.]+$/.test(row[0] || ""));
const nearExpected = [];
for (const row of expectedRows) {
  const ticker = row[0];
  const price = currentPrice(ticker);
  const upper1 = number(row[3]);
  const upper2 = number(row[4]);
  const lower1 = number(row[5]);
  const lower2 = number(row[6]);
  if (![price, upper1, upper2, lower1, lower2].every(Number.isFinite)) continue;
  let status = "區間內";
  let distance = Math.min(Math.abs(upper1 / price - 1), Math.abs(price / lower1 - 1)) * 100;
  if (price >= upper2) status = "突破 +2SD";
  else if (price >= upper1) status = "突破 +1SD";
  else if (price <= lower2) status = "跌破 -2SD";
  else if (price <= lower1) status = "跌破 -1SD";
  else if (distance <= 1) status = price < (upper1 + lower1) / 2 ? "接近 -1SD" : "接近 +1SD";
  if (status !== "區間內") nearExpected.push({ ticker, price, upper1, upper2, lower1, lower2, status, distance });
}
nearExpected.sort((left, right) => left.distance - right.distance);
const expectedTable = `<h3>每週預期波幅邊界</h3><div class="table-scroll"><table class="report-data-table report-cols-7"><thead><tr>` +
  `<th>ETF</th><th class="num">盤前</th><th class="num">-1SD</th><th class="num">+1SD</th><th class="num">-2SD</th><th class="num">+2SD</th><th>狀態／提醒</th></tr></thead><tbody>` +
  nearExpected.map((row) => `<tr><td>${row.ticker}</td><td class="num">${fixed(row.price)}</td><td class="num">${fixed(row.lower1)}</td>` +
    `<td class="num">${fixed(row.upper1)}</td><td class="num">${fixed(row.lower2)}</td><td class="num">${fixed(row.upper2)}</td>` +
    `<td><span class="badge amber">${row.status}</span> 尚未觸發邊界，等待盤中確認。</td></tr>`).join("") +
  `</tbody></table></div><p class="section-summary"><strong>預期波幅小結：</strong>目前沒有 1SD／2SD 突破；DIA、TLT、XOP、XLI 接近 1SD 邊界，先看開盤後是否真正觸發。</p>`;

function breadthTableRow(label, latest, fiveDaysAgo, judgment, suffix = "%") {
  const delta = latest - fiveDaysAgo;
  return `<tr><td>${label}</td><td class="num ${latest < 50 && suffix === "%" ? "dn" : ""}">${fixed(latest)}${suffix}</td>` +
    `<td>${delta >= 0 ? "上升" : "下降"} ${Math.abs(delta).toFixed(2)}${suffix === "%" ? "pp" : ""}</td><td>${judgment}</td></tr>`;
}

const marketBreadthTable = `<div class="table-scroll"><table class="report-data-table report-cols-4"><thead><tr><th>指標</th><th class="num">7/24 收盤</th><th>5日趨勢</th><th>判斷</th></tr></thead><tbody>` +
  breadthTableRow("S&amp;P 500 &gt; 20MA", b.spx20, b5.spx20, "回到 50% 上方，但仍低於中期廣度。") +
  breadthTableRow("S&amp;P 500 &gt; 50MA", b.spx50, b5.spx50, "仍有近三分之二成分股守住中期均線。") +
  breadthTableRow("Nasdaq 100 &gt; 20MA", b.ndx20, b5.ndx20, "僅三成，科技短線參與度極弱。") +
  breadthTableRow("Nasdaq 100 &gt; 50MA", b.ndx50, b5.ndx50, "不足四成，科技中期結構偏弱。") +
  breadthTableRow("Russell 2000 &gt; 20MA", b.iwm20, b5.iwm20, "盤前 IWM 反彈，成分股擴散仍待確認。") +
  breadthTableRow("Russell 2000 &gt; 50MA", b.iwm50, b5.iwm50, "過半但五日下降，中期緩衝尚在。") +
  breadthTableRow("T2108", stock.t2108, stock5.t2108, "回到 50% 附近，仍未形成強勢環境。") +
  breadthTableRow("5日 breadth ratio", stock.ratio5, stock5.ratio5, "低於 1，短線賣壓仍占優。", "") +
  breadthTableRow("10日 breadth ratio", stock.ratio10, stock5.ratio10, "低於 1，中線突破勝率偏低。", "") +
  `<tr><td>4%+ 上漲／下跌家數</td><td class="num dn">${stock.up4}／${stock.down4}</td><td>7/17 為 ${stock5.up4}／${stock5.down4}</td><td>下跌家數為上漲家數 ${(stock.down4 / stock.up4).toFixed(1)} 倍。</td></tr>` +
  `</tbody></table></div>`;

const macroCsv = parseCsv(fs.readFileSync(path.join(work, "macro_0727.csv"), "utf8"));
const macroLookup = new Map(macroCsv.filter((row) => row[0]).map((row) => [row[0], row]));
const fxSpecs = [
  ["EUR（FXE）", "EUR (FXE)", null, "歐元月線接近持平，美元仍是主要變數。"],
  ["GBP（FXB）", "GBP (FXB)", null, "英鎊月線偏強，短線受 FOMC 牽制。"],
  ["JPY（FXY）", "JPY (FXY)", null, "日圓仍弱，跨市場避險訊號有限。"],
  ["USD（USDU）", "USD (USDU)", null, "美元 ETF 仍在主要均線上方。"],
  ["GLD", "GLD", "GLD", "金價反彈，但完整日線仍低於主要均線。"],
  ["SLV", "SLV", "SLV", "白銀反彈，仍屬弱勢修復。"],
  ["CPER", "CPER", "CPER", "銅月線偏強，但盤前成交量偏低。"],
  ["USO", "USO", "USO", "盤前跌逾 6%，通膨壓力急降但地緣風險未消失。"],
  ["IBIT", "IBIT", "IBIT", "加密代理隨風險偏好回升。"],
];
const fxRows = fxSpecs.map(([label, sheetKey, quoteTicker, meaning]) => {
  const row = macroLookup.get(sheetKey);
  if (!row) throw new Error(`Macro sheet 缺少 ${sheetKey}`);
  const close = number(row[1]);
  const daily = number(row[2]);
  const monthly = number(row[4]);
  const pre = quoteTicker ? currentMove(quoteTicker) : null;
  return `<tr><td>${label}</td><td class="num">${fixed(close)}</td><td class="num ${moveClass(daily)}">${signed(daily)}</td>` +
    `<td class="num ${moveClass(monthly)}">${signed(monthly)}</td>` +
    `<td class="num ${moveClass(pre)}">${Number.isFinite(pre) ? signed(pre) : "無盤前成交"}</td><td>${meaning}</td></tr>`;
}).join("");

const tltTechnical = technical.get("TLT");
const ratesPolicyRows = [
  `<tr><td><strong>美國10年期殖利率</strong></td><td class="num">約 4.63%</td><td class="num">4.65%</td>` +
    `<td><span class="badge amber">接近壓力線</span></td><td>升破門檻會重新壓縮長久期科技估值；維持下方則利多反彈延續。</td></tr>`,
  `<tr><td><strong>TLT</strong></td><td class="num ${moveClass(currentMove("TLT"))}">${fixed(currentPrice("TLT"))}／${signed(currentMove("TLT"))}</td>` +
    `<td class="num">${fixed(tltTechnical.ma50)}（50MA）</td><td><span class="badge blue">反彈待確認</span></td>` +
    `<td>站回 50MA 才代表長端需求由日內反彈轉為技術修復。</td></tr>`,
  `<tr><td><strong>DXY</strong></td><td class="num">101.27</td><td class="num">102</td>` +
    `<td><span class="badge blue">門檻下方</span></td><td>升破 102 代表美元金融條件重新收緊，需降低高 beta 科技。</td></tr>`,
  `<tr><td><strong>2年期美債標售</strong><small class="table-note">11:30 ET</small></td><td class="num" data-allow-missing>Actual 待公布</td>` +
    `<td class="num">投標倍數 2.64</td><td><span class="badge amber">盤中驗證</span></td>` +
    `<td>高於前值代表短端需求改善；低於前值且 TLT 轉跌則利率緩衝失效。</td></tr>`,
].join("");

const majorTickers = ["IWM", "DIA", "SPY", "QQQ"];
const majorRows = majorTickers.map((ticker) => technical.get(ticker)).filter(Boolean);
const majorTable = `<div class="table-scroll"><table class="report-data-table report-cols-8" data-major-universe="indices-4"><thead><tr><th>ETF</th><th class="num">昨收</th>` +
  `<th class="num">1日</th><th class="num">5日</th><th class="num">1月</th><th>Above MA</th><th class="num">RSI</th><th>判斷</th></tr></thead><tbody>` +
  majorRows.map((row) => {
    const judgment = row.above20 && row.above50 ? "結構較完整，回落守均線。" :
      !row.above20 && row.above50 ? "低於 20MA、仍守 50MA，屬修復期。" :
      "低於 20/50MA，反彈先看收復 20MA。";
    return `<tr><td>${row.ticker}</td><td class="num">${fixed(row.close)}</td><td class="num ${moveClass(row.dailyPct)}">${signed(row.dailyPct)}</td>` +
      `<td class="num ${moveClass(row.fiveDayPct)}">${signed(row.fiveDayPct)}</td><td class="num ${moveClass(row.oneMonthPct)}">${signed(row.oneMonthPct)}</td>` +
      `<td class="ma-cell">${maStates(row)}</td><td class="num" data-rsi="${fixed(row.rsi14)}">${fixed(row.rsi14)}</td><td>${judgment}</td></tr>`;
  }).join("") + `</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>IWM／DIA 的中期結構優於 SPY／QQQ；QQQ 未收復 20MA 前，盤前反彈仍是風險緩和而非趨勢翻多。</p>`;

const atrTickers = ["VOO", "QQQ", "QQQE", "RSP", "IWM", "DIA"];
const atrRows = atrTickers.map((ticker) => technical.get(ticker));
const atrTable = `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">昨收</th>` +
  `<th class="num">50MA</th><th class="num">ATR(14)</th><th class="num">距 50MA ATR</th><th>判斷</th></tr></thead><tbody>` +
  atrRows.map((row) => {
    const ext = row.extension50Atr;
    const judgment = ext <= -2 ? "低於 50MA 超過 2 ATR，等待止跌而非直接抄底。" :
      ext >= 2 ? "高於 50MA 接近／超過 2 ATR，避免追價。" :
      ext < 0 ? "低於 50MA，先等待趨勢修復。" : "距 50MA 不極端，以均線方向判斷。";
    return `<tr><td>${row.ticker}</td><td class="num">${fixed(row.close)}</td><td class="num">${fixed(row.ma50)}</td>` +
      `<td class="num">${fixed(row.atr14)}</td><td class="num ${moveClass(ext)}">${ext > 0 ? "+" : ""}${fixed(ext)}</td><td>${judgment}</td></tr>`;
  }).join("") + `</tbody></table></div><p class="section-summary"><strong>本段結論：</strong>QQQ 仍低於 50MA 超過 2 ATR，RSP 相對延伸偏高；盤前反彈後追价赔率不对称。</p>`;

const tradeTickers = ["SPY", "QQQ", "SMH", "XLK", "IWM", "RSP", "DIA", "USO"];
const tradeRows = tradeTickers.map((ticker) => {
  const tech = technical.get(ticker);
  const price = currentPrice(ticker);
  const state = price >= tech.ma20 ? "高於20MA" : price >= tech.ma50 ? "介於20／50MA" : "低於20／50MA";
  const badge = price >= tech.ma20 ? "green" : price >= tech.ma50 ? "amber" : "red";
  const action = ticker === "USO" ? "急跌後不追空；若失守 125.38，再降低能源曝險。" :
    price >= tech.ma20 ? "守住 20MA 與 VWAP 才保留反彈倉位。" :
    price >= tech.ma50 ? "以 50MA 為防守，等待收復 20MA。" :
    "收回 20MA 前低於基準配置。";
  return `<tr><td>${ticker}</td><td class="num ${moveClass(currentMove(ticker))}">${fixed(price)}</td><td class="num">${fixed(tech.ma20)}</td>` +
    `<td class="num">${fixed(tech.ma50)}</td><td><span class="badge ${badge}">${state}</span></td><td>${action}</td></tr>`;
}).join("");

const data = {
  report_type: "premarket",
  report_title: "2026-07-27｜美股盤前監控",
  report_eyebrow: "2026-07-27｜盤前更新",
  report_heading: "油價急跌推動全面反彈，但科技均線與廣度仍未確認",
  technical_as_of: "2026-07-24",
  vix_volatility_score: vixScore,
  vix_volatility_level: vixRisk.label,
  vix_volatility_components: vixComponents,
  data_timestamp_note: "長橋盤前快照 08:32–08:51 ET；技術值截至 7/24 收盤；市場廣度與 Stockbee 採 Google Sheets 7/24 收盤；耐用品訂單已納入 08:30 ET Actual。",
  risk_badge: `高風險｜技術 ${technicalScore}/12、廣度 ${breadthScore}/8`,
  qqq_reengage_20ma: fixed(qqq.ma20),
  qqq_breakout_add_1sd: "726.43",
  summary_cards: `<div class="card"><span>SPY／QQQ 盤前</span><strong class="up">${signed(currentMove("SPY"))}／${signed(currentMove("QQQ"))}</strong><small>地緣風險緩和推動反彈。</small></div>` +
    `<div class="card"><span>DIA／IWM 盤前</span><strong class="up">${signed(currentMove("DIA"))}／${signed(currentMove("IWM"))}</strong><small>道指與小盤同步承接。</small></div>` +
    `<div class="card"><span>SMH 盤前</span><strong class="up">${signed(currentMove("SMH"))}</strong><small>${fixed(currentPrice("SMH"))}，仍低於 20/50MA。</small></div>` +
    `<div class="card"><span>USO／VIX</span><strong class="dn">${signed(currentMove("USO"))}／17.59</strong><small>油價地緣溢價回吐，VIX 低於 20。</small></div>`,
  upgrade_trigger_rule: "滿足 2/3 才由防守轉中性：科技收復均線、廣度擴散、宏觀壓力下降。",
  upgrade_trigger_1: `QQQ 收回 ${fixed(qqq.ma20)}（20MA），SMH 同站回 ${fixed(smh.ma20)}（20MA）。`,
  upgrade_trigger_2: "開盤後上漲家數超過下跌家數，NDX 廣度止跌。",
  upgrade_trigger_3: "TLT 守 83.25、DXY 低於 102、VIX 維持 20 下方。",
  downgrade_trigger_rule: "任一觸發即維持高風險：反彈失敗、油價反抽、政策風險升級。",
  downgrade_trigger_1: "SPY 跌回 744.10 下方，QQQ 同失 690。",
  downgrade_trigger_2: "SMH 跌回 561.19 下方，設備鏈同步失守 VWAP。",
  downgrade_trigger_3: "USO 收復 130、DXY 升破 102 或 VIX 升破 20。",
  core_conclusions: `<ol><li><strong>7/27 盤前反彈來自地緣風險緩和。</strong>SPY ${signed(currentMove("SPY"))}、QQQ ${signed(currentMove("QQQ"))}、DIA ${signed(currentMove("DIA"))}、IWM ${signed(currentMove("IWM"))}，同時 USO ${signed(currentMove("USO"))}；美國與伊朗暫停攻擊使能源溢價快速回吐。</li>` +
    `<li><strong>半導體反彈有廣度，但尚未完成技術翻多。</strong>SMH ${signed(currentMove("SMH"))}，MRVL、KLAC、AMAT、SNDK、LRCX、AMD、ARM 與 AVGO 同漲；但 SMH 7/24 收盤仍低於 20/50MA，1月 ${signed(smh.oneMonthPct)}。</li>` +
    `<li><strong>SPY 盤前重返 50MA 附近，QQQ 仍有明顯距離。</strong>SPY 盤前 ${fixed(currentPrice("SPY"))}，接近 50MA ${fixed(spy.ma50)}、仍低於 20MA ${fixed(spy.ma20)}；QQQ 盤前 ${fixed(currentPrice("QQQ"))}，20MA 在 ${fixed(qqq.ma20)}。</li>` +
    `<li><strong>五日市場廣度仍是主要缺口。</strong>SPX 高於 20MA 回到 ${fixed(b.spx20)}%，但 NDX 高於 20/50MA 只有 ${fixed(b.ndx20)}%／${fixed(b.ndx50)}%；Stockbee 4%+ 上漲／下跌為 ${stock.up4}／${stock.down4}。</li>` +
    `<li><strong>耐用品 headline 明顯 Miss。</strong>六月 Actual +0.3%，低於 +2.5% Forecast；扣除運輸 +0.6%，亦低於 +0.8% 預期。弱數據利多 TLT，但同時提醒製造需求不足。</li>` +
    `<li><strong>本週真正的二元風險在 FOMC 與大型科技財報。</strong>7/29 有利率決議及 MSFT／META，7/30 有 AAPL／AMZN；今天的反彈仍需保留事件風險折價。</li></ol>` +
    `<p class="section-summary"><strong>本段結論：</strong>油價急跌和債券反彈改善了短線環境，但技術與廣度尚未支持全面 risk-on；先看 QQQ／SMH 是否收復 VWAP，再判斷是否由高風險降級。</p>`,
  positioning_primary: "主線：保留指數反彈倉，但 QQQ／SMH 未收回 20MA 前不恢復滿額科技 beta。",
  positioning_secondary: "次線：航空、郵輪受油價回落支持；能源只保留核心對沖，不追空急跌。",
  positioning_watch: `觀察：SPY ${fixed(spy.ma50)}／${fixed(spy.ma20)}、QQQ ${fixed(qqq.ma20)}、SMH ${fixed(smh.ma20)}、USO 130、DXY 102、VIX 20。`,
  positioning_invalidation: `若 QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SMH 收回 ${fixed(smh.ma20)}（20MA），且 NDX 廣度回到 50%，防守定位失效。`,
  pre_market_movers: preMarketMovers,
  pre_market_movers_note: `<p class="section-summary"><strong>本段結論：</strong>異動具明確的「能源下跌、交通與晶片反彈」共同因子；不是零散個股雜訊，但仍需開盤成交與 VWAP 驗證。</p>`,
  section_pre_market_movers_primary_action: "主線：航空／郵輪只做相對強勢，能源未收回 VWAP 前降低戰術曝險。",
  section_pre_market_movers_condition_action: "條件：SMH 與設備鏈同步守住 VWAP，才提高晶片 beta。",
  section_pre_market_movers_avoid_action: "避免：把油價單日急跌當成地緣風險永久解除。",
  premarket_movers_invalidation: "若 USO 收復 130、航空失守 VWAP，油價利多交易失效。",
  correction_checklist_dashboard: checklist,
  section_correction_checklist_primary_action: "主線：High 項仍有 6 項，總倉位維持低於基準。",
  section_correction_checklist_condition_action: "條件：High 項降至 2 項以下，才恢復中性倉位。",
  section_correction_checklist_avoid_action: "避免：因 VIX 低於 20 或盤前上漲就忽略技術破位。",
  checklist_invalidation: "若 QQQ／SMH 收回 20MA 且廣度止跌，High Risk 才可降級。",
  macro_premarket_background_table: `<div class="table-scroll"><table class="report-data-table report-cols-5"><thead><tr>` +
    `<th>宏觀／財報事件</th><th>Actual／Forecast／Previous</th><th>訊號</th><th>政策／利率判讀</th><th>市場含義</th></tr></thead><tbody>${macroRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>已公布的耐用品數據偏弱，但市場主導因子仍是油價急跌；週三 FOMC 與大型科技財報前，反彈需要 TLT 和價格共同確認。</p>${expectedTable}`,
  section_macro_premarket_background_primary_action: "主線：耐用品公布後同看 TLT、QQQ 與 USO，不用單一數據推導 risk-on。",
  section_macro_premarket_background_condition_action: "條件：TLT 守漲、QQQ 守 VWAP，才把弱數據視為估值利多。",
  section_macro_premarket_background_avoid_action: "避免：在 Actual 待公布時提前標示 Beat／Miss。",
  macro_invalidation: "若 TLT 轉跌且 DXY 升破 102，弱數據的估值利多失效。",
  sector_momentum_chart: momentumChart(thematicRows),
  sector_thematic_etf_tables: `${etfGroup(sectorRows, "S&amp;P 500 Sector ETF", sectorJudgments)}${etfGroup(thematicRows, "Thematic Sector ETF（含 SPY 基準）", thematicJudgments, true)}` +
    `<p class="section-summary"><strong>本段結論：</strong>能源完整日線仍領先、但盤前急跌；科技與半導體正在反彈，月線與 MA 仍未翻多。板塊訊號由「能源獨強」轉為「風險緩和後的修復」，尚不是趨勢確認。</p>`,
  section_sector_thematic_etf_primary_action: "主線：不追 USO 急跌，也不在 SMH／AIQ 低於 20MA 時追反彈。",
  section_sector_thematic_etf_condition_action: "條件：SMH／XLK 收回 20MA，才把科技修復升級為輪動。",
  section_sector_thematic_etf_avoid_action: "避免：用單日盤前漲跌取代 7/24 完整日線排序。",
  sector_etf_invalidation: "若能源收復 VWAP 且科技失守開盤低位，輪動判斷失效。",
  major_etf_technical_table: majorTable,
  section_major_etf_technical_primary_action: "主線：IWM／DIA 結構優於 SPY／QQQ，先保留大小型與風格分散。",
  section_major_etf_technical_condition_action: `條件：QQQ 收回 ${fixed(qqq.ma20)}（20MA）、SPY 收回 ${fixed(spy.ma20)}（20MA），才提高指數科技權重。`,
  section_major_etf_technical_avoid_action: "避免：只看盤前上漲，不看 7/24 完整日線均線位置。",
  major_etf_invalidation: "若 SPY／QQQ 同收回 20MA，技術防守判斷失效。",
  fifty_ma_atr_extension_table: atrTable,
  section_50ma_atr_extension_primary_action: "主線：QQQ 深於 50MA 超過 2 ATR，等待止跌確認。",
  section_50ma_atr_extension_condition_action: "條件：QQQ 距 50MA ATR 回到 -1 以上，再提高成長曝險。",
  section_50ma_atr_extension_avoid_action: "避免：把負 ATR 延伸直接等同超賣買點。",
  atr_extension_invalidation: "若 SPY／RSP／DIA 同失 50MA，等權緩衝失效。",
  market_breadth_table: marketBreadthTable,
  stockbee_breadth_interpretation: `<div class="callout warn"><strong>Stockbee 收盤讀值（7/24）：</strong>5日／10日 ratio 為 ${fixed(stock.ratio5)}／${fixed(stock.ratio10)}，均低於 1；4%+ 上漲／下跌為 ${stock.up4}／${stock.down4}。25%+／- Quarter 為 ${stock.quarterUp}／${stock.quarterDown}，34/13 Bull／Bear 為 ${stock.day34Up}／${stock.day34Down}；T2108 ${fixed(stock.t2108)}%。</div>` +
    `<p class="section-summary"><strong>小結：</strong>SPX 中期廣度仍過半，但 NDX 與 IWM 短線廣度偏弱，Stockbee 同步顯示賣壓占優；盤前上漲暫未獲得收盤廣度確認。</p>`,
  section_market_breadth_primary_action: `主線：五日廣度 ${breadthScore}/8 High，總 beta 維持低於基準。`,
  section_market_breadth_condition_action: "條件：5日／10日 ratio 回到1以上且 NDX >20MA 超過50%。",
  section_market_breadth_avoid_action: "避免：只看指數跳空，不看成分股參與度。",
  breadth_invalidation: "若 NDX 廣度回到 50% 且上漲家數領先，廣度防守失效。",
  fx_commodities_table: `<div class="macro-policy-overview"><div><span>DXY</span><strong>101.27</strong><small>低於 102 風險門檻</small></div><div><span>美國10年期</span><strong>約 4.63%</strong><small>較前日下降約 4bp</small></div><div><span>主導商品</span><strong class="dn">USO ${signed(currentMove("USO"))}</strong><small>地緣溢價快速回吐</small></div></div>` +
    `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>資產</th><th class="num">7/24 收盤</th><th class="num">1日</th><th class="num">1月</th><th class="num">盤前</th><th>對美股含義</th></tr></thead><tbody>${fxRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>DXY 101.27、10年期約 4.63% 與 USO 急跌共同緩解金融條件；但 USO 仍高於 20/50MA，地緣風險只能視為暫停而非結束。</p>`,
  section_fx_commodities_primary_action: "主線：用 USO、DXY 與 TLT 判斷金融條件是否持續放鬆。",
  section_fx_commodities_condition_action: "條件：USO 低於 130、DXY 低於 102 且 TLT 守漲，才提高成長倉位。",
  section_fx_commodities_avoid_action: "避免：在運輸尚未恢復正常前宣告能源風險結束。",
  forex_commodity_invalidation: "若 USO 收復 130、DXY 升破 102，金融條件改善失效。",
  treasury_fed_economic_data_table: `<div class="macro-policy-overview"><div><span>Fed 路徑</span><strong class="dn">7/29 決議前分歧高</strong><small>利率區間 3.50%–3.75%</small></div>` +
    `<div><span>美債訊號</span><strong class="up">TLT ${signed(currentMove("TLT"))}</strong><small>10年期約 4.63%</small></div>` +
    `<div><span>美股含義</span><strong class="up">估值壓力邊際下降</strong><small>仍需 QQQ／SMH 收復均線</small></div></div>` +
    `<div class="table-scroll"><table class="rates-monitor-table report-data-table report-cols-5"><thead><tr><th>利率／政策觀察</th><th class="num">最新／時間</th><th class="num">確認門檻</th><th>狀態</th><th>對美股含義</th></tr></thead><tbody>${ratesPolicyRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>油價急跌令長端壓力邊際下降，但 TLT 尚未站回 50MA；FOMC 前只在 10Y、TLT、DXY 同步改善時提高科技曝險。</p>`,
  section_treasury_fed_primary_action: "主線：FOMC 前保留事件現金，同看 TLT、10年期殖利率與 DXY。",
  section_treasury_fed_condition_action: `條件：TLT 站回 ${fixed(tltTechnical.ma50)}（50MA）、10Y 低於 4.65% 且 DXY 低於 102，才逐步回補核心科技。`,
  section_treasury_fed_avoid_action: "避免：把 TLT 單日上漲直接解讀為 Fed 必然寬鬆。",
  treasury_invalidation: "若 2年期標售投標倍數低於 2.64、TLT 轉跌或 10Y 升破 4.65%，利率緩衝假設失效。",
  trading_plan: `<div class="table-scroll"><table class="report-data-table report-cols-6"><thead><tr><th>ETF</th><th class="num">盤前</th><th class="num">20MA</th><th class="num">50MA</th><th>狀態</th><th>行動</th></tr></thead><tbody>${tradeRows}</tbody></table></div>` +
    `<p class="section-summary"><strong>本段結論：</strong>RSP／DIA 已回到 20MA 上方，SPY 在 20／50MA 間；QQQ／SMH／XLK 仍是反彈中的弱環，倉位升級必須由成長權重確認。</p>` +
    `<div class="action-directive"><span class="ad-label">交易計畫</span><ul class="ad-list"><li class="ad-primary"><strong>主線：</strong>保留指數反彈倉，QQQ／SMH 未收回 20MA 前科技低於基準。</li>` +
    `<li class="ad-secondary"><strong>次線：</strong>航空／郵輪只做相對強勢，能源急跌後不追空。</li>` +
    `<li class="ad-watch"><strong>觀察：</strong>10:30 Dallas Fed、11:30 2年期標售、DXY 102、VIX 20。</li>` +
    `<li class="ad-avoid"><strong>避免：</strong>在 FOMC 與大型科技財報前無保護擴大隔夜 beta。</li>` +
    `<li class="ad-invalidate"><span class="ad-bullet">⚠</span><strong>反向訊號：若 QQQ／SMH 收回 20MA 且廣度止跌，再降低防守。</strong></li></ul></div>`,
  intraday_playbook_rows: [
    { time_slot: "09:30 ORB", trigger_event: "SPY 守 744.10、QQQ／SMH 守 VWAP", interpretation: "地緣風險緩和反彈獲得價格確認", action: "保留反彈倉，科技仍低於基準。" },
    { time_slot: "09:30 ORB", trigger_event: "SPY 跌回 744.10 下方、USO 反抽 130", interpretation: "跳空反彈失敗，能源壓力回升", action: "降低 beta，取消航空追價。" },
    { time_slot: "10:30 Dallas Fed", trigger_event: "數據弱、TLT 續強、QQQ 守 VWAP", interpretation: "成長放緩被市場解讀為估值利多", action: "小幅回補核心科技，不追高 beta。" },
    { time_slot: "11:30 2年期標售", trigger_event: "投標倍數高於 2.64、TLT 續強", interpretation: "短端需求改善，FOMC 壓力邊際下降", action: "提高 SPY／QQQ 至中性倉位。" },
    { time_slot: "13:00", trigger_event: "上漲家數未擴散、SMH 失守 VWAP", interpretation: "反彈仍由期貨與權重驅動", action: "鎖定部分利潤，維持防守。" },
    { time_slot: "15:30 MOC", trigger_event: "QQQ／SMH 仍低於20MA、VIX回升", interpretation: "FOMC 前隔夜風險未修復", action: "降低隔夜 beta，保留事件現金。" },
  ],
  cross_validation_summary: `<div class="callout ok"><strong>長橋確認：</strong>盤前 SPY ${signed(currentMove("SPY"))}、QQQ ${signed(currentMove("QQQ"))}、SMH ${signed(currentMove("SMH"))}、TLT ${signed(currentMove("TLT"))}、USO ${signed(currentMove("USO"))}。</div>` +
    `<div class="callout warn"><strong>廣度確認：</strong>Google Sheets 7/24 收盤顯示 NDX 高於 20/50MA 僅 ${fixed(b.ndx20)}%／${fixed(b.ndx50)}%，Stockbee 4%+ 上漲／下跌為 ${stock.up4}／${stock.down4}。</div>` +
    `<div class="callout"><strong>主導結論：</strong>7/27 是地緣風險緩和驅動的全面反彈，但技術與廣度仍未翻多；保留反彈倉、科技低於基準，等待 20MA、VWAP 與成分股擴散三者確認。</div>` +
    `<h3>資料來源</h3><p class="sources">長橋 OpenAPI：盤前價格與成交量、截至 2026-07-24 的完整日線 RSI／MA／ATR、finance-calendar；` +
    `<a href="https://docs.google.com/spreadsheets/d/1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE/edit?gid=1883991817#gid=1883991817">Market Watch：Market Breath／Macro／Weekly Expected Move</a>；` +
    `<a href="https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/edit?gid=1082103394#gid=1082103394">Stockbee Market Monitor 2026</a>；` +
    `<a href="https://www.census.gov/manufacturing/m3/adv/current/index.html">U.S. Census Bureau：六月耐用品訂單</a>；` +
    `<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Federal Reserve：2026 FOMC 日曆</a>；` +
    `<a href="https://au.investing.com/news/economy-news/wall-st-futures-rise-as-us-iran-pause-hostilities-4553224">Reuters：美伊暫停攻擊、油價與美股期貨</a>。</p>` +
    `<p class="source-note">本報告為 2026-07-27 美股盤前本地草稿，不構成投資建議。Actual 待公布項目明確標示，未預先判定 Beat／Miss。</p>`,
};

const output = path.join(root, "data", "2026-07-27-premarket.json");
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(output);
console.log(JSON.stringify({
  movers: data.pre_market_movers.length,
  sectorRows: sectorRows.length,
  thematicRows: thematicRows.length,
  technicalScore,
  breadthScore,
  nearExpected: nearExpected.map((row) => `${row.ticker}:${row.status}`),
}, null, 2));
