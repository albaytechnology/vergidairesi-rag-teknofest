/**
 * Korpus genelinde calisan multi-agent akis: router → (retrieve →) ajan → grader.
 *
 * Belge kapsamli sohbet icin chat/ altindaki akis kullanilir; ikisi ayni yapi
 * taslarini paylasir ama farkli problemleri cozer.
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { NOT_FOUND_ANSWER } from "../common/not-found.ts";
import { routeAfterGrader, routeAfterRetrieve, routeByIntent } from "./edges.ts";
import { chitchatNode } from "./nodes/chitchat.ts";
import { docFinderNode } from "./nodes/docfinder.ts";
import { entityNode } from "./nodes/entity.ts";
import { graderNode } from "./nodes/grader.ts";
import { retrieveNode } from "./nodes/retrieve.ts";
import { routerNode } from "./nodes/router.ts";
import { routingNode } from "./nodes/routing.ts";
import { synthesisNode } from "./nodes/synthesis.ts";
import { AgentState } from "./state.ts";

export function buildGraph() {
  const g = new StateGraph(AgentState)
    .addNode("router", routerNode)
    .addNode("retrieve", retrieveNode)
    .addNode("routing", routingNode)
    .addNode("entity_agent", entityNode)
    .addNode("docfinder", docFinderNode)
    .addNode("synthesis", synthesisNode)
    .addNode("chitchat", chitchatNode)
    .addNode("grader", graderNode)
    .addEdge(START, "router")
    .addConditionalEdges("router", routeByIntent, {
      chitchat: "chitchat",
      routing: "routing",
      retrieve: "retrieve",
    })
    .addConditionalEdges("retrieve", routeAfterRetrieve, {
      entity: "entity_agent",
      docfinder: "docfinder",
      synthesis: "synthesis",
    })
    .addEdge("entity_agent", "grader")
    .addEdge("synthesis", "grader")
    .addEdge("routing", "grader")
    .addEdge("docfinder", END) // liste gercek sonuclardan — grader'a gerek yok
    .addEdge("chitchat", END)
    .addConditionalEdges("grader", routeAfterGrader, {
      retry: "retrieve",
      retry_routing: "routing",
      [END]: END,
    });

  return g.compile();
}

export interface AskResult {
  answer: string;
  sources: string[];
  intent: string;
  trace: string[];
}

/** Tek soruluk kullanim — CLI ve eval icin. */
export async function ask(question: string): Promise<AskResult> {
  const graph = buildGraph();
  const result = await graph.invoke(
    { question },
    { recursionLimit: 12 },
  );
  return {
    answer: result.answer ?? NOT_FOUND_ANSWER,
    sources: result.sources ?? [],
    intent: result.intent ?? "?",
    trace: result.trace ?? [],
  };
}
