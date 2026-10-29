# Paper

A monochrome perpetual paper-trading terminal built with Next.js 16, React 19, Hyperliquid public data, and MySQL. The interface is inspired by exchange workflows; all balances and execution are virtual.

## Included

- Trading desk with live candles, order book, recent trades, market/limit orders, leverage, TP/SL, reduce-only, and partial close.
- Cross and isolated margin, one-way and hedge positions, fixed simulation fees, funding, and virtual liquidation.
- Native and builder-deployed perpetual discovery, searchable Markets, and authenticated watchlists.
- Portfolio, equity snapshots, fill/order/ledger history, CSV export, and preserved archived practice sessions.
- Username/password authentication with mandatory email verification and authenticated password changes. Password recovery is intentionally unavailable.
- Server-authoritative decimal calculations, versioned MySQL transactions, account locks, idempotency receipts, request rate limits, and resumable candle-based offline reconstruction.
- Responsive dark-only UI using IBM Plex Sans and TradingView Lightweight Charts attribution.

## Local setup

Requires Node.js 22+ and a MySQL 8 database. Use a TLS-enabled, externally accessible database for Vercel.

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local`:

TiDB Cloud connection URLs are supported directly: TLS 1.2 or later and certificate verification are enabled automatically for TiDB Cloud hosts, for both migrations and the app. You do not need to append an SSL parameter or download a CA certificate for TiDB Cloud Starter. Existing custom CA settings in the URL are preserved. Plain local MySQL connections are unchanged.

| Variable             | Purpose                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | MySQL connection URL; use the provider's TLS/SSL configuration. Never prefix it with `NEXT_PUBLIC_`. |
| `BETTER_AUTH_SECRET` | A random secret of at least 32 characters.                                                           |
| `BETTER_AUTH_URL`    | `http://localhost:3000` locally; exact HTTPS application origin in production.                       |
| `RESEND_API_KEY`     | Resend API key for verification emails.                                                              |
| `EMAIL_FROM`         | Sender on a domain verified in Resend.                                                               |
| `CRON_SECRET`        | A separate random secret for protected housekeeping.                                                 |

Generate each secret separately in your own terminal:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Apply the checked-in schema migration, then start the app:

```powershell
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Register, follow the verification link, and start trading with 10,000 virtual USDC. Email is required to verify an account; it cannot be used to log in or recover a password in this version.

Without environment configuration, public markets, charting, and browsing still work. Account access is disabled with a setup-state message. No fake account, fills, or local-browser balance is created.

### Verification email troubleshooting

`EMAIL_FROM` in `.env.example` is a placeholder. Replace it with an address on a domain verified in Resend, for example `Paper Trade <verify@your-actual-domain.com>`. A sending-only Resend API key is sufficient; ensure it is scoped to that sender domain. Restart `npm run dev` after changing environment values, and update the same variable in Vercel before redeploying.

The shared `onboarding@resend.dev` test sender can only send to the email address associated with the Resend account. Public registration requires your own verified sending domain. Do not use a Gmail address as the sender domain.

The server logs a safe explanation when Resend rejects a request; keys, recipients and verification tokens are not logged. Missing/example sender configuration blocks registration before creating an account. If the provider rejects an email after account creation, the account stays unverified and the UI offers resend rather than claiming delivery succeeded. Existing unverified accounts can request another email from **Log in → Need another verification email?** after the configuration is corrected. Do not register the same account again.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Browser checks use Microsoft Edge through Playwright. Install Edge on Windows, or remove `channel: "msedge"` from `playwright.config.ts` and run `npx playwright install chromium` on other platforms. The test harness starts a local development server if port 3000 is unused. Browser tests require network access to Hyperliquid and capture desktop/mobile screenshots under ignored `test-results/`.

The optional MySQL test uses a dedicated database whose name **must end in `_test`**. It applies the migrations and removes only its own test users. It never uses `DATABASE_URL` as a fallback:

```powershell
$env:TEST_DATABASE_URL = 'mysql://USER:PASSWORD@HOST:3306/paper_trade_test'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

Without that explicit variable the MySQL integration test is reported as skipped. A passing unit/browser suite does not verify production email delivery or MySQL connectivity.

## Vercel deployment

1. Import this repository into Vercel using the Next.js preset. Use a Node.js 22+ runtime.
2. Provision MySQL 8 near your Vercel region. Add the environment variables above to the appropriate environment; use the final production domain for `BETTER_AUTH_URL`.
3. Verify the sending domain in Resend. Set `EMAIL_FROM` to a sender on that domain.
4. Run `npm run db:migrate` against the intended database from a trusted terminal or a release job. Do not run migrations automatically during every preview build.
5. Deploy using the standard `npm run build` command. Production cron in `vercel.json` calls `/api/maintenance` daily at 04:00 UTC (11:00 WIB); Vercel sends the configured `CRON_SECRET` as a bearer token.
6. Verify registration, email verification, username login, one order, a returning offline session, history, reset, and logout against the production database before sharing the URL.

For preview deployments, use a separate database, auth secret, and exact preview origin. Real verification emails require a configured sender. Do not share production account cookies or connect untrusted previews to the production database.

Vercel Hobby is intended for personal/noncommercial use. This deployment targets small-scale public practice, without a continuous worker. Free-tier capacity depends on usage and is not guaranteed. MySQL, email, domains, and any later paid hosting are separate services.

## Simulation model

Maker fees are 0.02%, taker fees are 0.05%. Market orders sweep a freshly fetched public book; remaining market quantity is cancelled when depth is insufficient. Resting limits fill on a trade-through approximation. There is no queue simulation.

Offline positions are reconstructed when the user returns. The server uses the smallest available candle interval, processes a bounded batch, and saves an atomic checkpoint. Liquidation precedes SL, then TP for ambiguous intrabar events. Historical fill and risk results are marked as estimates. Missing candles, delisted markets, or incomplete risk metadata block trading until retry or reset.

The model cannot reproduce OKX or Hyperliquid execution exactly. Historical trade candles are a proxy for mark prices; current risk tiers are used for reconstruction. The interface's Simulation rules page explains these choices. Details and storage tradeoffs are documented in [docs/architecture.md](docs/architecture.md).

## Maintenance

Daily Vercel cron removes expired market caches, rate-limit buckets, sessions, and verification tokens. It does not execute orders. To run the same housekeeping manually:

```powershell
npm run db:maintain
```

Monitor Vercel invocations/CPU, MySQL connection count, reconstruction latency/errors, cache/receipt sizes, and email delivery failures. Application errors do not return database credentials or SQL driver messages to the browser. Practice history and idempotency receipts are retained; provision database backups before a public launch.

When changing the schema, run `npm run db:generate`, review the resulting SQL, and apply it through `npm run db:migrate`. esbuild is overridden only within Drizzle Kit's legacy loader dependency to avoid its old development-server vulnerability; Drizzle schema generation remains part of validation.
