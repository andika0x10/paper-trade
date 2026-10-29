# Simulation architecture

## Trust boundary

The browser subscribes to public Hyperliquid streams for display. It sends order intent, never balances, prices to execute at, fills, or liquidation decisions. The server independently reads market metadata, margin tiers, candles, funding, and order books.

MySQL is the source of truth. Authenticated users may only access aggregates selected by their session's user ID. All mutation requests require an exact trusted Origin, JSON, a UUID idempotency key, a verified account, and a database-backed request budget. There is no real exchange order endpoint or wallet signing code.

## Account storage and atomicity

`paper_account.state` is a typed JSON aggregate containing positions, orders, fills, the cash ledger, equity snapshots, market preferences, funding cursors, and a replay checkpoint. This deliberately trades relational reporting flexibility for an atomic portfolio boundary at small scale. It is bounded at approximately 3 MB; users can archive a session and start another. Archive records are immutable through the public API.

Network reads and reconstruction run against an account copy outside the database transaction. At commit, the server locks the owning user row, checks the idempotency receipt, locks the account, and compares its version. A changed version returns 409 with no partial changes. A successful transaction stores the whole aggregate and a compact receipt together. Two tabs cannot commit against the same version. Resets archive the old aggregate and create a new one under the same user lock.

Receipts store the command hash and outcome metadata, not repeated copies of the growing ledger. Retrying an accepted key returns the latest account without running the command again; reusing a key with different content returns 409. Receipts are retained so old keys cannot accidentally repeat a reset or order.

## Risk and accounting

All monetary engine operations use decimal.js with 40-digit precision. The cash ledger includes the initial virtual deposit, fees, realized PnL, funding, and explicit deficit-protection adjustments. Its sum must equal wallet balance.

Maintenance margin integrates the current tier schedule, using half the inverse of tier maximum leverage. Market leverage limits still apply when a tier permits higher leverage. Hedge legs have independent gross initial and maintenance requirements. No hedge discount is granted.

Cross available margin excludes isolated allocations, cross initial margin, and open-order reservations. Cross liquidation equity excludes isolated allocations, but not order reservations, since a reservation is not a realized loss. Isolated funding changes its allocated margin and wallet together. Cross deficits cannot consume remaining isolated allocations; isolated gap/funding deficits cannot consume the cross wallet. Both protections create ledger adjustments.

Liquidation is an application model: affected isolated legs or all cross legs close together. No real liquidation engine, queue priority, insurance fund, ADL, liquidation surcharge, or partial liquidation is reproduced. All contracts settle into one virtual USDC wallet, including builder venues that use another actual collateral asset.

## Reconstruction

The finest supported fixed interval covering the gap within a 4,500-bar safety window is selected. Each request processes at most 160 bars, across all affected markets on a shared timeline. Coin fetch concurrency is limited to four. Each successful batch commits a checkpoint; a failed batch commits nothing. An incomplete reconstruction blocks new trading, while reset remains available independently of market data.

Closed candle continuity and positive prices are checked before applying any batch. Funding is paginated and applied with separate per-market cursors. Each bar applies funding, stress-tests liquidation, evaluates stop loss before take profit, processes crossed limits, then stress-tests newly filled entries. Current, rather than historical, risk metadata is used.

Cross stress selects the worse of the candle's high/low risk headroom per market and combines those choices across the portfolio. This is a conservative hypothetical scenario, not an observed simultaneous portfolio price. Isolated hedge legs are independently stress-tested. If an order or position was created during a candle, that candle's close is used rather than extrema that may predate its creation. Intrabar timing, mark-price history, and queue position remain unknown.

Closed-candle checkpoints are retained while the current partial candle is reevaluated. Live book fills record their snapshot method. Candle-based fills record `estimated` and the interval. Funding records rate, time, and price reference. Empty or unavailable historical funding responses cannot prove complete exchange event history; results remain simulation estimates.

## Hosting and operations

Vercel serves the application and short API requests; there is no always-running matching worker. Open tabs synchronize every 12 seconds and resume on visibility. Offline batches resume on later requests. Native and builder market metadata is cached for 30 seconds. Public API responses use short CDN caching; account responses are private/no-store.

The MySQL pool allows three connections per server instance. Configure the database near the Vercel region and enable TLS using the provider's mysql2-compatible connection URL. Use a database connection proxy if deployment concurrency exceeds the database's connection allowance.

A protected daily cron removes expired cache rows, rate-limit buckets, sessions, and verification tokens. It never deletes trading history or receipts. The Hobby schedule is housekeeping only; it is not responsible for order execution. Monitor invocation count, CPU, DB connection count, cache table size, receipt growth, request latency, and reconstruction failures before expanding public access.

## Supported boundaries

- 40 position legs and 80 pending orders per practice session.
- Charts: candles, volume, crosshair, selectable timeframe, entry/TP/SL lines.
- Username/password registration, mandatory email verification, session cookies, password changes, sign-out; no password recovery or email-based sign-in.
- No real-money activity, social leaderboard, copy trading, advanced indicators, drawings, or historical tick archive.
