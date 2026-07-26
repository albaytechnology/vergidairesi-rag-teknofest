/**
 * Parse edilmis tum dokumanlari chunk'lar ve Postgres'e yazar.
 * Calistir: pnpm chunk            (sadece chunk'lanmamis dokumanlar)
 *           pnpm chunk -- --force (hepsini yeniden chunk'la)
 */
import { readFile } from "node:fs/promises";
import { chunkDocument } from "@albay/chunking";
import { pool, replaceChunks, chunkCounts, migrate } from "@albay/ingestion";

const force = process.argv.includes("--force");

await migrate();

const docs = await pool.query<{
  id: string;
  filename: string;
  parsed_md_path: string;
  docling_json_path: string | null;
}>(
  force
    ? `SELECT id, filename, parsed_md_path, docling_json_path
       FROM documents WHERE status = 'parsed'`
    : `SELECT d.id, d.filename, d.parsed_md_path, d.docling_json_path
       FROM documents d
       LEFT JOIN chunks c ON c.doc_id = d.id
       WHERE d.status = 'parsed' AND c.id IS NULL
       GROUP BY d.id`,
);

console.log(`${docs.rows.length} dokuman chunk'lanacak${force ? " (force)" : ""}`);

let done = 0;
for (const doc of docs.rows) {
  try {
    const markdown = await readFile(doc.parsed_md_path, "utf-8");
    let doclingJson: unknown;
    if (doc.docling_json_path) {
      doclingJson = JSON.parse(await readFile(doc.docling_json_path, "utf-8"));
    }
    const chunks = chunkDocument({
      docId: doc.id,
      filename: doc.filename,
      markdown,
      doclingJson,
    });
    await replaceChunks(doc.id, chunks);
    done++;
    const children = chunks.filter((c) => c.kind === "child").length;
    console.log(`✓ ${doc.filename}: ${children} child + ${chunks.length - children} parent`);
  } catch (err) {
    console.error(`✗ ${doc.filename}: ${(err as Error).message}`);
  }
}

const stats = await chunkCounts();
console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Dokuman        : ${stats.docs}`);
console.log(`Child chunk    : ${stats.children}`);
console.log(`Parent chunk   : ${stats.parents}`);
console.log(`Ort. child boy : ~${stats.avgTokens} token`);
console.log(`(${done}/${docs.rows.length} dokuman islendi)`);
await pool.end();
