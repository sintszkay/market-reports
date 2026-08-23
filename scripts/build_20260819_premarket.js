#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'build_20260818_premarket.js');
let source = fs.readFileSync(sourcePath, 'utf8').replace(/^#!.*\r?\n/, '');
const replacements = [
  ['2026-08-18-longbridge.json', '2026-08-19-longbridge.json'],
  ['2026-08-18-longbridge-adjusted.json', '2026-08-19-longbridge-adjusted.json'],
  ['2026-08-18-google-sheet.json', '2026-08-19-google-sheet.json'],
  ['const breadthScore = 4;', 'const breadthScore = 8;'],
  ["require('./premarket_20260818_overrides')", "require('./premarket_20260819_overrides')"],
  ['2026-08-18-premarket.json', '2026-08-19-premarket.json'],
  ['2026-08-18-premarket-update.html', '2026-08-19-premarket-update.html']
];
for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`找不到替換目標：${from}`);
  source = source.split(from).join(to);
}
new Function('require', '__dirname', '__filename', source)(require, __dirname, __filename);
