import type { EvalSummary, QuestionResult } from "./types.ts";

/**
 * Olculmeyen (null) boyutlari paydadan disarida birakarak oran hesaplar.
 * Hic olcum yoksa varsayilan doner — 0/0 yerine anlamli bir taban.
 */
function rate(
  rows: QuestionResult[],
  field: keyof QuestionResult,
  passes: (value: boolean) => boolean,
  emptyValue: number,
): number {
  const measured = rows.filter((r) => r[field] !== null);
  if (!measured.length) return emptyValue;
  return measured.filter((r) => passes(r[field] as boolean)).length / measured.length;
}

const pass = (v: boolean) => v;
const fail = (v: boolean) => !v;

export function summarize(rows: QuestionResult[]): EvalSummary {
  return {
    sourceRecall: rate(rows, "sourceHit", pass, 0),
    trapRate: rate(rows, "trapPassed", pass, 0),
    answerRate: rate(rows, "answerHit", pass, 0),
    // forbiddenHit'te "true" kotu haber: temiz gecen sorulari sayiyoruz.
    // Hic yasak ifade tanimlanmamissa ihlal de yok, taban 1.
    forbiddenRate: rate(rows, "forbiddenHit", fail, 1),
  };
}
