/**
 * Dokuman arama: liste GERCEK arama sonuclarindan kurulur, LLM yalnizca
 * her dokumanin ne oldugunu aciklar. Bu yuzden grader'a gerek yok.
 */
import type { SearchHit } from "@albay/retrieval";
import { NOT_FOUND_ANSWER } from "../../common/not-found.ts";
import { ollama } from "../../common/ollama.ts";
import { DOCFINDER_PROMPT } from "../prompts/answering.ts";
import type { AgentStateType } from "../state.ts";

export async function docFinderNode(state: AgentStateType) {
  if (!state.hits.length) {
    return { answer: NOT_FOUND_ANSWER, sources: [], trace: ["docfinder → sonuc yok"] };
  }
  const docs = groupByDocument(state.hits);

  const docList = docs
    .map(([filename, d], i) => {
      const sample = d.hits[0]!.text.replace(/^\[.*?\]\n/, "").slice(0, 400);
      return `${i + 1}. ${filename} (${d.hits[0]!.path})\n   Ornek icerik: ${sample}`;
    })
    .join("\n\n");

  const descriptions = await ollama.chat([
    { role: "system", content: DOCFINDER_PROMPT },
    { role: "user", content: `Aranan: ${state.question}\n\nBulunan dokumanlar:\n${docList}` },
  ]);

  const answer =
    `"${state.question}" ile ilgili ${docs.length} dokuman bulundu:\n\n${descriptions}\n\n` +
    `Kaynaklar:\n${docs.map(([f, d]) => `- ${f} (${d.hits[0]!.path})`).join("\n")}`;

  return {
    answer,
    sources: docs.map(([f]) => f),
    trace: [`docfinder → ${docs.length} dokuman listelendi`],
  };
}

/** Parcalari dokuman duzeyinde gruplar, en iyi skora gore siralar. */
function groupByDocument(hits: SearchHit[]): [string, { hits: SearchHit[]; bestScore: number }][] {
  const byDoc = new Map<string, { hits: SearchHit[]; bestScore: number }>();
  for (const h of hits) {
    const entry = byDoc.get(h.filename) ?? { hits: [], bestScore: 0 };
    entry.hits.push(h);
    entry.bestScore = Math.max(entry.bestScore, h.score);
    byDoc.set(h.filename, entry);
  }
  return [...byDoc.entries()].sort((a, b) => b[1].bestScore - a[1].bestScore);
}
