import type { EvalTarget } from "@albay/shared";
import type { GoldenQuestion } from "../golden/types.ts";
import { gradeAnswer, gradeFailure } from "../scoring/grade.ts";
import type { QuestionResult } from "../scoring/types.ts";

interface RunOptions {
  /** Her soru bitiminde ilerleme bildirimi; CLI disinda sessiz birakilabilir. */
  onProgress?: (result: QuestionResult) => void;
}

/**
 * Golden set'i hedefe sirayla sorar.
 *
 * Sirali (paralel degil): hedefler ayni Ollama/Qdrant kaynagini kullaniyor,
 * es zamanli yuk gecikmeleri sisirip olcumu kendisi bozar.
 * Tek sorunun hatasi kosumu durdurmaz — basarisiz olarak kaydedilir, boylece
 * her kosum tam bir karne uretir.
 */
export async function runEval(
  target: EvalTarget,
  questions: GoldenQuestion[],
  opts: RunOptions = {},
): Promise<QuestionResult[]> {
  const rows: QuestionResult[] = [];
  for (const q of questions) {
    let row: QuestionResult;
    try {
      const { answer, sources } = await target.ask(q.question);
      row = gradeAnswer(q, answer, sources);
    } catch (err) {
      row = gradeFailure(q, err);
    }
    rows.push(row);
    opts.onProgress?.(row);
  }
  return rows;
}
