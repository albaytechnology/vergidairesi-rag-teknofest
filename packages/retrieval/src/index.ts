export {
  encodeSparse,
  tokenize,
  termId,
  type SparseVector,
} from "./sparse.ts";
export {
  hybridSearch,
  type SearchHit,
  type SearchOptions,
  type SearchFilters,
} from "./search.ts";
export {
  client,
  ensureCollection,
  upsertChunkPoints,
  upsertChunkPointsToCollection,
  deleteByDocId,
  deletePoints,
  pointIdsByDocId,
  distinctDocIds,
  collectionExists,
  collectionInfo,
  type ChunkPoint,
} from "./qdrant.ts";
