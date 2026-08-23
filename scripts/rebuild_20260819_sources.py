#!/usr/bin/env python3
"""Rebuild the missing 2026-08-19 premarket snapshots from saved Longbridge data."""

from __future__ import annotations

import json
import math
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = Path(r"C:\Users\sints\Documents\Codex\2026-08-11\us\work\market_watch_verify.xlsx")
CLI = Path(r"C:\Users\sints\AppData\Local\Programs\longbridge\longbridge.exe")
AS_OF = "2026-08-18"
PREMARKET_DATE = "2026-08-19"


def mean(values):
    return sum(values) / len(values) if values else None


def pct(current, previous):
    return (current / previous - 1) * 100 if previous else None


def atr14(history):
    ranges = []
    for index in range(1, len(history)):
        row = history[index]
        previous = history[index - 1][3]
        ranges.append(max(row[1] - row[2], abs(row[1] - previous), abs(row[2] - previous)))
    return mean(ranges[-14:])


def wilder_rsi(closes, period=14):
    if len(closes) <= period:
        return None
    gains = 0.0
    losses = 0.0
    for index in range(1, period + 1):
        change = closes[index] - closes[index - 1]
        gains += max(change, 0)
        losses += max(-change, 0)
    average_gain = gains / period
    average_loss = losses / period
    for index in range(period + 1, len(closes)):
        change = closes[index] - closes[index - 1]
        average_gain = (average_gain * (period - 1) + max(change, 0)) / period
        average_loss = (average_loss * (period - 1) + max(-change, 0)) / period
    return 100 if average_loss == 0 else 100 - 100 / (1 + average_gain / average_loss)


def parse_json_output(text):
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < start:
        raise ValueError("Longbridge output did not contain a JSON array")
    return json.loads(text[start : end + 1])


def load_cache():
    workbook = load_workbook(WORKBOOK, read_only=True, data_only=True)
    sheet = workbook["Longbridge Cache"]
    rows = sheet.iter_rows(values_only=True)
    headers = list(next(rows))
    indexes = {name: headers.index(name) for name in headers if name is not None}
    cache = {}
    for values in rows:
        ticker = values[indexes["Ticker"]]
        if not ticker:
            continue
        history = json.loads(values[indexes["History JSON"]] or "[]")
        history = [row for row in history if row[0] <= AS_OF]
        if not history or history[-1][0] != AS_OF:
            continue
        cache[ticker] = {
            "history": history,
            "rsi": float(values[indexes["RSI"]]),
            "source_updated_at": values[indexes["Updated At"]],
        }
    return cache


def load_daily_cache(ticker):
    command = [
        str(CLI), "kline", "history", f"{ticker}.US", "--period", "day",
        "--start", "2025-08-01", "--end", AS_OF, "--adjust", "forward", "--format", "json",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
    candles = parse_json_output(completed.stdout)
    history = [
        [row["time"][:10], float(row["high"]), float(row["low"]), float(row["close"])]
        for row in candles if row["time"][:10] <= AS_OF
    ]
    history.sort(key=lambda row: row[0])
    if not history or history[-1][0] != AS_OF:
        raise RuntimeError(f"{ticker} missing {AS_OF} close")
    return {"history": history, "rsi": wilder_rsi([row[3] for row in history]), "source_updated_at": AS_OF}


def summarize(ticker, cached):
    history = cached["history"]
    closes = [float(row[3]) for row in history]
    latest = history[-1]
    previous = history[-2]
    ma20 = mean(closes[-20:])
    ma50 = mean(closes[-50:])
    ma200 = mean(closes[-200:])
    atr = atr14(history)
    high52 = max(float(row[1]) for row in history[-252:])
    close = float(latest[3])
    return {
        "ticker": ticker,
        "asOf": AS_OF,
        "date": AS_OF,
        "open": None,
        "high": float(latest[1]),
        "low": float(latest[2]),
        "close": close,
        "volume": None,
        "turnover": None,
        "previousClose": float(previous[3]),
        "dailyPct": pct(close, float(previous[3])),
        "fiveDayPct": pct(close, float(history[-6][3])),
        "oneMonthPct": pct(close, float(history[-22][3])),
        "ma20": ma20,
        "ma50": ma50,
        "ma200": ma200,
        "above20": close > ma20,
        "above50": close > ma50,
        "above200": close > ma200,
        "rsi14": cached["rsi"],
        "atr14": atr,
        "distance50Atr": (close - ma50) / atr if atr else None,
        "high52w": high52,
        "distanceFrom52wHighPct": pct(close, high52),
        "history": [
            {
                "date": row[0],
                "open": None,
                "high": float(row[1]),
                "low": float(row[2]),
                "close": float(row[3]),
                "volume": None,
                "turnover": None,
            }
            for row in history[-65:]
        ],
    }


def run_longbridge(ticker):
    command = [
        str(CLI), "kline", "history", f"{ticker}.US", "--period", "15m", "--session", "all",
        "--start", "2026-08-18", "--end", "2026-08-19", "--adjust", "none", "--format", "json",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
    candles = parse_json_output(completed.stdout)
    pre = [
        row for row in candles
        if row.get("session") == "Pre" and "2026-08-19T08:00:00Z" <= row.get("time", "") < "2026-08-19T13:30:00Z"
    ]
    regular = [
        row for row in candles
        if "2026-08-18T13:30:00Z" <= row.get("time", "") <= "2026-08-18T20:00:00Z"
        and row.get("session") not in {"Pre", "Post", "Overnight"}
    ]
    return ticker, pre, regular


def build_quote(ticker, pre, regular, close_map):
    previous_close = close_map.get(ticker)
    if previous_close is None and regular:
        previous_close = float(regular[-1]["close"])
    if not pre:
        return {
            "ticker": ticker,
            "timestamp": None,
            "premarketAvailable": False,
            "price": None,
            "previousClose": previous_close,
            "changePct": None,
            "volume": 0,
            "turnover": 0,
        }
    price = float(pre[-1]["close"])
    volume = sum(float(row.get("volume") or 0) for row in pre)
    turnover = sum(float(row.get("turnover") or 0) for row in pre)
    return {
        "ticker": ticker,
        "timestamp": pre[-1]["time"],
        "premarketAvailable": True,
        "price": price,
        "previousClose": previous_close,
        "changePct": pct(price, previous_close),
        "volume": volume,
        "turnover": turnover,
    }


def main():
    source = json.loads((ROOT / "data" / "2026-08-18-longbridge.json").read_text(encoding="utf-8"))
    cache = load_cache()
    technical_tickers = list(dict.fromkeys(
        source["universes"]["sectors"]
        + source["universes"]["themes"]
        + source["universes"]["indices"]
        + source["universes"]["macro"]
        + [".VIX"]
    ))
    missing = [ticker for ticker in technical_tickers if ticker not in cache]
    for ticker in missing:
        cache[ticker] = load_daily_cache(ticker)
    missing = [ticker for ticker in technical_tickers if ticker not in cache]
    if missing:
        raise RuntimeError(f"Longbridge Cache missing {AS_OF}: {missing}")
    rows = [summarize(ticker, cache[ticker]) for ticker in technical_tickers]
    close_map = {row["ticker"]: row["close"] for row in rows}

    mover_tickers = [
        "MRNA", "MRK", "BNTX", "NVAX", "MRVL", "EL", "TGT", "LOW",
        "TJX", "ADI", "ZM", "SKHY", "NOK", "SNDK", "INTC", "QCOM",
    ]
    quote_tickers = list(dict.fromkeys([row["ticker"] for row in source["quotes"] if row["ticker"] != ".VIX"] + mover_tickers))
    quote_results = {}
    errors = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(run_longbridge, ticker): ticker for ticker in quote_tickers}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                symbol, pre, regular = future.result()
                quote_results[symbol] = build_quote(symbol, pre, regular, close_map)
                print(f"{ticker} OK", flush=True)
            except Exception as error:
                errors.append({"ticker": ticker, "error": str(error)})
                quote_results[ticker] = build_quote(ticker, [], [], close_map)
                print(f"{ticker} ERROR {error}", flush=True)

    quotes = [quote_results[ticker] for ticker in quote_tickers]
    available = sum(1 for row in quotes if row["premarketAvailable"])
    output = {
        "generatedAt": "2026-08-19T13:29:00Z",
        "asOf": AS_OF,
        "premarketDate": PREMARKET_DATE,
        "source": "Saved Longbridge Cache as of 2026-08-18 + Longbridge historical 15m premarket --session all",
        "counts": {
            "technicalRequested": len(technical_tickers),
            "technicalSuccess": len(rows),
            "quoteRequested": len(quotes),
            "premarketAvailable": available,
        },
        "universes": source["universes"],
        "rows": rows,
        "errors": [],
        "quoteErrors": errors,
        "quotes": quotes,
        "topMovers": [],
    }
    for name in ["2026-08-19-longbridge.json", "2026-08-19-longbridge-adjusted.json"]:
        (ROOT / "data" / name).write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": output["counts"], "quoteErrors": errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
