/** Golden set senaryolari — her biri sistemin farkli bir yetenegini olcer. */
export type Scenario =
  | "entity"
  | "doc_find"
  | "synthesis"
  | "service_routing"
  | "trap";

/**
 * Golden set'teki tek bir soru.
 *
 * Beklenti alanlarinin BOS birakilabilmesi bilerek: her soru her boyutu
 * olcmez. Bos birakilan alan "bu soruda bu boyut degerlendirilmez" demektir,
 * "basarisiz" degil — puanlama bunu null olarak isler.
 */
export interface GoldenQuestion {
  id: string;
  scenario: Scenario;
  question: string;
  /** Kaynaklarda gecmesi beklenen dosya adlari; en az biri yeterli. */
  expectedDocs: string[];
  /** Cevapta gecmesi beklenen ifadeler; HEPSI gecmeli. */
  expectedAnswerContains: string[];
  /** Cevapta gecmemesi gereken ifadeler; biri bile gecerse basarisiz. */
  expectedAnswerNotContains?: string[];
  notes?: string;
}

export interface GoldenSet {
  questions: GoldenQuestion[];
}
