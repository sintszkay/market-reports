#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {chromium} = require("playwright");

const root = path.resolve(__dirname, "..");
const outputs = path.resolve(root, "..", "..", "outputs");
const reportPath = path.join(outputs, "2026-08-07-weekly.html");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewports = [
  {name:"desktop", width:1440, height:1000},
  {name:"mobile", width:390, height:844}
];

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:chromePath});
  const failures = [];
  const results = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
      const consoleErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await page.goto(pathToFileURL(reportPath).href, {waitUntil:"networkidle"});
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const stable = [...document.querySelectorAll(".grid .card,.trigger-box,.risk-overview,.action-directive")];
        const clipped = stable.filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2).map((element) => element.className);
        const overlapPairs = [];
        for (const parent of document.querySelectorAll(".grid,.regime-triggers")) {
          const children = [...parent.children].map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
          for (let left = 0; left < children.length; left += 1) {
            for (let right = left + 1; right < children.length; right += 1) {
              const a = children[left];
              const b = children[right];
              if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2) overlapPairs.push(`${parent.className}:${left}-${right}`);
            }
          }
        }
        const tableMismatches = [];
        for (const [index, table] of [...document.querySelectorAll("table")].entries()) {
          const expected = table.querySelectorAll("thead th").length;
          for (const [rowIndex, row] of [...table.querySelectorAll("tbody tr")].entries()) {
            const actual = row.querySelectorAll(":scope > td").length;
            if (actual !== expected) tableMismatches.push(`${index}:${rowIndex}:${actual}/${expected}`);
          }
        }
        const tableContainers = [...document.querySelectorAll(".table-scroll")];
        const escapedTables = tableContainers.filter((container) => {
          const rect = container.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).length;
        const maMisalignment = [...document.querySelectorAll(".ma-state-group")].filter((group) => {
          const states = [...group.querySelectorAll(":scope > .ma-state")];
          if (states.length !== 3) return true;
          const widths = states.map((state) => state.getBoundingClientRect().width);
          return Math.max(...widths) - Math.min(...widths) > 2;
        }).length;
        return {
          bodyTextLength:body.innerText.length,
          sections:document.querySelectorAll("main section").length,
          tables:document.querySelectorAll("table").length,
          styleSheets:document.styleSheets.length,
          pageOverflow:root.scrollWidth > innerWidth + 1 || body.scrollWidth > innerWidth + 1,
          pageWidth:root.scrollWidth,
          viewportWidth:innerWidth,
          clipped,
          overlapPairs,
          tableMismatches,
          escapedTables,
          scrollableTables:tableContainers.filter((container) => container.scrollWidth > container.clientWidth + 1).length,
          maMisalignment,
          sectorRows:document.querySelector('table[data-etf-group="sector"]')?.querySelectorAll("tbody tr").length || 0,
          thematicRows:document.querySelector('table[data-etf-group="thematic"]')?.querySelectorAll("tbody tr").length || 0,
          hasVisibleTitle:Boolean(document.querySelector("h1")?.getBoundingClientRect().height),
          hasVisibleMain:Boolean(document.querySelector("main")?.getBoundingClientRect().height)
        };
      });
      const screenshot = path.join(outputs, `qa-2026-08-07-weekly-${viewport.name}.png`);
      await page.screenshot({path:screenshot,fullPage:true});
      const checks = {
        content:metrics.bodyTextLength > 14000 && metrics.sections >= 13 && metrics.tables >= 12,
        styles:metrics.styleSheets >= 1,
        visible:metrics.hasVisibleTitle && metrics.hasVisibleMain,
        pageOverflow:!metrics.pageOverflow,
        clipping:metrics.clipped.length === 0,
        overlaps:metrics.overlapPairs.length === 0,
        tableColumns:metrics.tableMismatches.length === 0,
        tableContainers:metrics.escapedTables === 0,
        maAlignment:metrics.maMisalignment === 0,
        universes:metrics.sectorRows === 12 && metrics.thematicRows === 45,
        console:consoleErrors.length === 0
      };
      for (const [check, ok] of Object.entries(checks)) if (!ok) failures.push(`${viewport.name}:${check}`);
      results.push({viewport,screenshot,metrics,consoleErrors,checks});
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({reportPath,failures,results}, null, 2));
  if (failures.length) process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
