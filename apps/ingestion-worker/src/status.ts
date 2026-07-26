/**
 * Ingestion durumu ozeti.
 * Calistir: pnpm ingest:status
 */
import { statusCounts, pool } from "@albay/ingestion";

const counts = await statusCounts();
const total = Object.values(counts).reduce((a, b) => a + b, 0);

console.log("\n─── Ingestion Durumu ─────────────");
for (const [status, count] of Object.entries(counts)) {
  console.log(`${status.padEnd(10)} ${count}`);
}
console.log(`${"TOPLAM".padEnd(10)} ${total}`);

const failed = await pool.query<{ filename: string; error: string }>(
  "SELECT filename, error FROM documents WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10",
);
if (failed.rows.length) {
  console.log("\nSon basarisizlar:");
  for (const r of failed.rows) {
    console.log(`  ✗ ${r.filename}: ${r.error?.slice(0, 100)}`);
  }
}
await pool.end();
