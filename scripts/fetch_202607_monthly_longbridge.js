#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "2026-07-monthly-market.json");
const FALLBACK_LONGPORT_PROJECT = "C:\\Users\\sints\\Documents\\Codex\\2026-05-15\\new-chat\\publish-market-reports";
const START = { year: 2009, month: 1, day: 1 };
const END = { year: 2026, month: 7, day: 31 };
const REPORT_END = "2026-07-31";

const groups = {
  major: ["SPY", "QQQ", "DIA", "IWM", "RSP", "QQQE"],
  volatility: ["VIXY"],
  sectors: ["SPY", "XLF", "XLE", "XLV", "XLY", "XLP", "XLRE", "XLI", "XLK", "XLC", "XLB", "XLU"],
  themes: ["SPY", "KIE", "XBI", "CIBR", "XSW", "SMH", "AIQ", "IBIT", "GLD", "SLV", "WGMI", "ITA", "XRT", "XOP", "KRE", "IBB", "PAVE", "XHB", "JETS", "COPX", "ARKK"],
  crossAsset: ["SHY", "IEF", "TLT", "USO", "GLD", "SLV", "CPER", "USDU", "FXE", "FXB", "FXY", "IBIT"],
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

function loadLongport() {
  try {
    return require("longport");
  } catch (_) {
    loadEnv(path.join(FALLBACK_LONGPORT_PROJECT, ".env"));
    return require(path.join(FALLBACK_LONGPORT_PROJECT, "node_modules", "longport"));
  }
}

function numeric(value) {
  const result = typeof value?.toNumber === "function" ? value.toNumber() : Number(value);
  return Number.isFinite(result) ? result : null;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function rsiWilder(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rowAtOrBefore(rows, date) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= date) return rows[index];
  }
  return null;
}

function periodStats(rows, startExclusive, endInclusive) {
  const baseline = rowAtOrBefore(rows, startExclusive);
  const period = rows.filter((row) => row.date > startExclusive && row.date <= endInclusive);
  if (!baseline || !period.length) return null;
  const path = [baseline.close, ...period.map((row) => row.close)];
  const logReturns = [];
  let upDays = 0;
  let peak = path[0];
  let maxDrawdown = 0;
  for (let index = 1; index < path.length; index += 1) {
    logReturns.push(Math.log(path[index] / path[index - 1]));
    if (path[index] > path[index - 1]) upDays += 1;
    peak = Math.max(peak, path[index]);
    maxDrawdown = Math.min(maxDrawdown, path[index] / peak - 1);
  }
  return {
    startDate: baseline.date,
    endDate: period.at(-1).date,
    startClose: baseline.close,
    endClose: period.at(-1).close,
    returnPct: (period.at(-1).close / baseline.close - 1) * 100,
    realizedVolPct: standardDeviation(logReturns) * Math.sqrt(252) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    upDayPct: upDays / period.length * 100,
    sessions: period.length,
  };
}

function augustSeasonality(rows) {
  const observations = [];
  for (let year = 2011; year <= 2025; year += 1) {
    const julyEnd = rowAtOrBefore(rows, `${year}-07-31`);
    const augustRows = rows.filter((row) => row.date >= `${year}-08-01` && row.date <= `${year}-08-31`);
    if (!julyEnd || !augustRows.length || !julyEnd.date.startsWith(`${year}-07`)) continue;
    let peak = julyEnd.close;
    let maxDrawdown = 0;
    for (const row of augustRows) {
      peak = Math.max(peak, row.close);
      maxDrawdown = Math.min(maxDrawdown, row.close / peak - 1);
    }
    observations.push({
      year,
      returnPct: (augustRows.at(-1).close / julyEnd.close - 1) * 100,
      maxDrawdownPct: maxDrawdown * 100,
    });
  }
  const returns = observations.map((row) => row.returnPct);
  const drawdowns = observations.map((row) => row.maxDrawdownPct);
  return {
    sampleStart: observations.at(0)?.year || null,
    sampleEnd: observations.at(-1)?.year || null,
    observations: observations.length,
    averageReturnPct: average(returns),
    medianReturnPct: median(returns),
    winRatePct: returns.length ? returns.filter((value) => value > 0).length / returns.length * 100 : null,
    bestReturnPct: returns.length ? Math.max(...returns) : null,
    worstReturnPct: returns.length ? Math.min(...returns) : null,
    averageMaxDrawdownPct: average(drawdowns),
    worstMaxDrawdownPct: drawdowns.length ? Math.min(...drawdowns) : null,
    yearly: observations,
  };
}

function summarize(ticker, rows) {
  const available = rows.filter((row) => row.date <= REPORT_END);
  const latest = available.at(-1);
  const closes = available.map((row) => row.close);
  const last = (count) => available.slice(-count);
  const mean = (items) => average(items.map((row) => row.close));
  const month = periodStats(available, "2026-06-30", REPORT_END);
  const quarter = periodStats(available, "2026-04-30", REPORT_END);
  const ytd = periodStats(available, "2025-12-31", REPORT_END);
  const high52w = Math.max(...last(252).map((row) => row.high));
  const ma20 = mean(last(20));
  const ma50 = mean(last(50));
  const ma200 = mean(last(200));
  return {
    ticker,
    asOf: latest?.date || null,
    close: latest?.close ?? null,
    july: month,
    threeMonthReturnPct: quarter?.returnPct ?? null,
    ytdReturnPct: ytd?.returnPct ?? null,
    rsi14: rsiWilder(closes),
    ma20,
    ma50,
    ma200,
    above20: latest ? latest.close > ma20 : null,
    above50: latest ? latest.close > ma50 : null,
    above200: latest ? latest.close > ma200 : null,
    high52w,
    distanceFrom52wHighPct: latest ? (latest.close / high52w - 1) * 100 : null,
    augustSeasonality: augustSeasonality(available),
  };
}

async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1600));
    }
  }
  throw lastError;
}

async function main() {
  const { AdjustType, Config, NaiveDate, Period, QuoteContext, TradeSessions } = loadLongport();
  const factory = Config.fromEnv || Config.fromApikeyEnv;
  const context = await QuoteContext.new(factory.call(Config));
  const tickers = [...new Set(Object.values(groups).flat())];
  const deepHistoryTickers = new Set(groups.major);
  const rows = [];
  const errors = [];
  for (const ticker of tickers) {
    try {
      const ranges = deepHistoryTickers.has(ticker)
        ? Array.from({ length: 9 }, (_, index) => {
          const startYear = START.year + index * 2;
          const endYear = Math.min(startYear + 1, END.year);
          return {
            start: new NaiveDate(startYear, 1, 1),
            end: new NaiveDate(endYear, endYear === END.year ? END.month : 12, endYear === END.year ? END.day : 31),
          };
        })
        : [{ start: new NaiveDate(START.year, START.month, START.day), end: new NaiveDate(END.year, END.month, END.day) }];
      const candles = [];
      for (const range of ranges) {
        const chunk = await retry(() => context.historyCandlesticksByDate(
          `${ticker}.US`,
          Period.Day,
          AdjustType.ForwardAdjust,
          range.start,
          range.end,
          TradeSessions.Intraday,
        ));
        candles.push(...chunk);
        if (ranges.length > 1) await new Promise((resolve) => setTimeout(resolve, 160));
      }
      const history = candles.map((candle) => ({
        date: candle.timestamp.toISOString().slice(0, 10),
        close: numeric(candle.close),
        high: numeric(candle.high),
        low: numeric(candle.low),
      })).filter((row) => row.close !== null && row.high !== null && row.low !== null)
        .sort((left, right) => left.date.localeCompare(right.date))
        .filter((row, index, all) => index === 0 || row.date !== all[index - 1].date);
      const summary = summarize(ticker, history);
      const rounded = JSON.parse(JSON.stringify(summary), (key, value) => typeof value === "number" ? round(value) : value);
      rows.push(rounded);
      process.stdout.write(`${ticker} ${history.length} ${rounded.asOf} July=${round(rounded.july?.returnPct, 2)}% August n=${rounded.augustSeasonality.observations}\n`);
    } catch (error) {
      errors.push({ ticker, error: String(error?.message || error) });
      process.stderr.write(`${ticker} ERROR ${error?.message || error}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const output = {
    generatedAt: new Date().toISOString(),
    provider: "LongBridge OpenAPI",
    reportMonth: "2026-07",
    seasonalityWindow: "2011-2025",
    methodology: {
      monthlyReturn: "2026-07-31 adjusted close / latest adjusted close on or before 2026-06-30 - 1",
      realizedVolatility: "July daily log-return sample standard deviation annualized by sqrt(252)",
      maxDrawdown: "Close-to-close drawdown from the running peak, including the 2026-06-30 baseline",
      augustSeasonality: "Each August month-end adjusted-close return from the prior July month-end; max drawdown uses daily closes",
    },
    groups,
    rows,
    errors,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  if (errors.length) throw new Error(`LongBridge 月報取數有 ${errors.length} 個錯誤：${errors.map((row) => row.ticker).join(", ")}`);
  console.log(`Wrote ${OUTPUT} (${rows.length} rows, 0 errors)`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
