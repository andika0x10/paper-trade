import { test } from "node:test";
import assert from "node:assert/strict";
import { createPool } from "mysql2/promise";
import type { ConnectionOptions } from "mysql2";
import { mysqlConnectionUrl } from "../lib/db/connection-url";

test("TiDB TLS settings are understood by the installed mysql2 driver", async () => {
  const pool = createPool({
    uri: mysqlConnectionUrl(
      "mysql://user:p%40ss@gateway.aws.tidbcloud.com:4000/trade?connectTimeout=8000",
    ),
  });
  try {
    const config = (
      pool.pool.config as unknown as { connectionConfig: ConnectionOptions }
    ).connectionConfig;
    assert.equal(config.password, "p@ss");
    assert.equal(config.database, "trade");
    assert.equal(config.port, 4000);
    assert.equal(config.connectTimeout, 8000);
    assert.ok(config.ssl && typeof config.ssl === "object");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.minVersion, "TLSv1.2");
  } finally {
    await pool.end();
  }
});
test("TiDB retains custom CA and stronger TLS while enforcing certificate validation", () => {
  const url = new URL("mysql://user:pass@cluster.tidb-cloud.com/db");
  url.searchParams.set(
    "ssl",
    JSON.stringify({
      ca: "custom-ca",
      minVersion: "TLSv1.3",
      rejectUnauthorized: false,
    }),
  );
  const result = JSON.parse(
    new URL(mysqlConnectionUrl(url.toString())).searchParams.get("ssl")!,
  );
  assert.deepEqual(result, {
    ca: "custom-ca",
    minVersion: "TLSv1.3",
    rejectUnauthorized: true,
  });
});
test("local MySQL and other providers keep their existing connection settings", () => {
  for (const url of [
    "mysql://user:pass@localhost:3306/paper_trade",
    "mysql://user:pass@db.example/db?ssl=%7B%7D",
    "mysql://user:pass@tidbcloud.com.example/db",
  ])
    assert.equal(mysqlConnectionUrl(url), url);
});
test("invalid connection errors never echo credentials", () => {
  assert.throws(
    () => mysqlConnectionUrl("invalid-secret-password"),
    /^Error: DATABASE_URL must be a valid MySQL connection URL\.$/,
  );
  assert.throws(
    () => mysqlConnectionUrl("postgres://user:password@example/db"),
    /mysql:\/\/ protocol/,
  );
});
