/**
 * Arama katmani — RAG'in "R"si.
 *
 * Qdrant'in var oldugunu bilen TEK paket burasi; disari yalnizca bu yuzey
 * acilir, tuketiciler alt yollari import etmez.
 *
 *   sparse/      metni BM25 sparse vektorune ceviren kodlayici
 *   collection/  indeksin kurulmasi, yazilmasi, denetlenmesi (yazma tarafi)
 *   search/      sorgudan sonuca giden yol (okuma tarafi)
 *   client.ts    paylasilan Qdrant istemcisi ve sayfali gezinme
 */
export { tokenize } from "./sparse/tokenize.ts";
export { encodeSparse, termId, type SparseVector } from "./sparse/encode.ts";

export { client, collectionExists, collectionInfo } from "./client.ts";
export { ensureCollection } from "./collection/schema.ts";
export {
  upsertChunkPoints,
  upsertChunkPointsToCollection,
  deleteByDocId,
  deletePoints,
  type ChunkPoint,
} from "./collection/points.ts";
export { pointIdsByDocId, distinctDocIds } from "./collection/inspect.ts";

export { hybridSearch } from "./search/hybrid.ts";
export type { SearchHit, SearchOptions, SearchFilters } from "./search/types.ts";
