/**
 * Sistemdeki dokumanlari listeler.
 * Calistir: pnpm docs            (hepsi)
 *           pnpm docs sozlesme   (ada gore filtre)
 */
import { pool } from "@albay/ingestion";

const filter = process.argv[2];

const res = await pool.query<{
  filename: string;
  status: string;
  format: string;
  chunk_count: string;
}>(
  `SELECT d.filename, d.status, d.format,
          COUNT(c.id) FILTER (WHERE c.kind = 'child') AS chunk_count
   FROM documents d
   LEFT JOIN chunks c ON c.doc_id = d.id
   ${filter ? "WHERE d.filename ILIKE $1" : ""}
   GROUP BY d.id
   ORDER BY d.filename`,
  filter ? [`%${filter}%`] : [],
);

if (!res.rows.length) {
  console.log(filter ? `'${filter}' ile eslesen dokuman yok` : "Henuz dokuman yok — once: pnpm ingest <klasor>");
} else {
  console.log(`\n${"DOSYA".padEnd(50)} ${"DURUM".padEnd(9)} ${"TIP".padEnd(6)} CHUNK`);
  console.log("─".repeat(75));
  for (const r of res.rows) {
    console.log(
      `${r.filename.slice(0, 49).padEnd(50)} ${r.status.padEnd(9)} ${r.format.padEnd(6)} ${r.chunk_count}`,
    );
  }
  console.log(`\nToplam: ${res.rows.length} dokuman`);
  console.log(`Detay icin: pnpm chunk:preview <dosya-adi-parcasi>`);
}
await pool.end();
