import { applyFunding, evaluate, snapshot, TradingError } from "./engine";
import type { Candle, Funding, Market, TradingState } from "./types";

export const REPLAY_INTERVALS = [
  ["1m", 60_000],
  ["3m", 180_000],
  ["5m", 300_000],
  ["15m", 900_000],
  ["30m", 1_800_000],
  ["1h", 3_600_000],
  ["2h", 7_200_000],
  ["4h", 14_400_000],
  ["8h", 28_800_000],
  ["12h", 43_200_000],
  ["1d", 86_400_000],
  ["3d", 259_200_000],
  ["1w", 604_800_000],
] as const;
export function replayWindow(checkpoint: number, now: number) {
  const chosen = REPLAY_INTERVALS.find(
    ([, ms]) => (now - checkpoint) / ms < 4500,
  );
  if (!chosen)
    throw new TradingError(
      "This offline period exceeds available history. Reset this simulation to continue.",
    );
  const [interval, ms] = chosen;
  const end = Math.min(now, (Math.floor(checkpoint / ms) + 160) * ms);
  return { interval, ms, start: Math.floor(checkpoint / ms) * ms, end };
}
export function replay(
  s: TradingState,
  markets: Record<string, Market>,
  candles: Record<string, Candle[]>,
  funding: Record<string, Funding[]>,
  interval: string,
  ms: number,
  end: number,
) {
  const coins = [
    ...new Set([
      ...s.positions.map((p) => p.coin),
      ...s.orders.filter((o) => o.status === "open").map((o) => o.coin),
    ]),
  ];
  if (!coins.length) {
    s.checkpoint = end;
    return;
  }
  const beginning = Math.floor(s.checkpoint / ms) * ms;
  const closedEnd = Math.floor(end / ms) * ms;
  for (const coin of coins) {
    if (!markets[coin] || markets[coin].disabled)
      throw new TradingError(
        `Market or risk metadata unavailable for ${coin}. Retry later or reset the simulation.`,
      );
    const indexed = new Map(candles[coin]?.map((c) => [c.t, c]));
    for (let t = beginning; t < closedEnd; t += ms) {
      const c = indexed.get(t);
      if (
        !c ||
        c.T < t + ms - 1 ||
        [c.o, c.h, c.l, c.c].some(
          (v) => !Number.isFinite(Number(v)) || Number(v) <= 0,
        )
      )
        throw new TradingError(
          `Incomplete ${interval} history for ${coin}. Trading is blocked; retry or reset the simulation.`,
        );
    }
  }
  const maps = Object.fromEntries(
    coins.map((coin) => [coin, new Map(candles[coin].map((c) => [c.t, c]))]),
  );
  for (let t = beginning; t < closedEnd; t += ms) {
    const ranges: Record<string, { high: string; low: string; close: string }> =
      {};
    for (const coin of coins) {
      const c = maps[coin].get(t)!;
      // The first bar may contain prices from before an order existed. Use its
      // close in that case instead of triggering orders on pre-entry extremes.
      const partialEntry =
        s.positions.some((p) => p.coin === coin && p.openedAt > t) ||
        s.orders.some(
          (o) => o.coin === coin && o.status === "open" && o.createdAt > t,
        );
      ranges[coin] = {
        high: partialEntry ? c.c : c.h,
        low: partialEntry ? c.c : c.l,
        close: c.c,
      };
      const events = (funding[coin] ?? []).filter(
        (f) => f.time > s.checkpoint && f.time <= t + ms,
      );
      for (const event of events)
        applyFunding(s, coin, event.fundingRate, c.o, event.time, true);
    }
    evaluate(s, markets, ranges, {
      time: t + ms,
      estimated: true,
      interval,
      reason: "Offline reconstruction",
    });
    s.checkpoint = t + ms;
    snapshot(s, s.checkpoint);
  }
  s.replay = { interval, estimated: true, through: s.checkpoint };
}
