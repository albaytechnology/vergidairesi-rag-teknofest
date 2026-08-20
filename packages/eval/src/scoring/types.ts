import type { Scenario } from "../golden/types.ts";

/**
 * Tek bir sorunun puan karnesi.
 *
 * Alanlar uc degerli: true/false olcum sonucu, null ise "bu soruda bu boyut
 * olculmuyor". Ozet hesabi null'lari paydadan tamamen disarida birakir.
 */
export interface QuestionResult {
  id: string;
  scenario: Scenario | string;
  /** Beklenen dokumanlardan en az biri kaynaklarda gecti mi? */
  sourceHit: boolean | null;
  /** Tuzak soruda sistem "bilmiyorum" diyebildi mi? */
  trapPassed: boolean | null;
  /** Beklenen ifadelerin HEPSI cevapta gecti mi? */
  answerHit: boolean | null;
  /** Yasak ifadelerden biri cevapta gecti mi? (true = kotu) */
  forbiddenHit: boolean | null;
  answerSnippet: string;
}

/** Butun sorulardan cikan oranlar; 0-1 arasi. */
export interface EvalSummary {
  sourceRecall: number;
  trapRate: number;
  answerRate: number;
  /** Yasak ifadeye DUSMEME orani — yuksek olmasi iyi. */
  forbiddenRate: number;
}
