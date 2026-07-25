#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateReportHtml } = require("./report_rules");

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

function hasClass(attributes, className) {
  const match = String(attributes || "").match(/\bclass=(["'])([^"']*)\1/i);
  if (!match) return false;
  return match[2].split(/\s+/).includes(className);
}

function validateTableAlignment(html, errors) {
  const tables = [...html.matchAll(/<table\b[^>]*class=(["'])([^"']*\breport-data-table\b[^"']*)\1[^>]*>[\s\S]*?<\/table>/gi)];
  for (const tableMatch of tables) {
    const table = tableMatch[0];
    const section = sectionHeadingBefore(html, tableMatch.index);
    const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
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
        errors.push(`${section}: 「${headers[index].text}」內容靠右但表頭未使用 num 對齊類別。`);
      }
      if (hasClass(headers[index].attributes, "num") && numericCells.length !== cells.length) {
        errors.push(`${section}: 「${headers[index].text}」表頭為 num，但有 ${cells.length - numericCells.length} 列未使用相同靠右對齊。`);
      }
      if (maCells.length && !hasClass(headers[index].attributes, "ma-heading")) {
        errors.push(`${section}: 「${headers[index].text}」MA 內容置中，但表頭未使用 ma-heading。`);
      }
      if (resultCells.length && !hasClass(headers[index].attributes, "result-heading")) {
        errors.push(`${section}: 「${headers[index].text}」結果內容置中，但表頭未使用 result-heading。`);
      }
    }
  }

  if (/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) {
    const hasWeeklyMaRule = /\.flat-report\s+\.report-data-table\s+th\.ma-heading\s*\{[^}]*text-align\s*:\s*center/i.test(html);
    const hasWeeklyMaCellRule = /\.flat-report\s+\.report-data-table\s+td\.ma-cell\s*\{[^}]*text-align\s*:\s*center/i.test(html);
    if (!hasWeeklyMaRule) {
      errors.push("Weekly report 必須提供 report-data-table 的 ma-heading 置中規則，避免共用 th 樣式覆蓋。");
    }
    if (!hasWeeklyMaCellRule) {
      errors.push("Weekly report 必須提供 report-data-table 的 ma-cell 置中規則，避免共用 td 樣式覆蓋。");
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

function validateWeeklyIndexRsiOrder(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const indexSection = sections.find((section) => /<h2\b[^>]*>\s*美股指數與風格復盤\s*<\/h2>/i.test(section)) || "";
  const table = indexSection.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!headerRow || !body) {
    errors.push("Weekly report 美股指數與風格復盤缺少可驗證的 RSI 表格。");
    return;
  }

  const headers = getCells(headerRow[1], "th");
  const rsiIndex = headers.findIndex((header) => /^RSI$/i.test(header.text));
  if (rsiIndex < 0) {
    errors.push("Weekly report 美股指數與風格復盤缺少 RSI 欄。");
    return;
  }

  const rows = body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rsiValues = rows.map((row) => {
    const cell = getCells(row, "td")[rsiIndex];
    const match = cell?.text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
  });
  if (rsiValues.some((value) => !Number.isFinite(value))) {
    errors.push("Weekly report 美股指數與風格復盤含不可解析的 RSI 值。");
    return;
  }
  for (let index = 1; index < rsiValues.length; index += 1) {
    if (rsiValues[index] > rsiValues[index - 1]) {
      errors.push(`Weekly report 美股指數與風格復盤必須按 RSI 由高至低排列；第 ${index + 1} 列發生逆序。`);
      return;
    }
  }
}

function validateWeeklyVixScore(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const indexSection = sections.find((section) => /<h2\b[^>]*>\s*美股指數與風格復盤\s*<\/h2>/i.test(section)) || "";
  const table = indexSection.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!headerRow || !body) {
    errors.push("Weekly VIX scoring requires the index/style table.");
    return;
  }

  const headers = getCells(headerRow[1], "th");
  const latestIndex = headers.findIndex((header) => header.text === "最新");
  const fiveDayIndex = headers.findIndex((header) => header.text === "5日");
  const oneMonthIndex = headers.findIndex((header) => header.text === "1月");
  const maIndex = headers.findIndex((header) => /20\/50\/200MA/i.test(header.text));
  const rows = (body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => getCells(row, "td"));
  const vixRow = rows.find((row) => row[0]?.text === "VIX");
  if (!vixRow || [latestIndex, fiveDayIndex, oneMonthIndex, maIndex].some((index) => index < 0)) {
    errors.push("Weekly VIX scoring cannot locate all required VIX inputs.");
    return;
  }

  const close = Number(vixRow[latestIndex].text.replace("%", ""));
  const fiveDay = Number(vixRow[fiveDayIndex].text.replace("%", ""));
  const oneMonth = Number(vixRow[oneMonthIndex].text.replace("%", ""));
  const maHtml = vixRow[maIndex].html;
  const maStates = Object.fromEntries(
    [...maHtml.matchAll(/<span\b[^>]*class=["'][^"']*\bma-state\s+(ma-up|ma-down|ma-na)\b[^"']*["'][^>]*>\s*<span\b[^>]*class=["'][^"']*\bma-period\b[^"']*["'][^>]*>\s*(\d+)MA\s*<\/span>/gi)]
      .map((match) => [Number(match[2]), match[1]])
  );
  const above20 = maStates[20] === "ma-up";
  const above50 = maStates[50] === "ma-up";
  if (![close, fiveDay, oneMonth].every(Number.isFinite)) {
    errors.push("Weekly VIX scoring contains an unparseable price or return.");
    return;
  }

  const expectedScore = Number(close > 20) + Number(fiveDay > 0) + Number(oneMonth > 0) + Number(above20) + Number(above50);
  const expectedLevel = expectedScore >= 4 ? "High" : expectedScore >= 2 ? "Intermediate" : "Low";
  const visible = stripTags(stripBlocks(html));
  const scoreMatch = visible.match(/VIX >20\s*\/\s*VIX spike\s*\/\s*波動升溫\s*(Low|Intermediate|High)\s*VIX 波動分數\s*(\d+)\s*\/\s*5/i);
  if (!scoreMatch) {
    errors.push("Weekly correction checklist must display the computed VIX score out of 5.");
    return;
  }
  if (Number(scoreMatch[2]) !== expectedScore || scoreMatch[1] !== expectedLevel) {
    errors.push(`Weekly VIX score mismatch: expected ${expectedScore}/5 ${expectedLevel}, found ${scoreMatch[2]}/5 ${scoreMatch[1]}.`);
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

  const table = breadthSection.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!body) {
    errors.push("Weekly breadth scoring requires a readable breadth table.");
    return;
  }
  const rows = (body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => getCells(row, "td"));
  const rowMap = new Map(rows.filter((row) => row.length >= 3).map((row) => [row[0].text, row]));
  let expectedScore = 0;
  for (const label of ["SPX >20MA", "SPX >50MA", "NDX >20MA", "NDX >50MA", "IWM >20MA", "IWM >50MA", "T2108"]) {
    const transition = rowMap.get(label)?.[2]?.text.match(/(-?\d+(?:\.\d+)?)%?\s*→\s*(-?\d+(?:\.\d+)?)%?/);
    if (!transition) {
      errors.push(`Weekly breadth scoring cannot parse the 5-day transition for ${label}.`);
      return;
    }
    expectedScore += Number(transition[2]) < Number(transition[1]) ? 1 : 0;
  }

  const ratio5 = Number(rowMap.get("Stockbee 5D ratio")?.[1]?.text);
  const ratio10 = Number(rowMap.get("Stockbee 10D ratio")?.[1]?.text);
  const advanceDecline = rowMap.get("4%+ 上漲／下跌")?.[1]?.text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!Number.isFinite(ratio5) || !Number.isFinite(ratio10) || !advanceDecline) {
    errors.push("Weekly breadth scoring cannot parse Stockbee ratios or 4% advance/decline counts.");
    return;
  }
  expectedScore += ratio5 < 1 ? 1 : 0;
  expectedScore += ratio10 < 1 ? 1 : 0;
  expectedScore += Number(advanceDecline[2]) > Number(advanceDecline[1]) ? 1 : 0;

  const visible = stripTags(stripBlocks(html));
  const scoreMatch = visible.match(/Market breadth worsening\s*\/\s*市場廣度惡化\s*(Low|Intermediate|High)\s*5日廣度惡化分數\s*(\d+)\s*\/\s*10/i);
  if (!scoreMatch) {
    errors.push("Weekly correction checklist must display the computed 5-day breadth score out of 10.");
    return;
  }
  const expectedLevel = expectedScore >= 7 ? "High" : expectedScore >= 4 ? "Intermediate" : "Low";
  if (Number(scoreMatch[2]) !== expectedScore || scoreMatch[1] !== expectedLevel) {
    errors.push(`Weekly breadth score mismatch: expected ${expectedScore}/10 ${expectedLevel}, found ${scoreMatch[2]}/10 ${scoreMatch[1]}.`);
  }

  const checklistLevels = [...html.matchAll(/<div\b[^>]*class=(["'])[^"']*\bcheck\b[^"']*\1[^>]*>[\s\S]*?<span\b[^>]*class=(["'])[^"']*\bbadge\b[^"']*\2[^>]*>\s*(Low|Intermediate|High)\s*<\/span>/gi)].map((match) => match[3]);
  const highCount = checklistLevels.filter((level) => level === "High").length;
  const checklistScore = visible.match(/Checklist Score：\s*(\d+)\s*\/\s*8 High/i);
  if (checklistLevels.length !== 8 || !checklistScore || Number(checklistScore[1]) !== highCount) {
    errors.push(`Weekly Checklist Score must equal its computed High-item count; found ${checklistLevels.length} items and ${highCount} High.`);
  }
}

function validateWeeklyMarketRiskScore(html, errors) {
  if (!/<body\b[^>]*data-report-type=["']weekly["']/i.test(html)) return;
  const visible = stripTags(stripBlocks(html));
  if (/Weekly Expected Move|Expected range review|週度預期波動|1SD 關鍵位/i.test(visible)) {
    errors.push("Weekly Expected Move 對帳已停用，不可重新出現在週報。");
  }

  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]);
  const scoreSection = sections.find((section) => /<h2\b[^>]*>\s*市場量化總分\s*<\/h2>/i.test(section)) || "";
  const table = scoreSection.match(/<table\b[^>]*class=(["'])[^"']*\bmarket-score-table\b[^"']*\1[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!scoreSection || !body) {
    errors.push("Weekly report 必須以市場量化總分取代 Weekly Expected Move 對帳。");
    return;
  }

  const requiredDimensions = ["三大指數技術", "市場廣度", "VIX 波動", "板塊／主題動能", "50MA ATR 延伸", "跨資產壓力", "宏觀／事件風險"];
  const rows = (body[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => getCells(row, "td"));
  const rowMap = new Map(rows.filter((row) => row.length >= 5).map((row) => [row[0].text, row]));
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const dimension of requiredDimensions) {
    const row = rowMap.get(dimension);
    const raw = row?.[1]?.text.match(/(\d+)\s*\/\s*(\d+)/);
    const weight = row?.[2]?.text.match(/(\d+)%/);
    const weighted = row?.[3]?.text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!raw || !weight || !weighted) {
      errors.push(`Weekly market score cannot parse ${dimension}.`);
      return;
    }

    const rawScore = Number(raw[1]);
    const rawMax = Number(raw[2]);
    const componentWeight = Number(weight[1]);
    const riskPoints = Number(weighted[1]);
    const riskMax = Number(weighted[2]);
    const expectedPoints = Math.round(rawScore / rawMax * componentWeight);
    if (rawMax <= 0 || riskMax !== componentWeight || riskPoints !== expectedPoints) {
      errors.push(`${dimension} score mismatch: ${rawScore}/${rawMax} at ${componentWeight}% must equal ${expectedPoints}/${componentWeight}.`);
    }
    weightedTotal += riskPoints;
    weightTotal += componentWeight;
  }

  const overview = stripTags(scoreSection).match(/市場風險分數\s*(\d+)\s*\/\s*100\s*(Low Risk|Intermediate Risk|High Risk)/i);
  const expectedLevel = weightedTotal >= 60 ? "High Risk" : weightedTotal >= 35 ? "Intermediate Risk" : "Low Risk";
  if (weightTotal !== 100 || !overview || Number(overview[1]) !== weightedTotal || overview[2] !== expectedLevel) {
    errors.push(`Weekly market score must total 100 weight points and display ${weightedTotal}/100 ${expectedLevel}.`);
  }
}

function validateReport(file) {
  const html = fs.readFileSync(file, "utf8");
  const errors = [];
  if (/<body\b[^>]*data-report-type=["']postmarket["']/i.test(html)) {
    errors.push(...validateReportHtml(html, { reportType: "postmarket" }));
  }
  validateVisibleText(html, errors);
  validateAssets(html, errors);
  validateDangerousTableClasses(html, errors);
  validateTables(html, errors);
  validateTableAlignment(html, errors);
  validateWeeklyRequiredSections(html, errors);
  validateWeeklyMacroCoverage(html, errors);
  validateWeeklyMomentumWindow(html, errors);
  validateWeeklySpyBenchmark(html, errors);
  validateWeeklyIndexRsiOrder(html, errors);
  validateWeeklyVixScore(html, errors);
  validateWeeklyBreadthSynthesis(html, errors);
  validateWeeklyMarketRiskScore(html, errors);
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
