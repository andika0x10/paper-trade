import { loadEnvConfig } from "@next/env";
import { db } from "../lib/db";
import { maintain } from "../lib/maintenance";
loadEnvConfig(process.cwd());
async function main() {
  await maintain();
  await db().$client.end();
  console.log(
    "Expired caches, rate limits, sessions and verification tokens removed.",
  );
}
main().catch(() => {
  console.error("Maintenance failed. Check the database configuration.");
  process.exitCode = 1;
});
