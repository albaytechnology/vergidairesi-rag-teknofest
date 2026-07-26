/**
 * Hybrid aramayi elle test etme araci.
 * NOT: script adi "ara" — cunku `pnpm search` pnpm'in yerlesik npm-paket-arama
 * komutuna gider, bizim script'i calistirmaz.
 *
 * Calistir: pnpm ara "Opel kiralama sozlesmesi"
 *           pnpm ara "fesih kosullari" --type sozlesme
 *           pnpm ara "Altay" --pii            (PII iceren dokumanlar dahil)
 *           pnpm ara "sorgu" --no-rerank      (sadece RRF)
 */
import { hybridSearch } from "@albay/retrieval";

const args = process.argv.slice(2);
const query = args.filter((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--type")[0];
if (!query) {
  console.error('Kullanim: pnpm ara "sorgu" [--type sozlesme] [--pii] [--no-rerank]');
  process.exit(1);
}
const typeIdx = args.indexOf("--type");

const start = Date.now();
const hits = await hybridSearch(query, {
  topK: 8,
  filters: {
    docType: typeIdx >= 0 ? args[typeIdx + 1] : undefined,
    includePII: args.includes("--pii"),
  },
  skipRerank: args.includes("--no-rerank"),
});
const ms = Date.now() - start;

console.log(`\n"${query}" — ${hits.length} sonuc (${ms} ms)\n`);
for (const [i, h] of hits.entries()) {
  console.log(
    `${i + 1}. [${h.score.toFixed(3)}] ${h.filename}` +
      `${h.section ? ` › ${h.section}` : ""}` +
      `${h.page != null ? ` (s.${h.page})` : ""}`,
  );
  const snippet = h.text.replace(/^\[.*?\]\n/, "").replace(/\s+/g, " ").slice(0, 160);
  console.log(`   ${snippet}...\n`);
}
if (!hits.length) {
  console.log("Sonuc yok. Once pnpm embed calistigindan emin ol.");
}
