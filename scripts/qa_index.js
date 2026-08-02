const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const reportsDir = path.join(root, "reports");
const html = fs.readFileSync(indexPath, "utf8");

const errors = [];
const reportMatches = [...html.matchAll(/<article class="report">[\s\S]*?<a class="button" href="([^"]+)">/g)];
const reportHrefs = reportMatches.map((match) => match[1]);
const latestHref = html.match(/<header class="masthead">[\s\S]*?<a class="button" href="([^"]+)">最新報告<\/a>/)?.[1];
const statedCount = Number(html.match(/<span id="report-count">(\d+)<\/span>/)?.[1]);

if (!reportHrefs.length) errors.push("No report cards found.");
if (!latestHref) errors.push("Latest report link not found.");
if (latestHref && latestHref !== reportHrefs[0]) {
  errors.push(`Latest link ${latestHref} does not match first report ${reportHrefs[0]}.`);
}
if (statedCount !== reportHrefs.length) {
  errors.push(`Stated report count ${statedCount} does not match ${reportHrefs.length} cards.`);
}

const duplicates = reportHrefs.filter((href, index) => reportHrefs.indexOf(href) !== index);
if (duplicates.length) errors.push(`Duplicate report links: ${[...new Set(duplicates)].join(", ")}`);

for (const href of reportHrefs) {
  if (!fs.existsSync(path.join(root, href))) errors.push(`Missing report file: ${href}`);
}

const typeRank = {
  monthly: 5,
  weekly: 4,
  "mag7-tech-earnings-special": 3,
  "cibr-xsw-narrative-special": 3,
  "postmarket-recap": 2,
  "premarket-update": 1,
};
const reportFiles = fs.readdirSync(reportsDir)
  .map((name) => {
    const match = name.match(/^(\d{4}-\d{2}-\d{2})-(premarket-update|postmarket-recap|weekly|mag7-tech-earnings-special|cibr-xsw-narrative-special)\.html$/);
    if (match) return { name, date: match[1], type: match[2] };
    const monthly = name.match(/^(\d{4}-\d{2})-monthly\.html$/);
    return monthly ? { name, date: `${monthly[1]}-31`, type: "monthly" } : null;
  })
  .filter(Boolean)
  .sort((left, right) =>
    right.date.localeCompare(left.date) ||
    typeRank[right.type] - typeRank[left.type]
  );
const reportHrefSet = new Set(reportHrefs);
const unindexedReports = reportFiles
  .map((report) => `reports/${report.name}`)
  .filter((href) => !reportHrefSet.has(href));
if (unindexedReports.length) {
  errors.push(`Report files missing from homepage index: ${unindexedReports.join(", ")}.`);
}

const expectedLatest = reportFiles
  .slice(0, 4)
  .map((report) => `reports/${report.name}`);
expectedLatest.forEach((href, index) => {
  if (reportHrefs[index] !== href) {
    errors.push(`Report position ${index + 1} should be ${href}, found ${reportHrefs[index] || "nothing"}.`);
  }
});

if (errors.length) {
  console.error(`Index QA failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Index QA passed: ${reportHrefs.length} unique report links, latest ${latestHref}.`);
