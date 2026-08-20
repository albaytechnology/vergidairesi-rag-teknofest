/** Sorguyu siniflandirir ve retrieval sorgusunu hazirlar. */
import { ollama } from "../../common/ollama.ts";
import { ROUTER_PROMPT, ROUTER_SCHEMA } from "../prompts/router.ts";
import type { AgentStateType } from "../state.ts";

export async function routerNode(state: AgentStateType) {
  const raw = await ollama.chat(
    [
      { role: "system", content: ROUTER_PROMPT },
      { role: "user", content: state.question },
    ],
    { format: ROUTER_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );
  const parsed = JSON.parse(raw) as {
    intent: AgentStateType["intent"];
    entity?: string;
    searchQuery: string;
  };
  return {
    intent: parsed.intent,
    entity: parsed.entity?.trim() || null,
    searchQuery: parsed.searchQuery || state.question,
    retries: 0,
    trace: [`router → ${parsed.intent}${parsed.entity ? ` (varlik: ${parsed.entity})` : ""}`],
  };
}
