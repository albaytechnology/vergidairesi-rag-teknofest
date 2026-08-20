import { config } from "@albay/shared";
import pg from "pg";
import type { Check } from "../types.ts";

export const postgresCheck: Check = {
  name: "Postgres",
  async run() {
    const client = new pg.Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    const r = await client.query("SELECT version()");
    await client.end();
    return `ayakta — ${String(r.rows[0]?.version).split(" on ")[0]}`;
  },
};
