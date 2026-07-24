#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "reports", "2026-07-24-premarket-update.html"), "utf8");
const data = require(path.join(root, "data", "2026-07-24-premarket.json"));

function countRows(source) {
  return (source.match(/<tr>/g) || []).length;
}

function rsiValues(source) {
  return [...source.matchAll(/data-rsi="([0-9.]+)"/g)].map((match) => Number(match[1]));
}

function descending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

function tableAfterHeading(source, heading) {
  const start = source.indexOf(`<h3>${heading}</h3>`);
  if (start < 0) return "";
  const tail = source.slice(start);
  const end = tail.indexOf("</table>");
  return end < 0 ? "" : tail.slice(0, end + 8);
}

const sector = tableAfterHeading(data.sector_thematic_etf_tables, "S&amp;P 500 Sector ETF");
const thematicSource = data.sector_thematic_etf_tables.slice(
  data.sector_thematic_etf_tables.indexOf("<h3>Thematic Sector ETF")
);
const thematicBodies = [...thematicSource.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
  .map((match) => match[1]);
const thematicRows = thematicBodies.join("");
const sectorBody = (sector.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
const allEtfRows = [...data.sector_thematic_etf_tables.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((match) => match[1]);

const stalePattern = /2026-07-23｜美股盤前|7\/22 收盤廣度|0\.91／0\.92|164／242|油價跳升推高通膨/;
const unresolvedPattern = /\{\{|undefined|NaN|REPLACE_ME|待補|不可得/;
const simplifiedPattern = /市场|风险|数据|报告|软件|芯片|长桥|宽度|上涨|下跌家数/;

const checks = {
  date: data.report_title === "2026-07-24｜美股盤前監控",
  movers: data.pre_market_movers.length,
  moverTickerPlainText: data.pre_market_movers.every((row) => /^[A-Z]{1,6}$/.test(row.ticker)),
  moverVolumeCompact: data.pre_market_movers.every((row) => /；(?:[0-9.]+萬股|[0-9,]+股)$/.test(row.catalyst)),
  sectorRows: countRows(sectorBody),
  sectorRsiDescending: descending(rsiValues(sectorBody)),
  thematicRows: countRows(thematicRows),
  thematicRsiDescending: thematicBodies.length === 2
    && thematicBodies.every((body) => descending(rsiValues(body))),
  spyInThematic: (thematicRows.match(/<strong>SPY<\/strong>/g) || []).length,
  allEtfRowsHaveThreeMa: allEtfRows.length > 0 && allEtfRows.every((row) => {
    if (!/class="etf-symbol"/.test(row)) return true;
    return (row.match(/\bma-state\b/g) || []).length === 3;
  }),
  technicalScore: /技術惡化分數 11\/12（SPY 4\/4、QQQ 4\/4、DIA 3\/4）/.test(data.correction_checklist_dashboard),
  breadthScore: /5日廣度惡化分數 8\/8（SPX 2\/2、NDX 2\/2、T2108 1\/1、Stockbee 3\/3）/.test(data.correction_checklist_dashboard),
  breadthLatest: ["43.33%", "57.65%", "31.06%", "39.80%", "47.17%", "0.97", "0.80", "138／325"]
    .every((value) => data.market_breadth_table.includes(value)),
  macroTimes: ["09:45 ET", "10:00 ET", "54.3", "51.5", "61.0萬"]
    .every((value) => data.macro_premarket_background_table.includes(value)),
  censusDateGuard: /Census 官方日期為 7\/27/.test(data.section_macro_premarket_background_avoid_action),
  sources: /Longbridge|長橋 CLI/.test(data.cross_validation_summary)
    && /Market Watch/.test(data.cross_validation_summary)
    && /Stockbee/.test(data.cross_validation_summary),
  staleData: stalePattern.test(html) || stalePattern.test(JSON.stringify(data)),
  unresolved: unresolvedPattern.test(html),
  simplifiedChineseLeak: simplifiedPattern.test(html),
};

console.log(JSON.stringify(checks, null, 2));

const pass = checks.date
  && checks.movers === 18
  && checks.moverTickerPlainText
  && checks.moverVolumeCompact
  && checks.sectorRows === 12
  && checks.sectorRsiDescending
  && checks.thematicRows === 24
  && checks.thematicRsiDescending
  && checks.spyInThematic === 1
  && checks.allEtfRowsHaveThreeMa
  && checks.technicalScore
  && checks.breadthScore
  && checks.breadthLatest
  && checks.macroTimes
  && checks.censusDateGuard
  && checks.sources
  && !checks.staleData
  && !checks.unresolved
  && !checks.simplifiedChineseLeak;

if (!pass) process.exit(1);
