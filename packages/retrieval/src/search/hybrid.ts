/**
 * Hybrid arama: dense (bge-m3) + sparse (BM25) -> Qdrant RRF fuzyonu
 * -> (opsiyonel) cross-encoder rerank -> topK.
 *
 * Iki bacak birlikte gerekiyor: dense tek basina "A133-U" gibi tam kod/sayi
 * eslesmelerini kaciriyor, sparse tek basina esanlamli ifadeleri.
 */
import { config } from "@albay/shared";
import { OllamaClient } from "@albay/llm";
import { client } from "../client.ts";
import { encodeSparse } from "../sparse/encode.ts";
import { buildFilter } from "./filters.ts";
import { rerank } from "./rerank.ts";
import type { SearchHit, SearchOptions } from "./types.ts";

const ollama = new OllamaClient();

export async function hybridSearch(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const {
    candidates = 30,
    topK = 8,
    filters,
    skipRerank = false,
    collection = config.QDRANT_COLLECTION,
  } = opts;

  const [denseVec] = await ollama.embed([query]);
  const sparseVec = encodeSparse(query);
  const filter = buildFilter(filters);

  const res = await client.query(collection, {
    prefetch: [
      { query: denseVec!, using: "dense", limit: candidates, filter },
      {
        query: { indices: sparseVec.indices, values: sparseVec.values },
        using: "sparse",
        limit: candidates,
        filter,
      },
    ],
    query: { fusion: "rrf" },
    limit: candidates,
    with_payload: true,
  });

  let hits = res.points.map(toSearchHit);

  if (!skipRerank && config.RERANKER_URL && hits.length > 1) {
    hits = await rerank(query, hits);
  }

  return hits.slice(0, topK);
}

/** Qdrant payload'ini aramanin dis sozlesmesine cevirir. */
function toSearchHit(p: { id: string | number; score?: number; payload?: unknown }): SearchHit {
  const pl = (p.payload ?? {}) as Record<string, unknown>;
  return {
    chunkId: String(p.id),
    score: p.score ?? 0,
    filename: String(pl.filename ?? ""),
    path: String(pl.path ?? ""),
    docId: String(pl.doc_id ?? ""),
    docType: (pl.doc_type as string) ?? null,
    section: (pl.section as string) ?? null,
    page: (pl.page as number) ?? null,
    parentId: (pl.parent_id as string) ?? null,
    metadata: (pl.metadata as Record<string, unknown>) ?? {},
    text: String(pl.text ?? ""),
  };
}
