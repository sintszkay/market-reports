#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeReportHtml, validateReportHtml } = require("./report_rules");
const postmarketVisuals = require("./postmarket_visuals");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMoverRows(rows) {
  if (!Array.isArray(rows)) return "";
  return rows.map(function (row) {
    const values = [
      row.ticker,
      row.price,
      row.premarket_change,
      row.catalyst,
      row.read_through,
      row.judgment,
    ];
    const labels = ["股票", "價格", "盤前變化", "催化 / 背景", "板塊 read-through", "判斷"];
    return "<tr>" + values.map(function (value, index) {
      const numericClass = index === 1 || index === 2 ? ' class="num"' : "";
      return `<td data-label="${labels[index]}"${numericClass}>${escapeHtml(value ?? "不可得")}</td>`;
    }).join("") + "</tr>";
  }).join("");
}

function renderPlaybookRows(rows) {
  if (!Array.isArray(rows)) return "";
  const labels = ["時段 (ET)", "觸發事件", "判讀", "行動"];
  return rows.map(function (row) {
    const values = [row.time_slot, row.trigger_event, row.interpretation, row.action];
    return "<tr>" + values.map(function (value, index) {
      return `<td data-label="${labels[index]}">${escapeHtml(value ?? "不可得")}</td>`;
    }).join("") + "</tr>";
  }).join("");
}

const args = parseArgs(process.argv.slice(2));
const reportType = args.type;
const defaultTemplates = {
  premarket: path.join(__dirname, "..", "reports", "_template.html"),
  weekly: path.join(__dirname, "..", "reports", "_weekly-template.html"),
  postmarket: path.join(__dirname, "..", "reports", "_postmarket-template.html"),
};
if (!["premarket", "weekly", "postmarket"].includes(reportType) || !args.data || !args.out) {
  console.error("Usage: node scripts/render_report.js --type premarket|weekly|postmarket [--template <template.html>] --data <data.json> --out <report.html>");
  process.exit(2);
}

const templatePath = path.resolve(args.template || defaultTemplates[reportType]);
const dataPath = path.resolve(args.data);
const outputPath = path.resolve(args.out);
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
let html = fs.readFileSync(templatePath, "utf8");

const rendered = {
  ...data,
  pre_market_movers_rows: renderMoverRows(data.pre_market_movers),
  intraday_playbook_rows: renderPlaybookRows(data.intraday_playbook_rows),
};

if (reportType === "postmarket") {
  Object.assign(rendered, {
    reconciliation_hitbar: postmarketVisuals.renderHitbar(data.reconciliation_summary),
    summary_cards: postmarketVisuals.renderSummaryCards(data.summary_cards),
    reconciliation_rows: postmarketVisuals.renderReconciliationRows(data.reconciliation_rows),
    index_rows: postmarketVisuals.renderIndexRows(data.index_rows),
    sector_chart: postmarketVisuals.renderSectorChart(data.sector_rows),
    sector_rows: postmarketVisuals.renderSectorRows(data.sector_rows),
    breadth_rows: postmarketVisuals.renderBreadthRows(data.breadth_rows),
    macro_rows: postmarketVisuals.renderMacroRows(data.macro_rows),
  });
}

for (const [key, value] of Object.entries(rendered)) {
  if (typeof value === "string" || typeof value === "number") {
    html = html.replaceAll(`<!-- DATA: ${key} -->`, String(value));
  }
}

const unresolved = [...html.matchAll(/<!-- DATA: ([^>]+) -->/g)].map(function (match) { return match[1]; });
if (unresolved.length) {
  console.error(`Unresolved placeholders: ${unresolved.join(", ")}`);
  process.exit(1);
}

html = normalizeReportHtml(html, { reportType });
const errors = validateReportHtml(html, { reportType });
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(outputPath);
