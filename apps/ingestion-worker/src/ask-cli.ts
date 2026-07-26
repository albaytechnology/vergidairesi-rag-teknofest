/**
 * Multi-agent RAG'e soru sorma araci.
 * Calistir: pnpm sor "Albay Intelligence Hub sureci nasil isliyor?"
 *           pnpm sor "soru" --trace     (agent adimlarini goster)
 */
import { ask } from "@albay/agents";

const args = process.argv.slice(2);
const question = args.find((a) => !a.startsWith("--"));
if (!question) {
  console.error('Kullanim: pnpm sor "soru" [--trace]');
  process.exit(1);
}

const start = Date.now();
const result = await ask(question);
const sec = ((Date.now() - start) / 1000).toFixed(1);

if (args.includes("--trace")) {
  console.log("\n─── Agent Adimlari ───────────────");
  for (const t of result.trace) console.log(`  ${t}`);
}

console.log(`\n─── Cevap (${result.intent}, ${sec} sn) ─────────\n`);
console.log(result.answer);
if (result.sources.length && !result.answer.includes("Kaynaklar:")) {
  console.log(`\nKaynaklar:\n${result.sources.map((s) => `- ${s}`).join("\n")}`);
}
