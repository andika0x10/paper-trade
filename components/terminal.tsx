"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Search,
  Settings2,
  Star,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { TradingChart } from "./trading-chart";
import { Dialog } from "./dialog";
import { compact, number, price, signed, timestamp } from "@/lib/format";
import type { MarginMode, PositionMode } from "@/lib/trading/types";
import { pnl } from "@/lib/trading/engine";

export function Terminal() {
  const w = useWorkspace(),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState("chart");
  const m = w.market,
    mark = w.tape[0]?.px ?? m?.mark;
  const change =
    m && +m.previous > 0 ? (+(mark ?? m.mark) / +m.previous - 1) * 100 : 0;
  return (
    <div className="terminal">
      <div className="terminal-title">
        <div>
          <h1>Trading desk</h1>
          <span className="muted">Your edge starts with practice.</span>
        </div>
        <Link href="/portfolio" className="quiet-link">
          View portfolio
          <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="market-strip">
        <div className="market-selector">
          <button
            className="symbol-icon"
            aria-label={
              w.watchlist.includes(w.selected)
                ? "Remove from watchlist"
                : "Add to watchlist"
            }
            onClick={() => w.toggleWatchlist(w.selected)}
          >
            <Star
              size={16}
              fill={w.watchlist.includes(w.selected) ? "currentColor" : "none"}
            />
          </button>
          <button className="market-select" onClick={() => setPicker(true)}>
            <span className="asset-symbol">
              {m?.name === "BTC" || w.selected === "BTC"
                ? "₿"
                : (m?.name ?? w.selected).slice(0, 1)}
            </span>
            <span>
              <b>{m?.name ?? w.selected}</b>
              <small>Perpetual</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="market-price">
          <strong>{mark ? price(mark) : "—"}</strong>
          <span>{mark ? `${signed(change)}%` : "—"}</span>
        </div>
        <div className="market-stat">
          <span>Mark price</span>
          <b>{m ? price(m.mark) : "—"}</b>
        </div>
        <div className="market-stat">
          <span>24h volume</span>
          <b>{m ? `$${compact(m.volume)}` : "—"}</b>
        </div>
        <div className="market-stat">
          <span>Open interest</span>
          <b>{m ? `$${compact(+m.openInterest * +m.mark)}` : "—"}</b>
        </div>
        <div className="market-stat">
          <span>Funding / 1h</span>
          <b>{m ? `${signed(+m.funding * 100, 4)}%` : "—"}</b>
        </div>
        <div className="market-stat source-stat">
          <span>Data source</span>
          <b>
            Hyperliquid <ArrowUpRight size={11} />
          </b>
        </div>
      </div>
      {w.marketError && (
        <div className="inline-alert" role="alert">
          {w.marketError}
          <button onClick={() => void w.reloadMarkets()}>Retry</button>
        </div>
      )}
      {w.accountError && w.user && (
        <div className="inline-alert" role="alert">
          {w.accountError}
          <button
            disabled={w.busy}
            onClick={() => void w.command({ action: "reconcile" })}
          >
            Retry sync
          </button>
          <Link href="/settings">Reset session</Link>
        </div>
      )}
      <div className="mobile-tabs" aria-label="Trading panels">
        {["chart", "book", "orders"].map((v) => (
          <button
            className={mobile === v ? "selected" : ""}
            onClick={() => setMobile(v)}
            key={v}
          >
            {v === "book"
              ? "Order book"
              : v === "orders"
                ? "Place order"
                : "Chart"}
          </button>
        ))}
      </div>
      <div className={`terminal-grid mobile-${mobile}`}>
        <div className="chart-area">
          <TradingChart />
        </div>
        <OrderBook />
        <OrderForm />
      </div>
      <Positions />
      <div className="terminal-disclosure">
        <CircleHelp size={13} />
        <span>
          Simulation only. Maker 0.02% · Taker 0.05%. Offline fills and
          liquidations are estimates.
        </span>
        <Link href="/settings#simulation">How it works</Link>
      </div>
      {picker && (
        <Dialog
          labelledBy="market-dialog-title"
          className="market-modal"
          onClose={() => setPicker(false)}
        >
          <div className="modal-heading">
            <h2 id="market-dialog-title">Choose a market</h2>
            <button
              className="icon-button"
              aria-label="Close market selector"
              onClick={() => setPicker(false)}
            >
              <X size={19} />
            </button>
          </div>
          <label className="search-input">
            <Search size={16} />
            <input
              autoFocus
              placeholder="Search perpetuals"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="market-picker-list">
            {w.markets
              .filter((m) =>
                m.coin.toLowerCase().includes(search.toLowerCase()),
              )
              .map((m) => (
                <button
                  key={m.coin}
                  disabled={Boolean(m.disabled)}
                  onClick={() => {
                    w.select(m.coin);
                    setPicker(false);
                  }}
                >
                  <span>
                    <b>{m.coin}</b>
                    <small>
                      {m.disabled ??
                        `${m.dex || "Native"} · ${m.maxLeverage}× max`}
                    </small>
                  </span>
                  <span>{price(m.mark)}</span>
                </button>
              ))}
            {!w.markets.length && (
              <p className="muted">
                Market data is loading. Close this window and retry shortly.
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
function OrderBook() {
  const { book, tape, feed, selected } = useWorkspace(),
    [tab, setTab] = useState("book");
  const asks = book?.levels[1].slice(0, 9) ?? [],
    bids = book?.levels[0].slice(0, 9) ?? [];
  const max = Math.max(1, ...[...asks, ...bids].map((l) => +l.sz));
  const mid =
    asks.length && bids.length ? (+asks[0].px + +bids[0].px) / 2 : undefined;
  const levels = (data: typeof asks, side: string) =>
    data.map((l, i) => (
      <div className={`book-row ${side}`} key={`${side}-${i}`}>
        <i style={{ width: `${(+l.sz / max) * 100}%` }} />
        <span>{price(l.px)}</span>
        <span>{number(l.sz, Math.min(5, Math.max(2, +l.sz < 1 ? 5 : 2)))}</span>
        <span>{number(+l.px * +l.sz, 0)}</span>
      </div>
    ));
  return (
    <section className="book-panel">
      <div className="panel-tabs">
        <button
          className={tab === "book" ? "active" : ""}
          onClick={() => setTab("book")}
        >
          Order book
        </button>
        <button
          className={tab === "trades" ? "active" : ""}
          onClick={() => setTab("trades")}
        >
          Trades
        </button>
      </div>
      <div className="book-controls">
        <span>
          <i />
          <i />
          <i />
        </span>
        <span>
          {selected.split(":").at(-1)} / USD <ChevronDown size={10} />
        </span>
      </div>
      <div className="book-columns">
        <span>Price (USD)</span>
        <span>Size</span>
        <span>{tab === "book" ? "Total (USD)" : "Time"}</span>
      </div>
      {tab === "book" ? (
        <>
          <div className="book-asks">
            {levels([...asks].reverse(), "ask")}
            {!asks.length && (
              <div className="book-empty">Waiting for order book…</div>
            )}
          </div>
          <div className="book-mid">
            <strong>{mid ? price(mid) : "—"}</strong>
            <ArrowDownUp size={13} />
            <span>
              {asks.length && bids.length
                ? `Spread ${price(+asks[0].px - +bids[0].px)}`
                : feed}
            </span>
          </div>
          <div className="book-bids">{levels(bids, "bid")}</div>
          <div className="book-legend">
            <span>
              <i className="legend-solid" />
              Bid
            </span>
            <span>
              Ask
              <i className="legend-outline" />
            </span>
          </div>
          <div className="book-balance">
            <i
              style={{
                width: `${
                  (bids.reduce((n, l) => n + +l.sz, 0) /
                    Math.max(
                      1,
                      [...bids, ...asks].reduce((n, l) => n + +l.sz, 0),
                    )) *
                  100
                }%`,
              }}
            />
          </div>
        </>
      ) : (
        <div className="tape-list">
          {tape.slice(0, 21).map((t, i) => (
            <div className="book-row" key={`${t.hash}-${i}`}>
              <span className={t.side === "B" ? "buy-tick" : "sell-tick"}>
                {t.side === "B" ? "↗" : "↘"} {price(t.px)}
              </span>
              <span>{number(t.sz, 4)}</span>
              <span>{new Date(t.time).toLocaleTimeString("en-GB")}</span>
            </div>
          ))}
          {!tape.length && (
            <div className="book-empty">Waiting for recent trades…</div>
          )}
        </div>
      )}
    </section>
  );
}
function OrderForm() {
  const w = useWorkspace(),
    m = w.market;
  const [type, setType] = useState<"market" | "limit">("market"),
    [side, setSide] = useState<"long" | "short">("long"),
    [quantity, setQuantity] = useState(""),
    [limit, setLimit] = useState(""),
    [leverage, setLeverage] = useState(5),
    [brackets, setBrackets] = useState(false),
    [tp, setTp] = useState(""),
    [sl, setSl] = useState(""),
    [reduceOnly, setReduceOnly] = useState(false),
    [modes, setModes] = useState(false);
  const config = w.account?.state.config[w.selected] ?? {
    margin: "cross" as MarginMode,
    position: "one-way" as PositionMode,
  };
  const effectiveLeverage = Math.min(leverage, m?.maxLeverage ?? 5);
  const refPrice = +(type === "limit" ? limit : (m?.mark ?? 0)),
    notional = +quantity * refPrice,
    margin = notional / effectiveLeverage;
  const canTrade = Boolean(
    w.user &&
    w.account &&
    !w.accountError &&
    !w.account.pending &&
    w.feed === "live" &&
    m &&
    !m.disabled,
  );
  return (
    <section className="order-panel">
      <div className="order-heading">
        <h2>Place order</h2>
        <span>USDC</span>
      </div>
      <div className="mode-controls">
        <button onClick={() => setModes(!modes)}>
          {config.margin === "cross" ? "Cross" : "Isolated"}
          <ChevronDown size={11} />
        </button>
        <button onClick={() => setModes(!modes)}>
          {effectiveLeverage}×<ChevronDown size={11} />
        </button>
        <button
          className="icon-button"
          title="Trading modes"
          onClick={() => setModes(!modes)}
        >
          <Settings2 size={14} />
        </button>
      </div>
      {modes && (
        <div className="mode-editor">
          <label>
            Margin mode
            <select
              value={config.margin}
              disabled={w.busy || !w.user}
              onChange={(e) =>
                void w.command({
                  action: "configure",
                  coin: w.selected,
                  margin: e.target.value as MarginMode,
                  position: config.position,
                })
              }
            >
              <option value="cross">Cross</option>
              <option value="isolated">Isolated</option>
            </select>
          </label>
          <label>
            Position mode
            <select
              value={config.position}
              disabled={w.busy || !w.user}
              onChange={(e) =>
                void w.command({
                  action: "configure",
                  coin: w.selected,
                  margin: config.margin,
                  position: e.target.value as PositionMode,
                })
              }
            >
              <option value="one-way">One-way</option>
              <option value="hedge">Hedge</option>
            </select>
          </label>
          <label>
            Leverage <span>{effectiveLeverage}×</span>
            <input
              aria-label="Leverage"
              type="range"
              min="1"
              max={m?.maxLeverage ?? 5}
              value={effectiveLeverage}
              onChange={(e) => setLeverage(+e.target.value)}
            />
          </label>
          <p>Close positions and cancel orders before changing modes.</p>
        </div>
      )}
      <div className="segmented order-direction">
        <button
          className={side === "long" ? "selected" : ""}
          onClick={() => setSide("long")}
        >
          <ArrowUp size={12} />
          Buy / Long
        </button>
        <button
          className={side === "short" ? "selected" : ""}
          onClick={() => setSide("short")}
        >
          <ArrowDown size={12} />
          Sell / Short
        </button>
      </div>
      <div className="order-type">
        <button
          className={type === "market" ? "active" : ""}
          onClick={() => setType("market")}
        >
          Market
        </button>
        <button
          className={type === "limit" ? "active" : ""}
          onClick={() => setType("limit")}
        >
          Limit
        </button>
        <span title="Market executes against the current public order book. Limit waits for the market to trade through your price.">
          <CircleHelp size={13} />
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await w.command({
              action: "order",
              order: {
                coin: w.selected,
                side,
                type,
                quantity,
                leverage: effectiveLeverage,
                marginMode: config.margin,
                reduceOnly,
                ...(type === "limit" ? { price: limit } : {}),
                ...(brackets && tp ? { tp } : {}),
                ...(brackets && sl ? { sl } : {}),
              },
            })
          ) {
            setQuantity("");
          }
        }}
      >
        <div className="available">
          <span>Available</span>
          <b>
            {w.account ? number(w.account.summary.available) : "—"}{" "}
            <small>USDC</small>
          </b>
        </div>
        {type === "limit" && (
          <label className="field">
            Price
            <div className="input-wrap">
              <input
                required
                inputMode="decimal"
                placeholder="Limit price"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <span>USD</span>
              <button type="button" onClick={() => setLimit(m?.mark ?? "")}>
                Last
              </button>
            </div>
          </label>
        )}
        <label className="field">
          {type === "market" ? "Order size" : "Quantity"}
          <div className="input-wrap">
            <input
              aria-label="Order size"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <span>{m?.name ?? w.selected}</span>
          </div>
        </label>
        <div className="allocation-buttons">
          {[25, 50, 75, 100].map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => {
                const qty =
                  (+(w.account?.summary.available ?? 0) *
                    (percent / 100) *
                    effectiveLeverage) /
                  (+(m?.mark ?? 1) * (1 + effectiveLeverage * 0.0005));
                const factor = 10 ** (m?.szDecimals ?? 5);
                setQuantity(String(Math.floor(qty * factor) / factor));
              }}
            >
              {percent}%
            </button>
          ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={brackets}
            onChange={(e) => setBrackets(e.target.checked)}
          />
          Take profit / Stop loss
        </label>
        {brackets && (
          <div className="bracket-inputs">
            <label className="field">
              Take profit
              <input
                inputMode="decimal"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                placeholder="Price"
              />
            </label>
            <label className="field">
              Stop loss
              <input
                inputMode="decimal"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder="Price"
              />
            </label>
          </div>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
          />
          Reduce-only
          <span title="Only reduces an opposite position; never opens a new one.">
            <CircleHelp size={12} />
          </span>
        </label>
        <div className="order-estimate">
          <div>
            <span>Order value</span>
            <b>{Number.isFinite(notional) ? number(notional) : "0.00"} USDC</b>
          </div>
          <div>
            <span>Est. margin</span>
            <b>{Number.isFinite(margin) ? number(margin) : "0.00"} USDC</b>
          </div>
          <div>
            <span>Est. fee</span>
            <b>
              {Number.isFinite(notional)
                ? number(notional * 0.0005, 4)
                : "0.00"}{" "}
              USDC
            </b>
          </div>
        </div>
        {w.user ? (
          <button
            className={`button order-submit ${side === "long" ? "primary" : ""}`}
            disabled={!canTrade || w.busy || !quantity}
            type="submit"
          >
            {w.syncing
              ? "Synchronizing…"
              : w.busy
                ? "Processing…"
                : `${reduceOnly ? "Reduce" : side === "long" ? "Buy / Long" : "Sell / Short"} ${m?.name ?? w.selected}`}
            <ArrowUpRight size={16} />
          </button>
        ) : (
          <Link className="button primary order-submit" href="/login">
            Log in to trade
            <ArrowUpRight size={16} />
          </Link>
        )}
        <p className="order-footnote">
          {m?.disabled ??
            (w.user && w.feed !== "live"
              ? "Waiting for a fresh market feed."
              : "Virtual funds. No wallet connection required.")}
        </p>
      </form>
      <div className="account-mini">
        <div>
          <span>Practice account</span>
          <span className="tiny-badge">Simulation</span>
        </div>
        <div>
          <span>Account equity</span>
          <b>
            {w.account ? number(w.account.summary.equity) : "10,000.00"}
            <small> USDC</small>
          </b>
        </div>
        <div>
          <span>Unrealized PnL</span>
          <b>
            {w.account ? signed(w.account.summary.unrealized) : "—"}
            <small> USDC</small>
          </b>
        </div>
        {!w.user && (
          <small>New accounts receive 10,000 USDC in virtual funds.</small>
        )}
      </div>
    </section>
  );
}
function Positions() {
  const w = useWorkspace(),
    [tab, setTab] = useState("positions"),
    [close, setClose] = useState<string>(),
    [quantity, setQuantity] = useState("");
  const positions = w.account?.state.positions ?? [],
    orders = w.account?.state.orders.filter((o) => o.status === "open") ?? [],
    fills = w.account?.state.fills ?? [];
  const count =
    tab === "positions"
      ? positions.length
      : tab === "orders"
        ? orders.length
        : fills.length;
  return (
    <section className="positions-panel">
      <div className="positions-toolbar">
        <div className="panel-tabs">
          {[
            ["positions", "Positions", positions.length],
            ["orders", "Open orders", orders.length],
            ["history", "Order history", fills.length],
          ].map(([key, title, count]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(String(key))}
            >
              {title}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <span className="positions-meta">
          {w.syncing
            ? "Synchronizing"
            : w.account?.pending
              ? "Reconstruction pending"
              : w.user
                ? "Server-verified account"
                : "Practice account"}
        </span>
      </div>
      <div className="table-scroll">
        <table className="data-table position-table">
          <thead>
            <tr>
              {(tab === "positions"
                ? [
                    "Market / Side",
                    "Size",
                    "Entry price",
                    "Mark price",
                    "Margin",
                    "Unrealized PnL",
                    "TP / SL",
                    "",
                  ]
                : tab === "orders"
                  ? [
                      "Market / Side",
                      "Type",
                      "Remaining",
                      "Limit price",
                      "Reserved margin",
                      "Created",
                      "",
                      "",
                    ]
                  : [
                      "Market / Side",
                      "Size",
                      "Fill price",
                      "Fee",
                      "Realized PnL",
                      "Time",
                      "Execution",
                      "",
                    ]
              ).map((title, i) => (
                <th key={i}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab === "positions" &&
              positions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.coin}</b>
                    <small>
                      {p.side === "long" ? "↑ Long" : "↓ Short"} · {p.leverage}×
                      · {p.marginMode}
                    </small>
                  </td>
                  <td>{number(p.quantity, 5)}</td>
                  <td>{price(p.entry)}</td>
                  <td>{price(w.account?.state.marks[p.coin] ?? p.entry)}</td>
                  <td>
                    {number(p.margin)}
                    <small>USDC</small>
                  </td>
                  <td>
                    {signed(
                      pnl(
                        p,
                        w.account?.state.marks[p.coin] ?? p.entry,
                      ).toString(),
                    )}
                    <small>USDC</small>
                  </td>
                  <td>
                    {p.tp ? price(p.tp) : "—"} / {p.sl ? price(p.sl) : "—"}
                  </td>
                  <td>
                    <button
                      className="button small"
                      disabled={w.busy || Boolean(w.accountError)}
                      onClick={() => {
                        setClose(p.id);
                        setQuantity(p.quantity);
                      }}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            {tab === "orders" &&
              orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.coin}</b>
                    <small>
                      {o.side} · {o.leverage}×
                    </small>
                  </td>
                  <td>{o.type}</td>
                  <td>{number(o.remaining, 5)}</td>
                  <td>{price(o.price)}</td>
                  <td>{number(o.reserved)}</td>
                  <td>{timestamp(o.createdAt)}</td>
                  <td />
                  <td>
                    <button
                      className="button small"
                      disabled={w.busy}
                      onClick={() =>
                        void w.command({ action: "cancel", orderId: o.id })
                      }
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            {tab === "history" &&
              [...fills]
                .reverse()
                .slice(0, 50)
                .map((f) => (
                  <tr key={f.id}>
                    <td>
                      <b>{f.coin}</b>
                      <small>{f.side}</small>
                    </td>
                    <td>{number(f.quantity, 5)}</td>
                    <td>{price(f.price)}</td>
                    <td>{number(f.fee, 4)}</td>
                    <td>{signed(f.pnl)}</td>
                    <td>{timestamp(f.time)}</td>
                    <td>
                      <span className="tiny-badge">
                        {f.estimated
                          ? `Estimated ${f.interval ?? ""}`
                          : "Book snapshot"}
                      </span>
                    </td>
                    <td />
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!count && (
        <div className="empty-positions">
          <span className="empty-icon">
            <ArrowDownUp size={21} />
          </span>
          <strong>
            {!w.user
              ? "A clean slate. A real market."
              : tab === "positions"
                ? "No open positions"
                : tab === "orders"
                  ? "No pending orders"
                  : "Your first trade starts here"}
          </strong>
          <p>
            {!w.user
              ? "Log in to put your strategy to the test with 10,000 USDC in virtual funds."
              : tab === "positions"
                ? "Choose a market and place an order to open your first position."
                : tab === "orders"
                  ? "Limit orders waiting for a fill will appear here."
                  : "Your fills, fees, and execution details will appear here."}
          </p>
          {!w.user && (
            <Link href="/register" className="quiet-link">
              Create your practice account
              <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      )}
      {close && (
        <Dialog labelledBy="close-title" onClose={() => setClose(undefined)}>
          <div className="modal-heading">
            <h2 id="close-title">Close position</h2>
            <button
              className="icon-button"
              aria-label="Cancel close"
              onClick={() => setClose(undefined)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="muted">
            Enter a quantity for a partial close, or keep the full size.
            Execution uses the current order book.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await w.command({
                  action: "close",
                  positionId: close,
                  quantity,
                })
              )
                setClose(undefined);
            }}
          >
            <label className="field">
              Quantity
              <input
                required
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <button disabled={w.busy} className="button primary">
              {w.busy ? "Processing…" : "Close position"}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
