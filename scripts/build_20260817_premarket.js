#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'build_20260811_premarket.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(/^#!.*\r?\n/, '');

const replacements = [
  ["2026-08-11-longbridge.json", "2026-08-17-longbridge.json"],
  ["2026-08-11-longbridge-adjusted.json", "2026-08-17-longbridge-adjusted.json"],
  ["2026-08-11-longbridge-quotes.json", "2026-08-17-longbridge.json"],
  ["2026-08-11-google-sheet.json", "2026-08-17-google-sheet.json"],
  ["const breadthScore = 0;", "const breadthScore = 2;"],
  [
    "const moverTickers = ['FSLR','AMAT','LRCX','KLAC','NVDA','SNDK','SMCI','MU','RKLB','APP','U','ABNB','PLTR','SNOW','NET','INTC'];",
    "Object.assign(moverMeta, require('./premarket_20260817_overrides').moverMeta);\nconst moverTickers = ['COHR','RKLB','PANW','ASTS','CRWD','APP','LLY','TTD','CRM','DDOG','CVNA','NVO','SMCI','NOW','RBLX','ADBE'];"
  ],
  [
    "let html = template;",
    "Object.assign(data, require('./premarket_20260817_overrides').build({ROOT,snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,requireRow,requirePre,sheetTech,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,majorTable,atrTable,fxTable,bondTable,tradeRows,expectedTable,moverTableRows,macroSheetRow}));\nlet html = template;"
  ],
  ["2026-08-11-premarket.json", "2026-08-17-premarket.json"],
  ["2026-08-11-premarket-update.html", "2026-08-17-premarket-update.html"]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`找不到替換目標：${from}`);
  source = source.split(from).join(to);
}

new Function('require', '__dirname', '__filename', source)(require, __dirname, __filename);
