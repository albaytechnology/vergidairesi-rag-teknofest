import { config } from "@albay/shared";
import { OllamaClient } from "@albay/llm";
import { client } from "./qdrant.ts";
import { encodeSparse } from "./sparse.ts";

export interface SearchFilters {
  docType?: string;
  /** true verilirse PII iceren dokumanlar DAHIL edilir (yetkili kullanici). Varsayilan: haric. */
  includePII?: boolean;
  entity?: string;
  docId?: string;
}

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

const ollama = new OllamaClient();

function buildFilter(f?: SearchFilters): Record<string, unknown> | undefined {
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  if (f?.docType) must.push({ key: "doc_type", match: { value: f.docType } });
  if (f?.entity) must.push({ key: "entities", match: { value: f.entity } });
  if (f?.docId) must.push({ key: "doc_id", match: { value: f.docId } });
  if (!f?.includePII) mustNot.push({ key: "contains_pii", match: { value: true } });
  if (!must.length && !mustNot.length) return undefined;
  return {
    ...(must.length ? { must } : {}),
    ...(mustNot.length ? { must_not: mustNot } : {}),
  };
}

/**
 * Hybrid arama: dense (bge-m3) + sparse (BM25) -> Qdrant RRF fuzyonu
 * -> (opsiyonel) cross-encoder rerank -> topK.
 */
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

  let hits: SearchHit[] = res.points.map((p) => {
    const pl = p.payload as Record<string, unknown>;
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
  });

  if (!skipRerank && config.RERANKER_URL && hits.length > 1) {
    hits = await rerank(query, hits);
  }

  return hits.slice(0, topK);
}

/** TEI reranker (bge-reranker-v2-m3): adaylari sorguya gore yeniden siralar. */
async function rerank(query: string, hits: SearchHit[]): Promise<SearchHit[]> {
  const base = config.RERANKER_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}/rerank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      texts: hits.map((h) => h.text.slice(0, 2000)),
    }),
  });
  if (!res.ok) {
    console.warn(`Reranker hatasi (${res.status}) — RRF sirasi kullaniliyor`);
    return hits;
  }
  const ranked = (await res.json()) as { index: number; score: number }[];
  return ranked
    .map((r) => ({ ...hits[r.index]!, score: r.score }))
    .sort((a, b) => b.score - a.score);
}
