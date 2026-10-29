"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authClient } from "@/lib/auth-client";
import type { Market, TradingState } from "@/lib/trading/types";
import type { Command } from "@/lib/trading/service";

export type AccountView = {
  state: TradingState;
  summary: {
    balance: string;
    equity: string;
    unrealized: string;
    margin: string;
    reserved: string;
    available: string;
  };
  version: number;
  watchlist?: string[];
  archives?: { id: string; createdAt: string }[];
  pending?: boolean;
};
export type Book = {
  time: number;
  levels: { px: string; sz: string; n: number }[][];
};
export type Tape = {
  time: number;
  side: string;
  px: string;
  sz: string;
  hash: string;
};
type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username?: string | null;
};
type Workspace = {
  configured: boolean;
  user: User | null;
  markets: Market[];
  market?: Market;
  selected: string;
  select: (coin: string) => void;
  marketError: string;
  reloadMarkets: () => Promise<void>;
  book?: Book;
  tape: Tape[];
  feed: "connecting" | "live" | "stale";
  account?: AccountView;
  accountError: string;
  busy: boolean;
  syncing: boolean;
  command: (c: Command) => Promise<boolean>;
  refreshAccount: () => Promise<void>;
  refreshSession: () => Promise<void>;
  notice: (message: string) => void;
  watchlist: string[];
  toggleWatchlist: (coin: string) => void;
};
const Context = createContext<Workspace | null>(null);
export const useWorkspace = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing.");
  return value;
};

export function WorkspaceProvider({
  configured,
  children,
}: {
  configured: boolean;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null),
    [markets, setMarkets] = useState<Market[]>([]),
    [selected, setSelected] = useState("BTC");
  const [marketError, setMarketError] = useState(""),
    [book, setBook] = useState<Book>(),
    [tape, setTape] = useState<Tape[]>([]),
    [feed, setFeed] = useState<Workspace["feed"]>("connecting");
  const [account, setAccount] = useState<AccountView>(),
    [accountError, setAccountError] = useState(""),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(""),
    [watchlist, setWatchlist] = useState<string[]>([]);
  const lock = useRef(false),
    sessionEpoch = useRef(0),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notice = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);
  const select = useCallback((coin: string) => {
    setSelected(coin);
    sessionStorage.setItem("paper:market", coin);
  }, []);
  const refreshSession = useCallback(async () => {
    if (!configured) return;
    sessionEpoch.current++;
    try {
      const result = await authClient.getSession();
      setUser(result.data?.user ?? null);
      setAccount(undefined);
      setWatchlist([]);
      setAccountError("");
    } catch {
      setUser(null);
      setAccount(undefined);
      setWatchlist([]);
    }
  }, [configured]);
  const reloadMarkets = useCallback(async () => {
    try {
      const response = await fetch("/api/markets"),
        result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMarkets(result.markets);
      setMarketError("");
    } catch {
      setMarketError(
        "Market data is unavailable. Check your connection and retry.",
      );
    }
  }, []);
  const refreshAccount = useCallback(async () => {
    if (!user) return;
    const epoch = sessionEpoch.current;
    try {
      const response = await fetch("/api/account"),
        result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionEpoch.current !== epoch) return;
      setAccount(result);
      setWatchlist(result.watchlist ?? []);
      setAccountError("");
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Account unavailable.",
      );
    }
  }, [user]);
  const command = useCallback(
    async (c: Command) => {
      if (!user) {
        notice("Sign in to start your practice session.");
        return false;
      }
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      const epoch = sessionEpoch.current;
      if (c.action === "reconcile") setSyncing(true);
      const key = crypto.randomUUID();
      try {
        let result: AccountView | undefined;
        for (let retry = 0; retry < 2; retry++) {
          try {
            const response = await fetch("/api/trade", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": key,
              },
              body: JSON.stringify(c),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Request failed.");
            result = data;
            break;
          } catch (error) {
            if (retry || !(error instanceof TypeError)) throw error;
          }
        }
        if (sessionEpoch.current !== epoch) return false;
        if (result) {
          setAccount((previous) => ({ ...previous, ...result! }));
          setAccountError("");
        }
        if (c.action === "watchlist") setWatchlist(c.coins);
        if (c.action === "reset") {
          await refreshAccount();
          notice("New practice session started with 10,000 USDC.");
        } else if (c.action === "order")
          notice(
            "Order submitted. Check positions and open orders for the result.",
          );
        else if (c.action === "close")
          notice("Close order processed. Check the remaining position.");
        else if (c.action === "cancel") notice("Order cancelled.");
        else if (c.action === "configure") notice("Trading modes updated.");
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Request failed. Please retry.";
        setAccountError(message);
        if (c.action !== "reconcile") notice(message);
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
        setSyncing(false);
      }
    },
    [user, notice, refreshAccount],
  );
  function toggleWatchlist(coin: string) {
    if (!user) {
      notice("Sign in to save your watchlist.");
      return;
    }
    void command({
      action: "watchlist",
      coins: watchlist.includes(coin)
        ? watchlist.filter((c) => c !== coin)
        : [...watchlist, coin],
    });
  }
  useEffect(() => {
    const restore = setTimeout(() => {
      const saved = sessionStorage.getItem("paper:market");
      if (saved) setSelected(saved);
      void refreshSession();
      void reloadMarkets();
    }, 0);
    const timer = setInterval(() => {
      if (!document.hidden) void reloadMarkets();
    }, 30_000);
    return () => {
      clearTimeout(restore);
      clearInterval(timer);
      clearTimeout(toastTimer.current);
    };
  }, [refreshSession, reloadMarkets]);
  useEffect(() => {
    const timer = setTimeout(() => void refreshAccount(), 0);
    return () => clearTimeout(timer);
  }, [refreshAccount]);
  useEffect(() => {
    if (!user) return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (!document.hidden && !lock.current)
        await command({ action: "reconcile" });
      if (alive) timer = setTimeout(run, 12_000);
    };
    timer = setTimeout(run, 500);
    const visible = () => {
      if (!document.hidden && !lock.current) {
        clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user, command]);
  useEffect(() => {
    let socket: WebSocket | undefined,
      retryTimer: ReturnType<typeof setTimeout>,
      stopped = false,
      retries = 0,
      last = 0;
    const reset = setTimeout(() => {
      setBook(undefined);
      setTape([]);
      setFeed("connecting");
    }, 0);
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket("wss://api.hyperliquid.xyz/ws");
      socket.onopen = () => {
        retries = 0;
        for (const subscription of [
          { type: "l2Book", coin: selected },
          { type: "trades", coin: selected },
        ])
          socket?.send(JSON.stringify({ method: "subscribe", subscription }));
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.channel === "l2Book" && message.data.coin === selected) {
            setBook(message.data);
            last = Date.now();
            setFeed(Date.now() - message.data.time < 15_000 ? "live" : "stale");
          }
          if (message.channel === "trades")
            setTape((prev) =>
              [
                ...message.data.filter(
                  (t: Tape & { coin: string }) => t.coin === selected,
                ),
                ...prev,
              ]
                .sort((a, b) => b.time - a.time)
                .slice(0, 40),
            );
        } catch {
          /* Ignore malformed feed messages; stale watchdog prevents trading. */
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        setFeed("stale");
        if (!stopped)
          retryTimer = setTimeout(
            connect,
            Math.min(30_000, 1000 * 2 ** retries++),
          );
      };
    };
    connect();
    const heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ method: "ping" }));
      if (Date.now() - last > 15_000) setFeed("stale");
      if (
        socket?.readyState === WebSocket.OPEN &&
        last &&
        Date.now() - last > 40_000
      )
        socket.close();
    }, 10_000);
    return () => {
      stopped = true;
      clearTimeout(reset);
      clearInterval(heartbeat);
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [selected]);
  return (
    <Context.Provider
      value={{
        configured,
        user,
        markets,
        market: markets.find((m) => m.coin === selected),
        selected,
        select,
        marketError,
        reloadMarkets,
        book,
        tape,
        feed,
        account,
        accountError,
        busy,
        syncing,
        command,
        refreshAccount,
        refreshSession,
        notice,
        watchlist,
        toggleWatchlist,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
