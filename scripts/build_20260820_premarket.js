#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'build_20260818_premarket.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(/^#!.*\r?\n/, '');

const replacements = [
  ['2026-08-18-longbridge.json', '2026-08-20-longbridge.json'],
  ['2026-08-18-longbridge-adjusted.json', '2026-08-20-longbridge-adjusted.json'],
  ['2026-08-18-google-sheet.json', '2026-08-20-google-sheet.json'],
  ["require('./premarket_20260818_overrides')", "require('./premarket_20260820_overrides')"],
  ["'const breadthScore = 2;', 'const breadthScore = 4;'", "'const breadthScore = 2;', 'const breadthScore = 8;'"],
  ['2026-08-18-premarket.json', '2026-08-20-premarket.json'],
  ['2026-08-18-premarket-update.html', '2026-08-20-premarket-update.html']
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`找不到替換目標：${from}`);
  source = source.split(from).join(to);
}

new Function('require', '__dirname', '__filename', source)(require, __dirname, __filename);
