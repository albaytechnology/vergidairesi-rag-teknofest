import { isNotFoundAnswer } from "@albay/agents";
import type { GoldenQuestion } from "../golden/types.ts";
import { containsAll, containsAny, matchesAnySource } from "./match.ts";
import type { QuestionResult } from "./types.ts";

const SNIPPET_LEN = 80;

function snippet(text: string): string {
  return text.slice(0, SNIPPET_LEN).replace(/\n/g, " ");
}

/** Hedefin verdigi cevabi sorunun beklentileriyle karsilastirir. */
export function gradeAnswer(
  q: GoldenQuestion,
  answer: string,
  sources: string[],
): QuestionResult {
  const forbidden = q.expectedAnswerNotContains ?? [];
  return {
    id: q.id,
    scenario: q.scenario,
    sourceHit: q.expectedDocs.length ? matchesAnySource(sources, q.expectedDocs) : null,
    // Tuzak sorularda tek basari olcutu "bilmiyorum" diyebilmek; kalip listesi
    // ve TR-normalizasyon agents paketinde tek yerden yonetiliyor.
    trapPassed: q.scenario === "trap" ? isNotFoundAnswer(answer) : null,
    answerHit: q.expectedAnswerContains.length
      ? containsAll(answer, q.expectedAnswerContains)
      : null,
    forbiddenHit: forbidden.length ? containsAny(answer, forbidden) : null,
    answerSnippet: snippet(answer),
  };
}

/**
 * Hedef hata firlattiginda kullanilan karne.
 *
 * Hata "olculmedi" degil "basarisiz" sayilir: cevap veremeyen sistem, yanlis
 * cevap veren sistemden daha iyi puan almamali.
 */
export function gradeFailure(q: GoldenQuestion, err: unknown): QuestionResult {
  return {
    id: q.id,
    scenario: q.scenario,
    sourceHit: q.expectedDocs.length ? false : null,
    trapPassed: q.scenario === "trap" ? false : null,
    answerHit: q.expectedAnswerContains.length ? false : null,
    forbiddenHit: null,
    answerSnippet: `HATA: ${(err as Error).message}`,
  };
}
