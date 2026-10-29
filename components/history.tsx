"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { AccountGate } from "./account-gate";
import { number, price, signed, timestamp } from "@/lib/format";
import type { TradingState } from "@/lib/trading/types";
export function History() {
  const w = useWorkspace(),
    [tab, setTab] = useState("fills"),
    [archive, setArchive] = useState(""),
    [archivedState, setArchivedState] = useState<TradingState>(),
    [loading, setLoading] = useState(false),
    [page, setPage] = useState(0);
  const state = archive ? archivedState : w.account?.state;
  const rows = state
    ? tab === "fills"
      ? [...state.fills]
          .reverse()
          .map((f) => ({
            id: f.id,
            time: f.time,
            market: f.coin,
            type: `${f.side} · ${f.reason}`,
            quantity: f.quantity,
            price: f.price,
            amount: f.pnl,
            fee: f.fee,
            execution: f.estimated
              ? `Estimated · ${f.interval ?? "snapshot"}`
              : "Book snapshot",
          }))
      : tab === "orders"
        ? [...state.orders]
            .reverse()
            .map((o) => ({
              id: o.id,
              time: o.createdAt,
              market: o.coin,
              type: `${o.side} ${o.type} · ${o.status}`,
              quantity: o.quantity,
              price: o.price ?? "",
              amount: "",
              fee: "",
              execution: o.reduceOnly ? "Reduce-only" : "Order",
            }))
        : [...state.ledger]
            .reverse()
            .map((e) => ({
              id: e.id,
              time: e.time,
              market: e.coin ?? "Account",
              type: e.type,
              quantity: "",
              price: e.price ?? "",
              amount: e.amount,
              fee: "",
              execution: e.estimated
                ? "Estimated"
                : e.type === "deposit"
                  ? "Virtual deposit"
                  : "Ledger",
            }))
    : [];
  async function chooseArchive(id: string) {
    setArchive(id);
    setPage(0);
    if (!id) return;
    setLoading(true);
    setArchivedState(undefined);
    try {
      const response = await fetch(
        `/api/account?archive=${encodeURIComponent(id)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setArchivedState(result.state);
    } catch (error) {
      w.notice(
        error instanceof Error ? error.message : "Unable to load the session.",
      );
    } finally {
      setLoading(false);
    }
  }
  function download() {
    const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const text = [
      "Time,Market,Type,Quantity,Price,PnL or amount,Fee,Execution",
      ...rows.map((r) =>
        [
          new Date(r.time).toISOString(),
          r.market,
          r.type,
          r.quantity,
          r.price,
          r.amount,
          r.fee,
          r.execution,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `paper-${tab}-${state?.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>History</h1>
          <p>Every decision leaves a record. Review yours.</p>
        </div>
        <div className="history-controls">
          <select
            aria-label="Practice session"
            value={archive}
            onChange={(e) => void chooseArchive(e.target.value)}
          >
            <option value="">Current session</option>
            {w.account?.archives?.map((a) => (
              <option key={a.id} value={a.id}>
                Session · {new Date(a.createdAt).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
          <button
            className="button small"
            disabled={!rows.length}
            onClick={download}
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>
      {!w.account ? (
        <AccountGate title="Your trading story starts here." />
      ) : (
        <>
          <div className="section-toolbar">
            <div className="segmented">
              {[
                ["fills", "Trade fills"],
                ["orders", "Orders"],
                ["ledger", "Account ledger"],
              ].map(([key, title]) => (
                <button
                  key={key}
                  className={key === tab ? "selected" : ""}
                  onClick={() => {
                    setTab(key);
                    setPage(0);
                  }}
                >
                  {title}
                </button>
              ))}
            </div>
            <span className="muted">{rows.length} records</span>
          </div>
          {loading ? (
            <div className="loading-panel">Loading archived session…</div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table history-table">
                  <thead>
                    <tr>
                      {[
                        "Market / Event",
                        "Time",
                        "Quantity",
                        "Price",
                        "PnL / Amount",
                        "Fee",
                        "Execution",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(page * 30, (page + 1) * 30).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>{r.market}</b>
                          <small>{r.type}</small>
                        </td>
                        <td>{timestamp(r.time)}</td>
                        <td>{r.quantity ? number(r.quantity, 5) : "—"}</td>
                        <td>{r.price ? price(r.price) : "—"}</td>
                        <td>{r.amount ? signed(r.amount, 4) : "—"}</td>
                        <td>{r.fee ? number(r.fee, 4) : "—"}</td>
                        <td>
                          <span className="tiny-badge">{r.execution}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <div className="empty-positions" style={{ minHeight: 250 }}>
                  <strong>
                    No{" "}
                    {tab === "fills"
                      ? "trade fills"
                      : tab === "orders"
                        ? "orders"
                        : "ledger entries"}{" "}
                    yet.
                  </strong>
                  <p>
                    Your trading activity will appear here. Archived sessions
                    remain available after a reset.
                  </p>
                </div>
              )}
            </>
          )}
          {rows.length > 30 && (
            <div className="pagination">
              <button
                className="button small"
                disabled={page === 0}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </button>
              <span>
                {page + 1} / {Math.ceil(rows.length / 30)}
              </span>
              <button
                className="button small"
                disabled={(page + 1) * 30 >= rows.length}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </button>
            </div>
          )}
          <p className="page-subtitle">
            Estimated executions include the reconstruction interval. Account
            adjustments are recorded explicitly in the ledger.
          </p>
        </>
      )}
    </div>
  );
}
