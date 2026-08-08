#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUTS = path.resolve(ROOT, '..', '..', 'outputs');
const reportPath = path.join(OUTPUTS, '2026-08-07-premarket-update.html');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [
  {name:'desktop', width:1440, height:1000},
  {name:'mobile', width:390, height:844}
];

function overlaps(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:chromePath});
  const failures = [];
  const results = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({viewport:{width:viewport.width, height:viewport.height}, deviceScaleFactor:1});
      const consoleErrors = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await page.goto(pathToFileURL(reportPath).href, {waitUntil:'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const stableSelectors = ['.summary-grid .card', '.risk-check-grid .risk-check-row', '.macro-policy-overview > div'];
        const stableElements = stableSelectors.flatMap(selector => [...document.querySelectorAll(selector)]);
        const clipped = stableElements.filter(element => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2).map(element => element.className);
        const overlapPairs = [];
        for (const parent of document.querySelectorAll('.summary-grid,.risk-check-grid,.macro-policy-overview')) {
          const children = [...parent.children].map(element => ({element, rect:element.getBoundingClientRect()})).filter(item => item.rect.width > 0 && item.rect.height > 0);
          for (let i = 0; i < children.length; i += 1) {
            for (let j = i + 1; j < children.length; j += 1) {
              const a = children[i].rect;
              const b = children[j].rect;
              const hit = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
              if (hit) overlapPairs.push(`${parent.className}:${i}-${j}`);
            }
          }
        }
        const tableMismatches = [];
        for (const [index, table] of [...document.querySelectorAll('table')].entries()) {
          const expected = table.querySelectorAll('thead th').length;
          for (const [rowIndex, row] of [...table.querySelectorAll('tbody tr')].entries()) {
            const actual = row.querySelectorAll(':scope > td').length;
            if (actual !== expected) tableMismatches.push(`${index}:${rowIndex}:${actual}/${expected}`);
          }
        }
        const tableContainers = [...document.querySelectorAll('.table-scroll')];
        const escapedTables = tableContainers.filter(container => {
          const rect = container.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).length;
        return {
          bodyTextLength:body.innerText.length,
          sections:document.querySelectorAll('main section').length,
          tables:document.querySelectorAll('table').length,
          styleSheets:document.styleSheets.length,
          pageOverflow:root.scrollWidth > innerWidth + 1 || body.scrollWidth > innerWidth + 1,
          pageWidth:root.scrollWidth,
          viewportWidth:innerWidth,
          clipped,
          overlapPairs,
          tableMismatches,
          escapedTables,
          scrollableTables:tableContainers.filter(container => container.scrollWidth > container.clientWidth + 1).length,
          hasVisibleTitle:Boolean(document.querySelector('h1')?.getBoundingClientRect().height),
          hasVisibleMain:Boolean(document.querySelector('main')?.getBoundingClientRect().height)
        };
      });
      const screenshot = path.join(OUTPUTS, `qa-2026-08-07-premarket-${viewport.name}.png`);
      await page.screenshot({path:screenshot, fullPage:true});
      const checks = {
        content:metrics.bodyTextLength > 10000 && metrics.sections >= 12 && metrics.tables >= 10,
        styles:metrics.styleSheets >= 1,
        visible:metrics.hasVisibleTitle && metrics.hasVisibleMain,
        pageOverflow:!metrics.pageOverflow,
        clipping:metrics.clipped.length === 0,
        overlaps:metrics.overlapPairs.length === 0,
        tableColumns:metrics.tableMismatches.length === 0,
        tableContainers:metrics.escapedTables === 0,
        console:consoleErrors.length === 0
      };
      for (const [check, ok] of Object.entries(checks)) {
        if (!ok) failures.push(`${viewport.name}:${check}`);
      }
      results.push({viewport, screenshot, metrics, consoleErrors, checks});
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({reportPath, failures, results}, null, 2));
  if (failures.length) process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
