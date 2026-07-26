/**
 * Parse edilmis dokumanlari Qwen ile siniflandirir:
 * docType, entities, summary, containsPII, confidence.
 *
 * Calistir: pnpm classify             (sadece siniflandirilmamislar)
 *           pnpm classify -- --force  (hepsini yeniden)
 */
import { OllamaClient, classifyDocument } from "@albay/llm";
import { docsToClassify, saveClassification, pool, migrate } from "@albay/ingestion";

const force = process.argv.includes("--force");

await migrate();
const docs = await docsToClassify(force);
console.log(`${docs.length} dokuman siniflandirilacak${force ? " (force)" : ""}\n`);

const ollama = new OllamaClient();
let ok = 0;
let failed = 0;
let piiCount = 0;
let reviewCount = 0;

for (const [i, doc] of docs.entries()) {
  try {
    if (!doc.sample_text.trim()) {
      console.log(`- ${doc.filename}: chunk yok, atlandi (once pnpm chunk calistir)`);
      continue;
    }
    const c = await classifyDocument(ollama, {
      filename: doc.filename,
      sampleText: doc.sample_text,
    });
    await saveClassification(doc.id, c);
    ok++;
    if (c.containsPII) piiCount++;
    if (c.confidence < 0.6) reviewCount++;
    console.log(
      `✓ [${i + 1}/${docs.length}] ${doc.filename} → ${c.docType}` +
        `${c.containsPII ? " ⚠PII" : ""}` +
        `${c.confidence < 0.6 ? ` (dusuk guven: ${c.confidence.toFixed(2)})` : ""}` +
        `${c.entities.length ? ` | ${c.entities.slice(0, 3).join(", ")}` : ""}`,
    );
  } catch (err) {
    failed++;
    console.error(`✗ ${doc.filename}: ${(err as Error).message}`);
  }
}

console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Basarili        : ${ok}`);
console.log(`Basarisiz       : ${failed}`);
console.log(`PII iceren      : ${piiCount}`);
console.log(`Incelenmeli     : ${reviewCount} (guven < 0.6 — needs_review isaretlendi)`);
await pool.end();
