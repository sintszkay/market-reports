#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const ADJUST = process.argv.includes('--adjust-forward') ? 'forward' : 'none';
const TECHNICAL_ONLY = process.argv.includes('--technical-only');
const OUTPUT = path.join(ROOT, 'data', ADJUST === 'forward' ? '2026-08-06-longbridge-adjusted.json' : '2026-08-06-longbridge.json');
const CLI = '/opt/homebrew/bin/longbridge';
const AS_OF = '2026-08-05';
const PREMARKET_DATE = '2026-08-06';

const sectors = ['SPY','XLF','XLV','XLRE','XLB','XLP','XLI','XLE','XLU','XLC','XLY','XLK'];
const themes = [
  'FXI','IAK','KIE','PPH','XRT','IHI','KWEB','XLRE','XSW','XOP','KRE','SLX','IBB','IGV','JETS','ITA',
  'CIBR','ITB','IBIT','COPX','GLD','XBI','ASHR','XHB','XMAG','SLV','OIH','VOO','XAR','PAVE','IYZ','MAGS',
  'BOTZ','ARKK','AIQ','UFO','WGMI','SMH','URA','LIT','QTUM','TAN','AIRR','REMX','BUG'
];
const indices = ['IWM','DIA','SPY','QQQ'];
const macro = ['USDU','FXE','FXB','FXY','GLD','SLV','CPER','USO','IBIT','SHY','IEF','TLT','VIXY'];
const moverCandidates = [
  'AAPL','AMZN','AMD','ANET','APP','ARM','AVGO','COIN','CRCL','CRWD','DDOG','DASH','ELF','GOOGL','HOOD',
  'INTC','KLAC','LLY','LRCX','META','MRVL','MSFT','MU','NET','NVDA','NVO','ORCL','PANW','PLTR','QCOM',
  'RBLX','RKLB','SHOP','SMCI','SNDK','SNOW','TSLA','TTD','UBER','WMT','MSTR','ASTS','AMAT','CRM','NOW','ADBE'
];
const technicalTickers = [...new Set([...sectors, ...themes, ...indices, ...macro, '.VIX'])];
const quoteTickers = [...new Set([...technicalTickers, ...moverCandidates, '.VIX'])];

function parseJsonArray(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Longbridge output did not contain a JSON array');
  return JSON.parse(stdout.slice(start, end + 1));
}

const number = value => Number(value);
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pctChange = (current, previous) => previous ? (current / previous - 1) * 100 : null;
const round = (value, digits = 4) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function wilderRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function atr14(candles) {
  if (candles.length < 15) return null;
  const trueRanges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const row = candles[index];
    const previousClose = candles[index - 1].close;
    trueRanges.push(Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose)));
  }
  return average(trueRanges.slice(-14));
}

function summarize(ticker, rawCandles) {
  const candles = rawCandles.map(row => ({
    date: row.time.slice(0, 10),
    open: number(row.open),
    high: number(row.high),
    low: number(row.low),
    close: number(row.close),
    volume: number(row.volume),
    turnover: number(row.turnover)
  })).filter(row => row.date <= AS_OF).sort((a, b) => a.date.localeCompare(b.date));
  const latest = candles.at(-1);
  if (!latest || latest.date !== AS_OF) throw new Error(`${ticker} missing ${AS_OF} close`);
  if (candles.length < 200) throw new Error(`${ticker} has only ${candles.length} candles`);
  const closes = candles.map(row => row.close);
  const ma = period => average(closes.slice(-period));
  const ma20 = ma(20);
  const ma50 = ma(50);
  const ma200 = ma(200);
  const atr = atr14(candles);
  const high52w = Math.max(...candles.slice(-252).map(row => row.high));
  const summary = {
    ticker,
    asOf: latest.date,
    ...latest,
    previousClose: candles.at(-2).close,
    dailyPct: pctChange(latest.close, candles.at(-2).close),
    fiveDayPct: pctChange(latest.close, candles.at(-6).close),
    oneMonthPct: pctChange(latest.close, candles.at(-22).close),
    ma20,
    ma50,
    ma200,
    above20: latest.close > ma20,
    above50: latest.close > ma50,
    above200: latest.close > ma200,
    rsi14: wilderRsi(closes),
    atr14: atr,
    distance50Atr: (latest.close - ma50) / atr,
    high52w,
    distanceFrom52wHighPct: pctChange(latest.close, high52w),
    history: candles.slice(-65)
  };
  return JSON.parse(JSON.stringify(summary), (key, value) => typeof value === 'number' ? round(value) : value);
}

async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
    }
  }
  throw lastError;
}

async function fetchTicker(ticker) {
  const {stdout} = await retry(() => execFileAsync(CLI, [
    'kline','history',`${ticker}.US`,'--period','day','--start','2025-08-01','--end','2026-08-05',
    '--adjust',ADJUST,'--format','json'
  ], {maxBuffer: 10 * 1024 * 1024}), 5);
  return summarize(ticker, parseJsonArray(stdout));
}

async function runPool(items, concurrency, worker) {
  const rows = [];
  const errors = [];
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        rows[index] = await worker(items[index]);
        process.stdout.write(`${items[index]} OK\n`);
      } catch (error) {
        errors.push({ticker: items[index], error: String(error?.message || error)});
        process.stderr.write(`${items[index]} ERROR ${error?.message || error}\n`);
      }
    }
  }
  await Promise.all(Array.from({length: concurrency}, runner));
  return {rows: rows.filter(Boolean), errors};
}

async function fetchQuotes() {
  const chunks = [];
  for (let index = 0; index < quoteTickers.length; index += 36) chunks.push(quoteTickers.slice(index, index + 36));
  const results = [];
  for (const chunk of chunks) {
    const symbols = chunk.map(ticker => `${ticker}.US`);
    const {stdout} = await retry(() => execFileAsync(CLI, ['quote', ...symbols, '--format', 'json'], {maxBuffer: 12 * 1024 * 1024}));
    results.push(...parseJsonArray(stdout));
  }
  return results.map(row => {
    const ticker = row.symbol.replace(/\.US$/, '');
    const session = row.pre_market && String(row.pre_market.timestamp || '').startsWith(PREMARKET_DATE) ? row.pre_market : null;
    const price = session ? number(session.last) : null;
    const previousClose = session ? number(session.prev_close) : number(row.last);
    return {
      ticker,
      timestamp: session?.timestamp || null,
      premarketAvailable: Boolean(session && price > 0),
      price,
      previousClose,
      changePct: session ? pctChange(price, number(session.prev_close)) : null,
      volume: session ? number(session.volume) : 0,
      turnover: session ? number(session.turnover) : 0,
      regularClose: number(row.last),
      regularDailyPct: number(row.change_percentage),
      raw: row
    };
  });
}

async function main() {
  const technical = await runPool(technicalTickers, 6, fetchTicker);
  const quotes = TECHNICAL_ONLY ? [] : await fetchQuotes();
  const availableQuotes = quotes.filter(row => row.premarketAvailable);
  const output = {
    generatedAt: new Date().toISOString(),
    asOf: AS_OF,
    premarketDate: PREMARKET_DATE,
    source: `Longbridge CLI ${TECHNICAL_ONLY ? '' : 'quote + '}kline history --adjust ${ADJUST}`,
    counts: {
      technicalRequested: technicalTickers.length,
      technicalSuccess: technical.rows.length,
      quoteRequested: TECHNICAL_ONLY ? 0 : quoteTickers.length,
      premarketAvailable: availableQuotes.length
    },
    universes: {sectors, themes, indices, macro, moverCandidates},
    rows: technical.rows,
    errors: technical.errors,
    quotes
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({output: path.relative(ROOT, OUTPUT), counts: output.counts, errors: output.errors}, null, 2));
  if (technical.errors.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
