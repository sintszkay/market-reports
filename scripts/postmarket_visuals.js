"use strict";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function roundedPercent(value) {
  return Math.round(clamp(value));
}

function renderHitbar(summary = {}) {
  const hit = Number(summary.hit) || 0;
  const notTriggered = Number(summary.not_triggered ?? summary.partial) || 0;
  const miss = Number(summary.miss) || 0;
  const total = hit + notTriggered + miss;
  const width = (value) => total ? (value / total * 100).toFixed(2).replace(/\.00$/, "") : "0";
  const segments = [
    hit ? `<i class="h" style="width:${width(hit)}%"></i>` : "",
    notTriggered ? `<i class="n" style="width:${width(notTriggered)}%"></i>` : "",
    miss ? `<i class="m" style="width:${width(miss)}%"></i>` : "",
  ].join("");
  return `<div class="hitbar" role="img" aria-label="盤前判斷：${hit} 命中、${miss} 失誤、${notTriggered} 未觸發">${segments}</div>
  <div class="hitbar-legend">盤前判斷對賬：<span class="dot h"></span><b>${hit}</b> 命中<span class="dot m"></span><b>${miss}</b> 失誤<span class="dot n"></span><b>${notTriggered}</b> 未觸發</div>`;
}

function renderSummaryCards(cards = []) {
  return cards.map(function (card) {
    let value;
    if (Array.isArray(card.values)) {
      const parts = card.values.map(function (item) {
        const color = item.color ? ` style="color:var(--${escapeHtml(item.color)})"` : "";
        const numericClass = item.numeric === false ? "" : ' class="num"';
        return `<span${numericClass}${color}>${escapeHtml(item.text)}</span>`;
      });
      value = `<strong style="font-size:18px;white-space:nowrap">${parts.join("&nbsp;/&nbsp;")}</strong>`;
    } else {
      value = `<strong class="num">${escapeHtml(card.value)}</strong>`;
    }
    return `  <div class="card"><span>${escapeHtml(card.label)}</span>${value}<p class="note">${escapeHtml(card.note)}</p></div>`;
  }).join("\n");
}

function renderReconciliationRows(rows = []) {
  const labels = { hit: "命中", miss: "失誤", not_triggered: "未觸發" };
  return rows.map(function (row) {
    const result = ["hit", "miss", "not_triggered"].includes(row.result) ? row.result : "not_triggered";
    const resultClass = result === "not_triggered" ? "not-triggered" : result;
    return `<tr><td>${escapeHtml(row.section)}</td><td>${escapeHtml(row.directive)}</td><td>${escapeHtml(row.actual)}</td><td><span class="result-badge result-${resultClass}">${labels[result]}</span></td><td>${escapeHtml(row.correction)}</td></tr>`;
  }).join("\n    ");
}

function renderRsi(value) {
  const numeric = Number(value);
  const heat = numeric >= 70 ? " hot" : numeric <= 35 ? " cold" : "";
  return `<span class="rsi${heat}"><i><b style="width:${roundedPercent(numeric)}%"></b></i>${numeric.toFixed(2)}</span>`;
}

function renderPct(value) {
  const numeric = Number(value);
  return `<span class="pct"><i><b style="width:${clamp(numeric).toFixed(2).replace(/\.00$/, "")}%"></b></i><em>${numeric.toFixed(2)}%</em></span>`;
}

function renderAtr(label, atrValue) {
  const absolute = Math.abs(Number(atrValue));
  const level = absolute < 2 ? "l1" : absolute < 3 ? "l2" : absolute < 4 ? "l3" : "l4";
  return `<span class="atr ${level}"><i><b></b><b></b><b></b><b></b></i>${escapeHtml(label)}</span>`;
}

function renderMa(states = {}) {
  return `<span class="ma">${[20, 50, 200].map(function (period) {
    const isUp = Boolean(states[period] ?? states[String(period)]);
    return `<b class="${isUp ? "up" : "dn"}">${period}<i>${isUp ? "▲" : "▼"}</i></b>`;
  }).join("")}</span>`;
}

function renderSectorChart(rows = []) {
  const sorted = [...rows].sort((left, right) => Number(right.daily) - Number(left.daily));
  const maxNeg = Math.max(0, ...sorted.map((row) => Math.max(0, -Number(row.daily))));
  const maxPos = Math.max(0, ...sorted.map((row) => Math.max(0, Number(row.daily))));
  const span = maxNeg + maxPos || 1;
  const zero = maxNeg / span * 100;
  const items = sorted.map(function (row) {
    const value = Number(row.daily);
    const width = Math.abs(value) / span * 100;
    const positive = value >= 0;
    const left = positive ? zero : zero - width;
    const sign = value > 0 ? "+" : "";
    return `    <div class="bar-row"><span class="lbl">${escapeHtml(row.label)}</span><span class="val ${positive ? "pos" : "neg"}">${sign}${value.toFixed(2)}</span><div class="bar-track" style="--zero:${zero.toFixed(2)}%"><div class="b ${positive ? "pos" : "neg"}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></div></div></div>`;
  }).join("\n");
  return `<div class="chart" role="img" aria-label="板塊 1 月漲跌條形圖">
    <p class="chart-title">板塊動能一覽（1月漲跌，按強弱排序）</p>
${items}
  </div>`;
}

function renderIndexRows(rows = []) {
  return rows.map(function (row) {
    const dailyClass = row.dn_ok ? "num dn-ok" : "num";
    const fiveDayClass = row.dn_ok ? "num dn-ok" : "num";
    return `<tr><td>${escapeHtml(row.asset)}</td><td class="num">${escapeHtml(row.latest)}</td><td class="${dailyClass}">${escapeHtml(row.daily)}</td><td class="${fiveDayClass}">${escapeHtml(row.five_day)}</td><td style="text-align:center">${renderMa(row.ma)}</td><td class="num">${renderRsi(row.rsi)}</td><td>${escapeHtml(row.judgment)}</td></tr>`;
  }).join("\n    ");
}

function renderSectorRows(rows = []) {
  return rows.map(function (row) {
    return `<tr><td>${escapeHtml(row.label)}</td><td class="num">${escapeHtml(row.daily_display ?? row.daily)}</td><td class="num">${escapeHtml(row.five_day)}</td><td class="num">${escapeHtml(row.one_month)}</td><td class="num">${renderRsi(row.rsi)}</td><td>${escapeHtml(row.judgment)}</td></tr>`;
  }).join("\n    ");
}

function renderBreadthRows(rows = []) {
  return rows.map(function (row) {
    const latest = row.percent ? renderPct(row.latest) : escapeHtml(row.latest);
    const latestClass = row.percent ? "" : "num";
    const tone = row.tone ? ` style="color:var(--${escapeHtml(row.tone)});font-weight:700"` : "";
    const fiveDayClass = /^[+−-]/.test(String(row.five_day)) ? ' class="trend"' : "";
    const monthClass = /^[+−-]/.test(String(row.one_month)) ? ' class="trend"' : "";
    return `<tr><td>${escapeHtml(row.indicator)}</td><td${latestClass ? ` class="${latestClass}"` : ""}${tone}>${latest}</td><td${fiveDayClass}>${escapeHtml(row.five_day)}</td><td${monthClass}>${escapeHtml(row.one_month)}</td><td>${escapeHtml(row.judgment)}</td></tr>`;
  }).join("\n    ");
}

function renderMacroRows(rows = []) {
  return rows.map(function (row) {
    const latest = row.atr_value == null ? escapeHtml(row.latest) : renderAtr(row.latest, row.atr_value);
    return `<tr><td>${escapeHtml(row.asset)}</td><td class="num">${latest}</td><td class="num">${escapeHtml(row.daily)}</td><td>${escapeHtml(row.meaning)}</td></tr>`;
  }).join("\n    ");
}

module.exports = {
  renderAtr,
  renderBreadthRows,
  renderHitbar,
  renderIndexRows,
  renderMa,
  renderMacroRows,
  renderPct,
  renderReconciliationRows,
  renderRsi,
  renderSectorChart,
  renderSectorRows,
  renderSummaryCards,
};
