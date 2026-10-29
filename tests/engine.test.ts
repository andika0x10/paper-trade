import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFunding,
  cancel,
  closePosition,
  configure,
  D,
  evaluate,
  maintenance,
  newState,
  pnl,
  submit,
  summary,
} from "../lib/trading/engine";
import { replay, replayWindow } from "../lib/trading/replay";
import type { Candle, Market, OrderInput, Quote } from "../lib/trading/types";

const now = 1_800_000_000_000;
const market: Market = {
  coin: "BTC",
  name: "BTC",
  dex: "",
  maxLeverage: 40,
  szDecimals: 5,
  mark: "100",
  mid: "100",
  previous: "100",
  volume: "1000000",
  funding: "0.0001",
  openInterest: "100",
  tiers: [{ lowerBound: "0", maxLeverage: 40 }],
  isolatedOnly: false,
};
const quote = (
  mark = "100",
  levels: [string, string][] = [[mark, "1000"]],
): Quote => ({ coin: "BTC", mark, time: now, bids: levels, asks: levels });
const input = (overrides: Partial<OrderInput> = {}): OrderInput => ({
  coin: "BTC",
  side: "long",
  type: "market",
  quantity: "10",
  leverage: 10,
  marginMode: "cross",
  reduceOnly: false,
  ...overrides,
});
const bar = (low: string, high: string, close = "100") => ({
  BTC: { low, high, close },
});
const x = {
  time: now + 60_000,
  estimated: true,
  interval: "1m",
  reason: "Replay",
};
test("new accounts have an auditable 10,000 USDC deposit", () => {
  const s = newState(now);
  assert.equal(s.balance, "10000");
  assert.equal(s.ledger[0].amount, "10000");
});
test("market sweeps book levels and cancels unfilled depth", () => {
  const s = newState(now);
  const order = submit(
    s,
    input({ quantity: "5" }),
    market,
    quote("100", [
      ["100", "1"],
      ["102", "2"],
    ]),
    now,
  );
  assert.equal(s.positions[0].quantity, "3");
  assert.equal(order.status, "cancelled");
  assert.equal(order.remaining, "2");
  assert.equal(s.fills.length, 2);
  assert.equal(s.balance, "9999.848");
});
test("partial close realizes PnL and releases proportional margin", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  closePosition(s, s.positions[0].id, "4", market, quote("110"), now);
  assert.equal(s.positions[0].quantity, "6");
  assert.equal(s.positions[0].margin, "60");
  assert.equal(s.balance, "10039.28");
  assert.equal(pnl(s.positions[0], "110").toString(), "60");
});
test("one-way opposite trades net then reverse", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  submit(s, input({ side: "short", quantity: "15" }), market, quote(), now);
  assert.equal(s.positions.length, 1);
  assert.equal(s.positions[0].side, "short");
  assert.equal(s.positions[0].quantity, "5");
});
test("hedge records independent legs and gross margin", () => {
  const s = newState(now);
  configure(s, "BTC", "cross", "hedge");
  submit(s, input(), market, quote(), now);
  submit(s, input({ side: "short" }), market, quote(), now);
  assert.equal(s.positions.length, 2);
  assert.equal(summary(s).margin, "200");
  assert.equal(summary(s).unrealized, "0");
});
test("reduce-only cannot reverse or create a position", () => {
  const s = newState(now);
  assert.throws(
    () => submit(s, input({ reduceOnly: true }), market, quote(), now),
    /No opposite/,
  );
  submit(s, input(), market, quote(), now);
  submit(
    s,
    input({ side: "short", quantity: "15", reduceOnly: true }),
    market,
    quote(),
    now,
  );
  assert.equal(s.positions.length, 0);
  assert.equal(s.orders.at(-1)?.remaining, "5");
});
test("resting limits reserve margin and cancellation releases it", () => {
  const s = newState(now);
  const order = submit(
    s,
    input({ type: "limit", price: "90" }),
    market,
    quote(),
    now,
  );
  assert.equal(order.status, "open");
  assert.equal(order.reserved, "90.45");
  assert.equal(summary(s).available, "9909.55");
  cancel(s, order.id);
  assert.equal(summary(s).available, "10000");
});
test("resting limit requires a trade through, not a touch, and pays maker", () => {
  const s = newState(now);
  submit(s, input({ type: "limit", price: "90" }), market, quote(), now);
  evaluate(s, { BTC: market }, bar("90", "100"), x);
  assert.equal(s.positions.length, 0);
  evaluate(s, { BTC: market }, bar("89", "100", "95"), x);
  assert.equal(s.positions.length, 1);
  assert.equal(s.fills[0].fee, "0.18");
});
test("crossing limit is a taker, does not cross beyond its limit", () => {
  const s = newState(now);
  const order = submit(
    s,
    input({ type: "limit", price: "101", quantity: "3" }),
    market,
    quote("100", [
      ["100", "1"],
      ["102", "5"],
    ]),
    now,
  );
  assert.equal(s.fills[0].fee, "0.05");
  assert.equal(order.remaining, "2");
  assert.equal(order.status, "open");
});
test("invalid precision, stale data, leverage and insufficient margin reject", () => {
  for (const [overrides, message] of [
    [{ quantity: "0.000001" }, /decimals/],
    [{ leverage: 41 }, /leverage/],
    [{ quantity: "10000" }, /Insufficient/],
  ] as const)
    assert.throws(
      () => submit(newState(now), input(overrides), market, quote(), now),
      message,
    );
  assert.throws(
    () =>
      submit(
        newState(now),
        input(),
        market,
        { ...quote(), time: now - 20_000 },
        now,
      ),
    /stale/,
  );
});
test("higher notional respects lower tier leverage", () => {
  const tiers = {
    ...market,
    tiers: [
      { lowerBound: "0", maxLeverage: 40 },
      { lowerBound: "500", maxLeverage: 5 },
    ],
  };
  assert.throws(
    () => submit(newState(now), input(), tiers, quote(), now),
    /tier/,
  );
  const s = newState(now);
  submit(s, input({ leverage: 5 }), tiers, quote(), now);
  assert.equal(maintenance(s.positions[0], "100", tiers).toString(), "56.25");
});
test("mode changes are blocked while positions or orders exist", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  assert.throws(
    () => configure(s, "BTC", "isolated", "hedge"),
    /Close positions/,
  );
});
test("isolated gap liquidation cannot consume cross wallet", () => {
  const s = newState(now);
  configure(s, "BTC", "isolated", "one-way");
  submit(s, input({ marginMode: "isolated" }), market, quote(), now);
  evaluate(s, { BTC: market }, bar("1", "100", "1"), x);
  assert.equal(s.positions.length, 0);
  assert.equal(s.balance, "9899.5");
  assert.ok(s.ledger.some((e) => e.type === "adjustment"));
});
test("SL wins when both TP and SL are touched", () => {
  const s = newState(now);
  submit(s, input({ tp: "110", sl: "95" }), market, quote(), now);
  evaluate(s, { BTC: market }, bar("94", "111", "100"), x);
  assert.equal(s.positions.length, 0);
  assert.equal(s.fills.at(-1)?.reason, "Stop loss");
  assert.equal(s.fills.at(-1)?.price, "95");
});
test("short TP works and liquidation has priority over brackets", () => {
  const s = newState(now);
  configure(s, "BTC", "isolated", "one-way");
  submit(
    s,
    input({ side: "short", marginMode: "isolated", tp: "90", sl: "105" }),
    market,
    quote(),
    now,
  );
  evaluate(s, { BTC: market }, bar("89", "120", "100"), x);
  assert.equal(s.fills.at(-1)?.reason, "Isolated liquidation");
});
test("cross liquidation closes all cross positions and cancels cross orders", () => {
  const s = newState(now);
  submit(s, input({ quantity: "800" }), market, quote(), now);
  submit(
    s,
    input({ type: "limit", price: "1", quantity: "1" }),
    market,
    quote(),
    now,
  );
  evaluate(s, { BTC: market }, bar("80", "100", "80"), x);
  assert.equal(s.positions.length, 0);
  assert.equal(s.orders.filter((o) => o.status === "open").length, 0);
  assert.equal(s.balance, "0");
});
test("funding applies once, opposite hedge legs cancel funding", () => {
  const s = newState(now);
  configure(s, "BTC", "cross", "hedge");
  submit(s, input(), market, quote(), now);
  submit(s, input({ side: "short" }), market, quote(), now);
  const before = s.balance;
  applyFunding(s, "BTC", ".001", "100", now + 1000, true);
  applyFunding(s, "BTC", ".001", "100", now + 1000, true);
  assert.equal(s.balance, before);
  assert.equal(s.ledger.filter((e) => e.type === "funding").length, 2);
});
test("isolated funding cannot consume unrelated funds", () => {
  const s = newState(now);
  configure(s, "BTC", "isolated", "one-way");
  submit(s, input({ marginMode: "isolated" }), market, quote(), now);
  applyFunding(s, "BTC", "1", "100", now + 1000, true);
  assert.equal(s.positions[0].margin, "0");
  assert.equal(s.balance, "9899.5");
});
test("offline selection adapts for long gaps and batches work", () => {
  assert.equal(replayWindow(now, now + 60_000).interval, "1m");
  assert.equal(replayWindow(now, now + 10 * 86400_000).interval, "5m");
  assert.ok(replayWindow(now, now + 86400_000).end < now + 86400_000);
});
test("replay blocks on missing candles without advancing checkpoint", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  assert.throws(
    () =>
      replay(s, { BTC: market }, { BTC: [] }, {}, "1m", 60_000, now + 120_000),
    /Incomplete/,
  );
  assert.equal(s.checkpoint, now);
});
test("offline replay is resumable and applies funding exactly once", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  const candles: Candle[] = [0, 1, 2].map((i) => ({
    t: now + i * 60_000,
    T: now + (i + 1) * 60_000 - 1,
    o: "100",
    h: "101",
    l: "99",
    c: "100",
    v: "100",
  }));
  const funding = {
    BTC: [{ coin: "BTC", time: now + 60_000, fundingRate: ".001" }],
  };
  replay(
    s,
    { BTC: market },
    { BTC: candles },
    funding,
    "1m",
    60_000,
    now + 120_000,
  );
  const balance = s.balance;
  replay(
    s,
    { BTC: market },
    { BTC: candles },
    funding,
    "1m",
    60_000,
    now + 180_000,
  );
  assert.equal(s.balance, balance);
  assert.equal(s.checkpoint, now + 180_000);
  assert.equal(s.replay?.interval, "1m");
});
test("decimal ledger sums exactly to the wallet", () => {
  const s = newState(now);
  submit(s, input({ quantity: "0.00001" }), market, quote("0.123456"), now);
  assert.equal(
    s.ledger.reduce((n, e) => n.plus(e.amount), D(0)).toString(),
    s.balance,
  );
});
test("reduce-only limits can rest without reserving new margin", () => {
  const s = newState(now);
  submit(s, input(), market, quote(), now);
  const order = submit(
    s,
    input({ type: "limit", price: "110", side: "short", reduceOnly: true }),
    market,
    quote(),
    now,
  );
  assert.equal(order.status, "open");
  assert.equal(order.reserved, "0");
  evaluate(s, { BTC: market }, bar("100", "111", "110"), x);
  assert.equal(s.positions.length, 0);
});
test("hedge close uses its target leg leverage, independent of the opposite leg", () => {
  const s = newState(now);
  configure(s, "BTC", "cross", "hedge");
  submit(s, input(), market, quote(), now);
  submit(s, input({ side: "short", leverage: 5 }), market, quote(), now);
  closePosition(
    s,
    s.positions.find((p) => p.side === "long")!.id,
    "10",
    market,
    quote(),
    now,
  );
  assert.equal(s.positions.length, 1);
  assert.equal(s.positions[0].side, "short");
});
test("cross gap liquidation preserves unrelated isolated collateral", () => {
  const s = newState(now);
  const eth = { ...market, coin: "ETH", name: "ETH" };
  configure(s, "ETH", "isolated", "one-way");
  submit(
    s,
    input({ coin: "ETH", marginMode: "isolated" }),
    eth,
    { ...quote(), coin: "ETH" },
    now,
  );
  submit(s, input({ quantity: "800" }), market, quote(), now);
  evaluate(
    s,
    { BTC: market, ETH: eth },
    { ...bar("1", "100", "1"), ETH: { high: "100", low: "100", close: "100" } },
    x,
  );
  assert.equal(s.positions.length, 1);
  assert.equal(s.positions[0].coin, "ETH");
  assert.equal(s.balance, "100");
  assert.equal(summary(s).crossEquity, "0");
});
