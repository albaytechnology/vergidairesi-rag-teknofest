/** Dokuman gerektirmeyen sohbet mesajlari. */
import { ollama } from "../../common/ollama.ts";
import { CHITCHAT_PROMPT } from "../prompts/answering.ts";
import type { AgentStateType } from "../state.ts";

export async function chitchatNode(state: AgentStateType) {
  const answer = await ollama.chat([
    { role: "system", content: CHITCHAT_PROMPT },
    { role: "user", content: state.question },
  ]);
  return { answer, sources: [], trace: ["chitchat → cevap"] };
}
