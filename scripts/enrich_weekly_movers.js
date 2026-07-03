#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FALLBACK_LONGPORT_PROJECT = "C:\\Users\\sints\\Documents\\Codex\\2026-05-15\\new-chat\\publish-market-reports";
const RSI_PERIOD = 14;
const YEAR_SESSIONS = 252;

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

function number(value) {
  const result = typeof value?.toNumber === "function" ? value.toNumber() : Number(value);
  return Number.isFinite(result) ? result : null;
}

function rsiWilder(closes, period = RSI_PERIOD) {
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

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function moverSections(html) {
  return [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].filter((match) =>
    /<h2\b[^>]*>\s*Big (?:Winners|Losers)/i.test(match[0])
  );
}

function extractTickers(html) {
  const tickers = new Set();
  for (const section of moverSections(html)) {
    const tbody = section[0].match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
    for (const row of tbody.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
      const ticker = stripTags(row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "").toUpperCase();
      if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) tickers.add(ticker);
    }
  }
  for (const section of html.match(/<section\b[^>]*>[\s\S]*?<\/section>/gi) || []) {
    if (!/<h2\b[^>]*>\s*Sector\s*\/\s*Thematic ETF/i.test(section)) continue;
    for (const table of section.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || []) {
      const tbody = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
      for (const row of tbody.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
        const label = stripTags(row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "");
        const ticker = label.split(/\s+/)[0].toUpperCase();
        if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) tickers.add(ticker);
      }
    }
  }
  return [...tickers];
}

async function fetchTechnicals(tickers) {
  const { AdjustType, Config, Period, QuoteContext, TradeSessions } = loadLongport();
  const factory = Config.fromEnv || Config.fromApikeyEnv;
  const context = await QuoteContext.new(factory.call(Config));
  const results = {};
  for (const ticker of tickers) {
    const candles = await context.candlesticks(
      `${ticker}.US`, Period.Day, 300, AdjustType.ForwardAdjust, TradeSessions.Intraday,
    );
    const rows = candles
      .map((candle) => ({
        date: candle.timestamp.toISOString().slice(0, 10),
        close: number(candle.close),
        high: number(candle.high),
      }))
      .filter((row) => row.close !== null && row.high !== null)
      .sort((left, right) => left.date.localeCompare(right.date));
    const annual = rows.slice(-YEAR_SESSIONS);
    const latest = rows.at(-1)?.close ?? null;
    const high52w = annual.length ? Math.max(...annual.map((row) => row.high)) : null;
    results[ticker] = {
      asOf: rows.at(-1)?.date || null,
      close: latest,
      rsi14: latest === null ? null : rsiWilder(rows.map((row) => row.close)),
      high52w,
      distanceFrom52wHighPct: latest !== null && high52w ? (latest / high52w - 1) * 100 : null,
    };
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return results;
}

function format(value, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "—";
}

function addClass(attributes, className) {
  const match = attributes.match(/\bclass=(["'])(.*?)\1/i);
  if (!match) return `${attributes} class="${className}"`;
  const classes = new Set(match[2].split(/\s+/).filter(Boolean));
  classes.add(className);
  return attributes.replace(match[0], `class=${match[1]}${[...classes].join(" ")}${match[1]}`);
}

function enrichTable(table, technicals) {
  let output = table.replace(/^<table\b([^>]*)>/i, (full, attributes) =>
    `<table${addClass(attributes, "mover-state-table")}>`
  );
  output = output.replace(/<thead\b([^>]*)>([\s\S]*?)<\/thead>/i, (full, attributes, inner) => {
    if (/距52周高位/i.test(stripTags(inner))) return full;
    return `<thead${attributes}>${inner.replace(/(<th\b[^>]*>[\s\S]*?<\/th>\s*){2}/i, (firstTwo) =>
      `${firstTwo}<th class="num">RSI(14)</th><th class="num">距52周高位</th>`
    )}</thead>`;
  });
  return output.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/i, (full, attributes, inner) => {
    const rows = (inner.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => {
      const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
      const ticker = stripTags(cells[0] || "").toUpperCase();
      const data = technicals[ticker] || {};
      const rsiCell = `<td class="num" data-rsi="${format(data.rsi14)}">${format(data.rsi14)}</td>`;
      const distanceCell = `<td class="num">${format(data.distanceFrom52wHighPct, "%")}</td>`;
      if (cells.length >= 7 && /data-rsi/i.test(cells[2])) {
        cells[2] = rsiCell;
        cells[3] = distanceCell;
      } else {
        cells.splice(2, 0, rsiCell, distanceCell);
      }
      const rowAttributes = row.match(/^<tr\b([^>]*)>/i)?.[1] || "";
      return `<tr${rowAttributes}>${cells.join("")}</tr>`;
    });
    return `<tbody${attributes}>\n    ${rows.join("\n    ")}\n  </tbody>`;
  });
}

function enrichEtfTable(table, technicals) {
  let output = table.replace(/^<table\b([^>]*)>/i, (full, attributes) =>
    `<table${addClass(attributes, "etf-position-table")}>`
  );
  const headerInner = output.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1] || "";
  const headers = headerInner.match(/<th\b[^>]*>[\s\S]*?<\/th>/gi) || [];
  const rsiIndex = headers.findIndex((cell) => /^RSI(?:\(14\))?$/i.test(stripTags(cell)));
  if (rsiIndex < 0) return output;
  let distanceIndex = headers.findIndex((cell) => /距52周高位/i.test(stripTags(cell)));
  if (distanceIndex < 0) {
    headers.splice(rsiIndex + 1, 0, '<th class="num">距52周高位</th>');
    distanceIndex = rsiIndex + 1;
    output = output.replace(/(<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>)[\s\S]*?(<\/tr>[\s\S]*?<\/thead>)/i, `$1${headers.join("")}$2`);
  }
  return output.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/i, (full, attributes, inner) => {
    const rows = (inner.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => {
      const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
      const ticker = stripTags(cells[0] || "").split(/\s+/)[0].toUpperCase();
      const distanceCell = `<td class="num">${format(technicals[ticker]?.distanceFrom52wHighPct, "%")}</td>`;
      if (cells.length === headers.length) cells[distanceIndex] = distanceCell;
      else cells.splice(distanceIndex, 0, distanceCell);
      const rowAttributes = row.match(/^<tr\b([^>]*)>/i)?.[1] || "";
      return `<tr${rowAttributes}>${cells.join("")}</tr>`;
    });
    return `<tbody${attributes}>\n    ${rows.join("\n    ")}\n  </tbody>`;
  });
}

function enrichReport(html, technicals) {
  return html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/gi, (section) => {
    const isMoverSection = /<h2\b[^>]*>\s*Big (?:Winners|Losers)/i.test(section);
    if (isMoverSection) {
      return section.replace(/<table\b[^>]*>[\s\S]*?<\/table>/i, (table) => enrichTable(table, technicals));
    }
    if (/<h2\b[^>]*>\s*Sector\s*\/\s*Thematic ETF/i.test(section)) {
      return section.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => enrichEtfTable(table, technicals));
    }
    if (!/mover-state-table/i.test(section) || !/距52周高位/i.test(section)) return section;
    return section.replace(/<table\b[^>]*>[\s\S]*?<\/table>/i, (table) => {
      let repaired = table.replace(/\s*mover-state-table\b/i, "");
      repaired = repaired.replace(/<thead\b([^>]*)>([\s\S]*?)<\/thead>/i, (full, attributes, inner) => {
        const cells = inner.match(/<th\b[^>]*>[\s\S]*?<\/th>/gi) || [];
        cells.splice(2, 2);
        return `<thead${attributes}><tr>${cells.join("")}</tr></thead>`;
      });
      return repaired.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, (row, attributes, inner) => {
        if (!/<td\b/i.test(inner)) return row;
        const cells = inner.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
        cells.splice(2, 2);
        return `<tr${attributes}>${cells.join("")}</tr>`;
      });
    });
  });
}

async function main() {
  const reports = process.argv.slice(2);
  if (!reports.length) throw new Error("Usage: node scripts/enrich_weekly_movers.js <weekly-report.html> [...]");
  const firstHtml = fs.readFileSync(reports[0], "utf8");
  const tickers = extractTickers(firstHtml);
  if (!tickers.length) throw new Error("Big Winners / Big Losers 中未找到股票代码。");
  const cacheFile = path.resolve(__dirname, "..", "data", "weekly_mover_technicals.json");
  let cached = {};
  if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (Number.isFinite(age) && age < 6 * 60 * 60 * 1000) cached = cache.technicals || {};
  }
  const missingTickers = tickers.filter((ticker) => !cached[ticker]);
  const technicals = { ...cached, ...(missingTickers.length ? await fetchTechnicals(missingTickers) : {}) };
  fs.writeFileSync(cacheFile, `${JSON.stringify({ fetchedAt: new Date().toISOString(), technicals }, null, 2)}\n`);
  for (const report of reports) {
    const resolved = path.resolve(report);
    fs.writeFileSync(resolved, enrichReport(fs.readFileSync(resolved, "utf8"), technicals));
    process.stdout.write(`UPDATED ${report}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
