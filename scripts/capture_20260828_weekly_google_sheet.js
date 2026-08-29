#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const AS_OF = "2026-08-28";
const INPUT_PREFIX = "/tmp/2026-08-28-weekly";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

const readCsv = (name) => parseCsv(fs.readFileSync(`${INPUT_PREFIX}-${name}.csv`, "utf8"));
const numeric = (value) => {
  const text = String(value ?? "").trim();
  return text ? Number(text.replaceAll(",", "").replace("%", "")) : Number.NaN;
};
const isoDate = (value) => {
  const match = String(value ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : String(value ?? "");
};

const sector = readCsv("sector");
const thematic = readCsv("thematic");
const macro = readCsv("macro");
const breadthCsv = readCsv("breadth");
const stockbeeCsv = readCsv("stockbee");

const instrumentRows = (values) => values.filter((row, index) => index >= 2 && row[0] && Number.isFinite(numeric(row[1])) && !String(row[0]).startsWith("Updated:"));
const sectorRows = instrumentRows(sector);
const thematicRows = instrumentRows(thematic);
const breadth = breadthCsv.slice(2).filter((row) => /^2026-\d{2}-\d{2}$/.test(row[0] || "")).slice(0, 6).map((row) => ({
  date: row[0],
  spx20: numeric(row[1]),
  spx50: numeric(row[2]),
  ndx20: numeric(row[3]),
  ndx50: numeric(row[4]),
  iwm20: numeric(row[5]),
  iwm50: numeric(row[6])
}));
const stockbeeRows = stockbeeCsv.slice(2).filter((row) => /^\d{1,2}\/\d{1,2}\/2026$/.test(row[0] || "")).slice(0, 6).map((row) => ({
  date: isoDate(row[0]),
  up4: numeric(row[1]),
  down4: numeric(row[2]),
  ratio5d: numeric(row[3]),
  ratio10d: numeric(row[4]),
  quarterUp25: numeric(row[5]),
  quarterDown25: numeric(row[6]),
  monthUp25: numeric(row[7]),
  monthDown25: numeric(row[8]),
  monthUp50: numeric(row[9]),
  monthDown50: numeric(row[10]),
  up34_13: numeric(row[11]),
  down34_13: numeric(row[12]),
  universe: numeric(row[13]),
  t2108: numeric(row[14]),
  sp500: numeric(row[15])
}));

const freshness = [...sector, ...thematic, ...macro].flat().filter(Boolean).join(" ");
if (!freshness.includes("Longbridge EOD 2026-08-28")) throw new Error("Market Watch Google Sheet 尚未更新至 2026-08-28。");
if (sectorRows.length !== 18 || thematicRows.length !== 45) throw new Error(`ETF 快照不完整：Sector ${sectorRows.length}／18；Thematic ${thematicRows.length}／45。`);
if (breadth[0]?.date !== AS_OF || breadth.at(-1)?.date !== "2026-08-21") throw new Error("Maket breath 六日快照日期錯誤。");
if (stockbeeRows[0]?.date !== AS_OF || stockbeeRows.at(-1)?.date !== "2026-08-21") throw new Error("Stockbee 六日快照日期錯誤。");

const snapshot = {
  asOf: AS_OF,
  capturedAt: new Date().toISOString(),
  marketWatch: {
    spreadsheetId: "1zXbIfknybtivC5hgkqthyhqwK9OjYCKVadvJTPZrHqE",
    tabs: {
      "Sector Dashboard": {qa: "PASS", asOf: AS_OF, rowsCurrent: sectorRows.length, rowsExpected: 18},
      "Thematic Sectors": {qa: "PASS", asOf: AS_OF, rowsCurrent: thematicRows.length, rowsExpected: 45, requiredTickers: ["BUG", "PAVE", "VOO"]},
      Macro: {qa: "PASS", asOf: AS_OF, note: "Longbridge EOD 8/28；FRED H.15 visible through 8/27；週報收益率使用 U.S. Treasury 8/28 官方值。"},
      "Maket breath": {qa: "PASS", asOf: AS_OF}
    }
  },
  stockbee: {
    spreadsheetId: "1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE",
    tab: "2026",
    qa: "PASS",
    asOf: AS_OF
  },
  breadth,
  stockbeeRows,
  treasury: {
    "2026-08-21": {twoYear: 4.24, tenYear: 4.74, twentyYear: 5.25, thirtyYear: 5.27},
    "2026-08-28": {twoYear: 4.34, tenYear: 4.73, twentyYear: 5.21, thirtyYear: 5.22}
  }
};

const output = path.join(ROOT, "data", "2026-08-28-weekly-google-sheet.json");
fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: path.relative(ROOT, output),
  asOf: snapshot.asOf,
  sectorRows: sectorRows.length,
  thematicRows: thematicRows.length,
  breadthDates: breadth.map((row) => row.date),
  stockbeeDates: stockbeeRows.map((row) => row.date)
}, null, 2));
