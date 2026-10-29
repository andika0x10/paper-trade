"use client";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { AccountGate } from "./account-gate";
import { number, price, signed, timestamp } from "@/lib/format";
import { pnl } from "@/lib/trading/engine";
export function Portfolio() {
  const w = useWorkspace(),
    account = w.account;
  const points = account?.state.snapshots ?? [];
  const min = Math.min(...points.map((p) => +p.equity)),
    max = Math.max(...points.map((p) => +p.equity));
  const range = Math.max(10, max - min),
    low = min - range * 0.15,
    height = range * 1.3;
  const polyline = points
    .map(
      (p, i) =>
        `${points.length < 2 ? 0 : (i / (points.length - 1)) * 800},${200 - ((+p.equity - low) / height) * 190}`,
    )
    .join(" ");
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Portfolio</h1>
          <p>See the whole picture. Make every practice session count.</p>
        </div>
        <div className="page-actions">
          <button
            className="button small"
            disabled={w.busy || !w.user}
            onClick={() => void w.command({ action: "reconcile" })}
          >
            <RefreshCw size={12} />
            {w.syncing ? "Synchronizing…" : "Sync account"}
          </button>
          <Link href="/" className="button small primary">
            Trade
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      {!account ? (
        <AccountGate />
      ) : (
        <>
          {w.accountError && (
            <div className="inline-alert" role="alert">
              {w.accountError}
              <Link href="/settings#practice">Manage session</Link>
            </div>
          )}
          <div className="stat-grid">
            <div className="stat-block">
              <span>Account equity</span>
              <strong>{number(account.summary.equity)}</strong>
              <small>USDC · virtual funds</small>
            </div>
            <div className="stat-block">
              <span>Available margin</span>
              <strong>{number(account.summary.available)}</strong>
              <small>USDC available to trade</small>
            </div>
            <div className="stat-block">
              <span>Unrealized PnL</span>
              <strong>{signed(account.summary.unrealized)}</strong>
              <small>
                Across {account.state.positions.length} position legs
              </small>
            </div>
            <div className="stat-block">
              <span>Return on capital</span>
              <strong>
                {signed((+account.summary.equity / 10000 - 1) * 100)}%
              </strong>
              <small>Starting capital: 10,000 USDC</small>
            </div>
          </div>
          <div className="portfolio-grid">
            <section className="equity-panel">
              <div className="section-heading">
                <h2>Equity over time</h2>
                <span>Current session</span>
              </div>
              {points.length > 1 ? (
                <>
                  <svg
                    className="equity-svg"
                    viewBox="0 0 800 220"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Account equity over the current practice session"
                  >
                    {[20, 80, 140, 200].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        x2="800"
                        y1={y}
                        y2={y}
                        stroke="#242424"
                        strokeDasharray="3 5"
                      />
                    ))}
                    <polyline
                      points={polyline}
                      stroke="#ededed"
                      strokeWidth="1.8"
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="equity-axes">
                    <span>{timestamp(points[0].time)}</span>
                    <span>{timestamp(points.at(-1)!.time)}</span>
                  </div>
                </>
              ) : (
                <div className="empty-positions" style={{ minHeight: 250 }}>
                  <strong>Your equity curve starts here.</strong>
                  <p>
                    Snapshots appear as your account synchronizes. Place a trade
                    to begin tracking performance.
                  </p>
                </div>
              )}
            </section>
            <section className="breakdown-panel">
              <h2>Account breakdown</h2>
              {[
                ["Wallet balance", account.summary.balance],
                ["Unrealized PnL", account.summary.unrealized],
                ["Position margin", account.summary.margin],
                ["Order reservations", account.summary.reserved],
                [
                  "Total fees paid",
                  account.state.ledger
                    .filter((e) => e.type === "fee")
                    .reduce((n, e) => n - +e.amount, 0),
                ],
                [
                  "Net funding",
                  account.state.ledger
                    .filter((e) => e.type === "funding")
                    .reduce((n, e) => n + +e.amount, 0),
                ],
              ].map(([title, value]) => (
                <div className="detail-row" key={title}>
                  <span>{title}</span>
                  <b>
                    {number(value)} <small className="muted">USDC</small>
                  </b>
                </div>
              ))}
            </section>
          </div>
          <div className="section-heading">
            <h2>Open positions</h2>
            <span>{account.state.positions.length} position legs</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    "Market / Side",
                    "Quantity",
                    "Entry",
                    "Mark",
                    "Margin mode",
                    "Unrealized PnL",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account.state.positions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.coin}</b>
                      <small>
                        {p.side} · {p.leverage}×
                      </small>
                    </td>
                    <td>{number(p.quantity, 5)}</td>
                    <td>{price(p.entry)}</td>
                    <td>{price(account.state.marks[p.coin])}</td>
                    <td>{p.marginMode}</td>
                    <td>
                      {signed(
                        pnl(
                          p,
                          account.state.marks[p.coin] ?? p.entry,
                        ).toString(),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!account.state.positions.length && (
            <div className="empty-positions">
              <strong>No capital in the market.</strong>
              <p>
                Open positions will appear here once your first order fills.
              </p>
            </div>
          )}
          <p className="page-subtitle">
            {account.state.replay
              ? `Last reconstruction: ${account.state.replay.interval} candles. Offline equity and fills are estimates.`
              : "Account totals reflect the latest server synchronization."}
          </p>
        </>
      )}
    </div>
  );
}
