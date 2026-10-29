import { getMarkets } from "@/lib/hyperliquid";
export const maxDuration = 60;
export async function GET() {
  try {
    return Response.json(
      { markets: await getMarkets(), time: Date.now() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Market data is unavailable. Retry shortly." },
      { status: 503 },
    );
  }
}
