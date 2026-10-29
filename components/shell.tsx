"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "./workspace-provider";
import { authClient } from "@/lib/auth-client";
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    w = useWorkspace();
  const [menu, setMenu] = useState(false);
  return (
    <>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="Paper Trade home">
          <span className="brand-mark">
            <i />
            <i />
          </span>
          paper<span className="wordmark-dot">.</span>
        </Link>
        <nav
          className={menu ? "main-nav open" : "main-nav"}
          aria-label="Main navigation"
        >
          {[
            ["/", "Trade"],
            ["/markets", "Markets"],
            ["/portfolio", "Portfolio"],
            ["/history", "History"],
          ].map(([href, title]) => (
            <Link
              onClick={() => setMenu(false)}
              className={path === href ? "active" : ""}
              href={href}
              key={href}
            >
              {title}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <span className="practice-badge">
            <span />
            Paper trading
          </span>
          {w.user ? (
            <>
              <Link href="/settings" className="user-link">
                {w.user.username ?? w.user.name}
                <ChevronDown size={13} />
              </Link>
              <button
                className="icon-button logout"
                title="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  await w.refreshSession();
                }}
              >
                <LogOut size={15} />
                <span className="sr-only">Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link className="login-link" href="/login">
                Log in
              </Link>
              <Link href="/register" className="button small primary">
                Create account
                <ArrowUpRight size={14} />
              </Link>
            </>
          )}
          <button
            className="icon-button menu-toggle"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <span className="footer-left">
          <span
            className={`status-dot ${w.feed === "live" ? "connected" : ""}`}
          />
          {w.feed === "live"
            ? "Hyperliquid connected"
            : w.feed === "connecting"
              ? "Connecting to Hyperliquid"
              : "Market feed reconnecting"}
        </span>
        <span>Real markets. Virtual capital.</span>
        <Link href="/settings#simulation">
          <CircleHelp size={13} />
          Simulation rules
        </Link>
        <span className="footer-copyright">© Paper</span>
      </footer>
    </>
  );
}
