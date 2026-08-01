#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const market = JSON.parse(fs.readFileSync(path.join(root, "data", "2026-07-monthly-market.json"), "utf8"));
if (market.errors.length) throw new Error(`長橋月報資料仍有錯誤：${JSON.stringify(market.errors)}`);
if (market.rows.length !== 47) throw new Error(`長橋月報資料列數異常：${market.rows.length}`);

const templateFile = path.join(root, "reports", "_monthly-template.html");
const outputFile = path.join(root, "reports", "2026-07-monthly.html");
const dataFile = path.join(root, "data", "2026-07-monthly.json");
const vixHistoryFile = path.join(root, "data", "VIX_History.csv");
const template = fs.readFileSync(templateFile, "utf8");
const rows = new Map(market.rows.map((row) => [row.ticker, row]));

const get = (ticker) => {
  const row = rows.get(ticker);
  if (!row) throw new Error(`缺少 ${ticker} 月報資料`);
  return row;
};
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixed = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const signed = (value, digits = 2, suffix = "%") => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${fixed(value, digits)}${suffix}` : "—";
const tone = (value) => Number(value) > 0 ? "up" : Number(value) < 0 ? "dn" : "";
const pct = (value, digits = 2) => `<span class="${tone(value)}">${signed(value, digits)}</span>`;
const cell = (value, className = "") => `<td${className ? ` class="${className}"` : ""}>${value}</td>`;
const num = (value, className = "") => cell(value, `num${className ? ` ${className}` : ""}`);
const table = (headers, body, classes = "report-data-table", attrs = "") => `<div class="table-scroll"><table class="${classes}"${attrs ? ` ${attrs}` : ""}><thead><tr>${headers.map((header) => {
  const headerClasses = [header.num ? "num" : "", header.className || ""].filter(Boolean).join(" ");
  return `<th${headerClasses ? ` class="${headerClasses}"` : ""}>${header.label}</th>`;
}).join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;

function summarizeVixAugust() {
  const observations = fs.readFileSync(vixHistoryFile, "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
    const [dateText, open, high, low, close] = line.split(",");
    const [month, day, year] = dateText.split("/").map(Number);
    return { year, month, day, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  }).filter((row) => row.year >= 2011 && row.year <= 2025);
  const annual = [];
  for (let year = 2011; year <= 2025; year += 1) {
    const july = observations.filter((row) => row.year === year && row.month === 7).sort((a, b) => a.day - b.day);
    const august = observations.filter((row) => row.year === year && row.month === 8).sort((a, b) => a.day - b.day);
    if (!july.length || !august.length) continue;
    const base = july[july.length - 1].close;
    const end = august[august.length - 1].close;
    const closes = [base, ...august.map((row) => row.close)];
    let peak = closes[0];
    let maxDrawdownPct = 0;
    for (const close of closes) {
      peak = Math.max(peak, close);
      maxDrawdownPct = Math.min(maxDrawdownPct, (close / peak - 1) * 100);
    }
    annual.push({
      year,
      returnPct: (end / base - 1) * 100,
      maxDrawdownPct,
      maxUpsidePct: (Math.max(...closes) / base - 1) * 100,
    });
  }
  const returns = annual.map((row) => row.returnPct).sort((a, b) => a - b);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = returns.length % 2 ? returns[(returns.length - 1) / 2] : (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2;
  return {
    averageReturnPct: average(annual.map((row) => row.returnPct)),
    medianReturnPct: median,
    winRatePct: annual.filter((row) => row.returnPct > 0).length / annual.length * 100,
    bestReturnPct: Math.max(...returns),
    worstReturnPct: Math.min(...returns),
    averageMaxDrawdownPct: average(annual.map((row) => row.maxDrawdownPct)),
    averageMaxUpsidePct: average(annual.map((row) => row.maxUpsidePct)),
    observations: annual.length,
  };
}

function maState(period, above) {
  return `<span class="ma-state ${above ? "ma-up" : "ma-down"}"><span class="ma-period">${period}MA</span><span class="ma-arrow">${above ? "▲" : "▼"}</span></span>`;
}
function maCell(row) {
  return `<td class="ma-cell"><div class="ma-indicators">${maState(20, row.above20)}${maState(50, row.above50)}${maState(200, row.above200)}</div></td>`;
}
function rsiCell(value) {
  const cls = value >= 70 ? " hot" : value <= 30 ? " cold" : "";
  return `<td class="num" data-rsi="${fixed(value)}"><span class="rsi${cls}"><i><b style="width:${Math.max(0, Math.min(100, Math.round(value)))}%"></b></i>${fixed(value)}</span></td>`;
}
function judgment(row) {
  if (!row.above20 && !row.above50 && row.above200) return "短中期承壓，長期趨勢尚未破壞。";
  if (row.above20 && row.above50 && row.above200 && row.july.returnPct > 0) return "三條均線上方，七月相對強勢。";
  if (row.above20 && row.above50 && row.above200) return "均線結構完整，但七月動能有限。";
  if (!row.above20 && !row.above50 && !row.above200) return "三條均線下方，維持防守。";
  if (row.above20 && !row.above50) return "短線修復，尚未收回 50MA。";
  if (!row.above20 && row.above50) return "跌破 20MA，中期支撐仍在。";
  return "均線分歧，等待價格確認。";
}
function etfTable(tickers, classes) {
  const list = tickers.map(get).sort((left, right) => right.july.returnPct - left.july.returnPct);
  const body = list.map((row) => `<tr data-month-return="${fixed(row.july.returnPct)}">${cell(row.ticker)}${num(pct(row.july.returnPct))}${num(pct(row.threeMonthReturnPct))}${num(pct(row.ytdReturnPct))}${maCell(row)}${rsiCell(row.rsi14)}${cell(judgment(row))}</tr>`);
  return table([
    { label: "ETF" }, { label: "7月", num: true }, { label: "3個月", num: true }, { label: "年初至今", num: true },
    { label: "20／50／200MA", className: "ma-heading" }, { label: "RSI", num: true }, { label: "判斷" },
  ], body, `report-data-table report-cols-7 ${classes}`);
}
function chartRows(tickers) {
  const list = tickers.map(get);
  const max = Math.max(...list.map((row) => Math.abs(row.july.returnPct)));
  return list.map((row) => {
    const value = row.july.returnPct;
    const side = value >= 0 ? "pos" : "neg";
    const width = Math.max(2, Math.round(Math.abs(value) / max * 48));
    return `<div class="bar-row"><span class="lbl">${row.ticker}</span><span class="val ${side}">${signed(value)}</span><div class="bar-track" style="--zero:50%"><span class="b ${side}" style="width:${width}%"></span></div></div>`;
  }).join("");
}

const indexJudgments = {
  SPY: "七月幾乎持平，但月末仍站在 20／50／200MA 上方；指數穩定主要來自輪動。",
  QQQ: "七月 -6.57%，月內最大回撤 -10.14%，且低於 20／50MA；科技尚未完成修復。",
  DIA: "七月小漲且三線均上，防守與價值維持承接。",
  IWM: "七月 -3.08%、上漲日僅 36.4%；低於 20／50MA，經濟敏感度未形成接棒。",
  RSP: "七月 +1.05% 且三線均上，優於 SPY，顯示 S&amp;P 內部仍有輪動底盤。",
  QQQE: "七月 -4.05%、低於 20／50MA；Nasdaq 等權也弱，問題不只集中在單一權重股。",
};

const majorRows = market.groups.major.map(get).map((row) => `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.july.returnPct))}${num(pct(row.threeMonthReturnPct))}${num(pct(row.ytdReturnPct))}${num(`${fixed(row.july.realizedVolPct, 1)}%`)}${num(pct(row.july.maxDrawdownPct))}${cell(indexJudgments[row.ticker])}</tr>`);
const majorIndices = `${table([
  { label: "ETF" }, { label: "7/31收盤", num: true }, { label: "7月", num: true }, { label: "3個月", num: true },
  { label: "年初至今", num: true }, { label: "7月實現波動率", num: true }, { label: "7月最大回撤", num: true }, { label: "月末判斷" },
], majorRows, "report-data-table report-cols-8 monthly-index-table")}<p class="section-summary"><strong>本段結論：</strong>七月不是大盤全面下跌，而是「S&amp;P／道指／等權穩定、Nasdaq／小型股承壓」。RSP +1.05% 對 SPY +0.03%，同時 QQQ -6.57% 與 QQQE -4.05%，支持輪動而非單一權重失真；但 IWM 仍弱，輪動尚未擴展到完整 risk-on。</p>`;

const vixy = get("VIXY");
const volatilityRows = ["SPY", "QQQ", "DIA", "IWM"].map(get).map((row) => `<tr>${cell(row.ticker)}${num(`${fixed(row.july.realizedVolPct, 1)}%`)}${num(pct(row.july.maxDrawdownPct))}${num(`${fixed(row.july.upDayPct, 1)}%`)}${cell(row.ticker === "QQQ" ? "波動與回撤顯著高於其餘指數。" : row.ticker === "IWM" ? "波動不極端，但上漲日比例最低。" : "月度波動仍屬可控。")}</tr>`);
const volatilityReview = `<div class="month-stat-strip"><div><span>VIX 月初／月末</span><strong>16.59／15.99</strong></div><div><span>VIX 月內高點</span><strong class="dn">20.88</strong></div><div><span>VIX 月平均</span><strong>17.09</strong></div><div><span>VIXY 七月</span><strong class="${tone(vixy.july.returnPct)}">${signed(vixy.july.returnPct)}</strong></div></div>${table([
  { label: "指數代理" }, { label: "7月實現波動率", num: true }, { label: "最大回撤", num: true }, { label: "上漲日比例", num: true }, { label: "判讀" },
], volatilityRows, "report-data-table report-cols-5")}<div class="callout warn"><strong>波動率錯位：</strong>VIX 由 16.59 降至 15.99，VIXY 亦下跌 3.66%，月末看似平靜；但 VIX 曾在 7/29 升至 20.88，QQQ 月內實現波動率 23.6%、最大回撤 10.14%。因此八月不能只用 VIX&lt;20 判斷低風險，必須同時看 QQQ／IWM 的實現波動與市場廣度。</div>`;

const breadth = [
  ["SPX &gt;20MA", 62.74, 53.28, "短線參與度下降 9.46 個百分點。"],
  ["SPX &gt;50MA", 61.55, 62.02, "中期底盤近乎持平。"],
  ["NDX &gt;20MA", 59.40, 53.39, "科技短線廣度降溫。"],
  ["NDX &gt;50MA", 51.48, 47.57, "月末跌回五成以下。"],
  ["IWM &gt;20MA", 70.67, 43.93, "七月惡化幅度最大。"],
  ["IWM &gt;50MA", 67.44, 52.88, "中期仍在五成上方，但明顯降溫。"],
  ["T2108", 51.14, 46.66, "回到中性偏弱區。"],
];
const breadthRows = breadth.map((row) => {
  const delta = row[2] - row[1];
  return `<tr>${cell(row[0])}${num(`${fixed(row[1])}%`)}${num(`${fixed(row[2])}%`)}${num(`<span class="${tone(delta)}">${signed(delta, 2, " 個百分點")}</span>`)}${cell(row[3])}</tr>`;
});
const stockbeeRows = [
  ["5日強弱比", "1.68", "0.98", "由多頭友善區降至中性附近。"],
  ["10日強弱比", "1.39", "0.91", "中短線轉為弱股略多。"],
  ["單日 4% 上漲／下跌", "325／157", "177／214", "由買盤擴散轉為下跌股較多。"],
  ["季度 +25%／-25%", "1726／1082", "1172／1233", "中期強弱股結構翻為弱股略多。"],
].map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${cell(row[3])}</tr>`);
const breadthReview = `<h3>三大指數廣度</h3>${table([{label:"指標"},{label:"6/30",num:true},{label:"7/31",num:true},{label:"月變化",num:true},{label:"判讀"}], breadthRows, "report-data-table report-cols-5")}<h3>Stockbee 交叉驗證</h3>${table([{label:"指標"},{label:"6/30",num:true},{label:"7/31",num:true},{label:"判讀"}], stockbeeRows, "report-data-table report-cols-4")}<div class="callout warn"><strong>綜合結論：</strong>SPX 50MA 廣度守穩，但 SPX／NDX／IWM 的 20MA 廣度全部下降，IWM 最弱；Stockbee 5日與10日強弱比也降至 1 附近或以下，季度強弱股更由 1726／1082 反轉為 1172／1233。七月的指數穩定主要靠板塊輪動，不是參與度擴張。</div>`;

const sectorChart = `<div class="chart" aria-label="七月板塊與主題動能"><div class="chart-title">七月動能一覽（自然月漲跌）</div>${chartRows(["XLE", "XLF", "XLV", "SPY", "XLI", "XLK", "SMH", "WGMI"])}</div>`;
const sectorThemeTables = `<h3>S&amp;P 500 Sector ETF</h3><p class="note">完整 11 個板塊加 SPY 基準；表格依七月自然月收益率由高至低排序，RSI 保留為輔助指標。</p>${etfTable(market.groups.sectors, "monthly-sector-table")}<h3>Thematic Sector ETF</h3><p class="note">20 個主題 ETF 加 SPY 基準；只顯示英文代號，依七月自然月收益率由高至低排序。</p>${etfTable(market.groups.themes, "monthly-theme-table")}<p class="section-summary"><strong>本段結論：</strong>能源 XLE +12.13%、金融 XLF +6.21% 領先；科技 XLK -7.96%、半導體 SMH -17.59%、礦股主題 WGMI -18.41% 落後。這是長端利率、油價與盈利分化共同形成的風格切換，而不是單純的市場 beta 下跌。</p>`;

const macroRows = [
  ["6月非農就業", "+5.7萬", "+11.0萬", "+12.9萬（修訂後）", "明顯低於預期，但失業率 4.2%、薪資月增 0.3%，不是衰退式斷裂。"],
  ["核心 CPI 月率／年率", "0.0%／2.6%", "0.2%／2.8%", "0.2%／2.9%", "全面低於預期，推動中旬科技估值修復。"],
  ["PPI 月率", "-0.3%", "0.0%", "+0.6%", "生產端價格降溫，但價格利多未延續成全天科技趨勢。"],
  ["6月零售銷售月率", "+0.2%", "+0.2%", "+1.0%", "消費仍有韌性，增長沒有快速失速。"],
  ["FOMC 目標區間", "3.50%–3.75%", "維持", "3.50%–3.75%", "9 比 3 維持；三位反對票主張升息 25bp，政策分歧偏鷹。"],
  ["第二季 GDP 年化", "+1.5%", "+2.1%", "+2.1%", "總量 Miss，但私人國內最終銷售 +3.9%，不是單純衰退。"],
  ["核心 PCE 月率／年率", "+0.1%／+3.3%", "+0.2%／+3.3%", "+0.3%／+3.4%", "月率偏軟、年率符合；降低立即升息急迫性，但通膨仍高於目標。"],
  ["第二季就業成本指數", "+0.9%", "+0.8%", "+0.9%", "薪資成本略熱，支撐長端利率與期限溢價。"],
];
const macroReview = `${table([{label:"事件"},{label:"實際值",num:true},{label:"市場預期",num:true},{label:"前值",num:true},{label:"政策與市場含義"}], macroRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5 macro-review-table")}<div class="callout warn"><strong>宏觀主線：</strong>七月同時出現 CPI／PPI／核心 PCE 月率降溫、GDP 低於預期，以及私人需求、ECI、油價與 FOMC 反對票偏強。短端交易「不必立即升息」，長端交易「通膨、期限溢價與財政供給仍高」，因此收益率曲線陡峭化，科技估值沒有得到完整利率配合。</div>`;

const crossRows = [
  ["2年期美債殖利率", "4.17%", "4.28%", "+11bp", "短端仍反映偏鷹政策風險。"],
  ["10年期美債殖利率", "4.48%", "4.75%", "+27bp", "長端上升幅度更大，壓縮長久期估值。"],
  ["30年期美債殖利率", "4.97%", "5.27%", "+30bp", "月末長端壓力最強。"],
  ["10年－2年曲線", "+31bp", "+47bp", "+16bp", "曲線陡峭化，並非全期限同步轉鷹。"],
  ["DXY", "101.156", "99.789", "-1.35%", "美元回落部分緩衝科技估值壓力。"],
];
const assetRows = ["SHY", "IEF", "TLT", "USO", "GLD", "SLV", "CPER", "USDU", "FXE", "FXB", "FXY", "IBIT"].map(get).sort((a, b) => b.july.returnPct - a.july.returnPct).map((row) => `<tr>${cell(row.ticker)}${num(fixed(row.close))}${num(pct(row.july.returnPct))}${num(fixed(row.rsi14))}${cell(row.ticker === "TLT" ? "長債明顯弱於短債，確認期限溢價壓力。" : row.ticker === "USO" ? "油價代理七月 +21.35%，是通膨尾端與能源板塊主線。" : row.ticker === "SHY" ? "短債小幅正回報，明顯優於中長債。" : judgment(row))}</tr>`);
const crossAssetReview = `<h3>殖利率曲線與美元</h3>${table([{label:"指標"},{label:"7/1",num:true},{label:"7/31",num:true},{label:"月變化",num:true},{label:"市場含義"}], crossRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}${num(row[3])}${cell(row[4])}</tr>`), "report-data-table report-cols-5")}<h3>跨資產 ETF</h3>${table([{label:"資產"},{label:"7/31收盤",num:true},{label:"7月",num:true},{label:"RSI",num:true},{label:"判讀"}], assetRows, "report-data-table report-cols-5")}<p class="section-summary"><strong>本段結論：</strong>SHY +0.16%、IEF -1.39%、TLT -4.47%，期限越長表現越弱；同時 DXY -1.35%、USO +21.35%。七月不是美元上升導致科技下跌，而是長端利率與能源通膨風險主導的估值再定價。</p>`;

const vixAugustSeasonality = summarizeVixAugust();
const seasonalityRows = ["SPY", "QQQ", "DIA", "IWM", "RSP", "QQQE"].map(get).map((row) => {
  const s = row.augustSeasonality;
  const interpretation = row.ticker === "IWM" ? "平均與中位數皆偏弱，且勝率低於五成。" : row.ticker === "QQQ" ? "平均回報最佳，但歷史最差仍達 -6.82%，波動尾端不能忽略。" : "平均接近零，方向優勢有限。";
  return `<tr>${cell(row.ticker)}${num(pct(s.averageReturnPct))}${num(pct(s.medianReturnPct))}${num(`${fixed(s.winRatePct, 1)}%`)}${num(pct(s.bestReturnPct))}${num(pct(s.worstReturnPct))}${num(pct(s.averageMaxDrawdownPct))}${num(String(s.observations))}${cell(interpretation)}</tr>`;
});
seasonalityRows.push(`<tr class="vix-seasonality-row" data-vix-seasonality="true">${cell("VIX")}${num(pct(vixAugustSeasonality.averageReturnPct))}${num(pct(vixAugustSeasonality.medianReturnPct))}${num(`${fixed(vixAugustSeasonality.winRatePct, 1)}%`)}${num(pct(vixAugustSeasonality.bestReturnPct))}${num(pct(vixAugustSeasonality.worstReturnPct))}${num(pct(vixAugustSeasonality.averageMaxDrawdownPct))}${num(String(vixAugustSeasonality.observations))}${cell(`波動率八月月末平均變化 ${signed(vixAugustSeasonality.averageReturnPct)}，上升比例 ${fixed(vixAugustSeasonality.winRatePct, 1)}%；月內收盤相對七月底平均最高曾升 ${signed(vixAugustSeasonality.averageMaxUpsidePct)}。`)}</tr>`);
const seasonalityReview = `<p class="note">指數 ETF 採長橋前復權日線，VIX 採 Cboe 官方日線：2011–2025 年各年 8 月月末相對 7 月月末變化；最大回撤以每日收盤與月內前高計算。SPY／QQQ／DIA／IWM／RSP／VIX 為 15 個樣本，QQQE 因成立時間較晚為 14 個樣本。</p>${table([
  {label:"ETF"},{label:"平均",num:true},{label:"中位數",num:true},{label:"上漲勝率",num:true},{label:"最佳",num:true},{label:"最差",num:true},{label:"平均最大回撤",num:true},{label:"樣本數",num:true},{label:"含義"}
], seasonalityRows, "report-data-table report-cols-9 monthly-seasonality-table")}<div class="callout warn"><strong>季節性結論：</strong>SPY／DIA 的 8 月平均報酬接近零，QQQ 平均 +1.03% 但平均最大回撤 -4.97%；IWM 平均 -0.27%、中位數 -1.26%、勝率 46.7%。VIX 的歷史八月資料則顯示，即使月末變化不大，月內仍常有明顯上衝，風控不能只看月末點位。歷史資料支持「八月方向優勢弱、月內回撤通常大於月末報酬」，所以應用觸發條件與分批部位，而不是用季節性直接做空或做多。</div>`;

const scenarios = [
  ["基準：分化整理", 45, "就業／ISM 降溫但不失速；10Y 在 4.65%–4.80%，DXY 在 99–101.5。", "SPY 守 50MA 744.21；QQQ 測試 20MA 701.02，但 IWM 與廣度只緩慢修復。", "XLE／XLF 保持相對強，軟體反彈；晶片需 AMD 與 SMH 571.63 確認。", "維持中性總曝險，做相對強弱；不追能源與大型雲端延伸。"],
  ["偏多：軟著陸擴散", 25, "非農與薪資溫和、CPI／PPI 不反彈；10Y &lt;4.65%、DXY &lt;99。", "QQQ &gt;701.02、IWM &gt;293.99；三大指數 20MA 廣度至少兩項回到 60%／55%／50%，Stockbee 5日比 &gt;1。", "科技由軟體擴散至晶片與 AI；RSP／IWM 不再落後 SPY。", "科技與高 beta 回補 1/3；QQQ 收回 50MA 714.75 才恢復標準部位。"],
  ["偏空：長端再定價", 20, "薪資／CPI／ISM 價格偏熱；10Y &gt;4.80% 且 DXY &gt;101.50。", "SPY 跌破 744.21、VIX &gt;20；QQQ／IWM 持續低於 20／50MA，NDX 20MA 廣度 &lt;45%。", "長久期科技、晶片、房屋與清潔能源承壓；能源可能相對抗跌。", "科技與高 beta 降低 1/3；提高現金與短久期債。"],
  ["尾端：成長失速", 10, "非農接近零或大幅下修、ISM 服務跌破 50；初領與續領同步惡化。", "2Y／10Y 同步急跌，但 IWM、XLF 與廣度先弱；QQQ 可能因利率下行反彈卻缺乏擴散。", "XLV／XLP 與高品質大型股相對抗跌；TLT／GLD 反彈。", "不把利率下跌直接視為 risk-on；降低週期與小型股。"],
];
const augustScenarios = `${table([{label:"八月情境"},{label:"主觀概率",num:true},{label:"宏觀／跨資產觸發"},{label:"指數／廣度預測"},{label:"板塊／主題預測"},{label:"配置動作"}], scenarios.map((row) => `<tr>${cell(row[0])}${num(`${row[1]}%`, "",)}${cell(row[2])}${cell(row[3])}${cell(row[4])}${cell(row[5])}</tr>`.replace(`<td class="num">${row[1]}%</td>`, `<td class="num" data-scenario-probability="${row[1]}">${row[1]}%</td>`)), "report-data-table report-cols-6 scenario-month-table")}<div class="action-directive"><span class="ad-label">八月執行順序</span><ul class="ad-list"><li class="ad-primary"><strong>先看長端：</strong>10Y 能否跌回 4.65% 以下，或是否升破 4.80%。</li><li class="ad-watch"><strong>再看擴散：</strong>QQQ／SMH 收回 20MA 必須配合 NDX／IWM 廣度與 Stockbee 5日比改善。</li><li class="ad-watch"><strong>最後看數據：</strong>8/3 ISM 製造、8/5 ISM 服務、8/7 非農、8/12 CPI、8/13 PPI 逐步更新概率。</li><li class="ad-invalidate"><strong>風控：</strong>SPY &lt;744.21 且 VIX &gt;20，或 10Y &gt;4.80% 且 DXY &gt;101.50，總 beta 降低 1/3。</li></ul></div>`;

const scoreRows = [
  ["四大 ETF 技術", "6／16", "20%", "8／20", "IWM／QQQ 各有 3 個弱項；SPY／DIA 月末技術完整。"],
  ["市場廣度", "9／10", "20%", "18／20", "SPX、IWM 與 Stockbee 中短線參與度偏弱。"],
  ["VIX 波動", "0／5", "10%", "0／10", "月末 VIX 15.99、VIXY 低於主要均線；尾端風險未觸發。"],
  ["板塊／主題動能", "28／54", "15%", "8／15", "科技與晶片弱、能源與金融強，分化而非全面下跌。"],
  ["50MA ATR 延伸", "4／18", "10%", "2／10", "TLT 與部分板塊處於負向極端，追價／抄底容錯率低。"],
  ["跨資產壓力", "3／4", "15%", "11／15", "10Y／TLT／USO 三項壓力成立，DXY 是緩衝。"],
  ["宏觀／事件風險", "3／3", "10%", "10／10", "八月首週 ISM、AMD／PLTR 與非農均屬高影響窗口。"],
];
const monthEndScore = `<h3>月末市場量化總分</h3><div class="risk-overview"><div class="risk-overview-score"><span>7/31 市場風險分數</span><strong data-total-score="57">57<small>/100</small></strong><em>中等風險</em></div><div class="risk-overview-body"><div class="risk-meter"><span style="width:57%"></span></div><p>指數價格與低 VIX 降低尾端風險；廣度轉弱、晶片落後及長端利率上行限制加倉。</p><small>0–34 低風險；35–59 中等風險；60–100 高風險。分項沿用 7/31 完整周報的可反算規則。</small></div></div>${table([{label:"評分維度"},{label:"原始風險",num:true},{label:"權重",num:true},{label:"風險分",num:true},{label:"量化依據"}], scoreRows.map((row) => `<tr>${cell(row[0])}${num(row[1])}${num(row[2])}<td class="num" data-score="${row[3].split("／")[0]}" data-max-score="${row[3].split("／")[1]}">${row[3]}</td>${cell(row[4])}</tr>`), "report-data-table report-cols-5 monthly-score-table")}<div class="callout warn"><strong>反算：</strong>8 + 18 + 0 + 8 + 2 + 11 + 10 = 57。分數落在中等風險上緣；若八月首週 SPY 跌破 50MA 且 VIX 升破 20，或長端／美元複合門檻觸發，風險分將進入高風險區。</div>`;

const conclusions = `<ol><li><strong>七月是風格輪動，不是指數表面所顯示的平靜。</strong>SPY +0.03%、DIA +0.40%、RSP +1.05%，但 QQQ -6.57%、IWM -3.08%、QQQE -4.05%。</li><li><strong>能源與金融接棒，科技與晶片去風險。</strong>XLE +12.13%、XLF +6.21%，對比 XLK -7.96%、SMH -17.59%；油價代理 USO 同月 +21.35%。</li><li><strong>VIX 月末偏低掩蓋科技內部波動。</strong>VIX 由 16.59 降至 15.99，但月內高點 20.88；QQQ 實現波動率 23.6%、最大回撤 10.14%。</li><li><strong>宏觀不是單向鴿派。</strong>CPI／PPI／核心 PCE 月率降溫、GDP Miss；但私人需求 3.9%、ECI 0.9%、FOMC 三張升息反對票與油價上升共同支撐長端。</li><li><strong>利率曲線是七月最關鍵的跨資產訊號。</strong>2Y +11bp、10Y +27bp、30Y +30bp，10s2s 由 +31bp 擴至 +47bp；TLT -4.47%，而 SHY +0.16%。</li><li><strong>廣度確認弱於價格。</strong>SPX／NDX／IWM 20MA 廣度均較月初下降，Stockbee 5日比由 1.68 降至 0.98，季度強弱股更翻為弱股略多。</li><li><strong>八月沒有穩定方向優勢，重點是回撤管理。</strong>2011–2025 樣本中 SPY 8月平均僅 +0.16%，IWM -0.27%；四大指數平均最大回撤約 4%–6%。</li></ol>`;

const monitoringRows = [
  ["大盤風控", "SPY &lt;50MA 744.21 且 VIX &gt;20", "747.03／15.99", "總 beta 降低 1/3。"],
  ["科技修復", "QQQ &gt;20MA 701.02；SMH &gt;20MA 571.63", "687.99／540.53", "兩者同時收回才回補科技 1/3。"],
  ["科技趨勢恢復", "QQQ &gt;50MA 714.75；SMH &gt;50MA 596.17", "687.99／540.53", "恢復標準科技部位。"],
  ["小型股接棒", "IWM &gt;20MA 293.99 且 IWM &gt;20MA 廣度 &gt;50%", "291.20／43.93%", "允許增加小型股與週期曝險。"],
  ["綜合廣度", "SPX／NDX／IWM 20MA 廣度至少兩項 &gt;60%／55%／50%，Stockbee 5日比 &gt;1", "53.28%／53.39%／43.93%／0.98", "擴大新倉與高 beta。"],
  ["長端／美元複合壓力", "10Y &gt;4.80% 且 DXY &gt;101.50", "4.75%／99.789", "科技與高 beta 再降 1/3。"],
  ["能源過熱／失效", "USO &gt;140 或 &lt;50MA 123.30", "129.17", "上破不追；跌破則能源事件倉減半。"],
  ["成長失速", "非農接近零且 ISM 服務 &lt;50", "待 8/5、8/7 公布", "降低 XLF／XLE／IWM；不把利率下跌當 risk-on。"],
];
const monitoringChecklist = table([{label:"訊號"},{label:"閾值（含出處）"},{label:"當前值",num:true},{label:"觸發動作"}], monitoringRows.map((row) => `<tr>${cell(row[0])}${cell(row[1])}${num(row[2])}${cell(row[3])}</tr>`), "report-data-table report-cols-4 monitor-month-table");

const sources = `<ul><li>長橋 OpenAPI：47 檔 ETF 的前復權日線；七月自然月、3個月、年初至今、實現波動率、最大回撤、MA、RSI，以及主要指數 2011–2025 八月季節性。取數完成時間 ${esc(market.generatedAt)}，錯誤 0。</li><li><a href="https://www.cboe.com/tradable_products/vix/vix_historical_data" target="_blank" rel="noopener">Cboe VIX 歷史資料</a>：7/1–7/31 每日開高低收。</li><li><a href="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value_month=202607&amp;type=daily_treasury_yield_curve" target="_blank" rel="noopener">美國財政部每日殖利率曲線</a>：7/1 與 7/31 的 2Y／10Y／30Y。</li><li><a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">Federal Reserve：FOMC 聲明與記者會</a>；<a href="https://www.bea.gov/news/2026/gdp-advance-estimate-2nd-quarter-2026" target="_blank" rel="noopener">BEA 第二季 GDP</a>；<a href="https://www.bea.gov/news/2026/personal-income-and-outlays-june-2026" target="_blank" rel="noopener">BEA 六月 PCE</a>。</li><li><a href="https://www.bls.gov/news.release/archives/empsit_07022026.htm" target="_blank" rel="noopener">BLS 六月就業</a>、<a href="https://www.bls.gov/news.release/cpi.nr0.htm" target="_blank" rel="noopener">CPI</a>、<a href="https://www.bls.gov/news.release/ppi.nr0.htm" target="_blank" rel="noopener">PPI</a>、<a href="https://www.bls.gov/news.release/eci.nr0.htm" target="_blank" rel="noopener">ECI</a>；<a href="https://www.bls.gov/schedule/2026/08_sched_list.htm" target="_blank" rel="noopener">八月 BLS 日程</a>。</li><li>Market Watch／Market Breadth／Stockbee：6/30 與 7/31 的三大指數 MA 廣度、T2108、5日／10日強弱比、4% 漲跌股與季度強弱股。</li></ul><p class="source-note">月度報酬不是滾動 20 日：計算基準為 2026-06-30 最後收盤至 2026-07-31 收盤。季節性為歷史統計，不是確定預測；情境概率為依 7/31 價格、廣度、利率與八月事件窗形成的主觀條件式估計。本報告不構成投資建議。</p>`;

const values = {
  report_title: "2026年7月美股月報｜輪動撐住大盤，長端與科技分化",
  report_eyebrow: "2026-08-01｜七月月報｜資料截至 2026-07-31 美股收盤",
  report_heading: "七月輪動撐住大盤；八月先看長端、廣度與科技修復",
  data_timestamp_note: "ETF 與技術面取自長橋；VIX 取自 Cboe；美債殖利率取自美國財政部。月度報酬按自然月重算，主要指數季節性使用 2011–2025 歷史樣本。這是本地草稿，尚未推送 GitHub。",
  report_badges: '<span class="badge amber">月末風險 57／100</span><span class="badge green">XLE +12.13%</span><span class="badge red">QQQ -6.57%</span><span class="badge blue">VIX 15.99</span><span class="badge grey">八月方向優勢弱</span>',
  summary_cards: `<div class="card"><span>SPY／QQQ 七月</span><strong>${pct(get("SPY").july.returnPct)}／${pct(get("QQQ").july.returnPct)}</strong><small>大盤平穩、科技顯著落後。</small></div><div class="card"><span>XLE／XLK 七月</span><strong>${pct(get("XLE").july.returnPct)}／${pct(get("XLK").july.returnPct)}</strong><small>能源與科技形成最大板塊分化。</small></div><div class="card"><span>2Y／10Y／30Y</span><strong><span class="dn">+11／+27／+30bp</span></strong><small>期限越長升幅越大。</small></div><div class="card"><span>VIX 月末／月內高</span><strong>15.99／<span class="dn">20.88</span></strong><small>月末低波動掩蓋月內壓力。</small></div>`,
  core_conclusions: conclusions,
  month_end_score: monthEndScore,
  major_indices: majorIndices,
  volatility_review: volatilityReview,
  breadth_review: breadthReview,
  sector_chart: sectorChart,
  sector_theme_tables: sectorThemeTables,
  macro_review: macroReview,
  cross_asset_review: crossAssetReview,
  seasonality_review: seasonalityReview,
  august_scenarios: augustScenarios,
  monitoring_checklist: monitoringChecklist,
  sources,
};

let html = template;
for (const [key, value] of Object.entries(values)) html = html.replaceAll(`<!-- DATA: ${key} -->`, value);
const remaining = html.match(/<!-- DATA: [^>]+ -->/g) || [];
if (remaining.length) throw new Error(`尚有未替換欄位：${remaining.join(", ")}`);
fs.writeFileSync(outputFile, html, "utf8");

const summary = {
  report_title: values.report_title,
  report_type: "monthly",
  report_month: "2026-07",
  data_as_of: "2026-07-31",
  publication_state: "local-draft",
  market_provider: market.provider,
  longbridge_rows: market.rows.length,
  longbridge_errors: market.errors,
  august_seasonality_window: market.seasonalityWindow,
  vix_august_seasonality: vixAugustSeasonality,
  scenario_probabilities: Object.fromEntries(scenarios.map((row) => [row[0], row[1]])),
  source_dates: { longbridge: "2026-07-31", vix: "2026-07-31", treasury: "2026-07-31", breadth: "2026-07-31", stockbee: "2026-07-31" },
  output: "reports/2026-07-monthly.html",
};
fs.writeFileSync(dataFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputFile}`);
console.log(`Wrote ${dataFile}`);
