/**
 * Child chunk'lari bge-m3 ile embed edip Qdrant'a (dense + sparse) yazar.
 *
 * Calistir: pnpm embed             (sadece embed edilmemisler)
 *           pnpm embed -- --force  (embedded_at sifirla, hepsini yeniden)
 *
 * Not: once `pnpm classify` calistirmak iyi olur — doc_type / contains_pii
 * payload'a buradan yazilir (ACL filtreleri icin).
 */
import { OllamaClient } from "@albay/llm";
import {
  chunksToEmbed,
  markEmbedded,
  resetEmbeddings,
  pool,
  migrate,
} from "@albay/ingestion";
import {
  encodeSparse,
  ensureCollection,
  upsertChunkPoints,
  collectionInfo,
  type ChunkPoint,
} from "@albay/retrieval";

const force = process.argv.includes("--force");
const BATCH = 16;

await migrate();
if (force) {
  await resetEmbeddings();
  console.log("embedded_at sifirlandi — her sey yeniden embed edilecek");
}

const ollama = new OllamaClient();

// Ilk batch ile boyutu tespit edip collection'i garantile
let batch = await chunksToEmbed(BATCH);
if (!batch.length) {
  console.log("Embed edilecek chunk yok. (once: pnpm chunk, istege bagli: pnpm classify)");
  await pool.end();
  process.exit(0);
}

const probe = await ollama.embed([batch[0]!.text]);
const denseSize = probe[0]!.length;
await ensureCollection(denseSize);
console.log(`Embedding boyutu: ${denseSize} — collection hazir\n`);

let total = 0;
const start = Date.now();

while (batch.length) {
  const vectors = await ollama.embed(batch.map((c) => c.text));

  const points: ChunkPoint[] = batch.map((c, i) => ({
    id: c.id,
    dense: vectors[i]!,
    sparse: encodeSparse(c.text),
    payload: {
      doc_id: c.doc_id,
      filename: c.filename,
      path: c.path,
      doc_type: c.doc_type,
      contains_pii: c.contains_pii,
      entities: Array.isArray(c.entities) ? c.entities : [],
      section: c.section,
      page: c.page,
      parent_id: c.parent_id,
      text: c.text,
    },
  }));

  await upsertChunkPoints(points);
  await markEmbedded(batch.map((c) => c.id));

  total += batch.length;
  const rate = total / ((Date.now() - start) / 1000);
  process.stdout.write(`\rEmbed edildi: ${total} chunk (${rate.toFixed(1)}/sn)   `);

  batch = await chunksToEmbed(BATCH);
}

const info = await collectionInfo();
console.log(`\n\n─── Ozet ─────────────────────────`);
console.log(`Bu calismada     : ${total} chunk`);
console.log(`Qdrant'ta toplam : ${info.points} point`);
console.log(`Sure             : ${((Date.now() - start) / 1000).toFixed(0)} sn`);
await pool.end();
