# Market Reports

Static GitHub Pages site for US market monitoring reports.

Expected GitHub Pages URL:

```text
https://sintszkay.github.io/market-reports/
```

## Report generator

Premarket and weekly reports share one normalization and validation layer:

- `reports/_template.html`: premarket template.
- `reports/_weekly-template.html`: weekly template.
- `reports/report-shared.css`: shared RSI, MA, legend, and sticky navigation styles.
- `reports/report-runtime.js`: signed-number colors, RSI fallback formatting, symbol legend, and sticky table of contents.
- `scripts/render_report.js`: renders a template from JSON and refuses invalid output.
- `scripts/apply_report_rules.js`: normalizes or validates an existing HTML report.

Render a new report:

```powershell
node scripts/render_report.js --type premarket --template reports/_template.html --data data/2026-07-01.json --out reports/2026-07-01-premarket-update.html
node scripts/render_report.js --type weekly --template reports/_weekly-template.html --data data/2026-07-04-weekly.json --out reports/2026-07-04-weekly.html
```

Validate or normalize an existing report:

```powershell
node scripts/apply_report_rules.js --type premarket reports/2026-06-30-premarket-update.html
node scripts/apply_report_rules.js --type weekly reports/2026-06-27-weekly.html
node scripts/apply_report_rules.js --type premarket --write reports/2026-06-30-premarket-update.html
```

The validator enforces:

- QQQ 20MA as the initial re-engage tier and +1SD as the breakout-add tier.
- A verified price in every premarket-mover row and price coverage for mover directives.
- Two-decimal RSI values, ARKK exclusion from major-index tables, and three MA status markers.
- Explicit trigger-box activation counts.
- Shared visual runtime and styles.
