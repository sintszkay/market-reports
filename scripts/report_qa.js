#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MOJIBAKE_PATTERN = /[�]|锛|鐩|閹|馃|鈥|瑷|鍫|绲|妯|鍍|铏|褰|瀵|绋|绶|婊|妾|棰|闋|瑕栬|鍙嶅悜|璩囨枡|鐩ゅ|鍫卞|妯℃澘|閸/g;
const MISSING_VALUES = new Set(["", "—", "-", "–", "#N/A", "N/A", "NA", "null", "undefined"]);
const CORE_MAJOR_ETFS = ["QQQ", "SMH", "VOO", "IWM", "RSP", "DIA", "VIX"];

function usage() {
  console.error("Usage: node scripts/report_qa.js <report.html> [...]");
}

function stripBlocks(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function stripTags(value) {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCells(rowHtml, tagName) {
  const cells = [];
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match;
  while ((match = pattern.exec(rowHtml))) {
    cells.push({ attributes: match[1] || "", html: match[2] || "", text: stripTags(match[2] || "") });
  }
  return cells;
}

function sectionHeadingBefore(html, tableIndex) {
  const before = html.slice(0, tableIndex);
  const headings = [...before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  return headings.length ? stripTags(headings.at(-1)[1]) : "Unknown section";
}

function isNumericHeader(text) {
  return /(收盤|最新|PRICE|價格|1日|日變|5日|10日|1月|RSI|ATR|距52|52週|YTD|Move|Close|1SD|2SD|ratio|T2108|上漲|下跌|高位|高)/i.test(text);
}

function hasAllowMissing(attributes) {
  return /\bdata-allow-missing\b/i.test(attributes) || /\ballow-missing\b/i.test(attributes);
}

function validateVisibleText(html, errors) {
  const visible = stripTags(stripBlocks(html));
  const matches = [...visible.matchAll(MOJIBAKE_PATTERN)].slice(0, 20).map((match) => match[0]);
  if (matches.length) {
    errors.push(`可見文字疑似亂碼：${[...new Set(matches)].join(" / ")}`);
  }
  const questionRuns = [...visible.matchAll(/\?{3,}/g)].slice(0, 10).map((match) => match[0]);
  if (questionRuns.length) {
    errors.push("可見文字出現連續問號，疑似編碼遺失。");
  }
}

function validateAssets(html, errors) {
  const cssCount = (html.match(/report-shared\.css(?:\?v=[^"']*)?/gi) || []).length;
  const jsCount = (html.match(/report-runtime\.js(?:\?v=[^"']*)?/gi) || []).length;
  if (cssCount !== 1) errors.push(`report-shared.css 必須只載入一次，目前 ${cssCount} 次`);
  if (jsCount !== 1) errors.push(`report-runtime.js 必須只載入一次，目前 ${jsCount} 次`);
}

function validateDangerousTableClasses(html, errors) {
  const dangerous = [...html.matchAll(/<td\b[^>]*class=(["'])(?=[^"']*\b(?:pct|rsi|atr)\b)([^"']*)\1[^>]*>/gi)];
  for (const match of dangerous.slice(0, 10)) {
    errors.push(`表格 td 不可使用 pct/rsi/atr class，會破壞 table layout：class="${match[2]}"`);
  }

  const textHitbars = [...html.matchAll(/<div\b[^>]*class=(["'])(?=[^"']*\bhitbar\b)[^"']*\1[^>]*>\s*<span\b/gi)];
  if (textHitbars.length) {
    errors.push("`.hitbar` 是共享進度條元件，不可直接放文字 span；文字統計請使用 `.recon-pills` 或 `.hitbar-legend`");
  }
}

function validateTables(html, errors) {
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  for (const tableMatch of tables) {
    const table = tableMatch[0];
    const section = sectionHeadingBefore(html, tableMatch.index);
    const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
    if (!headerRow) {
      errors.push(`${section}: 表格缺少 thead/header row`);
      continue;
    }
    const headers = getCells(headerRow[1], "th");
    const numericIndexes = headers
      .map((cell, index) => ({ index, text: cell.text }))
      .filter((item) => isNumericHeader(item.text))
      .map((item) => item.index);
    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!body) {
      errors.push(`${section}: 表格缺少 tbody`);
      continue;
    }
    const rows = body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (!rows.length) errors.push(`${section}: 表格沒有資料行`);

    for (const [rowIndex, row] of rows.entries()) {
      const cells = getCells(row, "td");
      const first = cells[0]?.text || `row ${rowIndex + 1}`;
      if (cells.length !== headers.length) {
        errors.push(`${section}: ${first} 欄數 ${cells.length} != 表頭 ${headers.length}`);
      }
      for (const index of numericIndexes) {
        const cell = cells[index];
        if (!cell || hasAllowMissing(cell.attributes)) continue;
        const value = cell.text.replace(/\s+/g, "");
        if (MISSING_VALUES.has(value) && !/不可得|未取得|不適用/.test(row)) {
          errors.push(`${section}: ${first} 的「${headers[index]?.text || index + 1}」缺值`);
        }
      }
    }

    if (/大盤|Major ETF|技術面|指數/.test(section) && headers.some((cell) => /Above MA|20\/50\/200/.test(cell.text))) {
      const present = new Set(rows.map((row) => (getCells(row, "td")[0]?.text || "").split(/\s+/)[0].toUpperCase()));
      const missing = CORE_MAJOR_ETFS.filter((ticker) => !present.has(ticker));
      if (missing.length) errors.push(`${section}: 核心 ETF 行缺失：${missing.join(", ")}`);
    }
  }
}

function validateWeeklyRequiredSections(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const visible = stripTags(stripBlocks(html));
  const hasAtrSection = /50MA\s*ATR/i.test(visible) && /ATR\(14\)/i.test(visible) && /距50MA\s*ATR/i.test(visible);
  if (!hasAtrSection) {
    errors.push("Weekly report 必須包含「50MA ATR 週延伸」表，且欄位需含 ATR(14) / 距50MA ATR。");
  }
}

function validateWeeklyMacroCoverage(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const fxSection = sections.find((section) => /<h2\b[^>]*>[\s\S]*?外匯[\s\S]*?<\/h2>/i.test(section)) || "";
  if (!fxSection) {
    errors.push("Weekly report 缺少外匯、商品與美債段落。");
  } else if (!/<td\b[^>]*>\s*DXY\s*<\/td>/i.test(fxSection)) {
    errors.push("外匯段落必須包含 DXY；主要來源缺列時須使用明確標示的外部收盤來源補位。");
  }

  const planSections = sections.filter((section) => /<h2\b[^>]*>[\s\S]*?下週(?:事件與交易計畫|監控清單)[\s\S]*?<\/h2>/i.test(section));
  const riskText = stripTags(planSections.join(" "));
  const hasTechReduction = /(?:(?:減|降低)[^。]{0,16}(?:科技|成長|高 beta)|(?:科技|成長|高 beta)[^。]{0,16}(?:減|降低))/i.test(riskText);
  if (!/DXY\s*>\s*\d+(?:\.\d+)?/i.test(riskText) || !hasTechReduction) {
    errors.push("Weekly report 必須在下週計畫或監控清單保留數值化 DXY 減科技風控觸發。");
  }
}

function validateWeeklyMomentumWindow(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const sectorSection = sections.find((section) => /<h2\b[^>]*>[\s\S]*?板塊與主題 ETF 週分析[\s\S]*?<\/h2>/i.test(section)) || "";
  if (!sectorSection) {
    errors.push("Weekly report 缺少板塊與主題 ETF 週分析段落。");
    return;
  }

  const titleMatch = sectorSection.match(/class=["'][^"']*\bchart-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const chartTitle = stripTags(titleMatch?.[1] || "");
  if (!/(?:本週|5日)/.test(chartTitle)) {
    errors.push("Weekly report 動能長條圖必須使用本週／5日窗口，不能只畫 1 月漲跌。");
  }

  const barCount = (sectorSection.match(/class=["'][^"']*\bbar-row\b[^"']*["']/gi) || []).length;
  if (barCount < 5 || barCount > 8) errors.push(`Weekly report 動能長條圖必須包含 5–8 檔 ETF，目前 ${barCount} 檔。`);
  if (!/class=["'][^"']*\bval\s+pos\b/i.test(sectorSection) || !/class=["'][^"']*\bval\s+neg\b/i.test(sectorSection)) {
    errors.push("Weekly report 動能長條圖必須同時呈現領漲與領跌 ETF。");
  }
}

function validateWeeklySpyBenchmark(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const sectorSection = sections.find((section) => /<h2\b[^>]*>\s*板塊與主題 ETF 週分析\s*<\/h2>/i.test(section)) || "";
  if (!sectorSection) return;

  const tableSpecs = [
    ["S&P 500 Sector ETF", /<h3\b[^>]*>\s*S&amp;P 500 Sector ETF\s*<\/h3>[\s\S]*?<table\b[\s\S]*?<\/table>/i],
    ["Thematic Sector ETF", /<h3\b[^>]*>\s*Thematic Sector ETF\s*<\/h3>[\s\S]*?<table\b[\s\S]*?<\/table>/i],
  ];
  const expectedHeaders = ["ETF", "5日", "1月", "距52週高", "20/50/200MA", "RSI", "判斷"];
  for (const [label, pattern] of tableSpecs) {
    const table = sectorSection.match(pattern)?.[0] || "";
    const spyCount = (table.match(/<td\b[^>]*>\s*SPY\s*<\/td>/gi) || []).length;
    if (spyCount !== 1) errors.push(`${label} must contain exactly one SPY benchmark row; found ${spyCount}.`);
    const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => stripTags(match[1]));
    if (headers.join("|") !== expectedHeaders.join("|")) {
      errors.push(`${label} must use the shared seven-column ETF layout: ${expectedHeaders.join(" / ")}.`);
    }
    if (!/<table\b[^>]*class=["'][^"']*\breport-cols-7\b[^"']*["']/i.test(table)) {
      errors.push(`${label} must use report-cols-7 so both ETF tables share the same column widths.`);
    }
  }
}

function validateWeeklyBreadthSynthesis(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const breadthSection = sections.find((section) => /<h2\b[^>]*>\s*市場廣度深度復盤\s*<\/h2>/i.test(section)) || "";
  if (!breadthSection) return;

  const sectionText = stripTags(breadthSection);
  const requiredRows = ["SPX >20MA", "SPX >50MA", "NDX >20MA", "NDX >50MA", "IWM >20MA", "IWM >50MA", "Stockbee 5D ratio", "Stockbee 10D ratio", "4%+ 上漲／下跌"];
  for (const label of requiredRows) {
    if (!sectionText.includes(label)) errors.push(`Weekly breadth table is missing ${label}.`);
  }

  const tableEnd = breadthSection.search(/<\/table>/i);
  const synthesisText = stripTags(tableEnd >= 0 ? breadthSection.slice(tableEnd + 8) : "");
  const requiredSynthesis = ["三大指數廣度", "SPX", "NDX", "IWM", "與 Stockbee 交叉驗證", "Stockbee", "綜合結論", "短線", "中期"];
  for (const label of requiredSynthesis) {
    if (!synthesisText.includes(label)) errors.push(`Weekly breadth conclusion must synthesize ${label}, not summarize Stockbee alone.`);
  }
}

function validateReport(file) {
  const html = fs.readFileSync(file, "utf8");
  const errors = [];
  validateVisibleText(html, errors);
  validateAssets(html, errors);
  validateDangerousTableClasses(html, errors);
  validateTables(html, errors);
  validateWeeklyRequiredSections(html, errors);
  validateWeeklyMacroCoverage(html, errors);
  validateWeeklyMomentumWindow(html, errors);
  validateWeeklySpyBenchmark(html, errors);
  validateWeeklyBreadthSynthesis(html, errors);
  return errors;
}

const files = process.argv.slice(2);
if (!files.length) {
  usage();
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`FAIL ${file}: file not found`);
    failed = true;
    continue;
  }
  const errors = validateReport(resolved);
  if (errors.length) {
    console.error(`FAIL ${file}`);
    for (const error of errors) console.error(`  - ${error}`);
    failed = true;
  } else {
    console.log(`PASS ${file}: report QA clean`);
  }
}

if (failed) process.exit(1);
