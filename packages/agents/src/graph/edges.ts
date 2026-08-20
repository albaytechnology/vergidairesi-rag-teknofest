/** Kosullu gecisler — hangi node'dan sonra nereye gidilecegi. */
import { END } from "@langchain/langgraph";
import type { AgentStateType } from "./state.ts";

export function routeByIntent(state: AgentStateType): string {
  if (state.intent === "chitchat") return "chitchat";
  if (state.intent === "service_routing") return "routing";
  return "retrieve";
}

export function routeAfterRetrieve(state: AgentStateType): string {
  switch (state.intent) {
    case "entity":
      return "entity";
    case "doc_find":
      return "docfinder";
    default:
      return "synthesis";
  }
}

export function routeAfterGrader(state: AgentStateType): string {
  if (state.graderDecision !== "retry") return END;
  // Yonlendirme ayri koleksiyonda arar — retry'i retrieve'e degil routing'e dondur,
  // aksi halde ikinci deneme yanlis korpusta ve yanlis node'da biter.
  return state.intent === "service_routing" ? "retry_routing" : "retry";
}
