"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "./workspace-provider";
export function AuthForm({ register = false }: { register?: boolean }) {
  const w = useWorkspace(),
    router = useRouter(),
    [username, setUsername] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [delivered, setDelivered] = useState(false),
    [resend, setResend] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (register) {
        const result = await authClient.signUp.email({
          username,
          name: username,
          email,
          password,
          callbackURL: "/",
        });
        if (
          result.error &&
          String(result.error.code) === "VERIFICATION_EMAIL_FAILED_AFTER_SIGNUP"
        ) {
          setSent(true);
          setDelivered(false);
          setPassword("");
          setMessage(
            result.error.message ??
              "The account was created, but email delivery failed. Retry verification below.",
          );
          return;
        }
        if (result.error)
          throw new Error(result.error.message ?? "Account creation failed.");
        setSent(true);
        setDelivered(true);
        setPassword("");
      } else {
        const result = await authClient.signIn.username({ username, password });
        if (result.error)
          throw new Error(result.error.message ?? "Sign-in failed.");
        await w.refreshSession();
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <h1>
          Build conviction.
          <br />
          Before committing.
        </h1>
        <p>
          A quiet space to practice in a market that never stops. Live
          perpetuals. Your strategy. Zero real capital at risk.
        </p>
        <div className="auth-capital">
          <span>Your starting capital</span>
          <strong>
            10,000{" "}
            <span className="muted" style={{ fontSize: 20 }}>
              USDC
            </span>
          </strong>
          <small>Virtual funds. Real market data from Hyperliquid.</small>
        </div>
      </aside>
      <section className="auth-form">
        {sent ? (
          <>
            <Mail size={28} strokeWidth={1} style={{ marginBottom: 22 }} />
            <h2>{delivered ? "Check your inbox" : "Account created"}</h2>
            <p>
              {delivered
                ? `Check ${email} for a verification link. Verify your email to activate your practice account.`
                : `Your account still needs email verification. We could not send the link to ${email}. Retry below after email delivery is restored.`}
            </p>
            <button
              className="button"
              disabled={busy || resend}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await authClient.sendVerificationEmail({
                    email,
                    callbackURL: "/",
                  });
                  if (result.error) throw new Error(result.error.message);
                  setResend(true);
                  setDelivered(true);
                  setMessage(
                    "Verification email sent. Check your spam folder too.",
                  );
                } catch {
                  setMessage("Unable to resend right now. Try again later.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {resend ? "Verification email sent" : "Resend verification email"}
            </button>
            <p className="auth-switch">
              <Link href="/login">Return to login</Link>
            </p>
          </>
        ) : (
          <>
            <h2>
              {register ? "Create your practice account" : "Welcome back"}
            </h2>
            <p>
              {register
                ? "A fresh start, with 10,000 USDC in virtual funds."
                : "Your next session starts here."}
            </p>
            {!w.configured && (
              <div className="form-message" role="status">
                Account access is being set up. You can explore live markets in
                the meantime.
              </div>
            )}
            <form onSubmit={submit}>
              <label className="field">
                Username
                <input
                  required
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_.]+"
                  title="Use letters, numbers, underscores, and periods."
                  placeholder="Your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              {register && (
                <label className="field">
                  Email address
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                Password
                <input
                  required
                  minLength={register ? 10 : 1}
                  maxLength={128}
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "At least 10 characters" : "Your password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                disabled={!w.configured || busy}
                className="button primary"
              >
                {busy ? "Please wait…" : register ? "Create account" : "Log in"}
                <ArrowUpRight size={15} />
              </button>
            </form>
            <p className="auth-switch">
              {register ? "Already have an account? " : "New to Paper? "}
              <Link href={register ? "/login" : "/register"}>
                {register ? "Log in" : "Create an account"}
              </Link>
            </p>
            <p className="auth-note">
              {register ? "Email is used only to verify your account. " : ""}
              Password recovery is not available in this version. Keep your
              password in a safe place. This is a simulation; no deposits or
              withdrawals.
            </p>
          </>
        )}
        {message && (
          <div className="form-message" role="alert">
            {message}
          </div>
        )}
        {!register && (
          <details className="auth-note">
            <summary>Need another verification email?</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const result = await authClient.sendVerificationEmail({
                    email,
                    callbackURL: "/",
                  });
                  if (result.error) throw new Error(result.error.message);
                  setMessage(
                    "If this address belongs to an unverified account, a verification email has been requested.",
                  );
                } catch {
                  setMessage(
                    "Unable to request verification. Try again later.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field" style={{ marginTop: 15 }}>
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="button" disabled={busy || !w.configured}>
                Send verification email
              </button>
            </form>
          </details>
        )}
      </section>
    </div>
  );
}
