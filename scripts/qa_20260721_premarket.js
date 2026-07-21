#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-21-premarket-update.html"), "utf8");
const data = require(path.join(root, "data", "2026-07-21-premarket.json"));
const tables = [...data.sector_thematic_etf_tables.matchAll(/<h3>(.*?)<\/h3><div class="table-scroll"><table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)];
const sector = tables[0]?.[2] || "";
const thematic = tables[1]?.[2] || "";
const rowCount = (source) => (source.match(/<tr>/g) || []).length;
const rsiValues = (source) => [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
const descending = (values) => values.every((value, index) => index === 0 || values[index - 1] >= value);

const checks = {
  movers: data.pre_market_movers.length,
  sectorRows: rowCount(sector),
  sectorRsiDescending: descending(rsiValues(sector)),
  thematicRows: rowCount(thematic),
  thematicRsiDescending: descending(rsiValues(thematic)),
  spyInThematic: (thematic.match(/<td>SPY<\/td>/g) || []).length,
  dxyIncluded: /<td>DXY<\/td>/.test(html),
  macroHeaders: /Actual[\s\S]*Forecast[\s\S]*Previous/.test(data.macro_premarket_background_table),
  earningsBeatRows: (data.macro_premarket_background_table.match(/Beat／Beat/g) || []).length,
  hasUnresolvedText: /\{\{|undefined|NaN|REPLACE_ME|待補/.test(html),
  hasStaleTitle: /2026-07-20｜美股盤前監控/.test(html),
  moverTickerPlainText: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  nestedMomentumChart: /<div class="chart"[^>]*>[\s\S]*?<div class="chart"/.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const pass = checks.movers >= 15
  && checks.sectorRows === 12
  && checks.sectorRsiDescending
  && checks.thematicRows >= 20
  && checks.thematicRsiDescending
  && checks.spyInThematic === 1
  && checks.dxyIncluded
  && checks.macroHeaders
  && checks.earningsBeatRows >= 3
  && !checks.hasUnresolvedText
  && !checks.hasStaleTitle
  && checks.moverTickerPlainText
  && !checks.nestedMomentumChart;

if (!pass) process.exit(1);
