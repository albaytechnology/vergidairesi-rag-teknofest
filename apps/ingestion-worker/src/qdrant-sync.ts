/**
 * Qdrant'i Postgres ile senkronlar — oksuz vektorleri siler.
 *
 * NEDEN: chunk id'leri her yeniden chunk'lamada yeniden uretiliyor ve bir dokuman
 * Postgres'ten silindiginde (ON DELETE CASCADE) vektorleri Qdrant'ta kaliyordu.
 * Bu iki durum indekste "hayalet" parcalar birakir: silinmis bir dosya aramada
 * cikmaya, eski chunk'lar yenileriyle birlikte donmeye devam eder.
 *
 * Yazma yolu artik senkronu koruyor (chunk oncesi deleteByDocId); bu arac
 * gecmiste birikmis kaymayi temizlemek ve durumu denetlemek icin.
 *
 * Calistir: pnpm qdrant:sync           (rapor, degisiklik yok)
 *           pnpm qdrant:sync -- --fix  (oksuzleri sil)
 */
import { pool, migrate } from "@albay/ingestion";
import { config } from "@albay/shared";
import {
  collectionExists,
  collectionInfo,
  distinctDocIds,
  pointIdsByDocId,
  deleteByDocId,
  deletePoints,
} from "@albay/retrieval";

const fix = process.argv.includes("--fix");

await migrate();

const koleksiyonlar = [
  { name: config.QDRANT_COLLECTION, corpus: "documents" },
  { name: config.QDRANT_REGULATIONS_COLLECTION, corpus: "regulations" },
];

let toplamOksuz = 0;

for (const { name, corpus } of koleksiyonlar) {
  if (!(await collectionExists(name))) {
    console.log(`\n${name}: koleksiyon yok, atlandi`);
    continue;
  }

  const oncesi = (await collectionInfo(name)).points;
  const qdrantDocIds = await distinctDocIds(name);

  const pgDocs = await pool.query<{ id: string }>(
    "SELECT id FROM documents WHERE corpus = $1",
    [corpus],
  );
  const pgDocIds = new Set(pgDocs.rows.map((r) => r.id));

  console.log(`\n─── ${name} ─────────────────────────`);
  console.log(`Qdrant point   : ${oncesi}`);
  console.log(`Qdrant dokuman : ${qdrantDocIds.length}`);
  console.log(`Postgres dokuman: ${pgDocIds.size}`);

  // 1. Postgres'te hic olmayan dokumanlarin tum vektorleri
  const silinmisDocs = qdrantDocIds.filter((id) => !pgDocIds.has(id));
  for (const docId of silinmisDocs) {
    const adet = (await pointIdsByDocId(name, docId)).length;
    toplamOksuz += adet;
    console.log(`  silinmis dokuman ${docId.slice(0, 8)}: ${adet} point`);
    if (fix) await deleteByDocId(docId, name);
  }

  // 2. Var olan dokumanlarda, Postgres'te karsiligi olmayan chunk id'leri
  for (const docId of qdrantDocIds.filter((id) => pgDocIds.has(id))) {
    const qdrantIds = await pointIdsByDocId(name, docId);
    const pgChunks = await pool.query<{ id: string }>(
      "SELECT id FROM chunks WHERE doc_id = $1",
      [docId],
    );
    const pgIds = new Set(pgChunks.rows.map((r) => r.id));
    const oksuz = qdrantIds.filter((id) => !pgIds.has(id));
    if (!oksuz.length) continue;
    toplamOksuz += oksuz.length;
    console.log(`  ${docId.slice(0, 8)}: ${oksuz.length} oksuz chunk (PG'de ${pgIds.size})`);
    if (fix) await deletePoints(name, oksuz);
  }

  if (fix) {
    const sonrasi = (await collectionInfo(name)).points;
    console.log(`Temizlik sonrasi: ${sonrasi} point (${oncesi - sonrasi} silindi)`);
  }
}

console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Oksuz point: ${toplamOksuz}`);
if (toplamOksuz && !fix) {
  console.log("Temizlemek icin: pnpm qdrant:sync -- --fix");
}
await pool.end();
