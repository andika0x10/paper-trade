import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/db/schema";
import { checkOrigin, errorResponse, identity } from "@/lib/api";
import { execute, ServiceError } from "@/lib/trading/service";
export const maxDuration = 60;
const amount = z
  .string()
  .max(40)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Enter a positive decimal amount.")
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 1e15,
    "Amount is outside the supported range.",
  );
const coin = z.string().min(1).max(80);
const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("order"),
    order: z.object({
      coin,
      side: z.enum(["long", "short"]),
      type: z.enum(["market", "limit"]),
      quantity: amount,
      leverage: z.number().int().min(1).max(1000),
      marginMode: z.enum(["cross", "isolated"]),
      reduceOnly: z.boolean(),
      price: amount.optional(),
      tp: amount.optional(),
      sl: amount.optional(),
    }),
  }),
  z.object({
    action: z.literal("close"),
    positionId: z.uuid(),
    quantity: amount,
  }),
  z.object({ action: z.literal("cancel"), orderId: z.uuid() }),
  z.object({
    action: z.literal("configure"),
    coin,
    margin: z.enum(["cross", "isolated"]),
    position: z.enum(["one-way", "hedge"]),
  }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("reconcile") }),
  z.object({
    action: z.literal("watchlist"),
    coins: z
      .array(coin)
      .max(100)
      .transform((v) => [...new Set(v)]),
  }),
]);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await identity(request);
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    const text = await request.text();
    if (text.length > 16_000)
      throw new ServiceError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ServiceError("Invalid JSON request.");
    }
    const command = commandSchema.parse(body);
    const throttled = await db().transaction(async (tx) => {
      const bucket = `trade:${user.id}:${Math.floor(Date.now() / 60_000)}`;
      await tx
        .insert(rateLimit)
        .values({
          id: crypto.randomUUID(),
          key: bucket,
          count: 0,
          lastRequest: Date.now(),
        })
        .onDuplicateKeyUpdate({ set: { key: bucket } });
      const [row] = await tx
        .select()
        .from(rateLimit)
        .where(eq(rateLimit.key, bucket))
        .for("update");
      if (row.count >= 60) return true;
      await tx
        .update(rateLimit)
        .set({ count: row.count + 1 })
        .where(and(eq(rateLimit.id, row.id), eq(rateLimit.key, bucket)));
      return false;
    });
    if (throttled)
      throw new ServiceError(
        "Too many requests. Wait a minute and retry.",
        429,
      );
    return Response.json(await execute(user.id, key, command), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
