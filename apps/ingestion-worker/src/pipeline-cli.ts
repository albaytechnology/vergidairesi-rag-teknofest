/**
 * Parse edilmis belgeleri hattan gecirir: chunk → kunye → ozet → servis yonlendirme → embed.
 *
 * Worker (pnpm worker) yeni gelen belgeleri zaten otomatik hattan geciriyor;
 * bu CLI, hat kurulmadan once ingest edilmis belgeleri geri doldurmak ve tek bir
 * belgeyi yeniden islemek icin.
 *
 * Calistir: pnpm pipeline                      (yonlendirilmemis tum belgeler)
 *           pnpm pipeline -- --force           (yonlendirilmis olanlar dahil hepsi)
 *           pnpm pipeline -- --doc <uuid>      (tek belge)
 *           pnpm pipeline -- --corpus regulations
 */
import { pool, migrate } from "@albay/ingestion";
import type { Corpus } from "@albay/shared";
import { processDocument } from "./helpers/pipeline.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const docArg = args[args.indexOf("--doc") + 1];
const docId = args.includes("--doc") ? docArg : undefined;
const corpus: Corpus =
  args.includes("--corpus") && args[args.indexOf("--corpus") + 1] === "regulations"
    ? "regulations"
    : "documents";

await migrate();

let hedefler: string[];
if (docId) {
  hedefler = [docId];
} else {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM documents
     WHERE status = 'parsed' AND corpus = $1
       ${force || corpus === "regulations" ? "" : "AND routing_status = 'pending'"}
     ORDER BY created_at`,
    [corpus],
  );
  hedefler = res.rows.map((r) => r.id);
}

console.log(`${hedefler.length} belge hattan gecirilecek — corpus: ${corpus}\n`);

let ok = 0;
let hata = 0;
let belirlenemedi = 0;

for (const [i, id] of hedefler.entries()) {
  try {
    const s = await processDocument(id, { corpus });
    ok++;
    if (s.routingStatus === "belirlenemedi") belirlenemedi++;
    const hedef =
      s.routingStatus === "routed"
        ? `→ ${s.routedService}`
        : s.routingStatus === "belirlenemedi"
          ? "→ belirlenemedi"
          : "";
    console.log(`✓ [${i + 1}/${hedefler.length}] ${s.filename}: ${s.chunkCount} chunk ${hedef}`);
    if (s.analysis) console.log(`    konu: ${s.analysis.konu}`);
  } catch (err) {
    hata++;
    console.error(`✗ [${i + 1}/${hedefler.length}] ${id.slice(0, 8)}: ${(err as Error).message}`);
  }
}

console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Islenen        : ${ok}/${hedefler.length}`);
if (corpus === "documents") console.log(`Belirlenemedi  : ${belirlenemedi} (manuel inceleme)`);
if (hata) console.log(`Hata           : ${hata}`);
await pool.end();
