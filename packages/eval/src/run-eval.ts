/**
 * Golden set eval harness (v0).
 * Calistir: pnpm eval -- --target ragflow
 *
 * Su an tek hedef var: ragflow (baseline). Faz 4'te "new" hedefi eklenecek.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { EvalTarget } from "@albay/shared";
import { ragflowTarget } from "./targets/ragflow.ts";
import { newSystemTarget } from "./targets/new-system.ts";
import { agentTarget } from "./targets/agent.ts";

interface GoldenQuestion {
  id: string;
  scenario: "entity" | "doc_find" | "synthesis" | "service_routing" | "trap";
  question: string;
  expectedDocs: string[];
  expectedAnswerContains: string[];
  expectedAnswerNotContains?: string[];
  notes?: string;
}

const __dir = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(__dir, "golden-set.json"), "utf-8"),
) as { questions: GoldenQuestion[] };

const targetName = process.argv.includes("--target")
  ? process.argv[process.argv.indexOf("--target") + 1]
  : "ragflow";

const targets: Record<string, EvalTarget> = {
  ragflow: ragflowTarget,
  new: newSystemTarget,
  agent: agentTarget,
};

const target = targets[targetName ?? "ragflow"];
if (!target) {
  console.error(`Bilinmeyen hedef: ${targetName}. Mevcut: ${Object.keys(targets).join(", ")}`);
  process.exit(1);
}

import { isNotFoundAnswer } from "@albay/agents";

interface QuestionResult {
  id: string;
  scenario: string;
  sourceHit: boolean | null;
  trapPassed: boolean | null;
  answerHit: boolean | null;
  forbiddenHit: boolean | null;
  answerSnippet: string;
}

console.log(`\nEval hedefi: ${target.name} — ${golden.questions.length} soru\n`);

const rows: QuestionResult[] = [];
for (const q of golden.questions) {
  try {
    const { answer, sources } = await target.ask(q.question);

    // Kaynak isabeti: beklenen dokumanlardan en az biri kaynaklarda gecti mi?
    const sourceHit =
      q.expectedDocs.length === 0
        ? null
        : q.expectedDocs.some((d) =>
            sources.some((s) => s.toLowerCase().includes(d.toLowerCase())),
          );

    // Tuzak: sistem "bilmiyorum" diyebildi mi? (genis kalip listesi, TR-normalize)
    const trapPassed = q.scenario === "trap" ? isNotFoundAnswer(answer) : null;
    const answerHit =
      q.expectedAnswerContains.length === 0
        ? null
        : q.expectedAnswerContains.every((s) =>
            answer.toLocaleLowerCase("tr-TR").includes(s.toLocaleLowerCase("tr-TR")),
          );
    const forbiddenHit =
      q.expectedAnswerNotContains && q.expectedAnswerNotContains.length
        ? q.expectedAnswerNotContains.some((s) =>
            answer.toLocaleLowerCase("tr-TR").includes(s.toLocaleLowerCase("tr-TR")),
          )
        : null;

    rows.push({
      id: q.id,
      scenario: q.scenario,
      sourceHit,
      trapPassed,
      answerHit,
      forbiddenHit,
      answerSnippet: answer.slice(0, 80).replace(/\n/g, " "),
    });
    console.log(`  ${q.id} tamamlandi`);
  } catch (err) {
    rows.push({
      id: q.id,
      scenario: q.scenario,
      sourceHit: false,
      trapPassed: q.scenario === "trap" ? false : null,
      answerHit: q.expectedAnswerContains.length ? false : null,
      forbiddenHit: null,
      answerSnippet: `HATA: ${(err as Error).message}`,
    });
    console.log(`  ${q.id} HATA: ${(err as Error).message}`);
  }
}

// Ozet
const withSource = rows.filter((r) => r.sourceHit !== null);
const sourceRecall =
  withSource.length === 0
    ? 0
    : withSource.filter((r) => r.sourceHit).length / withSource.length;
const traps = rows.filter((r) => r.trapPassed !== null);
const trapRate =
  traps.length === 0
    ? 0
    : traps.filter((r) => r.trapPassed).length / traps.length;
const answerChecks = rows.filter((r) => r.answerHit !== null);
const answerRate =
  answerChecks.length === 0
    ? 0
    : answerChecks.filter((r) => r.answerHit).length / answerChecks.length;
const forbiddenChecks = rows.filter((r) => r.forbiddenHit !== null);
const forbiddenRate =
  forbiddenChecks.length === 0
    ? 1
    : forbiddenChecks.filter((r) => !r.forbiddenHit).length / forbiddenChecks.length;

console.log("\n─── Eval Sonuclari ───────────────────────────────────");
for (const r of rows) {
  const flags = [
    r.sourceHit === null ? "" : r.sourceHit ? "kaynak✓" : "kaynak✗",
    r.trapPassed === null ? "" : r.trapPassed ? "tuzak✓" : "tuzak✗",
    r.answerHit === null ? "" : r.answerHit ? "cevap✓" : "cevap✗",
    r.forbiddenHit === null ? "" : r.forbiddenHit ? "yasak✗" : "yasak✓",
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`${r.id.padEnd(10)} [${r.scenario.padEnd(9)}] ${flags.padEnd(16)} ${r.answerSnippet}`);
}
console.log("──────────────────────────────────────────────────────");
console.log(`Dogru kaynak orani : ${(sourceRecall * 100).toFixed(1)}% (hedef ≥ 90%)`);
console.log(`Tuzak basarisi     : ${(trapRate * 100).toFixed(1)}% (hedef ≥ 98%)`);
console.log(`Beklenen cevap     : ${(answerRate * 100).toFixed(1)}%`);
console.log(`Yasak ifade kontrol: ${(forbiddenRate * 100).toFixed(1)}%`);
console.log(`\nBu skorlari kaydet — her fazin sonunda ayni komutla karsilastiracagiz.`);
