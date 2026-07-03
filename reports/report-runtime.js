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

  function addSectionKickers() {
    var labels = [
      [/核心結論|五個核心週結論/, "Key takeaways"],
      [/Pre-market movers/i, "Premarket movers"],
      [/修正檢查|Correction Checklist/i, "Risk checklist"],
      [/宏觀事件與盤前背景/, "Macro backdrop"],
      [/Sector\s*\/\s*Thematic/i, "Sector / Thematic"],
      [/大盤 ETF 技術|指數與風格/, "Major indices & style"],
      [/50MA ATR/, "50MA ATR extension"],
      [/市場廣度/, "Breadth"],
      [/外匯|商品與美債/, "Macro / FX / Rates"],
      [/美債、Fed|宏觀與 Fed/, "Rates / Fed"],
      [/交易計畫|下週事件與交易計畫/, "Trading plan"],
      [/盤中觸發劇本/, "Intraday playbook"],
      [/上週對賬/, "Reconciliation"],
      [/Big Winners & Losers/i, "Leadership"],
      [/交叉驗證/, "Cross-validation"],
      [/資料來源/, "Sources"],
    ];
    document.querySelectorAll("main section h2").forEach(function (heading) {
      var section = heading.closest("section");
      if (!section || section.querySelector(":scope > .kicker")) return;
      var match = labels.find(function (entry) { return entry[0].test(textOf(heading)); });
      if (!match) return;
      var kicker = document.createElement("div");
      kicker.className = "kicker";
      kicker.textContent = match[1];
      section.insertBefore(kicker, heading);
    });
  }

  function colorVisualSignedNumbers() {
    document.querySelectorAll(".num, .trend").forEach(function (cell) {
      if (cell.querySelector(".rsi, .atr, .pct")) return;
      var value = textOf(cell);
      if (cell.classList.contains("dn-ok")) {
        cell.classList.remove("up", "dn");
        cell.style.color = "var(--muted)";
        return;
      }
      if (/^\+/.test(value)) cell.classList.add("up");
      else if (/^[-−]/.test(value)) cell.classList.add("dn");
      if (cell.classList.contains("trend")) {
        cell.style.fontVariantNumeric = "tabular-nums";
        if (cell.classList.contains("up")) {
          cell.style.color = "var(--green)";
          cell.style.fontWeight = "600";
        }
        if (cell.classList.contains("dn")) {
          cell.style.color = "var(--red)";
          cell.style.fontWeight = "600";
        }
      }
    });
  }

  function formatMovingAverageStates() {
    document.querySelectorAll("table").forEach(function (table) {
      var headers = Array.from(table.querySelectorAll("thead th")).map(textOf);
      var maIndex = headers.findIndex(function (header) {
        return /20\s*\/\s*50\s*\/\s*200\s*MA|Above\s*MA/i.test(header);
      });
      if (maIndex < 0) return;

      table.querySelectorAll("tbody tr").forEach(function (row) {
        var cell = row.cells[maIndex];
        if (!cell || cell.querySelector(".ma-state")) return;
        var states = textOf(cell).split(/\s*[／/]\s*/);
        if (states.length !== 3) return;

        var fragment = document.createDocumentFragment();
        states.forEach(function (state, index) {
          var normalized = state.trim();
          var isUp = /^(上|▲|✓|Y)$/i.test(normalized);
          var isDown = /^(下|▼|✗|N)$/i.test(normalized);
          if (!isUp && !isDown) return;

          var badge = document.createElement("span");
          badge.className = "ma-state " + (isUp ? "ma-up" : "ma-down");
          badge.setAttribute("aria-label", [20, 50, 200][index] + "MA " + (isUp ? "上方" : "下方"));

          var period = document.createElement("span");
          period.className = "ma-period";
          period.textContent = [20, 50, 200][index] + "MA";
          var arrow = document.createElement("span");
          arrow.className = "ma-arrow";
          arrow.textContent = isUp ? "▲" : "▼";
          badge.appendChild(period);
          badge.appendChild(arrow);
          fragment.appendChild(badge);

          if (index < states.length - 1) {
            var separator = document.createElement("span");
            separator.className = "ma-separator";
            separator.textContent = "·";
            fragment.appendChild(separator);
          }
        });

        if (fragment.childNodes.length) {
          cell.textContent = "";
          cell.classList.add("ma-cell");
          cell.appendChild(fragment);
        }
      });
    });
  }

  function init() {
    formatRsiTables();
    addSymbolLegend();
    addSectionKickers();
    addTableOfContents();
    colorSignedNumbers();
    colorVisualSignedNumbers();
    formatMovingAverageStates();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
