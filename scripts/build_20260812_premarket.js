#!/usr/bin/env node
'use strict';

// 8/12 report reuses the stable 8/11 rendering pipeline, but injects a fully
// date-specific content layer.  This keeps the shared 45-row ETF and layout
// logic identical while preventing yesterday's narrative from leaking in.
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'build_20260811_premarket.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(/^#!.*\r?\n/, '');

source = source
  .replace("'2026-08-11-longbridge.json'", "'2026-08-12-longbridge.json'")
  .replace("'2026-08-11-longbridge-adjusted.json'", "'2026-08-12-longbridge-adjusted.json'")
  .replace("'2026-08-11-longbridge-quotes.json'", "'2026-08-12-longbridge-quotes.json'")
  .replace("'2026-08-11-google-sheet.json'", "'2026-08-12-google-sheet.json'")
  .replace('const breadthScore = 0;', 'const breadthScore = 7;')
  .replace(
    "const moverTickers = ['FSLR','AMAT','LRCX','KLAC','NVDA','SNDK','SMCI','MU','RKLB','APP','U','ABNB','PLTR','SNOW','NET','INTC'];",
    "Object.assign(moverMeta, require('./premarket_20260812_overrides').moverMeta);\n" +
    "const moverTickers = ['CAVA','SMCI','COHR','SNDK','MRVL','LRCX','MU','AMAT','KLAC','NVO','NOW','ORCL','INTC','PLTR','MSFT','AVGO'];"
  )
  .replace(
    'let html = template;',
    "Object.assign(data, require('./premarket_20260812_overrides').build({ROOT,snapshot,adjustedSnapshot,quoteSnapshot,sheetSnapshot,close,adjusted,pre,n,pct,cls,td,numTd,badge,table,volume,requireRow,requirePre,sheetTech,sectors,thematic,techTable,chartRows,vix,vixScore,technicalScore,majorTable,atrTable,fxTable,bondTable,tradeRows,expectedTable,moverTableRows}));\nfor (const key of Object.keys(data)) { if (typeof data[key] === 'string') data[key] = data[key].replaceAll('硬件','硬體').replaceAll('同业','同業').replaceAll('必须','必須').replaceAll('继续','繼續'); }\nlet html = template;"
  )
  .replace("'2026-08-11-premarket.json'", "'2026-08-12-premarket.json'")
  .replace("'2026-08-11-premarket-update.html'", "'2026-08-12-premarket-update.html'")
  .replace("report:'reports/2026-08-11-premarket-update.html'", "report:'reports/2026-08-12-premarket-update.html'");

if (!source.includes("require('./premarket_20260812_overrides').build")) {
  throw new Error('無法注入 8/12 報告覆寫層');
}

new Function('require', '__dirname', '__filename', source)(require, __dirname, sourcePath);
