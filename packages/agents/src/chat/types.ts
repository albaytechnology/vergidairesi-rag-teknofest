/** Evrak sohbetinin girdi/olay sozlesmeleri (SSE tarafi bunlari tuketir). */
import type { DocumentGap, ExtractedEntities } from "@albay/shared";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Sistemin evrak icin urettigi kayit — arayuzdeki "Belge detayi" panelinin
 * gosterdigi bilgilerin ayni kaynagi. Evrakin metninde YAZMAZ; analiz ve
 * yonlendirme adimlarinin ciktisidir.
 */
export interface DocumentRecord {
  filename: string;
  konu: string | null;
  ozet: string | null;
  docType: string | null;
  entities: ExtractedEntities | null;
  yasamDongusu: string;
  /** Eksik bilgi taramasinin bulgulari; null ise evrak taranmamis. */
  eksikler: DocumentGap[] | null;
  routing: {
    birim: string | null;
    servis: string | null;
    guvenSkoru: number | null;
    gerekce: string | null;
    maddeler: { maddeNo: string; baslik: string }[];
  };
}

export interface AskStreamOptions {
  /** Verilirse retrieval bu belgeye kilitlenir. */
  docId?: string;
  /** Oturuma ozel yuklenmis ek dokumanlar (gecici RAG). */
  extraDocIds?: string[];
  /** Onceki mesajlar (kronolojik). */
  history?: ChatTurn[];
  /** Belge detay panelindeki bilgiler — ozet, cikarilan alanlar, yonlendirme karari. */
  record?: DocumentRecord;
  topK?: number;
}

export type ChatEvent =
  | { type: "trace"; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[]; hits: { filename: string; page: number | null }[] }
  | { type: "done"; answer: string }
  | { type: "error"; message: string };
