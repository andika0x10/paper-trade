import { maintain } from "@/lib/maintenance";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  try {
    await maintain();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Maintenance could not be completed." },
      { status: 503 },
    );
  }
}
