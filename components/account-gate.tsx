"use client";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
export function AccountGate({
  title = "Your practice account, in perspective.",
}: {
  title?: string;
}) {
  const w = useWorkspace();
  if (w.user)
    return (
      <div className="loading-panel">
        <p>{w.accountError || "Loading your practice account…"}</p>
        <button
          className="button"
          style={{ marginTop: 18 }}
          onClick={() => void w.refreshAccount()}
        >
          Retry account
        </button>
      </div>
    );
  return (
    <div className="empty-page">
      <Wallet size={30} strokeWidth={1} />
      <h2>{title}</h2>
      <p>
        Start with 10,000 USDC in virtual funds. Track every trade, measure your
        progress, and refine your approach.
      </p>
      <Link className="button primary" href="/login">
        Log in to your account
        <ArrowUpRight size={14} />
      </Link>
      <Link className="quiet-link" href="/">
        Explore the trading desk
        <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}
