"use client";
import Link from "next/link";
import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "./workspace-provider";
import { Dialog } from "./dialog";
export function Settings() {
  const w = useWorkspace(),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false),
    [confirmation, setConfirmation] = useState("");
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Your account, your practice, your rules of engagement.</p>
        </div>
        {w.user && (
          <button
            className="button small"
            onClick={async () => {
              await authClient.signOut();
              await w.refreshSession();
            }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        )}
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#profile">Profile</a>
          <a href="#security">Security</a>
          <a href="#practice">Practice account</a>
          <a href="#simulation">Simulation rules</a>
        </nav>
        <div>
          <section className="settings-section" id="profile">
            <h2>Profile</h2>
            <p>
              Your practice account is private. Each user has a separate
              balance, positions, and trading history.
            </p>
            {w.user ? (
              <>
                <div className="detail-row">
                  <span>Username</span>
                  <b>{w.user.username ?? w.user.name}</b>
                </div>
                <div className="detail-row">
                  <span>Email</span>
                  <b>{w.user.email}</b>
                </div>
                <div className="detail-row">
                  <span>Email status</span>
                  <b>
                    {w.user.emailVerified
                      ? "Verified"
                      : "Verification required"}
                  </b>
                </div>
              </>
            ) : (
              <Link className="button small" href="/login">
                Log in to manage your account
              </Link>
            )}
          </section>
          <section className="settings-section" id="security">
            <h2>Security</h2>
            <p>
              Use a unique password with at least 10 characters. Password
              recovery is not available in this version; you can change it while
              signed in.
            </p>
            {w.user && (
              <form
                className="settings-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const result = await authClient.changePassword({
                      currentPassword: current,
                      newPassword: password,
                      revokeOtherSessions: true,
                    });
                    if (result.error) throw new Error(result.error.message);
                    setCurrent("");
                    setPassword("");
                    w.notice(
                      "Password changed. Other sessions have been signed out.",
                    );
                  } catch (error) {
                    w.notice(
                      error instanceof Error
                        ? error.message
                        : "Password could not be changed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  Current password
                  <input
                    required
                    autoComplete="current-password"
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </label>
                <label className="field">
                  New password
                  <input
                    required
                    autoComplete="new-password"
                    type="password"
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy}>
                  {busy ? "Changing password…" : "Change password"}
                </button>
              </form>
            )}
          </section>
          <section className="settings-section" id="practice">
            <h2>Practice account</h2>
            <p>
              Every session starts with 10,000 USDC in virtual funds. Resetting
              archives the entire current session and starts a new one. Previous
              sessions remain available in History.
            </p>
            <div className="detail-row">
              <span>Starting capital</span>
              <b>10,000.00 USDC</b>
            </div>
            <div className="detail-row">
              <span>Theme</span>
              <b>Dark · monochrome</b>
            </div>
            <div className="detail-row">
              <span>Interface language</span>
              <b>English</b>
            </div>
            <button
              className="button"
              style={{ marginTop: 20 }}
              disabled={!w.user || w.busy}
              onClick={() => {
                setReset(true);
                setConfirmation("");
              }}
            >
              Reset practice account
            </button>
          </section>
          <section className="settings-section" id="simulation">
            <h2>Simulation rules</h2>
            <p>
              Paper is a virtual trading environment inspired by exchange
              workflows. Market data comes from Hyperliquid. Execution and
              account calculations follow the rules below.
            </p>
            <ul className="rules-list">
              <li>
                <b>Virtual capital.</b> All balances use virtual USDC. No
                wallet, deposits, withdrawals, or real orders are involved.
                Builder-deployed contracts are normalized into the same virtual
                balance.
              </li>
              <li>
                <b>Trading fees.</b> Maker: 0.02%. Taker: 0.05%. These are fixed
                simulation fees, independent of any exchange fee schedule. A
                limit order crossing the book pays taker fees.
              </li>
              <li>
                <b>Market execution.</b> Orders sweep a current public
                order-book snapshot. Insufficient depth results in a partial
                fill; the unfilled market quantity is cancelled. Public
                snapshots cannot reproduce exchange queue position or latency.
              </li>
              <li>
                <b>Limit execution.</b> Resting orders fill when the observed
                price trades through the limit, at the limit price. Historical
                queue and partial fills are not reconstructed. A resting order
                can be cancelled if margin is insufficient at execution.
              </li>
              <li>
                <b>Margin and hedge.</b> Cross and isolated use instrument
                leverage and maintenance tiers from Hyperliquid. Hedge legs
                reserve margin independently, with no hedge margin discount.
                Cross equity excludes allocated isolated margin and includes
                cross unrealized PnL. Pending orders reserve initial margin and
                fees.
              </li>
              <li>
                <b>Liquidation.</b> The simulator closes the affected isolated
                position, or all cross positions when cross maintenance is
                breached. Gap losses beyond allocated isolated margin and
                negative virtual wallets receive explicit ledger adjustments.
                Partial liquidation, insurance funds, and ADL are not simulated.
              </li>
              <li>
                <b>Offline reconstruction.</b> Orders remain virtual while you
                are away. On return, the server processes historical candles in
                batches, using the smallest available interval. This estimates
                what might have happened; it does not reproduce exchange
                execution.
              </li>
              <li>
                <b>Conservative replay.</b> Each replay bar evaluates
                liquidation before stop loss, then take profit. When both TP and
                SL are touched in one candle, SL wins. Cross positions use a
                synchronized adverse-price scenario; this can overstate intrabar
                risk. Limit entries are estimated because intrabar sequence is
                unknown.
              </li>
              <li>
                <b>Price references.</b> Live risk checks use mark prices.
                Historical reconstruction uses trade candles as a proxy, which
                can produce different liquidation outcomes. Funding uses
                historical Hyperliquid rates and a stored candle price
                reference.
              </li>
              <li>
                <b>Missing data.</b> New trading is blocked when history,
                prices, or risk metadata are incomplete. Retry synchronization
                or reset the practice session. Unavailable and delisted markets
                are shown with a reason.
              </li>
              <li>
                <b>Session limits.</b> Up to 40 position legs, 80 open orders,
                and approximately 3 MB of history per practice session. Reset to
                archive a full session and continue.
              </li>
              <li>
                <b>Synchronization.</b> Account state updates while you are
                active and on return. It is not a continuously running exchange.
                Every fill records its execution method; reconstructed fills
                include the candle interval.
              </li>
            </ul>
            <p style={{ marginTop: 30 }}>
              Charts use{" "}
              <a
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "underline" }}
              >
                TradingView Lightweight Charts
              </a>
              . See{" "}
              <a href="/attribution" style={{ textDecoration: "underline" }}>
                third-party attribution
              </a>
              .
            </p>
          </section>
        </div>
      </div>
      {reset && (
        <Dialog labelledBy="reset-title" onClose={() => setReset(false)}>
          <div className="modal-heading">
            <h2 id="reset-title">Start a new practice session?</h2>
            <button
              aria-label="Cancel reset"
              className="icon-button"
              onClick={() => setReset(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="muted">
            Your positions and pending orders will be archived with this
            session. The new session starts with 10,000 USDC. You can still view
            the old history.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                confirmation === "RESET" &&
                (await w.command({ action: "reset" }))
              )
                setReset(false);
            }}
          >
            <label className="field">
              Type RESET to confirm
              <input
                autoFocus
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="button primary"
              disabled={confirmation !== "RESET" || w.busy}
            >
              {w.busy ? "Starting session…" : "Reset practice account"}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
