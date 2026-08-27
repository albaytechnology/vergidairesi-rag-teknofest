/**
 * Ingestion katmani — evragin kuruma girisinden arsivlenmesine kadarki kaydi.
 *
 * Postgres'in var oldugunu bilen TEK paket burasi; disari yalnizca bu yuzey
 * acilir, tuketiciler alt yollari import etmez.
 *
 *   parse/      docling-serve ile dosyadan Markdown + yapisal JSON
 *   db/         havuz ve sema (migrations/ altinda faz faz adimlar)
 *   documents/  evrak satiri: kayit, siniflandirma, analiz, yasam dongusu, arsiv
 *   chunks/     parcalarin yazilmasi ve embed kuyrugu
 *   routing/    servis yonlendirmesi: karar, havuzlar, katalog, tutarlilik denetimi
 *   chat/       belge bazli sohbet gecmisi
 *   letters/    uretilen cevap yazilari ve giden evrak numarasi
 *   sessions/   sohbete aticlanan gecici ekler
 */

// ─── parse ────────────────────────────────────────────────────────────
export { DoclingClient } from "./parse/docling.ts";
export type { DoclingResult } from "./parse/types.ts";

// ─── db ───────────────────────────────────────────────────────────────
export { pool } from "./db/pool.ts";
export { migrate } from "./db/migrate.ts";

// ─── documents ────────────────────────────────────────────────────────
export {
  upsertDocument,
  setStatus,
  setDocumentCorpus,
  getDocumentDetail,
  statusCounts,
} from "./documents/store.ts";
export { docsToClassify, saveClassification, type DocToClassify } from "./documents/classify.ts";
export {
  saveDocumentKunye,
  saveDocumentSummary,
  documentAnalysisFromRow,
} from "./documents/analysis.ts";
export { saveDocumentGaps, docsToScanGaps, type DocToScanGaps } from "./documents/gaps.ts";
export { setLifecycleStatus, type LifecycleStatus } from "./documents/lifecycle.ts";
export { listArchiveDocuments, archiveCounts } from "./documents/archive.ts";
export type { DocStatus, DocumentRow, DocumentDetail } from "./documents/types.ts";

// ─── chunks ───────────────────────────────────────────────────────────
export { replaceChunks, chunkCounts } from "./chunks/store.ts";
export {
  chunksToEmbed,
  chunksToEmbedForDoc,
  markEmbedded,
  resetEmbeddings,
} from "./chunks/embedding.ts";
export type { ChunkInsert, ChunkToEmbed } from "./chunks/types.ts";

// ─── routing ──────────────────────────────────────────────────────────
export { saveRoutingDecision } from "./routing/decisions.ts";
export {
  serviceQueueCounts,
  listDocumentsByService,
  type ServiceQueueRow,
} from "./routing/queues.ts";
export { regulationServices, isRegulationService } from "./routing/catalog.ts";
export { routingInconsistencies, type RoutingConsistencyRow } from "./routing/audit.ts";

// ─── chat ─────────────────────────────────────────────────────────────
export {
  appendChatMessage,
  appendChatExchange,
  getChatHistory,
  type ChatMessageRow,
  type ChatLetterIntent,
} from "./chat/history.ts";

// ─── letters ──────────────────────────────────────────────────────────
export {
  nextLetterNo,
  saveResponseLetter,
  listResponseLetters,
  getResponseLetter,
  type ResponseLetterRow,
} from "./letters/store.ts";

// ─── sessions ─────────────────────────────────────────────────────────
export { markSessionUpload, sessionDocumentIds } from "./sessions/uploads.ts";
