"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUpRight, Search, Star } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { compact, price, signed } from "@/lib/format";
export function Markets() {
  const w = useWorkspace(),
    router = useRouter(),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("all"),
    [sort, setSort] = useState<"volume" | "change">("volume"),
    [limit, setLimit] = useState(50);
  const data = w.markets
    .filter(
      (m) =>
        (!query || m.coin.toLowerCase().includes(query.toLowerCase())) &&
        (tab === "watchlist"
          ? w.watchlist.includes(m.coin)
          : tab === "native"
            ? !m.dex
            : true),
    )
    .sort((a, b) =>
      sort === "volume"
        ? +b.volume - +a.volume
        : +b.mark / +b.previous - 1 - (+a.mark / +a.previous - 1),
    );
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Markets</h1>
          <p>Find your next setup. Every perpetual, one place.</p>
        </div>
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search markets"
            placeholder="Search markets"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
          />
        </label>
      </div>
      <div className="section-toolbar">
        <div className="segmented">
          {[
            ["all", "All perpetuals"],
            ["native", "Native"],
            ["watchlist", "Watchlist"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "selected" : ""}
              onClick={() => {
                setTab(key);
                setLimit(50);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">{data.length} markets</span>
      </div>
      {w.marketError && (
        <div className="inline-alert">
          {w.marketError}
          <button onClick={() => void w.reloadMarkets()}>Retry</button>
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table market-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Price</th>
              <th>
                <button onClick={() => setSort("change")}>
                  24h change {sort === "change" && "↓"}
                </button>
              </th>
              <th>
                <button onClick={() => setSort("volume")}>
                  24h volume{" "}
                  {sort === "volume" && (
                    <ArrowDown size={10} style={{ display: "inline" }} />
                  )}
                </button>
              </th>
              <th>Funding / 1h</th>
              <th>Max leverage</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.slice(0, limit).map((m) => (
              <tr key={m.coin}>
                <td>
                  <div className="market-name">
                    <button
                      className="symbol-icon"
                      aria-label={`${w.watchlist.includes(m.coin) ? "Unwatch" : "Watch"} ${m.coin}`}
                      onClick={() => w.toggleWatchlist(m.coin)}
                    >
                      <Star
                        size={14}
                        fill={
                          w.watchlist.includes(m.coin) ? "currentColor" : "none"
                        }
                      />
                    </button>
                    <span className="coin-avatar">
                      {m.name === "BTC" ? "₿" : m.name.slice(0, 1)}
                    </span>
                    <div>
                      <div className="coin-title">{m.coin}</div>
                      <div className="coin-detail">
                        {m.disabled ?? `${m.dex || "Native"} perpetual`}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{price(m.mark)}</td>
                <td>
                  {+m.previous
                    ? `${signed((+m.mark / +m.previous - 1) * 100)}%`
                    : "—"}
                </td>
                <td>${compact(m.volume)}</td>
                <td>{signed(+m.funding * 100, 4)}%</td>
                <td>{m.maxLeverage}×</td>
                <td>
                  <button
                    className="button small"
                    disabled={Boolean(m.disabled)}
                    onClick={() => {
                      w.select(m.coin);
                      router.push("/");
                    }}
                  >
                    Trade
                    <ArrowUpRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.length && (
        <div className="empty-page">
          <Search size={25} />
          <h2>
            {tab === "watchlist"
              ? "Keep your markets close"
              : w.markets.length
                ? "No matching markets"
                : "Loading markets"}
          </h2>
          <p>
            {tab === "watchlist"
              ? "Select the star beside a market to add it to your watchlist."
              : w.markets.length
                ? "Try a different symbol or clear your search."
                : "Fetching the native and builder-deployed perpetual catalog from Hyperliquid."}
          </p>
        </div>
      )}
      {data.length > limit && (
        <div className="pagination">
          <span>
            Showing {limit} of {data.length}
          </span>
          <button className="button small" onClick={() => setLimit(limit + 50)}>
            Show more markets
          </button>
        </div>
      )}
      <p className="page-subtitle">
        Prices refresh every 30 seconds. Unavailable markets remain visible with
        an explanation.
      </p>
    </div>
  );
}
