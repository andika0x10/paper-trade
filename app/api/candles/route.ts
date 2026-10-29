import { getCandles, duration, INTERVALS } from "@/lib/hyperliquid";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    coin = params.get("coin") ?? "BTC",
    interval = params.get("interval") ?? "15m";
  if (
    coin.length > 80 ||
    !/^[A-Za-z0-9_:.@/-]+$/.test(coin) ||
    !INTERVALS.includes(interval as (typeof INTERVALS)[number])
  )
    return Response.json(
      { error: "Invalid market or timeframe." },
      { status: 400 },
    );
  try {
    const now = Math.floor(Date.now() / 10_000) * 10_000;
    return Response.json(
      {
        candles: await getCandles(
          coin,
          interval,
          now - duration[interval] * 400,
          now,
        ),
      },
      { headers: { "Cache-Control": "public, s-maxage=10" } },
    );
  } catch {
    return Response.json(
      { error: "Candle history is unavailable. Try again." },
      { status: 503 },
    );
  }
}
