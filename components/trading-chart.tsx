"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Maximize2, RefreshCw } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { price } from "@/lib/format";
import type { Candle } from "@/lib/trading/types";

export function TradingChart() {
  const { selected, account, market } = useWorkspace();
  const precision = Math.max(2, Math.min(8, 6 - (market?.szDecimals ?? 0)));
  const [interval, setIntervalValue] = useState("15m"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [latest, setLatest] = useState<Candle>();
  const container = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLDivElement>(null),
    chartRef = useRef<IChartApi | null>(null),
    seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#858585",
        fontFamily: '"IBM Plex Sans", sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#101010" },
        horzLines: { color: "#181818" },
      },
      rightPriceScale: {
        borderColor: "#242424",
        scaleMargins: { top: 0.12, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "#242424",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 7,
        barSpacing: 7,
      },
      crosshair: {
        vertLine: { color: "#606060", labelBackgroundColor: "#363636" },
        horzLine: { color: "#606060", labelBackgroundColor: "#363636" },
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
      upColor: "#e8e8e8",
      downColor: "#242424",
      wickUpColor: "#bcbcbc",
      wickDownColor: "#808080",
      borderUpColor: "#e8e8e8",
      borderDownColor: "#929292",
      priceLineColor: "#a3a3a3",
      priceLineStyle: LineStyle.Dashed,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    chartRef.current = chart;
    seriesRef.current = candles;
    let alive = true,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>,
      lastTime = 0;
    setError("");
    setLoading(true);
    setLatest(undefined);
    const update = (c: Candle) => {
      const t = Math.floor(c.t / 1000) as UTCTimestamp;
      if (t < lastTime || !alive) return;
      lastTime = t;
      candles.update({
        time: t,
        open: +c.o,
        high: +c.h,
        low: +c.l,
        close: +c.c,
      });
      volume.update({
        time: t,
        value: +c.v,
        color: +c.c >= +c.o ? "#444444" : "#202020",
      });
      setLatest(c);
    };
    const connect = () => {
      if (!alive) return;
      socket = new WebSocket("wss://api.hyperliquid.xyz/ws");
      socket.onopen = () =>
        socket?.send(
          JSON.stringify({
            method: "subscribe",
            subscription: { type: "candle", coin: selected, interval },
          }),
        );
      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.channel === "candle") {
            const data = Array.isArray(message.data)
              ? message.data
              : [message.data];
            for (const c of data) update(c);
          }
        } catch {
          /* Invalid messages never modify chart history. */
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        // Reload historical candles on reconnect so missing bars are backfilled.
        if (alive) retry = setTimeout(() => setReload((n) => n + 1), 3000);
      };
    };
    fetch(
      `/api/candles?coin=${encodeURIComponent(selected)}&interval=${interval}`,
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!alive) return;
        const data = [
          ...new Map(
            (result.candles as Candle[]).map((c) => [c.t, c]),
          ).values(),
        ].sort((a, b) => a.t - b.t);
        if (!data.length)
          throw new Error("No candle history is available for this market.");
        for (const c of data) update(c);
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, data.length - 90),
          to: data.length + 6,
        });
        connect();
      })
      .catch((error) => {
        if (alive) setError(error.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const ping = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ method: "ping" }));
    }, 25_000);
    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [selected, interval, reload, precision]);
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const lines =
      account?.state.positions
        .filter((p) => p.coin === selected)
        .flatMap((p) => [
          series.createPriceLine({
            price: +p.entry,
            color: "#d0d0d0",
            lineStyle: LineStyle.Dotted,
            lineWidth: 1,
            axisLabelVisible: true,
            title: `${p.side} entry`,
          }),
          ...(p.tp
            ? [
                series.createPriceLine({
                  price: +p.tp,
                  color: "#aaaaaa",
                  lineStyle: LineStyle.Dashed,
                  lineWidth: 1,
                  axisLabelVisible: true,
                  title: "TP",
                }),
              ]
            : []),
          ...(p.sl
            ? [
                series.createPriceLine({
                  price: +p.sl,
                  color: "#777777",
                  lineStyle: LineStyle.Dashed,
                  lineWidth: 1,
                  axisLabelVisible: true,
                  title: "SL",
                }),
              ]
            : []),
        ]) ?? [];
    return () => {
      for (const line of lines) {
        try {
          series.removePriceLine(line);
        } catch {
          /* Chart was replaced. */
        }
      }
    };
  }, [account?.state.positions, selected, interval, reload, loading]);
  return (
    <section
      className="chart-panel"
      ref={frame}
      aria-label={`${selected} price chart`}
    >
      <div className="chart-toolbar">
        <div className="timeframes">
          {["1m", "5m", "15m", "1h", "4h", "1d", "1w"].map((value) => (
            <button
              key={value}
              onClick={() => setIntervalValue(value)}
              className={value === interval ? "selected" : ""}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="chart-tools">
          <span>Candles</span>
          <button
            className="icon-button"
            onClick={() => frame.current?.requestFullscreen?.()}
            aria-label="Expand chart"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="chart-caption">
        <span>
          {selected.split(":").at(-1)} · {interval} · Hyperliquid
        </span>
        {latest && (
          <span className="ohlc">
            <span>
              O <b>{price(latest.o)}</b>
            </span>
            <span>
              H <b>{price(latest.h)}</b>
            </span>
            <span>
              L <b>{price(latest.l)}</b>
            </span>
            <span>
              C <b>{price(latest.c)}</b>
            </span>
          </span>
        )}
      </div>
      <div className="chart-canvas" ref={container} />
      {(loading || error) && (
        <div className="chart-overlay">
          <span>{error || "Loading market history…"}</span>
          {error && (
            <button className="button" onClick={() => setReload((n) => n + 1)}>
              <RefreshCw size={13} />
              Retry chart
            </button>
          )}
        </div>
      )}
      <div className="chart-note">
        Volume · {selected.split(":").at(-1)}
        <span>Market data by Hyperliquid</span>
      </div>
    </section>
  );
}
