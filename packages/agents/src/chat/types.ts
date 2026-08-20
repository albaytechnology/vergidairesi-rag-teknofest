/** Evrak sohbetinin girdi/olay sozlesmeleri (SSE tarafi bunlari tuketir). */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskStreamOptions {
  /** Verilirse retrieval bu belgeye kilitlenir. */
  docId?: string;
  /** Oturuma ozel yuklenmis ek dokumanlar (gecici RAG). */
  extraDocIds?: string[];
  /** Onceki mesajlar (kronolojik). */
  history?: ChatTurn[];
  topK?: number;
}

export type ChatEvent =
  | { type: "trace"; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[]; hits: { filename: string; page: number | null }[] }
  | { type: "done"; answer: string }
  | { type: "error"; message: string };
