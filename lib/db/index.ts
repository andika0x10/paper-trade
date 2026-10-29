import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";
import { mysqlConnectionUrl } from "./connection-url";

let database: ReturnType<typeof connect> | undefined;
function connect() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured.");
  const pool = createPool({
    uri: mysqlConnectionUrl(process.env.DATABASE_URL),
    timezone: "Z",
    connectionLimit: 3,
    idleTimeout: 20_000,
    enableKeepAlive: true,
  });
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) connection.destroy();
    });
  });
  return drizzle(pool, { schema, mode: "default" });
}
export function db() {
  return (database ??= connect());
}
export const databaseConfigured = () =>
  Boolean(
    process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET.length >= 32 &&
    process.env.BETTER_AUTH_URL,
  );
