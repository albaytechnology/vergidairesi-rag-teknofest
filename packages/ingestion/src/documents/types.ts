import type { Corpus, ExtractedEntities } from "@albay/shared";
import type { LifecycleStatus } from "./lifecycle.ts";

/** Parse hattinin durumu — is akisi durumu icin bkz. LifecycleStatus. */
export type DocStatus = "pending" | "parsing" | "parsed" | "failed";

export interface DocumentRow {
  id: string;
  path: string;
  filename: string;
  format: string;
  size_bytes: string;
  hash: string;
  status: DocStatus;
  parsed_md_path: string | null;
  docling_json_path: string | null;
  error: string | null;
}

/** Analiz, yonlendirme ve yasam dongusu alanlariyla birlikte tam satir. */
export interface DocumentDetail extends DocumentRow {
  corpus: Corpus;
  doc_subject: string | null;
  doc_summary_long: string | null;
  doc_title_suggestion: string | null;
  islem_turu: string | null;
  alacak_turu: string | null;
  analyzed_at: string | null;
  classification_confidence: number | null;
  extracted_entities: ExtractedEntities | null;
  doc_type: string | null;
  contains_pii: boolean | null;
  routed_birim: string | null;
  routed_service: string | null;
  routing_confidence: number | null;
  routing_reasoning: string | null;
  routing_regulation_refs: { maddeNo: string; baslik: string }[] | null;
  routing_status: string;
  lifecycle_status: LifecycleStatus;
  completed_at: string | null;
  created_at: string;
}
