#!/usr/bin/env node
'use strict';

const https = require('node:https');

const endDate = process.argv[2] || new Date().toISOString().slice(0, 10);
const end = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000) + 86400;
const start = end - 400 * 86400;
const url = `https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?period1=${start}&period2=${end}&interval=1d&events=history`;

const get = target => new Promise((resolve, reject) => {
  https.get(target, {headers: {'User-Agent': 'Mozilla/5.0'}}, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => response.statusCode === 200 ? resolve(body) : reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`)));
  }).on('error', reject);
});

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (value, previous) => (value / previous - 1) * 100;

function rsiWilder(closes, period = 14) {
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

(async () => {
  const payload = JSON.parse(await get(url));
  const result = payload.chart.result[0];
  const closes = result.indicators.quote[0].close;
  const rows = result.timestamp.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: closes[index] == null ? null : Number(closes[index])
  })).filter(row => Number.isFinite(row.close) && row.date <= endDate);
  const values = rows.map(row => row.close);
  const current = values.at(-1);
  const output = {
    symbol: 'DX-Y.NYB',
    source: 'Yahoo Finance chart API',
    asOf: rows.at(-1).date,
    close: current,
    dailyPct: pct(current, values.at(-2)),
    fiveDayPct: pct(current, values.at(-6)),
    oneMonthPct: pct(current, values.at(-22)),
    rsi14: rsiWilder(values),
    ma20: average(values.slice(-20)),
    ma50: average(values.slice(-50)),
    ma200: average(values.slice(-200)),
    above20: current > average(values.slice(-20)),
    above50: current > average(values.slice(-50)),
    above200: current > average(values.slice(-200))
  };
  console.log(JSON.stringify(output, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
