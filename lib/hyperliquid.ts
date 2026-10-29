import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { marketCache } from "./db/schema";
import type { Candle, Funding, Market, Quote, Tier } from "./trading/types";

export const INTERVALS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;
export const duration: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};
const pending = new Map<string, Promise<unknown>>();
const memory = new Map<string, { value: unknown; expires: number }>();
export async function info<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      `Hyperliquid returned ${response.status}. Try again shortly.`,
    );
  return response.json();
}
async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now(),
    local = memory.get(key);
  if (local && local.expires > now) return local.value as T;
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const work = (async () => {
    if (process.env.DATABASE_URL) {
      const [row] = await db()
        .select()
        .from(marketCache)
        .where(eq(marketCache.key, key));
      if (row && row.expiresAt > now) {
        memory.set(key, { value: row.value, expires: row.expiresAt });
        return row.value as T;
      }
    }
    const value = await fn();
    memory.set(key, { value, expires: now + ttl });
    if (memory.size > 250) memory.delete(memory.keys().next().value!);
    if (process.env.DATABASE_URL)
      await db()
        .insert(marketCache)
        .values({ key, value, expiresAt: now + ttl })
        .onDuplicateKeyUpdate({ set: { value, expiresAt: now + ttl } });
    return value;
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
type Meta = {
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    marginTableId?: number;
    onlyIsolated?: boolean;
    isDelisted?: boolean;
  }[];
  marginTables?: [number, { marginTiers: Tier[] }][];
};
type Context = {
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  dayNtlVlm: string;
  funding: string;
  openInterest: string;
};
export async function getMarkets(): Promise<Market[]> {
  return cached("markets:v1", 30_000, async () => {
    const dexes = await info<({ name: string } | null)[]>({ type: "perpDexs" });
    const names = [
      "",
      ...new Set(
        dexes
          .filter((d): d is { name: string } => Boolean(d?.name))
          .map((d) => d.name),
      ),
    ];
    const markets: Market[] = [];
    // Keep API concurrency bounded; missing venues are surfaced instead of
    // silently publishing a partial catalog as if it were complete.
    for (let i = 0; i < names.length; i += 4) {
      const batch = await Promise.all(
        names.slice(i, i + 4).map(async (dex) => {
          const [meta, contexts] = await info<[Meta, Context[]]>({
            type: "metaAndAssetCtxs",
            ...(dex ? { dex } : {}),
          });
          return meta.universe.map((m, index): Market => {
            const ctx = contexts[index];
            const tiers =
              meta.marginTables?.find(([id]) => id === m.marginTableId)?.[1]
                .marginTiers ??
              (m.maxLeverage > 0 &&
              (m.marginTableId === undefined ||
                m.marginTableId === m.maxLeverage)
                ? [{ lowerBound: "0", maxLeverage: m.maxLeverage }]
                : []);
            const coin =
              dex && !m.name.includes(":") ? `${dex}:${m.name}` : m.name;
            const disabled = m.isDelisted
              ? "This market has been delisted."
              : !ctx?.markPx || !tiers.length
                ? "Risk metadata or market data is unavailable."
                : undefined;
            return {
              coin,
              name: coin.split(":").at(-1)!,
              dex,
              maxLeverage: m.maxLeverage,
              szDecimals: m.szDecimals,
              mark: ctx?.markPx ?? "0",
              mid: ctx?.midPx ?? ctx?.markPx ?? "0",
              previous: ctx?.prevDayPx ?? "0",
              volume: ctx?.dayNtlVlm ?? "0",
              funding: ctx?.funding ?? "0",
              openInterest: ctx?.openInterest ?? "0",
              tiers,
              isolatedOnly: Boolean(m.onlyIsolated),
              disabled,
            };
          });
        }),
      );
      markets.push(...batch.flat());
    }
    return markets;
  });
}
export async function getQuote(coin: string): Promise<Quote> {
  const dex = coin.includes(":") ? coin.split(":")[0] : "";
  const [book, data] = await Promise.all([
    info<{ time: number; levels: { px: string; sz: string }[][] }>({
      type: "l2Book",
      coin,
    }),
    info<[Meta, Context[]]>({
      type: "metaAndAssetCtxs",
      ...(dex ? { dex } : {}),
    }),
  ]);
  const index = data[0].universe.findIndex(
    (m) => m.name === coin || (dex && `${dex}:${m.name}` === coin),
  );
  const mark = data[1][index]?.markPx;
  if (!mark || !book?.levels?.[0] || Date.now() - book.time > 15_000)
    throw new Error(`Fresh market data unavailable for ${coin}.`);
  return {
    coin,
    mark,
    time: book.time,
    bids: book.levels[0].map((l) => [l.px, l.sz]),
    asks: book.levels[1].map((l) => [l.px, l.sz]),
  };
}
export async function getCandles(
  coin: string,
  interval: string,
  start: number,
  end: number,
): Promise<Candle[]> {
  if (!INTERVALS.includes(interval as (typeof INTERVALS)[number]))
    throw new Error("Unsupported candle interval.");
  // Only closed windows are cached; forming candles always remain fresh.
  const key = `c:${createHash("sha256").update(`${coin}:${interval}:${start}:${end}`).digest("hex")}`;
  return cached(
    key,
    end < Date.now() - duration[interval] ? 86_400_000 : 10_000,
    () =>
      info<Candle[]>({
        type: "candleSnapshot",
        req: { coin, interval, startTime: start, endTime: end },
      }),
  );
}
export async function getFunding(
  coin: string,
  start: number,
  end: number,
): Promise<Funding[]> {
  const key = `f:${createHash("sha256").update(`${coin}:${start}:${end}`).digest("hex")}`;
  return cached(key, 3_600_000, async () => {
    const all: Funding[] = [];
    let cursor = start;
    for (let page = 0; page < 20 && cursor <= end; page++) {
      const rows = await info<Funding[]>({
        type: "fundingHistory",
        coin,
        startTime: cursor,
        endTime: end,
      });
      if (!rows.length) return all;
      all.push(...rows);
      const next = rows.at(-1)!.time + 1;
      if (next <= cursor)
        throw new Error("Funding pagination did not advance.");
      cursor = next;
      if (rows.length < 500) return all;
    }
    if (cursor <= end)
      throw new Error(
        "Funding history exceeds this reconstruction batch. Retry with a smaller batch.",
      );
    return all;
  });
}
