import type { Config } from "drizzle-kit";

// Placeholder config — schema will be populated in WI-02.
const config: Config = {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
};

export default config;
