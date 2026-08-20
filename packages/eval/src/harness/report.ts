import type { EvalSummary, QuestionResult } from "../scoring/types.ts";

const LINE = "──────────────────────────────────────────────────────";

/** Hedefler: kaynak isabeti ≥ %90, tuzak basarisi ≥ %98. */
const TARGET_SOURCE_RECALL = "≥ 90%";
const TARGET_TRAP_RATE = "≥ 98%";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function flags(r: QuestionResult): string {
  return [
    r.sourceHit === null ? "" : r.sourceHit ? "kaynak✓" : "kaynak✗",
    r.trapPassed === null ? "" : r.trapPassed ? "tuzak✓" : "tuzak✗",
    r.answerHit === null ? "" : r.answerHit ? "cevap✓" : "cevap✗",
    r.forbiddenHit === null ? "" : r.forbiddenHit ? "yasak✗" : "yasak✓",
  ]
    .filter(Boolean)
    .join(" ");
}

export function printEvalHeader(targetName: string, questionCount: number): void {
  console.log(`\nEval hedefi: ${targetName} — ${questionCount} soru\n`);
}

export function printProgress(r: QuestionResult): void {
  const failed = r.answerSnippet.startsWith("HATA: ");
  console.log(`  ${r.id} ${failed ? r.answerSnippet : "tamamlandi"}`);
}

export function printEvalReport(rows: QuestionResult[], summary: EvalSummary): void {
  console.log(`\n─── Eval Sonuclari ───────────────────────────────────`);
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(10)} [${r.scenario.padEnd(9)}] ${flags(r).padEnd(16)} ${r.answerSnippet}`,
    );
  }
  console.log(LINE);
  console.log(`Dogru kaynak orani : ${pct(summary.sourceRecall)} (hedef ${TARGET_SOURCE_RECALL})`);
  console.log(`Tuzak basarisi     : ${pct(summary.trapRate)} (hedef ${TARGET_TRAP_RATE})`);
  console.log(`Beklenen cevap     : ${pct(summary.answerRate)}`);
  console.log(`Yasak ifade kontrol: ${pct(summary.forbiddenRate)}`);
  console.log(`\nBu skorlari kaydet — her fazin sonunda ayni komutla karsilastiracagiz.`);
}
