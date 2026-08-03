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
const requiredFilters = ["all", "daily", "weekly", "monthly", "special"];
const filterTypes = [...html.matchAll(/data-report-filter="([^"]+)"/g)].map((match) => match[1]);

function reportTypeFromHref(href) {
  if (/-monthly\.html$/i.test(href)) return "monthly";
  if (/-weekly(?:-expected-move)?\.html$/i.test(href)) return "weekly";
  if (/(?:-special|-nvda-gtc)\.html$/i.test(href)) return "special";
  if (/(?:-premarket-update|-postmarket-recap)\.html$/i.test(href) || /reports\/\d{4}-\d{2}-\d{2}\.html$/i.test(href)) return "daily";
  return null;
}

if (!reportHrefs.length) errors.push("No report cards found.");
if (!latestHref) errors.push("Latest report link not found.");
if (latestHref && latestHref !== reportHrefs[0]) {
  errors.push(`Latest link ${latestHref} does not match first report ${reportHrefs[0]}.`);
}
if (statedCount !== reportHrefs.length) {
  errors.push(`Stated report count ${statedCount} does not match ${reportHrefs.length} cards.`);
}
requiredFilters.forEach((type) => {
  if (!filterTypes.includes(type)) errors.push(`Missing homepage report filter: ${type}.`);
});
requiredFilters.slice(1).forEach((type) => {
  if (!html.includes(`id="type-count-${type}"`)) errors.push(`Missing homepage report count: ${type}.`);
});

const categoryCounts = { daily: 0, weekly: 0, monthly: 0, special: 0 };
for (const href of reportHrefs) {
  const type = reportTypeFromHref(href);
  if (!type) errors.push(`Report cannot be classified on homepage: ${href}.`);
  else categoryCounts[type] += 1;
}
Object.entries(categoryCounts).forEach(([type, expected]) => {
  const visible = Number(html.match(new RegExp(`id="type-count-${type}">(\\d+)<\\/strong>`))?.[1]);
  if (visible !== expected) errors.push(`Homepage ${type} count ${visible} does not match ${expected} classified reports.`);
});

const duplicates = reportHrefs.filter((href, index) => reportHrefs.indexOf(href) !== index);
if (duplicates.length) errors.push(`Duplicate report links: ${[...new Set(duplicates)].join(", ")}`);

for (const href of reportHrefs) {
  if (!fs.existsSync(path.join(root, href))) errors.push(`Missing report file: ${href}`);
}

const typeRank = {
  monthly: 5,
  weekly: 4,
  "weekly-expected-move": 4,
  "mag7-tech-earnings-special": 3,
  "cibr-xsw-narrative-special": 3,
  "nvda-gtc": 3,
  "postmarket-recap": 2,
  "premarket-update": 1,
  daily: 1,
};
const reportFiles = fs.readdirSync(reportsDir)
  .map((name) => {
    const monthly = name.match(/^(\d{4}-\d{2})-monthly\.html$/);
    if (monthly) return { name, date: `${monthly[1]}-31`, type: "monthly" };
    const dated = name.match(/^(\d{4}-\d{2}-\d{2})(?:-(.+))?\.html$/);
    if (!dated) return null;
    const suffix = dated[2] || "daily";
    return { name, date: dated[1], type: suffix };
  })
  .filter(Boolean)
  .sort((left, right) =>
    right.date.localeCompare(left.date) ||
    (typeRank[right.type] || 0) - (typeRank[left.type] || 0)
  );
const reportHrefSet = new Set(reportHrefs);
const unindexedReports = reportFiles
  .map((report) => `reports/${report.name}`)
  .filter((href) => !reportHrefSet.has(href));
if (unindexedReports.length) {
  errors.push(`Report files missing from homepage index: ${unindexedReports.join(", ")}.`);
}

const sortedReportHrefs = reportFiles.map((report) => `reports/${report.name}`);
const expectedLatest = [latestHref, ...sortedReportHrefs.filter((href) => href !== latestHref)].slice(0, 4);
expectedLatest.forEach((href, index) => {
  if (reportHrefs[index] !== href) {
    errors.push(`Report position ${index + 1} should be ${href}, found ${reportHrefs[index] || "nothing"}.`);
  }
});

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
inlineScripts.forEach((match, index) => {
  try {
    new Function(match[1]);
  } catch (error) {
    errors.push(`Inline script ${index + 1} has invalid JavaScript: ${error.message}`);
  }
});

if (errors.length) {
  console.error(`Index QA failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `Index QA passed: ${reportHrefs.length} unique report links; ` +
  `日報 ${categoryCounts.daily}, 週報 ${categoryCounts.weekly}, ` +
  `月報 ${categoryCounts.monthly}, 專題報告 ${categoryCounts.special}; latest ${latestHref}.`
);
