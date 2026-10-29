import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";
import { mysqlConnectionUrl } from "./lib/db/connection-url";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: mysqlConnectionUrl(
      process.env.DATABASE_URL ?? "mysql://localhost:3306/paper_trade",
    ),
  },
  strict: true,
});
