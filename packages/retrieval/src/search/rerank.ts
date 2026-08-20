import { config } from "@albay/shared";
import type { SearchHit } from "./types.ts";

/**
 * TEI reranker (bge-reranker-v2-m3): adaylari sorguya gore yeniden siralar.
 *
 * Istege bagli bir iyilestirme oldugu icin hata yolunda CALISMAYI SURDURUR:
 * servis dususe RRF sirasi kullanilir, arama komple kaybedilmez.
 */
export async function rerank(query: string, hits: SearchHit[]): Promise<SearchHit[]> {
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
