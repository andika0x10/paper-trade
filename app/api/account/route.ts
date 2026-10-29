import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paperAccount } from "@/lib/db/schema";
import { identity, errorResponse } from "@/lib/api";
import { accountView, ServiceError } from "@/lib/trading/service";
import { summary } from "@/lib/trading/engine";
export async function GET(request: Request) {
  try {
    const user = await identity(request);
    const archive = new URL(request.url).searchParams.get("archive");
    if (archive) {
      const [row] = await db()
        .select()
        .from(paperAccount)
        .where(
          and(
            eq(paperAccount.userId, user.id),
            eq(paperAccount.id, archive),
            eq(paperAccount.archived, true),
          ),
        );
      if (!row) throw new ServiceError("Archived session not found.", 404);
      return Response.json(
        { state: row.state, summary: summary(row.state), archived: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(await accountView(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
