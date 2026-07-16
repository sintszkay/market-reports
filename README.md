# Market Reports

Static GitHub Pages site for US market monitoring reports.

Expected GitHub Pages URL:

```text
https://sintszkay.github.io/market-reports/
```

## Report generator

Premarket, weekly, and postmarket reports share one normalization and validation layer:

- `reports/_template.html`: premarket template.
- `reports/_weekly-template.html`: weekly template.
- `reports/_postmarket-template.html`: visual postmarket template.
- `_postmarket_data_schema.json`: structured visual postmarket data schema.
- `reports/report-shared.css`: shared RSI, MA, legend, and sticky navigation styles.
- `reports/report-runtime.js`: signed-number colors, RSI fallback formatting, symbol legend, and sticky table of contents.
- `scripts/render_report.js`: renders a template from JSON and refuses invalid output.
- `scripts/apply_report_rules.js`: normalizes or validates an existing HTML report.

Render a new report:

```powershell
node scripts/render_report.js --type premarket --template reports/_template.html --data data/2026-07-01.json --out reports/2026-07-01-premarket-update.html
node scripts/render_report.js --type weekly --template reports/_weekly-template.html --data data/2026-07-04-weekly.json --out reports/2026-07-04-weekly.html
node scripts/render_report.js --type postmarket --template reports/_postmarket-template.html --data data/2026-07-02-postmarket.json --out reports/2026-07-02-postmarket-recap.html
```

`--type postmarket` defaults to `reports/_postmarket-template.html`, so future postmarket recaps always use the visual hit-rate bar, sector chart, RSI, breadth, ATR, MA, and kicker components even when `--template` is omitted:

```powershell
node scripts/render_report.js --type postmarket --data data/YYYY-MM-DD-postmarket.json --out reports/YYYY-MM-DD-postmarket-recap.html
```

All three default templates use the same visual baseline. Premarket and weekly reports retain their domain-specific trigger, action, and review sections while sharing the postmarket header, card, table, color, RSI/MA, and kicker styling.

Validate or normalize an existing report:

```powershell
node scripts/apply_report_rules.js --type premarket reports/2026-06-30-premarket-update.html
node scripts/apply_report_rules.js --type weekly reports/2026-06-27-weekly.html
node scripts/apply_report_rules.js --type postmarket reports/2026-07-02-postmarket-recap.html
node scripts/apply_report_rules.js --type premarket --write reports/2026-06-30-premarket-update.html
```

## Mandatory report QA before publishing

Every new report is a local draft first. Commit/push only after the user reviews the local HTML and explicitly confirms publication.

Every new report must pass both the structural validator and the QA gate before asking for publication confirmation:

```powershell
node scripts/apply_report_rules.js --type postmarket reports/YYYY-MM-DD-postmarket-recap.html
node scripts/report_qa.js reports/YYYY-MM-DD-postmarket-recap.html
```

Use the matching `--type premarket|weekly|postmarket` for `apply_report_rules.js`.

`scripts/report_qa.js` is the publish blocker for the recurring issues we hit:

- visible mojibake / encoding garbage in report text;
- missing numeric cells such as `—`, `#N/A`, blank values in tables;
- broken table layout from putting `.pct`, `.rsi`, or `.atr` directly on `<td>`;
- table row/header column-count mismatches;
- missing core Major ETF rows when a Major ETF technical table is present;
- duplicate `report-shared.css` or `report-runtime.js` loads.

If a datapoint is genuinely unavailable, do not leave a bare dash in a numeric table cell. Mark it explicitly as unavailable in prose, or add a deliberate `data-allow-missing` marker to the cell with an explanation in the same section.

Premarket macro and earnings tables should maximize decision-useful numbers:

- Do not reserve a standalone time column unless timing is the main signal.
- Macro rows should show `Actual / Forecast / Previous`.
- Earnings rows should show EPS actual vs estimate, revenue actual vs estimate, and an explicit `Beat`, `Miss`, or `待公布` result.
- If an earnings release has not happened yet, do not infer beat/miss; show consensus and mark it `待公布`.
- Premarket mover ticker cells must stay on one line. Do not allow symbols such as `PANW` or `GOOG` to wrap by character; if the card is narrow, prefer table scrolling over broken tickers.
- Sector / thematic ETF sections must include a broad enough full table: at least 20 ETF rows when the data source has enough rows. The zero-axis momentum chart can stay compact, but the full table should cover all major S&P sector ETFs plus core themes such as biotech, cybersecurity/software, regional banks, semiconductors, AI, and commodity beta.

The validator enforces:

- QQQ 20MA as the initial re-engage tier and +1SD as the breakout-add tier.
- A verified price in every premarket-mover row and price coverage for mover directives.
- Two-decimal RSI values, ARKK exclusion from major-index tables, and three MA status markers.
- Explicit trigger-box activation counts.
- Shared visual runtime and styles.
