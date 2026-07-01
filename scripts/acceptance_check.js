#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { stripTags, validateReportHtml } = require("./report_rules");

const root = path.resolve(__dirname, "..");
const premarketPath = path.join(root, "reports", "2026-06-30-premarket-update.html");
const weeklyPath = path.join(root, "reports", "2026-06-27-weekly.html");
const premarketTemplatePath = path.join(root, "reports", "_template.html");
const weeklyTemplatePath = path.join(root, "reports", "_weekly-template.html");
const runtimePath = path.join(root, "reports", "report-runtime.js");
const sharedCssPath = path.join(root, "reports", "report-shared.css");

const premarket = fs.readFileSync(premarketPath, "utf8");
const weekly = fs.readFileSync(weeklyPath, "utf8");
const premarketTemplate = fs.readFileSync(premarketTemplatePath, "utf8");
const weeklyTemplate = fs.readFileSync(weeklyTemplatePath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");
const sharedCss = fs.readFileSync(sharedCssPath, "utf8");

const checks = [];

function check(id, title, condition, detail = "") {
  checks.push({ id, title, condition: Boolean(condition), detail });
}

function sectionByHeading(html, headingPattern) {
  return (html.match(/<section\b[^>]*>[\s\S]*?<\/section>/gi) || []).find(function (section) {
    const heading = stripTags((section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || "");
    return headingPattern.test(heading);
  }) || "";
}

function tableByHeading(html, headingPattern) {
  const section = sectionByHeading(html, headingPattern);
  return (section.match(/<table\b[^>]*>[\s\S]*?<\/table>/i) || [])[0] || "";
}

const premarketErrors = validateReportHtml(premarket, { reportType: "premarket" });
const weeklyErrors = validateReportHtml(weekly, { reportType: "weekly" });

const qqq724 = [...premarket.matchAll(/QQQ[\s\S]{0,100}?724\.87/g)].map(function (match) { return stripTags(match[0]); });
const qqq728 = [...premarket.matchAll(/QQQ[\s\S]{0,100}?728\.90/g)].map(function (match) { return stripTags(match[0]); });
check(
  "P0-1",
  "QQQ 20MA / +1SD 兩級門檻一致",
  qqq724.length > 0 && qqq728.length > 0 &&
    qqq724.every(function (text) { return /20MA|初步/.test(text); }) &&
    qqq728.every(function (text) { return /\+1SD|突破加碼/.test(text); }) &&
    premarketErrors.every(function (error) { return !error.startsWith("QQQ"); }),
  `724.87 occurrences=${qqq724.length}; 728.90 occurrences=${qqq728.length}`
);

const movers = tableByHeading(premarket, /^Pre-market movers$/i);
const moverHeaders = [...movers.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(function (match) { return stripTags(match[1]); });
const moverRows = [...((movers.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
const allMoverPrices = moverRows.every(function (row) {
  const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(function (match) { return stripTags(match[1]); });
  return /^\d[\d,]*(?:\.\d+)?$/.test(cells[1] || "");
});
check(
  "P0-2",
  "Movers 價格欄與下游絕對價覆蓋",
  moverHeaders[1] === "價格" && moverHeaders[2] === "盤前變化" && allMoverPrices &&
    premarketErrors.every(function (error) { return !/Movers|movers/.test(error); }),
  `rows=${moverRows.length}; headers=${moverHeaders.slice(0, 3).join("/")}`
);

const rsiCells = [...premarket.matchAll(/<td\b[^>]*data-rsi="([^"]+)"[^>]*>([^<]+)<\/td>/gi)];
check(
  "P1-3",
  "RSI 一律保留兩位小數",
  rsiCells.length > 0 && rsiCells.every(function (match) { return /^-?\d+\.\d{2}$/.test(match[2].trim()); }),
  `RSI cells=${rsiCells.length}`
);

const premarketMajor = sectionByHeading(premarket, /大盤 ETF 技術/i);
const weeklyMajor = sectionByHeading(weekly, /美股指數與風格/i);
check(
  "P1-4",
  "ARKK 只留 Thematic，不進大盤 ETF",
  !/<td[^>]*>\s*ARKK\b/i.test(premarketMajor) &&
    !/<td[^>]*>\s*ARKK\b/i.test(weeklyMajor) &&
    /Thematic[\s\S]*?<td[^>]*>\s*ARKK\b/i.test(premarket)
);

check(
  "P1-5",
  "升降級框顯示成立項數",
  /trigger-upgrade[\s\S]*?滿足 2\/3 才成立/.test(premarket) &&
    /trigger-downgrade[\s\S]*?任一觸發即成立/.test(premarket) &&
    /trigger-upgrade[\s\S]*?滿足 2\/3 才成立/.test(weekly) &&
    /trigger-downgrade[\s\S]*?任一觸發即成立/.test(weekly)
);

function majorRowsHaveThreeMaBadges(section) {
  const table = (section.match(/<table\b[^>]*>[\s\S]*?<\/table>/i) || [])[0] || "";
  const rows = ((table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || "").match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  return rows.length > 0 && rows.every(function (row) {
    return (row.match(/\bma-state\b/g) || []).length === 3;
  });
}
check(
  "P1-6",
  "Above MA 使用 20/50/200 ✓/✗",
  majorRowsHaveThreeMaBadges(premarketMajor) && majorRowsHaveThreeMaBadges(weeklyMajor)
);

check(
  "V-7",
  "td.num 正負號自動配色",
  sharedCss.includes(".num.up{color:var(--green)}.num.dn{color:var(--red)}") &&
    runtime.includes("document.querySelectorAll('td.num').forEach(function(c)") &&
    runtime.includes("if(/^\\+/.test(t))c.classList.add('up')") &&
    runtime.includes("else if(/^[-−]/.test(t))c.classList.add('dn')")
);

check(
  "V-8",
  "RSI 過熱/超賣著色",
  /class="[^"]*rsi-hot/.test(premarket) &&
    /class="[^"]*rsi-cold/.test(premarket) &&
    sharedCss.includes("td.rsi-hot") &&
    sharedCss.includes("td.rsi-cold")
);

const legendText = "● 主要　◐ 條件/次要　◎ 觀察　✕ 避免　⚠ 反向訊號　↑ 升級　↓ 降級";
check(
  "V-9",
  "頂部摘要後加入完整符號圖例",
  runtime.includes(legendText) && runtime.includes('summary.insertAdjacentElement("afterend", legend)')
);

check(
  "V-10",
  "Sticky 迷你目錄可跳所有 h2",
  sharedCss.includes(".report-toc{position:sticky") &&
    runtime.includes('document.querySelectorAll("main h2")') &&
    runtime.includes('link.href = "#" + heading.id') &&
    /<h2>交易計畫<\/h2>/.test(premarketTemplate) &&
    /<h2>盤中觸發劇本<\/h2>/.test(premarketTemplate)
);

check(
  "Templates",
  "Premarket / weekly 模板均掛載共用規則",
  /pre_market_movers_rows/.test(premarketTemplate) &&
    /<th class="num">價格<\/th><th class="num">盤前變化<\/th>/.test(premarketTemplate) &&
    /upgrade_trigger_rule/.test(premarketTemplate) &&
    /upgrade_trigger_rule/.test(weeklyTemplate) &&
    /report-runtime\.js/.test(premarketTemplate) &&
    /report-runtime\.js/.test(weeklyTemplate)
);

check(
  "Validators",
  "兩種實際報告通過嚴格驗證",
  premarketErrors.length === 0 && weeklyErrors.length === 0,
  [...premarketErrors, ...weeklyErrors].join(" | ")
);

let failed = false;
for (const item of checks) {
  const status = item.condition ? "PASS" : "FAIL";
  console.log(`${status} ${item.id} — ${item.title}${item.detail ? ` (${item.detail})` : ""}`);
  if (!item.condition) failed = true;
}

if (failed) process.exit(1);
