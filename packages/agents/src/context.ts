import type { SearchHit } from "@albay/retrieval";

/**
 * Getirilen parcalari LLM'e verilecek numarali baglama cevirir.
 * Numaralandirma [n] atif desenine karsilik gelir — parca sirasi ile atif
 * numarasi birebir ayni olmali (bkz. SYNTHESIS_PROMPT ve GRADER_PROMPT).
 */
export function buildContext(hits: SearchHit[]): string {
  return hits
    .map(
      (h, i) =>
        `--- Parca ${i + 1} (${h.filename}${h.page != null ? `, s.${h.page}` : ""}) ---\n${h.text}`,
    )
    .join("\n\n");
}

export function uniqueSources(hits: SearchHit[]): string[] {
  return [...new Set(hits.map((h) => h.filename))];
}
