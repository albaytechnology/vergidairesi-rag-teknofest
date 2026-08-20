export interface SearchFilters {
  docType?: string;
  /** true verilirse PII iceren dokumanlar DAHIL edilir (yetkili kullanici). Varsayilan: haric. */
  includePII?: boolean;
  entity?: string;
  docId?: string;
}

/** Aramanin dondurdugu parca — cevap uretimi yalnizca bu alanlara guvenir. */
export interface SearchHit {
  chunkId: string;
  score: number;
  filename: string;
  path: string;
  docId: string;
  docType: string | null;
  section: string | null;
  page: number | null;
  parentId: string | null;
  metadata: Record<string, unknown>;
  text: string;
}

export interface SearchOptions {
  /** RRF fuzyonundan kac aday cikarilacak (rerank oncesi havuz) */
  candidates?: number;
  /** Nihai sonuc sayisi */
  topK?: number;
  filters?: SearchFilters;
  /** Reranker'i devre disi birak (RERANKER_URL tanimli olsa bile) */
  skipRerank?: boolean;
  collection?: string;
}
