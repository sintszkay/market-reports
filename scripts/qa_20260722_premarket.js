#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-22-premarket-update.html"), "utf8");
const data = require(path.join(root, "data", "2026-07-22-premarket.json"));
const daily = require(path.join(root, "..", "postmarket_snapshot_2026-07-21.json")).rows;
const thematicDaily = require(path.join(root, "..", "thematic_rsi_longport.json")).rows;

const tables = [...data.sector_thematic_etf_tables.matchAll(/<h3>(.*?)<\/h3><div class="table-scroll"><table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)];
const sector = tables[0]?.[2] || "";
const thematic = tables[1]?.[2] || "";
const rowCount = (source) => (source.match(/<tr>/g) || []).length;
const rsiValues = (source) => [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
const descending = (values) => values.every((value, index) => index === 0 || values[index - 1] >= value);

const checks = {
  date: data.report_title.startsWith("2026-07-22｜"),
  movers: data.pre_market_movers.length,
  moverTickerPlainText: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  moverQuantityCompact: data.pre_market_movers.every((row) => /；(?:[0-9.]+萬股|[0-9,]+股)$/.test(row.catalyst)),
  sectorRows: rowCount(sector),
  sectorRsiDescending: descending(rsiValues(sector)),
  thematicRows: rowCount(thematic),
  thematicRsiDescending: descending(rsiValues(thematic)),
  spyInThematic: (thematic.match(/<td>SPY<\/td>/g) || []).length,
  allDailyAsOf: daily.every((row) => row.asOf === "2026-07-21"),
  allThematicAsOf: thematicDaily.every((row) => row.asOf === "2026-07-21"),
  dxyIncluded: /<td>DXY<\/td>/.test(html),
  macroHeaders: /Actual[\s\S]*Forecast[\s\S]*Previous/.test(data.macro_premarket_background_table),
  exactEarningsReconciliation: /T Q2[\s\S]*Beat／Miss[\s\S]*GEV Q2[\s\S]*Miss／Beat/.test(data.macro_premarket_background_table),
  pendingActualExplicit: (data.macro_premarket_background_table.match(/待公布/g) || []).length >= 4,
  breadthIntegrated: ["NDX", "IWM", "Stockbee"].every((term) => data.stockbee_breadth_interpretation.includes(term)),
  expectedMoveTriggers: /USO[\s\S]*已突破 \+1SD[\s\S]*GLD[\s\S]*已突破 \+1SD/.test(data.trading_plan),
  maTriangles: /20MA[\s\S]*▲/.test(html) && /20MA[\s\S]*▼/.test(html),
  hasUnresolvedText: /\{\{|undefined|NaN|REPLACE_ME|待補/.test(html),
  hasStaleDate: /2026-07-(20|21)｜美股盤前監控/.test(html),
  nestedMomentumChart: /<div class="chart"[^>]*>[\s\S]*?<div class="chart"/.test(html),
  simplifiedChineseLeak: /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨/.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const pass = checks.date
  && checks.movers >= 15
  && checks.moverTickerPlainText
  && checks.moverQuantityCompact
  && checks.sectorRows === 12
  && checks.sectorRsiDescending
  && checks.thematicRows >= 20
  && checks.thematicRsiDescending
  && checks.spyInThematic === 1
  && checks.allDailyAsOf
  && checks.allThematicAsOf
  && checks.dxyIncluded
  && checks.macroHeaders
  && checks.exactEarningsReconciliation
  && checks.pendingActualExplicit
  && checks.breadthIntegrated
  && checks.expectedMoveTriggers
  && checks.maTriangles
  && !checks.hasUnresolvedText
  && !checks.hasStaleDate
  && !checks.nestedMomentumChart
  && !checks.simplifiedChineseLeak;

if (!pass) process.exit(1);
