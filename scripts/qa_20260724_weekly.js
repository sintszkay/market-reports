#!/usr/bin/env node
const fs = require("fs");

const file = process.argv[2] || "reports/2026-07-24-weekly.html";
const html = fs.readFileSync(file, "utf8");
const failures = [];

function requireText(pattern, message) {
  if (!pattern.test(html)) failures.push(message);
}

function count(pattern) {
  return (html.match(pattern) || []).length;
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getCells(rowHtml, tagName) {
  const cells = [];
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match;
  while ((match = pattern.exec(rowHtml))) {
    cells.push({ attributes: match[1] || "", text: stripTags(match[2] || "") });
  }
  return cells;
}

function hasClass(attributes, className) {
  const match = String(attributes || "").match(/\bclass=(["'])([^"']*)\1/i);
  return Boolean(match && match[2].split(/\s+/).includes(className));
}

requireText(/data-report-type="weekly"/, "report type must be weekly");
requireText(/美股一週總結：科技財報降估值/, "weekly headline missing");
requireText(/板塊與主題 ETF 週分析/, "weekly sector section missing");
requireText(/市場廣度深度復盤/, "weekly breadth section missing");
requireText(/50MA ATR 週延伸/, "weekly ATR section missing");
requireText(/DXY\s*&gt;101\.50|DXY &gt;101\.50/, "numeric DXY risk trigger missing");
requireText(/科技與高 beta 再降低 1\/3/, "technology reduction action missing");
requireText(/2 已觸發/, "reconciliation count missing");
requireText(/7 未觸發/, "reconciliation count missing");
requireText(/58／58/, "Longbridge completeness check missing");
requireText(/SPX &gt;20MA|SPX >20MA/, "SPX breadth missing");
requireText(/NDX &gt;20MA|NDX >20MA/, "NDX breadth missing");
requireText(/IWM &gt;20MA|IWM >20MA/, "IWM breadth missing");
requireText(/5日廣度惡化分數 9\/10（SPX 1\/2、NDX 2\/2、IWM 2\/2、T2108 1\/1、Stockbee 3\/3）/, "computed 5-day breadth score is missing or incorrect");
requireText(/VIX 波動分數 3\/5（&gt;20 0\/1、5日&gt;0 0\/1、1月&gt;0 1\/1、20MA 1\/1、50MA 1\/1）/, "computed VIX score is missing or incorrect");
requireText(/三大指數技術惡化分數 12\/12（SPY 4\/4、QQQ 4\/4、IWM 4\/4）/, "computed three-index technical score is missing or incorrect");
requireText(/Checklist Score：<\/strong>6\/8 High = High Risk/, "computed checklist High count is missing or incorrect");
requireText(/<h2>市場量化總分<\/h2>/, "composite market score section missing");
requireText(/市場風險分數<\/span><strong>85<small>\/100<\/small><\/strong><em>High Risk<\/em>/, "market risk score or level is incorrect");
for (const component of ["20/20", "18/20", "6/10", "10/15", "6/10", "15/15", "10/10"]) {
  requireText(new RegExp(`>${component.replace("/", "\\/")}<`), `market score component ${component} missing`);
}
if (/Weekly Expected Move|Expected range review|週度預期波動|1SD 關鍵位/.test(html)) {
  failures.push("deleted Weekly Expected Move section returned");
}

if (count(/<link rel="stylesheet" href="report-shared\.css/g) !== 1) {
  failures.push("report-shared.css must be included exactly once");
}
if (count(/<script src="report-runtime\.js/g) !== 1) {
  failures.push("report-runtime.js must be included exactly once");
}
if (/Polymarket|預測市場/.test(html)) {
  failures.push("deleted prediction-market section returned");
}
if (!/\.flat-report\s+\.report-data-table\s+th\.ma-heading\s*\{[^}]*text-align\s*:\s*center/i.test(html)) {
  failures.push("shared MA header centering rule missing");
}
if (!/\.flat-report\s+\.report-data-table\s+td\.ma-cell\s*\{[^}]*text-align\s*:\s*center/i.test(html)) {
  failures.push("shared MA cell centering rule missing");
}

const alignedTables = [...html.matchAll(/<table\b[^>]*class=(["'])([^"']*\breport-data-table\b[^"']*)\1[^>]*>[\s\S]*?<\/table>/gi)];
for (const tableMatch of alignedTables) {
  const tableHtml = tableMatch[0];
  const headerRow = tableHtml.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const body = tableHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!headerRow || !body) continue;
  const headers = getCells(headerRow[1], "th");
  const rows = (body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => getCells(row, "td"));
  for (let index = 0; index < headers.length; index += 1) {
    const cells = rows.map((row) => row[index]).filter(Boolean);
    if (!cells.length) continue;
    const numericCells = cells.filter((cell) => hasClass(cell.attributes, "num"));
    const maCells = cells.filter((cell) => hasClass(cell.attributes, "ma-cell"));
    const resultCells = cells.filter((cell) => hasClass(cell.attributes, "result-cell"));
    if (numericCells.length >= Math.ceil(cells.length * 0.6) && !hasClass(headers[index].attributes, "num")) {
      failures.push(`${headers[index].text} numeric header alignment missing`);
    }
    if (hasClass(headers[index].attributes, "num") && numericCells.length !== cells.length) {
      failures.push(`${headers[index].text} numeric cells do not share header alignment`);
    }
    if (maCells.length && !hasClass(headers[index].attributes, "ma-heading")) {
      failures.push(`${headers[index].text} MA header alignment missing`);
    }
    if (resultCells.length && !hasClass(headers[index].attributes, "result-heading")) {
      failures.push(`${headers[index].text} result header alignment missing`);
    }
  }
}

for (const heading of ["S&amp;P 500 Sector ETF", "Thematic Sector ETF"]) {
  const start = html.indexOf(`<h3>${heading}</h3>`);
  if (start < 0) {
    failures.push(`${heading} heading missing`);
    continue;
  }
  const end = html.indexOf("</table>", start);
  const fragment = html.slice(start, end + 8);
  const spyCount = countIn(fragment, /<td>SPY<\/td>/g);
  if (spyCount !== 1) failures.push(`${heading} must contain one SPY row; found ${spyCount}`);
}

const indexSectionStart = html.indexOf("<h2>美股指數與風格復盤</h2>");
const indexSectionEnd = html.indexOf("</section>", indexSectionStart);
const indexSection = indexSectionStart >= 0 ? html.slice(indexSectionStart, indexSectionEnd) : "";
const indexTable = indexSection.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
const indexHeaderRow = indexTable.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
const indexBody = indexTable.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
if (!indexHeaderRow || !indexBody) {
  failures.push("index/style RSI table missing");
} else {
  const indexHeaders = getCells(indexHeaderRow[1], "th");
  const rsiIndex = indexHeaders.findIndex((header) => /^RSI$/i.test(header.text));
  const indexRows = indexBody[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rsiValues = indexRows.map((row) => {
    const cell = getCells(row, "td")[rsiIndex];
    const match = cell?.text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
  });
  if (rsiIndex < 0 || rsiValues.some((value) => !Number.isFinite(value))) {
    failures.push("index/style RSI values are not verifiable");
  } else if (rsiValues.some((value, index) => index > 0 && value > rsiValues[index - 1])) {
    failures.push("index/style table must be sorted by RSI descending");
  }
}

function countIn(text, pattern) {
  return (text.match(pattern) || []).length;
}

if (failures.length) {
  console.error(`FAIL ${file}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS ${file}: weekly content QA clean`);
