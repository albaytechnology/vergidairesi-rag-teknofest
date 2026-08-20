/** LangGraph durumu — tum node'larin okudugu/yazdigi ortak alan. */
import { Annotation } from "@langchain/langgraph";
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";

export const AgentState = Annotation.Root({
  question: Annotation<string>,
  intent: Annotation<"entity" | "doc_find" | "synthesis" | "service_routing" | "chitchat">,
  entity: Annotation<string | null>,
  searchQuery: Annotation<string>,
  hits: Annotation<SearchHit[]>,
  answer: Annotation<string>,
  sources: Annotation<string[]>,
  retries: Annotation<number>,
  routingDecision: Annotation<ServiceRoutingDecision | null>,
  /** Grader'in dayanaksiz buldugu servisler — ikinci denemede tekrar onerilmemeli. */
  rejectedServices: Annotation<string[]>({
    reducer: (a, b) => [...new Set([...(a ?? []), ...b])],
    default: () => [],
  }),
  graderDecision: Annotation<"pass" | "retry" | "fail" | null>,
  trace: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentState.State;
