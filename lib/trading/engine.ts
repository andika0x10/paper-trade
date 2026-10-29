import Decimal from "decimal.js";
import type {
  Entry,
  Execution,
  Market,
  Order,
  OrderInput,
  Position,
  Quote,
  TradingState,
} from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });
export const D = (value: Decimal.Value) => new Decimal(value);
export const MAKER = "0.0002";
export const TAKER = "0.0005";
const uid = () => crypto.randomUUID();
export class TradingError extends Error {}
const demand: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new TradingError(message);
};
export function newState(now = Date.now()): TradingState {
  const id = uid();
  return {
    id,
    createdAt: now,
    balance: "10000",
    positions: [],
    orders: [],
    fills: [],
    ledger: [
      {
        id: uid(),
        time: now,
        type: "deposit",
        amount: "10000",
        reference: id,
        estimated: false,
      },
    ],
    snapshots: [{ time: now, equity: "10000" }],
    checkpoint: now,
    config: {},
    marks: {},
    fundingThrough: {},
  };
}
export function pnl(p: Position, price: string) {
  return D(price)
    .minus(p.entry)
    .mul(p.quantity)
    .mul(p.side === "long" ? 1 : -1);
}
export function maintenance(p: Position, price: string, market: Market) {
  const notional = D(p.quantity).mul(price);
  let amount = D(0);
  for (let i = 0; i < market.tiers.length; i++) {
    const tier = market.tiers[i];
    const upper = market.tiers[i + 1]?.lowerBound;
    const covered = Decimal.max(
      0,
      Decimal.min(notional, upper ?? notional).minus(tier.lowerBound),
    );
    amount = amount.plus(covered.div(tier.maxLeverage * 2));
  }
  return amount;
}
export function summary(s: TradingState) {
  let unrealized = D(0),
    crossPnl = D(0),
    isolated = D(0),
    crossInitial = D(0);
  for (const p of s.positions) {
    const unreal = pnl(p, s.marks[p.coin] ?? p.entry);
    unrealized = unrealized.plus(unreal);
    if (p.marginMode === "isolated") isolated = isolated.plus(p.margin);
    else {
      crossPnl = crossPnl.plus(unreal);
      crossInitial = crossInitial.plus(
        D(p.quantity)
          .mul(s.marks[p.coin] ?? p.entry)
          .div(p.leverage),
      );
    }
  }
  const reserved = s.orders
    .filter((o) => o.status === "open")
    .reduce((n, o) => n.plus(o.reserved), D(0));
  return {
    balance: s.balance,
    equity: D(s.balance).plus(unrealized).toString(),
    unrealized: unrealized.toString(),
    margin: isolated.plus(crossInitial).toString(),
    reserved: reserved.toString(),
    available: Decimal.max(
      0,
      D(s.balance)
        .plus(crossPnl)
        .minus(isolated)
        .minus(crossInitial)
        .minus(reserved),
    ).toString(),
    crossEquity: D(s.balance).minus(isolated).plus(crossPnl).toString(),
  };
}
function ledger(
  s: TradingState,
  type: Entry["type"],
  amount: Decimal.Value,
  x: Execution,
  reference: string,
  coin?: string,
  extras: Partial<Entry> = {},
) {
  s.balance = D(s.balance).plus(amount).toString();
  s.ledger.push({
    id: uid(),
    time: x.time,
    type,
    amount: D(amount).toString(),
    reference,
    coin,
    estimated: x.estimated,
    ...extras,
  });
}
export function configure(
  s: TradingState,
  coin: string,
  margin: "cross" | "isolated",
  position: "one-way" | "hedge",
) {
  demand(
    !s.positions.some((p) => p.coin === coin) &&
      !s.orders.some((o) => o.coin === coin && o.status === "open"),
    "Close positions and cancel orders in this market before changing modes.",
  );
  s.config[coin] = { margin, position };
}
function close(
  s: TradingState,
  p: Position,
  quantity: Decimal,
  price: string,
  feeRate: string,
  orderId: string,
  x: Execution,
) {
  const ratio = quantity.div(p.quantity);
  const realized = pnl({ ...p, quantity: quantity.toString() }, price);
  const fee = quantity.mul(price).mul(feeRate);
  ledger(s, "realized", realized, x, orderId, p.coin);
  ledger(s, "fee", fee.negated(), x, orderId, p.coin);
  s.fills.push({
    id: uid(),
    orderId,
    coin: p.coin,
    side: p.side === "long" ? "short" : "long",
    quantity: quantity.toString(),
    price,
    fee: fee.toString(),
    pnl: realized.toString(),
    ...x,
  });
  // Isolated losses cannot consume the cross wallet, including gap losses.
  const released = D(p.margin).mul(ratio);
  if (
    p.marginMode === "isolated" &&
    realized.minus(fee).lessThan(released.negated())
  )
    ledger(
      s,
      "adjustment",
      released.negated().minus(realized.minus(fee)),
      x,
      orderId,
      p.coin,
    );
  p.margin = D(p.margin).minus(released).toString();
  p.quantity = D(p.quantity).minus(quantity).toString();
  if (D(p.quantity).isZero())
    s.positions = s.positions.filter((v) => v.id !== p.id);
  return quantity;
}
function fill(
  s: TradingState,
  order: Order,
  quantity: Decimal,
  price: string,
  market: Market,
  feeRate: string,
  x: Execution,
) {
  let remaining = quantity;
  const config = s.config[order.coin] ?? {
    margin: order.marginMode,
    position: "one-way",
  };
  const opposite = s.positions.find(
    (p) => p.coin === order.coin && p.side !== order.side,
  );
  if (opposite && (order.reduceOnly || config.position === "one-way"))
    remaining = remaining.minus(
      close(
        s,
        opposite,
        Decimal.min(remaining, opposite.quantity),
        price,
        feeRate,
        order.id,
        x,
      ),
    );
  if (order.reduceOnly) return quantity.minus(remaining);
  if (remaining.isZero()) return quantity;
  const newNotional = remaining.mul(price);
  const existing = s.positions.find(
    (p) => p.coin === order.coin && p.side === order.side,
  );
  const totalNotional = newNotional.plus(
    existing ? D(existing.quantity).mul(price) : 0,
  );
  const tier = [...market.tiers]
    .reverse()
    .find((t) => totalNotional.gte(t.lowerBound));
  demand(
    tier && order.leverage <= Math.min(market.maxLeverage, tier.maxLeverage),
    "Order exceeds this market's leverage tier.",
  );
  const fee = newNotional.mul(feeRate),
    margin = newNotional.div(order.leverage);
  demand(
    D(summary(s).available).gte(margin.plus(fee)),
    "Insufficient available margin.",
  );
  ledger(s, "fee", fee.negated(), x, order.id, order.coin);
  if (existing) {
    const total = D(existing.quantity).plus(remaining);
    existing.entry = D(existing.entry)
      .mul(existing.quantity)
      .plus(newNotional)
      .div(total)
      .toString();
    existing.quantity = total.toString();
    existing.margin = D(existing.margin).plus(margin).toString();
    if (order.tp) existing.tp = order.tp;
    if (order.sl) existing.sl = order.sl;
  } else
    s.positions.push({
      id: uid(),
      coin: order.coin,
      side: order.side,
      quantity: remaining.toString(),
      entry: price,
      leverage: order.leverage,
      marginMode: order.marginMode,
      margin: margin.toString(),
      openedAt: x.time,
      tp: order.tp,
      sl: order.sl,
    });
  s.fills.push({
    id: uid(),
    orderId: order.id,
    coin: order.coin,
    side: order.side,
    quantity: remaining.toString(),
    price,
    fee: fee.toString(),
    pnl: "0",
    ...x,
  });
  return quantity;
}
export function submit(
  s: TradingState,
  input: OrderInput,
  market: Market,
  quote: Quote,
  now: number,
) {
  demand(!market.disabled, market.disabled ?? "Market unavailable.");
  demand(
    quote.coin === input.coin &&
      now - quote.time < 15_000 &&
      now >= quote.time - 5000,
    "Market data is stale. Retry when the feed reconnects.",
  );
  demand(
    market.tiers.length && D(quote.mark).gt(0),
    "Risk metadata is unavailable.",
  );
  demand(
    !market.isolatedOnly || input.marginMode === "isolated",
    "This market only supports isolated margin.",
  );
  demand(
    Number.isInteger(input.leverage) &&
      input.leverage >= 1 &&
      input.leverage <= market.maxLeverage,
    "Invalid leverage.",
  );
  const quantity = D(input.quantity);
  demand(
    quantity.isFinite() &&
      quantity.gt(0) &&
      quantity.decimalPlaces() <= market.szDecimals,
    `Quantity must be positive with at most ${market.szDecimals} decimals.`,
  );
  const config = s.config[input.coin] ?? {
    margin: "cross",
    position: "one-way",
  };
  demand(
    config.margin === input.marginMode,
    "Apply the margin mode before placing an order.",
  );
  const existing = s.positions.find(
    (p) => p.coin === input.coin && p.side === input.side,
  );
  if (existing && !input.reduceOnly)
    demand(
      existing.leverage === input.leverage &&
        existing.marginMode === input.marginMode,
      "Use the position's existing leverage and margin mode.",
    );
  const price = input.type === "limit" ? input.price : quote.mark;
  demand(
    price && D(price).isFinite() && D(price).gt(0),
    "Enter a valid limit price.",
  );
  for (const value of [input.tp, input.sl])
    if (value)
      demand(
        D(value).isFinite() && D(value).gt(0),
        "TP and SL must be positive prices.",
      );
  if (!input.reduceOnly) {
    if (input.tp)
      demand(
        input.side === "long" ? D(input.tp).gt(price) : D(input.tp).lt(price),
        "Take profit must be on the profitable side of the entry price.",
      );
    if (input.sl)
      demand(
        input.side === "long" ? D(input.sl).lt(price) : D(input.sl).gt(price),
        "Stop loss must be on the loss side of the entry price.",
      );
  }
  if (input.reduceOnly)
    demand(
      s.positions.some((p) => p.coin === input.coin && p.side !== input.side),
      "No opposite position to reduce.",
    );
  const order: Order = {
    ...input,
    id: uid(),
    quantity: quantity.toString(),
    remaining: quantity.toString(),
    reserved: "0",
    status: "open",
    createdAt: now,
  };
  s.marks[input.coin] = quote.mark;
  s.config[input.coin] = config;
  s.fundingThrough[input.coin] ??= now;
  const levels = input.side === "long" ? quote.asks : quote.bids;
  demand(levels.length > 0, "Order book unavailable.");
  const crossing =
    input.type === "market" ||
    (input.side === "long"
      ? D(levels[0][0]).lte(price)
      : D(levels[0][0]).gte(price));
  s.orders.push(order);
  if (crossing) {
    for (const [px, size] of levels) {
      if (D(order.remaining).isZero()) break;
      if (
        input.type === "limit" &&
        (input.side === "long" ? D(px).gt(price) : D(px).lt(price))
      )
        break;
      const filled = fill(
        s,
        order,
        Decimal.min(order.remaining, size),
        px,
        market,
        TAKER,
        { time: now, estimated: false, reason: "Order book execution" },
      );
      order.remaining = D(order.remaining).minus(filled).toString();
      if (input.reduceOnly && filled.isZero()) break;
    }
  }
  if (D(order.remaining).isZero()) order.status = "filled";
  else if (input.type === "market") order.status = "cancelled";
  else if (!input.reduceOnly) {
    order.reserved = D(order.remaining)
      .mul(price)
      .div(input.leverage)
      .plus(D(order.remaining).mul(price).mul(TAKER))
      .toString();
    // Exclude this order's reservation when checking its affordability.
    const reserved = order.reserved;
    order.reserved = "0";
    demand(
      D(summary(s).available).gte(reserved),
      "Insufficient available margin for the pending order.",
    );
    order.reserved = reserved;
  }
  return order;
}
export function cancel(s: TradingState, id: string) {
  const order = s.orders.find((o) => o.id === id && o.status === "open");
  demand(order, "Open order not found.");
  order.status = "cancelled";
  order.reserved = "0";
}
export function closePosition(
  s: TradingState,
  id: string,
  quantity: string,
  market: Market,
  quote: Quote,
  now: number,
) {
  const p = s.positions.find((p) => p.id === id);
  demand(p, "Position not found.");
  demand(
    D(quantity).gt(0) && D(quantity).lte(p.quantity),
    "Close quantity exceeds the position.",
  );
  return submit(
    s,
    {
      coin: p.coin,
      side: p.side === "long" ? "short" : "long",
      type: "market",
      quantity,
      leverage: p.leverage,
      marginMode: p.marginMode,
      reduceOnly: true,
    },
    market,
    quote,
    now,
  );
}
export function applyFunding(
  s: TradingState,
  coin: string,
  rate: string,
  price: string,
  time: number,
  estimated: boolean,
) {
  if ((s.fundingThrough[coin] ?? s.createdAt) >= time) return;
  const x = { time, estimated, reason: "Funding" };
  for (const p of s.positions.filter(
    (p) => p.coin === coin && p.openedAt < time,
  )) {
    const amount = D(p.quantity)
      .mul(price)
      .mul(rate)
      .mul(p.side === "long" ? -1 : 1);
    ledger(s, "funding", amount, x, `${coin}:${time}:${p.id}`, coin, {
      rate,
      price,
    });
    if (p.marginMode === "isolated") {
      const next = D(p.margin).plus(amount);
      if (next.lt(0))
        ledger(
          s,
          "adjustment",
          next.negated(),
          x,
          `Isolated funding deficit:${p.id}:${time}`,
          coin,
        );
      p.margin = Decimal.max(0, next).toString();
    }
  }
  s.fundingThrough[coin] = time;
}
export function evaluate(
  s: TradingState,
  markets: Record<string, Market>,
  ranges: Record<string, { high: string; low: string; close: string }>,
  x: Execution,
  processLimits = true,
) {
  // All markets first move to their adverse extreme on a shared timeline. In
  // hedge mode, each isolated leg is independently stress-tested; cross uses net exposure.
  for (const [coin, r] of Object.entries(ranges)) {
    const cross = s.positions.filter(
      (p) => p.coin === coin && p.marginMode === "cross",
    );
    const score = (px: string) =>
      cross.reduce(
        (n, p) => n.plus(pnl(p, px)).minus(maintenance(p, px, markets[coin])),
        D(0),
      );
    s.marks[coin] = score(r.low).lte(score(r.high)) ? r.low : r.high;
  }
  for (const p of [...s.positions]) {
    const r = ranges[p.coin],
      m = markets[p.coin];
    if (!r || !m) throw new TradingError(`Risk data missing for ${p.coin}.`);
    const adverse = p.side === "long" ? r.low : r.high;
    if (
      p.marginMode === "isolated" &&
      D(p.margin)
        .plus(pnl(p, adverse))
        .lte(maintenance(p, adverse, m))
    )
      close(s, p, D(p.quantity), adverse, TAKER, uid(), {
        ...x,
        reason: "Isolated liquidation",
      });
  }
  const cross = s.positions.filter((p) => p.marginMode === "cross");
  const mm = cross.reduce(
    (n, p) => n.plus(maintenance(p, s.marks[p.coin], markets[p.coin])),
    D(0),
  );
  if (cross.length && D(summary(s).crossEquity).lte(mm)) {
    for (const p of cross)
      close(s, p, D(p.quantity), s.marks[p.coin], TAKER, uid(), {
        ...x,
        reason: "Cross liquidation",
      });
    for (const o of s.orders.filter(
      (o) => o.status === "open" && o.marginMode === "cross",
    ))
      cancel(s, o.id);
  }
  for (const p of [...s.positions]) {
    const r = ranges[p.coin];
    const slHit =
      p.sl && (p.side === "long" ? D(r.low).lte(p.sl) : D(r.high).gte(p.sl));
    const tpHit =
      p.tp && (p.side === "long" ? D(r.high).gte(p.tp) : D(r.low).lte(p.tp));
    if (slHit || tpHit) {
      const trigger = slHit ? p.sl! : p.tp!;
      // Gap-through stops fill at the worse observed price, never an invented better price.
      const px = slHit
        ? (p.side === "long"
            ? Decimal.min(trigger, r.close)
            : Decimal.max(trigger, r.close)
          ).toString()
        : trigger;
      close(s, p, D(p.quantity), px, TAKER, uid(), {
        ...x,
        reason: slHit ? "Stop loss" : "Take profit",
      });
    }
  }
  for (const [coin, r] of Object.entries(ranges)) s.marks[coin] = r.close;
  const limitIds = processLimits
    ? s.orders.filter((o) => o.status === "open").map((o) => o.id)
    : [];
  let opened = false;
  for (const id of limitIds) {
    const o = s.orders.find((o) => o.id === id && o.status === "open");
    if (!o) continue;
    const r = ranges[o.coin];
    if (!r) throw new TradingError(`Candle missing for ${o.coin}.`);
    const crossed =
      o.side === "long" ? D(r.low).lt(o.price!) : D(r.high).gt(o.price!);
    if (!crossed) continue;
    const backup = structuredClone(s);
    try {
      o.reserved = "0";
      const done = fill(
        s,
        o,
        D(o.remaining),
        o.price!,
        markets[o.coin],
        MAKER,
        { ...x, reason: "Limit price crossed" },
      );
      o.remaining = D(o.remaining).minus(done).toString();
      o.status = D(o.remaining).isZero() ? "filled" : "cancelled";
      opened = true;
    } catch (e) {
      if (!(e instanceof TradingError)) throw e;
      Object.assign(s, backup);
      cancel(s, o.id);
    }
  }
  // Conservatively stress-test new limit entries in their fill bar as well.
  if (opened) evaluate(s, markets, ranges, x, false);
  const protectedMargin = s.positions
    .filter((p) => p.marginMode === "isolated")
    .reduce((n, p) => n.plus(p.margin), D(0));
  if (D(s.balance).lt(protectedMargin))
    ledger(
      s,
      "adjustment",
      protectedMargin.minus(s.balance),
      x,
      "Virtual cross deficit protection",
    );
}
export function snapshot(s: TradingState, time: number) {
  const equity = summary(s).equity;
  if (
    !s.snapshots.length ||
    time - s.snapshots[s.snapshots.length - 1].time >= 60_000
  )
    s.snapshots.push({ time, equity });
}
