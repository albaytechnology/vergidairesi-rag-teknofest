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
import { config, type Corpus } from "@albay/shared";
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
  upsertChunkPointsToCollection,
  collectionInfo,
  type ChunkPoint,
} from "@albay/retrieval";

const force = process.argv.includes("--force");
const corpus: Corpus = process.argv.includes("--corpus")
  ? process.argv[process.argv.indexOf("--corpus") + 1] === "regulations"
    ? "regulations"
    : "documents"
  : "documents";
const collection =
  corpus === "regulations" ? config.QDRANT_REGULATIONS_COLLECTION : config.QDRANT_COLLECTION;
const BATCH = 16;

await migrate();
if (force) {
  await resetEmbeddings(corpus);
  console.log(`embedded_at sifirlandi — ${corpus} yeniden embed edilecek`);
}

const ollama = new OllamaClient();

// Ilk batch ile boyutu tespit edip collection'i garantile
let batch = await chunksToEmbed(BATCH, corpus);
if (!batch.length) {
  console.log(
    `Embed edilecek chunk yok (${corpus}). (once: pnpm chunk${corpus === "regulations" ? " -- --corpus regulations" : ", istege bagli: pnpm classify"})`,
  );
  await pool.end();
  process.exit(0);
}

const probe = await ollama.embed([batch[0]!.text]);
const denseSize = probe[0]!.length;
await ensureCollection(denseSize, collection);
console.log(`Embedding boyutu: ${denseSize} — collection hazir: ${collection}\n`);

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
      corpus: c.corpus,
      doc_type: c.doc_type,
      contains_pii: c.contains_pii,
      entities: Array.isArray(c.entities) ? c.entities : [],
      section: c.section,
      page: c.page,
      parent_id: c.parent_id,
      metadata: c.metadata ?? {},
      madde_no: String(c.metadata?.maddeNo ?? ""),
      madde_baslik: String(c.metadata?.baslik ?? ""),
      text: c.text,
    },
  }));

  await upsertChunkPointsToCollection(collection, points);
  await markEmbedded(batch.map((c) => c.id));

  total += batch.length;
  const rate = total / ((Date.now() - start) / 1000);
  process.stdout.write(`\rEmbed edildi: ${total} chunk (${rate.toFixed(1)}/sn)   `);

  batch = await chunksToEmbed(BATCH, corpus);
}

const info = await collectionInfo(collection);
console.log(`\n\n─── Ozet ─────────────────────────`);
console.log(`Bu calismada     : ${total} chunk`);
console.log(`Qdrant'ta toplam : ${info.points} point`);
console.log(`Sure             : ${((Date.now() - start) / 1000).toFixed(0)} sn`);
await pool.end();
