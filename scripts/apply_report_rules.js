#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { applyToFile } = require("./report_rules");

function usage() {
  console.error("Usage: node scripts/apply_report_rules.js --type premarket|weekly|postmarket [--write] <report.html> [...]");
}

const argv = process.argv.slice(2);
let reportType = "premarket";
let write = false;
const files = [];

for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index];
  if (token === "--type") {
    reportType = argv[index + 1];
    index += 1;
  } else if (token === "--write") {
    write = true;
  } else if (token.startsWith("--")) {
    usage();
    process.exit(2);
  } else {
    files.push(token);
  }
}

if (!["premarket", "weekly", "postmarket"].includes(reportType) || files.length === 0) {
  usage();
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) {
    console.error(`FAIL ${file}: file not found`);
    failed = true;
    continue;
  }

  const result = applyToFile(absolute, { reportType, write });
  if (result.errors.length) {
    console.error(`FAIL ${file}`);
    for (const error of result.errors) console.error(`  - ${error}`);
    failed = true;
    continue;
  }

  const mode = write && result.changed ? "normalized" : "valid";
  console.log(`PASS ${file}: ${mode}`);
}

if (failed) process.exit(1);
