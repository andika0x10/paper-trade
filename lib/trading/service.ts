import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db";
import { paperAccount, receipt, user, watchlist } from "../db/schema";
import { getCandles, getFunding, getMarkets, getQuote } from "../hyperliquid";
import {
  cancel,
  closePosition,
  configure,
  D,
  evaluate,
  newState,
  snapshot,
  submit,
  summary,
  TradingError,
} from "./engine";
import { replay, replayWindow } from "./replay";
import type { Market, OrderInput, TradingState } from "./types";

export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function getAccount(userId: string) {
  return db().transaction(async (tx) => {
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    const [row] = await tx
      .select()
      .from(paperAccount)
      .where(
        and(eq(paperAccount.userId, userId), eq(paperAccount.archived, false)),
      );
    if (row) return row;
    const state = newState();
    await tx.insert(paperAccount).values({ id: state.id, userId, state });
    return {
      id: state.id,
      userId,
      state,
      version: 0,
      archived: false,
      createdAt: new Date(state.createdAt),
    };
  });
}
export async function accountView(userId: string) {
  const row = await getAccount(userId);
  const [saved] = await db()
    .select()
    .from(watchlist)
    .where(eq(watchlist.userId, userId));
  const archives = await db()
    .select({ id: paperAccount.id, createdAt: paperAccount.createdAt })
    .from(paperAccount)
    .where(
      and(eq(paperAccount.userId, userId), eq(paperAccount.archived, true)),
    );
  return {
    state: row.state,
    summary: summary(row.state),
    version: row.version,
    watchlist: saved?.coins ?? [],
    archives,
  };
}
export type Command =
  | { action: "order"; order: OrderInput }
  | { action: "close"; positionId: string; quantity: string }
  | { action: "cancel"; orderId: string }
  | {
      action: "configure";
      coin: string;
      margin: "cross" | "isolated";
      position: "one-way" | "hedge";
    }
  | { action: "reconcile" }
  | { action: "reset" }
  | { action: "watchlist"; coins: string[] };

export async function execute(
  userId: string,
  key: string,
  command: Command,
): Promise<Record<string, unknown>> {
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const savedReceipt = async () =>
    (
      await db()
        .select()
        .from(receipt)
        .where(and(eq(receipt.userId, userId), eq(receipt.requestKey, key)))
    )[0];
  const old = await savedReceipt();
  if (old) {
    if (old.hash !== hash)
      throw new ServiceError(
        "Idempotency key was already used for another request.",
        409,
      );
    const current = await getAccount(userId);
    return {
      state: current.state,
      summary: summary(current.state),
      version: current.version,
      pending: old.response.pending,
    };
  }
  const row = await getAccount(userId),
    state = structuredClone(row.state);
  const now = Date.now();
  let pending = false;
  if (!["reset", "watchlist"].includes(command.action)) {
    const allMarkets = await getMarkets();
    const markets = Object.fromEntries(allMarkets.map((m) => [m.coin, m]));
    const riskCoins = [
      ...new Set([
        ...state.positions.map((p) => p.coin),
        ...state.orders.filter((o) => o.status === "open").map((o) => o.coin),
      ]),
    ];
    if (riskCoins.length) {
      const window = replayWindow(state.checkpoint, now);
      const data: Record<string, Awaited<ReturnType<typeof getCandles>>> = {},
        funding: Record<string, Awaited<ReturnType<typeof getFunding>>> = {};
      for (let i = 0; i < riskCoins.length; i += 4)
        await Promise.all(
          riskCoins.slice(i, i + 4).map(async (coin) => {
            const [bars, events] = await Promise.all([
              getCandles(coin, window.interval, window.start, window.end),
              getFunding(
                coin,
                Math.max(state.createdAt, state.checkpoint) + 1,
                window.end,
              ),
            ]);
            data[coin] = bars;
            funding[coin] = events;
          }),
        );
      replay(
        state,
        markets,
        data,
        funding,
        window.interval,
        window.ms,
        window.end,
      );
      pending = now - state.checkpoint > window.ms;
      if (pending && command.action !== "reconcile")
        throw new ServiceError(
          "Reconstruction is still running. Finish synchronization before trading.",
          409,
        );
      if (!pending) {
        const quotes = [];
        for (let i = 0; i < riskCoins.length; i += 4)
          quotes.push(
            ...(await Promise.all(riskCoins.slice(i, i + 4).map(getQuote))),
          );
        const ranges = Object.fromEntries(
          quotes.map((q) => [
            q.coin,
            { high: q.mark, low: q.mark, close: q.mark },
          ]),
        );
        // Process the current partial candle since the checkpoint too. Without
        // this, short-lived tabs could skip intraminute stop events entirely.
        for (const coin of riskCoins) {
          const c = data[coin].find(
            (c) => c.t <= state.checkpoint && c.T >= state.checkpoint,
          );
          const entryDuringBar =
            c &&
            (state.positions.some((p) => p.coin === coin && p.openedAt > c.t) ||
              state.orders.some(
                (o) =>
                  o.coin === coin && o.status === "open" && o.createdAt > c.t,
              ));
          if (c && !entryDuringBar)
            ranges[coin] = { high: c.h, low: c.l, close: ranges[coin].close };
        }
        evaluate(state, markets, ranges, {
          time: now,
          estimated: true,
          interval: window.interval,
          reason: "Session synchronization",
        });
        // Keep the closed-candle checkpoint. Partial candles are conservatively
        // re-evaluated until closed; funding uses independent exactly-once cursors.
      }
    } else state.checkpoint = now;
    if (command.action === "configure") {
      const market = requireMarket(markets, command.coin);
      if (market.isolatedOnly && command.margin !== "isolated")
        throw new TradingError("This market only supports isolated margin.");
      configure(state, command.coin, command.margin, command.position);
    }
    if (command.action === "cancel") cancel(state, command.orderId);
    if (command.action === "order") {
      if (
        state.positions.length >= 40 ||
        state.orders.filter((o) => o.status === "open").length >= 80
      )
        throw new TradingError(
          "This simulation supports up to 40 position legs and 80 open orders.",
        );
      submit(
        state,
        command.order,
        requireMarket(markets, command.order.coin),
        await getQuote(command.order.coin),
        Date.now(),
      );
    }
    if (command.action === "close") {
      const p = state.positions.find((p) => p.id === command.positionId);
      if (!p) throw new TradingError("Position not found.");
      closePosition(
        state,
        p.id,
        command.quantity,
        requireMarket(markets, p.coin),
        await getQuote(p.coin),
        Date.now(),
      );
    }
    snapshot(state, now);
  }
  // Bound the aggregate before it becomes costly to lock/transfer on Hobby.
  if (command.action !== "reset" && JSON.stringify(state).length > 3_000_000)
    throw new ServiceError(
      "This practice session has reached its history limit. Reset to start a new session; the old history remains available.",
      409,
    );
  return db().transaction(async (tx) => {
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    const [duplicate] = await tx
      .select()
      .from(receipt)
      .where(and(eq(receipt.userId, userId), eq(receipt.requestKey, key)));
    if (duplicate) {
      if (duplicate.hash !== hash)
        throw new ServiceError("Idempotency key conflict.", 409);
      const [active] = await tx
        .select()
        .from(paperAccount)
        .where(
          and(
            eq(paperAccount.userId, userId),
            eq(paperAccount.archived, false),
          ),
        );
      return {
        state: active.state,
        summary: summary(active.state),
        version: active.version,
        pending: duplicate.response.pending,
      };
    }
    const [current] = await tx
      .select()
      .from(paperAccount)
      .where(and(eq(paperAccount.id, row.id), eq(paperAccount.userId, userId)))
      .for("update");
    if (!current || current.archived || current.version !== row.version)
      throw new ServiceError(
        "Your account changed in another tab. Refresh and retry.",
        409,
      );
    let resultState: TradingState = state;
    if (command.action === "reset") {
      await tx
        .update(paperAccount)
        .set({ archived: true })
        .where(eq(paperAccount.id, row.id));
      resultState = newState();
      await tx
        .insert(paperAccount)
        .values({ id: resultState.id, userId, state: resultState });
    } else if (command.action === "watchlist") {
      await tx
        .insert(watchlist)
        .values({ userId, coins: command.coins })
        .onDuplicateKeyUpdate({ set: { coins: command.coins } });
    } else
      await tx
        .update(paperAccount)
        .set({ state, version: sql`${paperAccount.version} + 1` })
        .where(eq(paperAccount.id, row.id));
    const result: Record<string, unknown> = {
      state: resultState,
      summary: summary(resultState),
      pending,
      version: command.action === "reset" ? 0 : row.version + 1,
    };
    // Store the mutation result, so a dropped response can be retried safely.
    await tx
      .insert(receipt)
      .values({
        id: crypto.randomUUID(),
        userId,
        requestKey: key,
        hash,
        response: {
          accountId: resultState.id,
          pending,
          version: result.version,
        },
      });
    return result;
  });
}
function requireMarket(markets: Record<string, Market>, coin: string) {
  const market = markets[coin];
  if (!market || market.disabled || !D(market.mark).gt(0))
    throw new TradingError(market?.disabled ?? "Market is unavailable.");
  return market;
}
