const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "reports", "2026-07-24-postmarket-recap.html");
const dataPath = path.join(root, "data", "2026-07-24-postmarket.json");
const html = fs.readFileSync(htmlPath, "utf8");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const errors = [];

function count(pattern) {
  return (html.match(pattern) || []).length;
}

function requireText(value, label) {
  if (!html.includes(value)) errors.push(`missing ${label}: ${value}`);
}

if (html.includes("\0")) errors.push("HTML contains NUL bytes");
if (/\{\{[^}]+\}\}|undefined|null%|NaN/.test(html)) {
  errors.push("HTML contains unresolved placeholder text");
}

[
  "收盤核心結論",
  "盤前主判斷對帳",
  "指數與風格收盤",
  "板塊與主題 ETF",
  "市場廣度與 Stockbee",
  "50MA ATR 延伸",
  "主要外匯與商品期貨",
  "宏觀數據與財報對帳",
  "下一交易日計畫",
  "交叉驗證總結",
  "QA 審查",
].forEach((heading) => requireText(heading, "required heading"));

["Polymarket / 預測市場事件風險", "關鍵位置/驅動"].forEach((removed) => {
  if (html.includes(removed)) errors.push(`removed content reappeared: ${removed}`);
});

const counts = data.reconciliation;
const expected = {
  hit: count(/result-badge result-hit/g),
  partial: count(/result-badge result-partial/g),
  miss: count(/result-badge result-miss/g),
  not_triggered: count(/result-badge result-not-triggered/g),
};
for (const key of Object.keys(expected)) {
  if (counts[key] !== expected[key]) {
    errors.push(`reconciliation ${key}: data=${counts[key]} html=${expected[key]}`);
  }
}
if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== 9) {
  errors.push("reconciliation total must equal 9");
}

[
  "SPY 738.93",
  "QQQ 684.23",
  "SMH 561.19",
  "0.84 / 0.76",
  "7/24 日線 58／58",
].forEach((value) => requireText(value, "core QA value"));

if (count(/class="ma-state-group"/g) < 35) {
  errors.push("too few aligned Above MA groups");
}
if (count(/class="[^"]*\bpostmarket-sector-table\b[^"]*"/g) !== 1) {
  errors.push("sector table fixed-layout class missing");
}
if (count(/class="[^"]*\bpostmarket-theme-table\b[^"]*"/g) !== 1) {
  errors.push("theme table fixed-layout class missing");
}
if (count(/class="bar-row"/g) < 4) errors.push("sector momentum chart is incomplete");

if (data.source_dates.Longbridge !== "2026-07-24 close, 58/58") {
  errors.push("Longbridge source date or coverage mismatch");
}
if (data.stockbee.date !== "2026-07-24") {
  errors.push("Stockbee source date mismatch");
}

if (errors.length) {
  console.error(`FAIL ${path.relative(root, htmlPath)}`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(
  `PASS ${path.relative(root, htmlPath)}: 9 reconciliation rows, ` +
  "58/58 Longbridge symbols, layout and source dates clean"
);
