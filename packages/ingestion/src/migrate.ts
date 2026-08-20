/** Calistir: pnpm migrate */
import { pool } from "./db/pool.ts";
import { migrate } from "./db/migrate.ts";

await migrate();
console.log("✓ documents tablosu hazir");
await pool.end();
