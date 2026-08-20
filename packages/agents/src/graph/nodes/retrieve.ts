/** Kurum korpusundan parca getirir; varlik sorgusunda iki asamali dener. */
import { hybridSearch, type SearchHit } from "@albay/retrieval";
import type { AgentStateType } from "../state.ts";

export async function retrieveNode(state: AgentStateType) {
  // Varlik sorgusunda once entity filtresiyle dene; az sonuc gelirse genel ara
  let hits: SearchHit[] = [];
  if (state.intent === "entity" && state.entity) {
    hits = await hybridSearch(state.searchQuery, {
      topK: 10,
      filters: { entity: state.entity, includePII: true },
    });
    if (hits.length < 3) {
      const general = await hybridSearch(`${state.entity} ${state.searchQuery}`, {
        topK: 10,
        filters: { includePII: true },
      });
      const seen = new Set(hits.map((h) => h.chunkId));
      hits = [...hits, ...general.filter((h) => !seen.has(h.chunkId))].slice(0, 10);
    }
  } else {
    hits = await hybridSearch(state.searchQuery, {
      topK: state.intent === "doc_find" ? 12 : 8,
      filters: { includePII: true },
    });
  }
  return {
    hits,
    trace: [`retrieve → ${hits.length} parca (sorgu: "${state.searchQuery}")`],
  };
}
