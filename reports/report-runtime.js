(function () {
  "use strict";

  function textOf(node) {
    return (node.textContent || "").trim();
  }

  function formatRsiTables() {
    document.querySelectorAll("table").forEach(function (table) {
      var headers = Array.from(table.querySelectorAll("thead th")).map(textOf);
      var rsiIndex = headers.findIndex(function (header) { return /^RSI$/i.test(header); });
      if (rsiIndex < 0) return;

      table.querySelectorAll("tbody tr").forEach(function (row) {
        var cell = row.cells[rsiIndex];
        if (!cell) return;
        var value = Number(textOf(cell).replace(/,/g, ""));
        if (!Number.isFinite(value)) return;
        cell.textContent = value.toFixed(2);
        cell.classList.add("num");
        cell.classList.toggle("rsi-hot", value >= 70);
        cell.classList.toggle("rsi-cold", value <= 30);
      });
    });
  }

  function addSymbolLegend() {
    if (document.querySelector(".symbol-legend")) return;
    var summary = document.querySelector('section[aria-label*="summary"], section.grid');
    if (!summary) return;
    var legend = document.createElement("div");
    legend.className = "symbol-legend";
    legend.setAttribute("aria-label", "報告符號圖例");
    legend.textContent = "● 主要　◐ 條件/次要　◎ 觀察　✕ 避免　⚠ 反向訊號　↑ 升級　↓ 降級";
    summary.insertAdjacentElement("afterend", legend);
  }

  function slugify(value, index) {
    var slug = value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "section-" + String(index + 1);
  }

  function addTableOfContents() {
    if (document.querySelector(".report-toc")) return;
    var main = document.querySelector("main");
    var headings = Array.from(document.querySelectorAll("main h2"));
    if (!main || headings.length < 2) return;

    var used = new Set();
    headings.forEach(function (heading, index) {
      if (!heading.id) {
        var base = slugify(textOf(heading), index);
        var id = base;
        var suffix = 2;
        while (used.has(id) || document.getElementById(id)) {
          id = base + "-" + String(suffix);
          suffix += 1;
        }
        heading.id = id;
      }
      used.add(heading.id);
    });

    var nav = document.createElement("nav");
    nav.className = "report-toc";
    nav.setAttribute("aria-label", "報告目錄");
    var label = document.createElement("span");
    label.className = "toc-label";
    label.textContent = "快速跳轉";
    nav.appendChild(label);

    headings.forEach(function (heading) {
      var link = document.createElement("a");
      link.href = "#" + heading.id;
      link.textContent = textOf(heading);
      nav.appendChild(link);
    });

    var legend = document.querySelector(".symbol-legend");
    if (legend) legend.insertAdjacentElement("afterend", nav);
    else main.insertBefore(nav, main.querySelector("section"));
  }

  function colorSignedNumbers() {
    document.querySelectorAll('td.num').forEach(function(c){
      var t=c.textContent.trim();
      if(/^\+/.test(t))c.classList.add('up');
      else if(/^[-−]/.test(t))c.classList.add('dn');
    });
  }

  function init() {
    formatRsiTables();
    addSymbolLegend();
    addTableOfContents();
    colorSignedNumbers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
