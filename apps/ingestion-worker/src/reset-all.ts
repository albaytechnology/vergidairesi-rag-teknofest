/**
 * Veritabanini ve Qdrant indeksini sifirlar — GERI DONUSU YOKTUR.
 *
 * Gelistirme sirasinda korpus bastan kurulurken gerekiyor: sema degisiyor,
 * chunk stratejisi degisiyor, elde yarim islenmis kayitlar kaliyor. Elle
 * temizlemek iki sistemi (Postgres + Qdrant) ayri ayri dolasmak demek ve biri
 * unutuldugunda ortaya "hayalet" durum cikiyor — silinmis belgenin vektoru
 * aramada gorunmeye devam ediyor.
 *
 * SILME VARSAYILAN DEGIL: bayraksiz calistirildiginda yalnizca ne silinecegini
 * yazar. Yikici islem, kullanicinin acikca istedigi bir sey olmali.
 *
 * Dosyalar diske DOKUNULMAZ: data/uploads altindaki orijinal evrak durur,
 * yeniden ingest edilebilir (pnpm ingest <klasor>).
 *
 * Calistir: pnpm reset                                (rapor, hicbir sey silinmez)
 *           pnpm reset -- --yes                       (her sey silinir)
 *           pnpm reset -- --corpus documents --yes    (yonetmelik indeksi kalir)
 */
import { pool, migrate } from "@albay/ingestion";
import { config, type Corpus } from "@albay/shared";
import { client, collectionExists, collectionInfo } from "@albay/retrieval";

const argv = process.argv.slice(2);
const onayli = argv.includes("--yes");
const corpus = corpusSecimi();

const KOLEKSIYONLAR: Record<Corpus, string> = {
  documents: config.QDRANT_COLLECTION,
  regulations: config.QDRANT_REGULATIONS_COLLECTION,
};
const kapsam: Corpus[] = corpus ? [corpus] : ["documents", "regulations"];

await migrate();

// ─── Ne silinecek? ────────────────────────────────────────────────────
console.log(`Kapsam: ${corpus ?? "TUM KORPUS (evrak + yonetmelik)"}\n`);

const sayilar = await pool.query<{ tablo: string; adet: string }>(
  `SELECT 'documents' tablo, count(*)::text adet FROM documents WHERE ($1::text IS NULL OR corpus = $1)
   UNION ALL SELECT 'chunks', count(*)::text FROM chunks c
     JOIN documents d ON d.id = c.doc_id WHERE ($1::text IS NULL OR d.corpus = $1)
   UNION ALL SELECT 'chat_messages', count(*)::text FROM chat_messages m
     JOIN documents d ON d.id = m.document_id WHERE ($1::text IS NULL OR d.corpus = $1)
   UNION ALL SELECT 'response_letters', count(*)::text FROM response_letters r
     JOIN documents d ON d.id = r.document_id WHERE ($1::text IS NULL OR d.corpus = $1)
   UNION ALL SELECT 'session_uploads', count(*)::text FROM session_uploads s
     JOIN documents d ON d.id = s.document_id WHERE ($1::text IS NULL OR d.corpus = $1)`,
  [corpus],
);

console.log("─── Postgres ─────────────────────────");
for (const r of sayilar.rows) console.log(`${r.tablo.padEnd(17)}: ${r.adet} satir`);

console.log("\n─── Qdrant ───────────────────────────");
for (const c of kapsam) {
  const ad = KOLEKSIYONLAR[c];
  const var_mi = await collectionExists(ad);
  console.log(`${ad.padEnd(17)}: ${var_mi ? `${(await collectionInfo(ad)).points} point` : "yok"}`);
}

if (!onayli) {
  console.log("\nHicbir sey silinmedi (rapor modu).");
  console.log(`Silmek icin: pnpm reset --${corpus ? ` --corpus ${corpus}` : ""} --yes`);
  await pool.end();
  process.exit(0);
}

// ─── Silme ────────────────────────────────────────────────────────────
console.log("\n─── Siliniyor ────────────────────────");

/*
 * Cocuk tablolar documents'a ON DELETE CASCADE ile bagli; tek DELETE hepsini
 * goturuyor. Tam sifirlamada ayrica giden evrak numarasi da basa aliniyor —
 * bos bir defterin 47'den devam etmesi yaniltici olurdu.
 */
await pool.query("DELETE FROM documents WHERE ($1::text IS NULL OR corpus = $1)", [corpus]);
if (!corpus) await pool.query("ALTER SEQUENCE response_letter_no_seq RESTART 1");
console.log("Postgres: documents ve bagli tablolar silindi");

for (const c of kapsam) {
  const ad = KOLEKSIYONLAR[c];
  if (!(await collectionExists(ad))) {
    console.log(`Qdrant: ${ad} zaten yok`);
    continue;
  }
  // Point'leri tek tek silmek yerine koleksiyon dusuruluyor: embed yolu
  // ensureCollection ile dogru boyutta yenisini zaten kuruyor.
  await client.deleteCollection(ad);
  console.log(`Qdrant: ${ad} koleksiyonu dusuruldu`);
}

console.log("\n─── Bitti ────────────────────────────");
console.log("Diskteki dosyalar durur (data/uploads). Yeniden kurmak icin:");
console.log("  pnpm worker &");
if (!corpus || corpus === "regulations") {
  console.log("  pnpm ingest corpus/regulations -- --corpus regulations");
}
if (!corpus || corpus === "documents") console.log("  pnpm ingest <evrak klasoru>");
console.log("\nNOT: worker calisiyorsa kuyrukta bekleyen isler silinen kayitlari geri getirebilir;");
console.log("     sifirlamayi worker kapaliyken yapin.");

await pool.end();

/** --corpus degeri; verilmezse null (her sey). Gecersiz deger sessizce gecmez. */
function corpusSecimi(): Corpus | null {
  const i = argv.indexOf("--corpus");
  if (i === -1) return null;
  const deger = argv[i + 1];
  if (deger !== "documents" && deger !== "regulations") {
    console.error(`Gecersiz --corpus degeri: ${deger ?? "(bos)"} — documents | regulations`);
    process.exit(1);
  }
  return deger;
}
