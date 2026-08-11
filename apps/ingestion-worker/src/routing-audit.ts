/**
 * Yonlendirme tutarlilik denetimi.
 *
 * Kurum isleyisinde ayni tur evrak ayni servise gitmelidir: "idari para cezasinin
 * taksitle odenmesi" ile "trafik idari para cezasinin tecil ve taksitlendirilmesi"
 * ayni islem turudur ve farkli servislere dusmemelidir.
 *
 * Bu ozellik insa geregi saglanir — yonlendirme girdisi yalnizca dusuk kardinaliteli
 * alanlardan (belge turu + islem turu + alacak turu) turer ve LLM sicakligi 0'dir,
 * dolayisiyla ayni anahtar ayni sorguyu ve ayni karari uretir. Bu arac o varsayimin
 * gercekten tuttugunu dogrular; bozulursa CI'da yakalanmasi icin exit kodu doner.
 *
 * Calistir: pnpm routing:audit
 */
import { pool, migrate, routingInconsistencies } from "@albay/ingestion";

await migrate();

const gruplar = await pool.query<{
  routing_key: string;
  adet: string;
  servisler: string[];
}>(
  `SELECT routing_key,
          COUNT(*) adet,
          array_agg(DISTINCT COALESCE(routed_service, '(belirlenemedi)')) servisler
   FROM documents
   WHERE corpus = 'documents' AND routing_key IS NOT NULL AND routing_status <> 'pending'
   GROUP BY routing_key
   ORDER BY COUNT(*) DESC`,
);

console.log("─── Yonlendirme anahtarlari ──────────────────────────");
for (const g of gruplar.rows) {
  const tutarli = g.servisler.length === 1;
  console.log(`${tutarli ? "✓" : "✗"} ${g.routing_key}  (${g.adet} belge)`);
  console.log(`    → ${g.servisler.join("  |  ")}`);
}

const anahtarsiz = await pool.query<{ adet: string }>(
  `SELECT COUNT(*) adet FROM documents
   WHERE corpus = 'documents' AND routing_status <> 'pending' AND routing_key IS NULL`,
);
const eksik = Number(anahtarsiz.rows[0]?.adet ?? 0);

const tutarsizliklar = await routingInconsistencies();

console.log("\n─── Ozet ─────────────────────────");
console.log(`Anahtar sayisi : ${gruplar.rows.length}`);
if (eksik) {
  console.log(`Anahtarsiz     : ${eksik} belge (hat guncellenmeden once islenmis)`);
  console.log("                 duzeltmek icin: pnpm pipeline -- --force");
}

if (!tutarsizliklar.length) {
  console.log("Tutarsizlik    : yok — ayni tur evrak ayni servise gidiyor ✓");
  await pool.end();
  process.exit(0);
}

console.log(`Tutarsizlik    : ${tutarsizliklar.length} anahtar\n`);
for (const t of tutarsizliklar) {
  console.log(`✗ ${t.routing_key}`);
  for (const b of t.belgeler) {
    console.log(`    ${b.servis ?? "(belirlenemedi)"}  ←  ${b.filename}`);
  }
}
console.log("\nAyni anahtardaki evraklar farkli servislere gitmis.");
console.log("Once analiz ciktilarini karsilastirin (islemTuru/alacakTuru ayni mi),");
console.log("sonra golden-set'e bu cifti ekleyip yonlendirmeyi duzeltin.");
await pool.end();
process.exit(1);
