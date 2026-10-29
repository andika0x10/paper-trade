import { lt } from "drizzle-orm";
import { db } from "./db";
import { marketCache, rateLimit, session, verification } from "./db/schema";
export async function maintain() {
  const now = Date.now();
  await db().delete(marketCache).where(lt(marketCache.expiresAt, now));
  await db()
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, now - 86400_000));
  await db()
    .delete(session)
    .where(lt(session.expiresAt, new Date(now)));
  await db()
    .delete(verification)
    .where(lt(verification.expiresAt, new Date(now)));
}
