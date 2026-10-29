import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "../lib/db";
import { paperAccount, receipt, user, watchlist } from "../lib/db/schema";
import { accountView, execute, getAccount } from "../lib/trading/service";

test(
  "MySQL: concurrent initialization, idempotency, reset archives and user isolation",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      url.pathname.endsWith("_test"),
      "TEST_DATABASE_URL must point to a dedicated database ending in _test.",
    );
    process.env.DATABASE_URL = url.toString();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    try {
      await migrate(db(), { migrationsFolder: "./drizzle" });
      for (const id of ids)
        await db()
          .insert(user)
          .values({
            id,
            name: "Integration test",
            email: `${id}@example.test`,
            emailVerified: true,
          });
      const accounts = await Promise.all(
        Array.from({ length: 5 }, () => getAccount(ids[0])),
      );
      assert.equal(new Set(accounts.map((a) => a.id)).size, 1);
      const other = await getAccount(ids[1]);
      assert.notEqual(other.id, accounts[0].id);
      const key = crypto.randomUUID();
      await Promise.all([
        execute(ids[0], key, { action: "watchlist", coins: ["BTC"] }),
        execute(ids[0], key, { action: "watchlist", coins: ["BTC"] }),
      ]);
      const receipts = await db()
        .select()
        .from(receipt)
        .where(eq(receipt.userId, ids[0]));
      assert.equal(receipts.length, 1);
      await assert.rejects(
        execute(ids[0], key, { action: "watchlist", coins: ["ETH"] }),
        /already used/,
      );
      assert.deepEqual((await accountView(ids[1])).watchlist, []);
      assert.deepEqual((await accountView(ids[0])).watchlist, ["BTC"]);
      const resetKey = crypto.randomUUID();
      const reset = await execute(ids[0], resetKey, { action: "reset" });
      const retry = await execute(ids[0], resetKey, { action: "reset" });
      assert.equal(
        (reset.state as { id: string }).id,
        (retry.state as { id: string }).id,
      );
      const rows = await db()
        .select()
        .from(paperAccount)
        .where(eq(paperAccount.userId, ids[0]));
      assert.equal(rows.length, 2);
      assert.equal(rows.filter((r) => r.archived).length, 1);
      assert.equal((await accountView(ids[0])).state.balance, "10000");
      assert.equal((await accountView(ids[1])).state.id, other.id);
    } finally {
      for (const id of ids) {
        await db().delete(watchlist).where(eq(watchlist.userId, id));
        await db().delete(user).where(eq(user.id, id));
      }
      await db().$client.end();
    }
  },
);
