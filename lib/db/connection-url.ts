/** Apply TiDB Cloud's required TLS policy for both mysql2 and Drizzle Kit. */
export function mysqlConnectionUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL connection URL.");
  }
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }
  const tidb =
    url.hostname.endsWith(".tidbcloud.com") ||
    url.hostname.endsWith(".tidb-cloud.com");
  if (!tidb) return value;

  let existing: Record<string, unknown> = {};
  const ssl = url.searchParams.get("ssl");
  if (ssl) {
    try {
      const parsed: unknown = JSON.parse(ssl);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error("TiDB DATABASE_URL ssl must be a JSON object.");
    }
  }
  url.searchParams.set(
    "ssl",
    JSON.stringify({
      ...existing,
      minVersion: existing.minVersion === "TLSv1.3" ? "TLSv1.3" : "TLSv1.2",
      rejectUnauthorized: true,
    }),
  );
  return url.toString();
}
