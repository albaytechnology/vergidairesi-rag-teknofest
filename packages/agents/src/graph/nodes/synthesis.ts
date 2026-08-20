/** Parcalardan sentezlenmis, atifli cevap uretir. */
import { buildContext, uniqueSources } from "../../common/context.ts";
import { NOT_FOUND_ANSWER } from "../../common/not-found.ts";
import { ollama } from "../../common/ollama.ts";
import { SYNTHESIS_PROMPT } from "../prompts/answering.ts";
import type { AgentStateType } from "../state.ts";

export async function synthesisNode(state: AgentStateType) {
  if (!state.hits.length) {
    return { answer: NOT_FOUND_ANSWER, sources: [], trace: ["synthesis → sonuc yok"] };
  }
  const answer = await ollama.chat([
    { role: "system", content: SYNTHESIS_PROMPT },
    {
      role: "user",
      content: `Soru: ${state.question}\n\nDokuman parcalari:\n${buildContext(state.hits)}`,
    },
  ]);
  return { answer, sources: uniqueSources(state.hits), trace: ["synthesis → cevap uretildi"] };
}
