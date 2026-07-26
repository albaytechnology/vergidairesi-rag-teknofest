/**
 * Bir dokumanin chunk'larini gozle denetlemek icin debug araci.
 * Calistir: pnpm chunk:preview <dosya-adi-parcasi>
 */
import { pool } from "@albay/ingestion";

const q = process.argv[2];
if (!q) {
  console.error("Kullanim: pnpm chunk:preview <dosya-adi-parcasi>");
  process.exit(1);
}

const doc = await pool.query<{ id: string; filename: string }>(
  "SELECT id, filename FROM documents WHERE filename ILIKE $1 LIMIT 1",
  [`%${q}%`],
);
if (!doc.rows[0]) {
  console.error(`'${q}' ile eslesen dokuman yok`);
  process.exit(1);
}
const { id, filename } = doc.rows[0];

const chunks = await pool.query<{
  kind: string;
  section: string | null;
  page: number | null;
  token_count: number;
  text: string;
}>(
  `SELECT kind, section, page, token_count, text
   FROM chunks WHERE doc_id = $1
   ORDER BY kind DESC, created_at, section NULLS FIRST`,
  [id],
);

console.log(`\n═══ ${filename} — ${chunks.rows.length} chunk ═══\n`);
for (const [i, c] of chunks.rows.entries()) {
  const head = `#${i + 1} [${c.kind}] ${c.section ?? "(bolumsuz)"} · sayfa: ${c.page ?? "?"} · ~${c.token_count} token`;
  console.log("─".repeat(Math.min(head.length, 80)));
  console.log(head);
  console.log("─".repeat(Math.min(head.length, 80)));
  console.log(c.text.length > 600 ? c.text.slice(0, 600) + "\n[... kirpildi]" : c.text);
  console.log();
}
await pool.end();
