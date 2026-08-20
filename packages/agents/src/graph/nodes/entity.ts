/** Bir kisi/kurum hakkindaki bilgileri toplayip ozetler. */
import { buildContext, uniqueSources } from "../../common/context.ts";
import { NOT_FOUND_ANSWER } from "../../common/not-found.ts";
import { ollama } from "../../common/ollama.ts";
import { ENTITY_PROMPT } from "../prompts/answering.ts";
import type { AgentStateType } from "../state.ts";

export async function entityNode(state: AgentStateType) {
  if (!state.hits.length) {
    return { answer: NOT_FOUND_ANSWER, sources: [], trace: ["entity → sonuc yok"] };
  }
  const answer = await ollama.chat([
    { role: "system", content: ENTITY_PROMPT },
    {
      role: "user",
      content: `Varlik: ${state.entity ?? state.question}\nSoru: ${state.question}\n\nDokuman parcalari:\n${buildContext(state.hits)}`,
    },
  ]);
  return { answer, sources: uniqueSources(state.hits), trace: ["entity → cevap uretildi"] };
}
