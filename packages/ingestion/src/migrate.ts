/** Calistir: pnpm migrate */
import { migrate, pool } from "./db.ts";

await migrate();
console.log("✓ documents tablosu hazir");
await pool.end();
