#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ASSET_VERSION = "20260717-flat-2";
const RUNTIME_TAG = `<script src="report-runtime.js?v=${ASSET_VERSION}"></script>`;
const SHARED_STYLE_TAG = `<link rel="stylesheet" href="report-shared.css?v=${ASSET_VERSION}">`;
const MA_PERIODS = ["20", "50", "200"];

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

function addClass(attributes, className) {
  const classMatch = attributes.match(/\bclass=(["'])(.*?)\1/i);
  if (!classMatch) return `${attributes} class="${className}"`;
  const classes = classMatch[2].split(/\s+/).filter(Boolean);
  if (!classes.includes(className)) classes.push(className);
  return attributes.replace(classMatch[0], `class=${classMatch[1]}${classes.join(" ")}${classMatch[1]}`);
}

function getCells(row, tagName) {
  const cells = [];
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match;
  while ((match = pattern.exec(row))) {
    cells.push({
      attributes: match[1],
      inner: match[2],
      full: match[0],
      index: match.index,
    });
  }
  return cells;
}

function replaceCell(row, tagName, targetIndex, replacer) {
  let current = -1;
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return row.replace(pattern, (full, attributes, inner) => {
    current += 1;
    if (current !== targetIndex) return full;
    return replacer({ full, attributes, inner });
  });
}

function parseMaStates(text) {
  const clean = stripTags(text).replace(/\s+/g, " ").trim();
  const states = {};

  for (const period of MA_PERIODS) {
    const direct = clean.match(new RegExp(`\\b${period}\\s*([YN])\\b`, "i"));
    if (direct) states[period] = direct[1].toUpperCase() === "Y";
  }

  const grouped = /(高於|低於|上方|下方)\s*([0-9/]+)\s*MA?/g;
  let group;
  while ((group = grouped.exec(clean))) {
    const isUp = /高於|上方/.test(group[1]);
    for (const period of group[2].split("/")) {
      if (MA_PERIODS.includes(period)) states[period] = isUp;
    }
  }

  const suffix = clean.match(/(20\/50\/200)\s*(上方|下方)/);
  if (suffix) {
    const isUp = suffix[2] === "上方";
    for (const period of MA_PERIODS) states[period] = isUp;
  }

  if (MA_PERIODS.every((period) => Object.hasOwn(states, period))) return states;
  return null;
}

function renderMaStates(states) {
  return MA_PERIODS.map((period) => {
    const isUp = states[period];
    const symbol = isUp ? "▲" : "▼";
    const direction = isUp ? "上方" : "下方";
    const stateClass = isUp ? "ma-up" : "ma-down";
    return `<span class="ma-state ${stateClass}" title="${period}MA ${direction}" aria-label="${period}MA ${direction}"><span class="ma-period">${period}</span><span class="ma-arrow" aria-hidden="true">${symbol}</span></span>`;
  }).join('<span class="ma-separator" aria-hidden="true"> </span>');
}

function parseRenderedMaStates(inner) {
  const badges = [...inner.matchAll(/<span\b[^>]*class=(["'])[^"']*\bma-state\b[^"']*\1[^>]*>/gi)];
  if (badges.length !== MA_PERIODS.length) return null;
  const states = {};
  badges.forEach((badge, index) => {
    states[MA_PERIODS[index]] = /\bma-up\b/i.test(badge[0]);
  });
  return states;
}

function normalizeTable(tableHtml, options = {}) {
  const headerRow = tableHtml.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  if (!headerRow) return tableHtml;

  const headers = getCells(headerRow[1], "th").map((cell) => stripTags(cell.inner));
  const rsiIndex = headers.findIndex((header) => /^RSI$/i.test(header));
  const maIndex = headers.findIndex((header) => /Above MA/i.test(header));

  let output = tableHtml;
  if (headers.length >= 3) {
    output = output.replace(/^<table\b([^>]*)>/i, (full, attributes) => {
      let nextAttributes = addClass(attributes.replace(/\breport-cols-\d+\b/gi, ""), "report-data-table");
      nextAttributes = addClass(nextAttributes, `report-cols-${headers.length}`);
      return `<table${nextAttributes}>`;
    });
  }
  if (maIndex >= 0) {
    output = output.replace(/^<table\b([^>]*)>/i, (full, attributes) =>
      `<table${addClass(attributes, "ma-table")}>`
    );
    output = replaceCell(output, "th", maIndex, ({ attributes }) =>
      `<th${addClass(attributes, "ma-heading")}>Above MA（20/50/200）</th>`
    );
  }

  output = output.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/i, (tbodyFull, tbodyAttributes, tbodyInner) => {
    let rows = [];
    tbodyInner.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
      rows.push(row);
      return row;
    });

    if (options.removeArkk) {
      rows = rows.filter((row) => {
        const first = getCells(row, "td")[0];
        return !first || !/^ARKK\b/i.test(stripTags(first.inner));
      });
    }

    rows = rows.map((row) => {
      let next = row;

      if (rsiIndex >= 0) {
        next = replaceCell(next, "td", rsiIndex, ({ attributes, inner }) => {
          const text = stripTags(inner);
          if (!/^-?\d+(?:\.\d+)?$/.test(text)) return `<td${attributes}>${inner}</td>`;
          const value = Number(text);
          const nextAttributes = addClass(attributes.replace(/\sdata-rsi=(?:["'][^"']*["'])/gi, ""), "num");
          const rsiClass = value >= 70 ? "rsi-hot" : value <= 30 ? "rsi-cold" : "";
          const display = rsiClass ? `<span class="${rsiClass}">${value.toFixed(2)}</span>` : value.toFixed(2);
          return `<td${nextAttributes} data-rsi="${value.toFixed(2)}">${display}</td>`;
        });
      }

      if (maIndex >= 0) {
        next = replaceCell(next, "td", maIndex, ({ attributes, inner }) => {
          const states = /\bma-state\b/.test(inner) ? parseRenderedMaStates(inner) : parseMaStates(inner);
          if (!states) return `<td${attributes}>${inner}</td>`;
          return `<td${addClass(attributes, "ma-cell")}>${renderMaStates(states)}</td>`;
        });
      }

      return next;
    });

    if (options.sortByRsi && rsiIndex >= 0) {
      rows.sort((left, right) => {
        const leftCell = getCells(left, "td")[rsiIndex];
        const rightCell = getCells(right, "td")[rsiIndex];
        const leftValue = leftCell ? Number(stripTags(leftCell.inner)) : Number.NEGATIVE_INFINITY;
        const rightValue = rightCell ? Number(stripTags(rightCell.inner)) : Number.NEGATIVE_INFINITY;
        return rightValue - leftValue;
      });
    }

    return `<tbody${tbodyAttributes}>\n    ${rows.join("\n    ")}\n  </tbody>`;
  });

  return output;
}

function normalizeSections(html) {
  return html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/gi, (sectionHtml) => {
    const heading = stripTags((sectionHtml.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || "");
    const isMajor = /大盤 ETF 技術|美股指數與風格|US 指數與風格|Major ETF/i.test(heading);
    const isRsiSorted = isMajor || /Sector\s*\/\s*Thematic|Sectors?/i.test(heading);

    return sectionHtml.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) =>
      normalizeTable(tableHtml, {
        removeArkk: isMajor,
        sortByRsi: isRsiSorted && isMajor,
      })
    );
  });
}

function ensureTriggerRules(html) {
  const rules = [
    ["trigger-upgrade", "滿足 2/3 才成立"],
    ["trigger-downgrade", "任一觸發即成立"],
  ];

  let output = html;
  for (const [boxClass, fallback] of rules) {
    const boxPattern = new RegExp(`(<div class="trigger-box [^"]*${boxClass}[^"]*"[^>]*>[\\s\\S]*?<div class="tb-header"[\\s\\S]*?<\\/div>)([\\s\\S]*?<ul class="tb-list")`, "i");
    output = output.replace(boxPattern, (full, header, listStart) => {
      if (/\btb-rule\b/.test(header + listStart)) return full;
      return `${header}\n    <div class="tb-rule">${fallback}</div>${listStart}`;
    });
  }
  return output;
}

function ensureRuntime(html, reportType) {
  let output = html;
  output = output.replace(/\s*<link\b[^>]*href=(["'])report-shared\.css(?:\?v=[^"']*)?\1[^>]*>\s*/gi, "\n");
  output = output.replace(/<\/head>/i, `  ${SHARED_STYLE_TAG}\n</head>`);
  if (!/<body\b[^>]*\bdata-report-type=/i.test(output)) {
    output = output.replace(/<body\b([^>]*)>/i, `<body$1 data-report-type="${reportType}">`);
  }
  output = output.replace(/\s*<script\b[^>]*src=(["'])report-runtime\.js(?:\?v=[^"']*)?\1[^>]*><\/script>\s*/gi, "\n");
  output = output.replace(/<\/body>/i, `${RUNTIME_TAG}\n</body>`);
  return output;
}

function normalizeReportHtml(html, { reportType = "premarket" } = {}) {
  if (reportType === "postmarket") return html;
  let output = normalizeSections(html);
  output = ensureTriggerRules(output);
  output = ensureRuntime(output, reportType);
  return output;
}

function findSection(html, headingPattern) {
  const sections = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/gi) || [];
  return sections.find((section) => {
    const heading = stripTags((section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || "");
    return headingPattern.test(heading);
  }) || "";
}

function validateRsiAndMa(html, errors) {
  const sections = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/gi) || [];
  for (const section of sections) {
    const heading = stripTags((section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || "");
    const tables = section.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];

    for (const table of tables) {
      const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
      if (!headerRow) continue;
      const headers = getCells(headerRow[1], "th").map((cell) => stripTags(cell.inner));
      const rsiIndex = headers.findIndex((header) => /^RSI$/i.test(header));
      const maIndex = headers.findIndex((header) => /Above MA/i.test(header));
      const rows = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
      const rowList = rows ? rows[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [] : [];

      for (const row of rowList) {
        const cells = getCells(row, "td");
        if (rsiIndex >= 0 && cells[rsiIndex]) {
          const value = stripTags(cells[rsiIndex].inner);
          if (/^-?\d+(?:\.\d+)?$/.test(value) && !/^-?\d+\.\d{2}$/.test(value)) {
            errors.push(`${heading}: RSI "${value}" 不是兩位小數。`);
          }
        }
        if (maIndex >= 0 && cells[maIndex]) {
          const badgeCount = (cells[maIndex].inner.match(/\bma-state\b/g) || []).length;
          if (badgeCount !== 3) errors.push(`${heading}: Above MA 未渲染 20/50/200 三個狀態。`);
        }
      }
    }

    if (/大盤 ETF 技術|美股指數與風格|US 指數與風格|Major ETF/i.test(heading) && /<td[^>]*>\s*ARKK\b/i.test(section)) {
      errors.push(`${heading}: ARKK 不可出現在大盤 ETF 技術表。`);
    }
  }
}

function validateMovers(html, errors) {
  const section = findSection(html, /^Pre-market movers$/i);
  if (!section) return;
  const table = (section.match(/<table\b[^>]*>[\s\S]*?<\/table>/i) || [])[0];
  if (!table) {
    errors.push("Pre-market movers 缺少表格。");
    return;
  }
  const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const headers = headerRow ? getCells(headerRow[1], "th").map((cell) => stripTags(cell.inner)) : [];
  const tickerIndex = headers.findIndex((header) => /股票|Ticker/i.test(header));
  const priceIndex = headers.findIndex((header) => /價格|Price/i.test(header));
  const changeIndex = headers.findIndex((header) => /盤前變化|Premarket change/i.test(header));
  if (priceIndex < 0 || changeIndex < 0 || priceIndex !== changeIndex - 1) {
    errors.push("Pre-market movers 必須在「盤前變化」左側放置「價格」欄。");
    return;
  }

  const tickerPrices = new Map();
  const tbody = (table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  for (const row of tbody.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const cells = getCells(row, "td");
    const ticker = cells[tickerIndex] ? stripTags(cells[tickerIndex].inner).match(/^[A-Z]{1,6}/)?.[0] : null;
    const price = cells[priceIndex] ? stripTags(cells[priceIndex].inner) : "";
    if (ticker) tickerPrices.set(ticker, price);
    if (!ticker || !/^\$?\d[\d,]*(?:\.\d+)?$/.test(price)) {
      errors.push(`Pre-market movers 每列都要有可核對現價：${ticker || "未知標的"} = "${price || "空白"}"。`);
    }
  }

  const directive = (section.match(/<div class="action-directive"[\s\S]*?<\/div>\s*<\/section>/i) || [])[0] || section;
  const thresholdPattern = /\b([A-Z]{2,6})\s*(?:&gt;|&lt;|[<>≥≤])\s*\$?(\d+(?:\.\d+)?)/g;
  let threshold;
  while ((threshold = thresholdPattern.exec(directive))) {
    if (!tickerPrices.has(threshold[1])) {
      errors.push(`Movers 行動引用 ${threshold[1]} ${threshold[2]}，但主表沒有該標的現價。`);
    }
  }
}

function validateQqqTiers(html, errors) {
  const compact = html.replace(/\r?\n/g, " ");
  const occurrences = [...compact.matchAll(/QQQ[\s\S]{0,90}?(724\.87|728\.90)/g)];
  for (const occurrence of occurrences) {
    const snippet = occurrence[0];
    const level = occurrence[1];
    if (level === "724.87" && !/20MA|初步/i.test(snippet)) {
      errors.push(`QQQ 724.87 必須標示 20MA（初步）：${stripTags(snippet)}`);
    }
    if (level === "728.90" && !/\+1SD|1SD|突破加碼/i.test(snippet)) {
      errors.push(`QQQ 728.90 必須標示 +1SD（突破加碼）：${stripTags(snippet)}`);
    }
  }

  const textBlocks = compact.match(/<(?:li|td|div)[^>]*>[\s\S]*?<\/(?:li|td|div)>/gi) || [];
  const restoreLevels = new Set();
  const addLevels = new Set();

  for (const block of textBlocks) {
    const text = stripTags(block);
    const qqqLevel = text.match(/QQQ[^0-9]{0,30}(\d{3}(?:\.\d+)?)/i)?.[1];
    if (!qqqLevel) continue;
    if (/(?:>|<|≥|≤|收回|突破|失守)/.test(text) && !/(?:20MA|50MA|\\+1SD|VWAP)/i.test(text)) {
      errors.push(`QQQ 觸發價缺少 20MA / +1SD 等級標籤：${text}`);
    }
    if (/恢復.*(?:標準|科技配置)|初步 re-engage/i.test(text)) {
      restoreLevels.add(qqqLevel);
      if (!/20MA|初步/i.test(text)) errors.push(`QQQ 恢復標準配置未標示 20MA（初步）：${text}`);
    }
    if (/成長倉加|突破加碼|加碼.*成長/i.test(text)) {
      addLevels.add(qqqLevel);
      if (!/\+1SD|1SD|突破加碼/i.test(text)) errors.push(`QQQ 突破加碼未標示 +1SD：${text}`);
    }
  }

  if (restoreLevels.size > 1) errors.push(`QQQ 初步 re-engage 使用多個門檻：${[...restoreLevels].join(", ")}。`);
  if (addLevels.size > 1) errors.push(`QQQ +1SD 突破加碼使用多個門檻：${[...addLevels].join(", ")}。`);
  if (restoreLevels.has("728.90")) errors.push("QQQ 728.90 不可用於「恢復標準配置」；它是 +1SD 突破加碼。");
  if (addLevels.has("724.87")) errors.push("QQQ 724.87 不可用於「突破加碼」；它是 20MA 初步 re-engage。");
}

function validateTriggers(html, errors) {
  const regime = findSection(html, /油門升級|regime/i) || (html.match(/<section class="regime-triggers"[\s\S]*?<\/section>/i) || [])[0] || "";
  if (!regime) return;
  if (!/trigger-upgrade[\s\S]*?tb-rule[^>]*>\s*滿足\s*\d+\/\d+/i.test(regime)) {
    errors.push("升級訊號框缺少「滿足 N/M 才成立」。");
  }
  if (!/trigger-downgrade[\s\S]*?tb-rule[^>]*>[^<]*(?:任一觸發|滿足\s*\d+\/\d+)/i.test(regime)) {
    errors.push("降級訊號框缺少成立門檻。");
  }
}

function validateRuntime(html, errors) {
  if (!html.includes(RUNTIME_TAG)) errors.push("報告未掛載 report-runtime.js。");
  if (!html.includes(SHARED_STYLE_TAG)) errors.push("報告未掛載 report-shared.css。");
  const styleCount = (html.match(/report-shared\.css(?:\?v=[^"']*)?/gi) || []).length;
  const runtimeCount = (html.match(/report-runtime\.js(?:\?v=[^"']*)?/gi) || []).length;
  if (styleCount !== 1) errors.push(`report-shared.css 必須只載入一次，目前 ${styleCount} 次。`);
  if (runtimeCount !== 1) errors.push(`report-runtime.js 必須只載入一次，目前 ${runtimeCount} 次。`);
}

function validatePostmarketVisuals(html, errors) {
  const requiredClasses = ["hitbar", "kicker", "rsi", "pct", "atr", "ma", "chart", "bar-row", "bar-track"];
  for (const className of requiredClasses) {
    if (!new RegExp(`class=["'][^"']*\\b${className}\\b`).test(html)) {
      errors.push(`盤後報告缺少視覺元件 .${className}。`);
    }
  }
  if (!/document\.querySelectorAll\(['"]\.num, \.trend['"]\)/.test(html)) {
    errors.push("盤後報告缺少 .num / .trend 正負號著色腳本。");
  }
  if (!/report-shared\.css\?v=/.test(html)) {
    errors.push("盤後報告未使用帶版本號的共享樣式。");
  }
}

function validatePostmarketSectorThemeFormat(html, errors) {
  const reportDate = (html.match(/\b20\d{2}-\d{2}-\d{2}\b/) || [])[0] || "";
  if (reportDate && reportDate < "2026-07-23") return;

  const section = findSection(html, /^板塊與主題 ETF$/);
  if (!section) {
    errors.push("盤後報告缺少「板塊與主題 ETF」段落。");
    return;
  }

  if (!/<h3\b[^>]*>\s*S&amp;P 500 Sector ETF\s*<\/h3>/i.test(section)) {
    errors.push("板塊與主題 ETF 必須使用「S&P 500 Sector ETF」分類標題。");
  }
  if (!/<h3\b[^>]*>\s*Thematic Sector ETF\s*<\/h3>/i.test(section)) {
    errors.push("板塊與主題 ETF 必須使用「Thematic Sector ETF」分類標題。");
  }

  const tables = section.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];
  if (tables.length !== 2) {
    errors.push(`板塊與主題 ETF 必須恰有兩張表，目前 ${tables.length} 張。`);
    return;
  }

  const specs = [
    {
      label: "S&P 500 Sector ETF",
      columns: 6,
      className: "postmarket-sector-table",
      maIndex: 3,
      headerChecks: [
        (value) => value === "ETF",
        (value) => value === "最新",
        (value) => value.includes("動能") && value.includes("1日") && value.includes("5日") && value.includes("1月"),
        (value) => /^AboveMA(?:（20\/50\/200）)?$/i.test(value),
        (value) => value === "RSI",
        (value) => value === "判斷",
      ],
    },
    {
      label: "Thematic Sector ETF",
      columns: 5,
      className: "postmarket-theme-table",
      maIndex: 2,
      headerChecks: [
        (value) => value === "ETF",
        (value) => value.includes("動能") && value.includes("1日") && value.includes("5日") && value.includes("1月"),
        (value) => /^AboveMA(?:（20\/50\/200）)?$/i.test(value),
        (value) => value === "RSI",
        (value) => value === "判斷",
      ],
    },
  ];

  specs.forEach((spec, tableIndex) => {
    const table = tables[tableIndex];
    if (!new RegExp(`<table\\b[^>]*class=["'][^"']*\\b${spec.className}\\b`, "i").test(table)) {
      errors.push(`${spec.label} 必須使用 .${spec.className} 固定欄寬規則。`);
    }

    const headerRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
    const headers = headerRow
      ? getCells(headerRow[1], "th").map((cell) => stripTags(cell.inner).replace(/\s+/g, ""))
      : [];
    const headerValid = headers.length === spec.columns &&
      spec.headerChecks.every((check, index) => check(headers[index] || ""));
    if (!headerValid) {
      errors.push(`${spec.label} 欄位格式不符：${headers.join(" / ") || "無表頭"}。`);
    }

    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
    const rows = body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (rows.length === 0) errors.push(`${spec.label} 沒有 ETF 資料列。`);

    rows.forEach((row, rowIndex) => {
      const cells = getCells(row, "td");
      if (cells.length !== spec.columns) {
        errors.push(`${spec.label} 第 ${rowIndex + 1} 列必須有 ${spec.columns} 欄，目前 ${cells.length} 欄。`);
        return;
      }

      const momentumCell = cells[spec.maIndex - 1]?.inner || "";
      const momentumValues = (momentumCell.match(/<span\b/gi) || []).length;
      if (!/\betf-momentum\b/i.test(momentumCell) || momentumValues < 3) {
        errors.push(`${spec.label} 第 ${rowIndex + 1} 列缺少 1日／5日／1月三格動能。`);
      }

      const maCell = cells[spec.maIndex]?.inner || "";
      const groupClassMatch = maCell.match(/<div\b[^>]*class=(["'])([^"']*)\1/i);
      const groupClasses = (groupClassMatch?.[2] || "").split(/\s+/).filter(Boolean);
      const stateCount = (
        maCell.match(/<span\b[^>]*class=["'][^"']*\bma-state\b[^"']*["']/gi) || []
      ).length;
      if (!groupClasses.includes("ma-state-group") || stateCount !== 3) {
        errors.push(`${spec.label} 第 ${rowIndex + 1} 列 Above MA 必須使用三等分 .ma-state-group。`);
      }
      for (const period of ["20MA", "50MA", "200MA"]) {
        if (!maCell.includes(period)) {
          errors.push(`${spec.label} 第 ${rowIndex + 1} 列 Above MA 缺少 ${period}。`);
        }
      }
    });
  });
}

function validateWeeklyMacroCoverage(html, errors) {
  const fxSection = findSection(html, /外匯/);
  if (!fxSection) {
    errors.push("Weekly report 缺少外匯、商品與美債段落。");
  } else if (!/<td\b[^>]*>\s*DXY\s*<\/td>/i.test(fxSection)) {
    errors.push("外匯段落必須包含 DXY；主要來源缺列時須使用明確標示的外部收盤來源補位。");
  }

  const nextPlan = findSection(html, /下週事件與交易計畫/) || "";
  const monitor = findSection(html, /下週監控清單/) || "";
  const riskText = stripTags(`${nextPlan} ${monitor}`);
  const hasTechReduction = /(?:(?:減|降低)[^。]{0,16}(?:科技|成長|高 beta)|(?:科技|成長|高 beta)[^。]{0,16}(?:減|降低))/i.test(riskText);
  if (!/DXY\s*>\s*\d+(?:\.\d+)?/i.test(riskText) || !hasTechReduction) {
    errors.push("Weekly report 必須在下週計畫或監控清單保留數值化 DXY 減科技風控觸發。");
  }
}

function validateWeeklyMomentumWindow(html, errors) {
  const sectorSection = findSection(html, /板塊與主題 ETF 週分析/);
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
  const sectorSection = findSection(html, /板塊與主題 ETF 週分析/);
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
  const breadthSection = findSection(html, /市場廣度深度復盤/);
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

function validateReportHtml(html, { reportType = "premarket" } = {}) {
  const errors = [];
  if (reportType === "postmarket") {
    validatePostmarketVisuals(html, errors);
    validatePostmarketSectorThemeFormat(html, errors);
    return errors;
  }
  validateRsiAndMa(html, errors);
  validateQqqTiers(html, errors);
  validateTriggers(html, errors);
  validateRuntime(html, errors);
  if (reportType === "premarket") validateMovers(html, errors);
  if (reportType === "weekly") {
    validateWeeklyMacroCoverage(html, errors);
    validateWeeklyMomentumWindow(html, errors);
    validateWeeklySpyBenchmark(html, errors);
    validateWeeklyBreadthSynthesis(html, errors);
  }
  return errors;
}

function applyToFile(filePath, { reportType = "premarket", write = false } = {}) {
  const absolute = path.resolve(filePath);
  const source = fs.readFileSync(absolute, "utf8");
  const html = normalizeReportHtml(source, { reportType });
  const errors = validateReportHtml(html, { reportType });
  if (write && errors.length === 0) fs.writeFileSync(absolute, html, "utf8");
  return { html, errors, changed: html !== source };
}

module.exports = {
  RUNTIME_TAG,
  applyToFile,
  normalizeReportHtml,
  normalizeTable,
  parseMaStates,
  renderMaStates,
  stripTags,
  validateReportHtml,
};
