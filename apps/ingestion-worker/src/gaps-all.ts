/**
 * Evraklarda eksik bilgi / tutarsizlik taramasi.
 *
 * Hat (processDocument) bunu yeni gelen her evrak icin zaten yapiyor; bu CLI
 * tarama hattina girmeden once islenmis evraklar icindir.
 *
 * Calistir: pnpm gaps             (sadece hic taranmamislar)
 *           pnpm gaps -- --force  (hepsini yeniden)
 */
import { readFile } from "node:fs/promises";
import { OllamaClient, analyzeDocumentGaps } from "@albay/llm";
import { docsToScanGaps, saveDocumentGaps, pool, migrate } from "@albay/ingestion";

const force = process.argv.includes("--force");

await migrate();
const docs = await docsToScanGaps(force);
console.log(`${docs.length} evrak taranacak${force ? " (force)" : ""}\n`);

const ollama = new OllamaClient();
let ok = 0;
let failed = 0;
let bulguToplam = 0;

for (const [i, doc] of docs.entries()) {
  try {
    const text = await readFile(doc.parsed_md_path, "utf-8");
    const { bulgular } = await analyzeDocumentGaps(ollama, { filename: doc.filename, text });
    await saveDocumentGaps(doc.id, bulgular);
    ok++;
    bulguToplam += bulgular.length;
    const kritik = bulgular.filter((b) => b.onem === "kritik").length;
    console.log(
      `✓ [${i + 1}/${docs.length}] ${doc.filename} → ${bulgular.length} bulgu` +
        `${kritik ? ` (${kritik} kritik)` : ""}`,
    );
  } catch (err) {
    failed++;
    console.error(`✗ ${doc.filename}: ${(err as Error).message}`);
  }
}

console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Taranan   : ${ok}`);
console.log(`Basarisiz : ${failed}`);
console.log(`Bulgu     : ${bulguToplam}`);
await pool.end();
