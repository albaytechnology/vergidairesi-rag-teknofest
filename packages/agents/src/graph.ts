import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { OllamaClient } from "@albay/llm";
import { config, type ServiceRoutingDecision } from "@albay/shared";
import { hybridSearch, type SearchHit } from "@albay/retrieval";
import {
  ROUTER_PROMPT,
  ROUTER_SCHEMA,
  ROUTING_NOT_DETERMINED,
  ENTITY_PROMPT,
  DOCFINDER_PROMPT,
  SYNTHESIS_PROMPT,
  GRADER_PROMPT,
  GRADER_SCHEMA,
  REWRITE_PROMPT,
  CHITCHAT_PROMPT,
  NOT_FOUND_ANSWER,
  isNotFoundAnswer,
} from "./prompts.ts";
import { buildContext, uniqueSources } from "./context.ts";
import {
  routeOnce,
  gradeRouting,
  formatRoutingDecision,
  sameService,
} from "./routing.ts";

const ollama = new OllamaClient();

// ─── State ────────────────────────────────────────────────────────────

const AgentState = Annotation.Root({
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

// ─── Yardimcilar ──────────────────────────────────────────────────────

// ─── Node'lar ─────────────────────────────────────────────────────────

async function routerNode(state: AgentStateType) {
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

async function retrieveNode(state: AgentStateType) {
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

async function routingNode(state: AgentStateType) {
  const { decision, hits, trace } = await routeOnce({
    metin: state.question,
    aramaSorgusu: state.searchQuery,
    elenenServisler: state.rejectedServices,
  });

  return {
    hits,
    routingDecision: decision,
    answer: formatRoutingDecision(decision, hits),
    // Karar dayanaksizsa kaynak gostermek yaniltici olur — bos birak.
    sources: decision.belirlenemedi ? [] : uniqueSources(hits),
    trace,
  };
}

/**
 * Yonlendirme kararinin grounding denetimi. Madde atiflari zaten routingNode'da
 * deterministik dogrulandi; burada LLM'e SERVIS GOREV TANIMI eslesmesi sorulur.
 */
async function routingGrader(state: AgentStateType) {
  const decision = state.routingDecision;
  if (!decision || decision.belirlenemedi || state.answer.startsWith(ROUTING_NOT_DETERMINED)) {
    return {
      graderDecision: "pass" as const,
      trace: ["grader → 'belirlenemedi' karari, dogru davranis olarak gecildi"],
    };
  }

  const verdict = await gradeRouting({
    metin: state.question,
    decision,
    hits: state.hits,
    kararMetni: state.answer,
  });

  if (verdict.onaylandi) {
    return {
      graderDecision: "pass" as const,
      trace: [`grader → yonlendirme onaylandi (${verdict.reason})`],
    };
  }

  const reddedilen = decision.servis ? [decision.servis] : [];

  // Bir kez daha dene — reddedilen servisi bu kez elemeye alarak
  if (state.retries < 1) {
    const newQuery = await ollama.chat([
      { role: "system", content: REWRITE_PROMPT },
      { role: "user", content: `Soru: ${state.question}\nEski sorgu: ${state.searchQuery}` },
    ]);
    return {
      retries: state.retries + 1,
      searchQuery: newQuery.trim().replace(/^["']|["']$/g, ""),
      rejectedServices: reddedilen,
      graderDecision: "retry" as const,
      trace: [
        `grader → ${decision.servis ?? "karar"} reddedildi (${verdict.reason});` +
          " sorgu yeniden yazildi, servis elendi",
      ],
    };
  }
  return {
    answer: `${ROUTING_NOT_DETERMINED}\n\nGerekce: ${verdict.reason}`,
    sources: [],
    routingDecision: null,
    rejectedServices: reddedilen,
    graderDecision: "fail" as const,
    trace: [`grader → ikinci deneme de reddedildi (${verdict.reason}); 'belirlenemedi' donuldu`],
  };
}

async function entityNode(state: AgentStateType) {
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

async function docFinderNode(state: AgentStateType) {
  if (!state.hits.length) {
    return { answer: NOT_FOUND_ANSWER, sources: [], trace: ["docfinder → sonuc yok"] };
  }
  // Dokuman duzeyinde grupla — liste GERCEK sonuclardan, LLM sadece aciklama yazar
  const byDoc = new Map<string, { hits: SearchHit[]; bestScore: number }>();
  for (const h of state.hits) {
    const entry = byDoc.get(h.filename) ?? { hits: [], bestScore: 0 };
    entry.hits.push(h);
    entry.bestScore = Math.max(entry.bestScore, h.score);
    byDoc.set(h.filename, entry);
  }
  const docs = [...byDoc.entries()].sort((a, b) => b[1].bestScore - a[1].bestScore);

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

async function synthesisNode(state: AgentStateType) {
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

async function chitchatNode(state: AgentStateType) {
  const answer = await ollama.chat([
    { role: "system", content: CHITCHAT_PROMPT },
    { role: "user", content: state.question },
  ]);
  return { answer, sources: [], trace: ["chitchat → cevap"] };
}

async function graderNode(state: AgentStateType) {
  // Yonlendirme kararlarinin denetimi farkli: madde atiflari deterministik
  // dogrulandi, kalan soru servis gorev tanimi eslesmesi.
  if (state.intent === "service_routing") return routingGrader(state);

  // Cevap zaten "bilgi yok" diyorsa (herhangi bir kalipta) denetime gerek yok —
  // uydurma riski yok, dogru davranis bu.
  if (isNotFoundAnswer(state.answer)) {
    return {
      graderDecision: "pass" as const,
      trace: ["grader → cevap 'bilgi yok' turunde, denetim atlandi"],
    };
  }
  const raw = await ollama.chat(
    [
      { role: "system", content: GRADER_PROMPT },
      {
        role: "user",
        content: `Soru: ${state.question}\n\nParcalar:\n${buildContext(state.hits)}\n\nUretilen cevap:\n${state.answer}`,
      },
    ],
    { format: GRADER_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );
  const verdict = JSON.parse(raw) as {
    grounded: boolean;
    sufficient: boolean;
    reason: string;
  };

  if (verdict.grounded) {
    return {
      graderDecision: "pass" as const,
      trace: [`grader → onaylandi (${verdict.reason})`],
    };
  }

  // Corrective-RAG: bir kez sorgu yeniden yazip tekrar dene, sonra pes et
  if (state.retries < 1) {
    const newQuery = await ollama.chat([
      { role: "system", content: REWRITE_PROMPT },
      { role: "user", content: `Soru: ${state.question}\nEski sorgu: ${state.searchQuery}` },
    ]);
    return {
      retries: state.retries + 1,
      searchQuery: newQuery.trim().replace(/^["']|["']$/g, ""),
      graderDecision: "retry" as const,
      trace: [`grader → reddedildi (${verdict.reason}); sorgu yeniden yazildi`],
    };
  }
  return {
    answer: NOT_FOUND_ANSWER,
    sources: [],
    graderDecision: "fail" as const,
    trace: [`grader → ikinci deneme de reddedildi (${verdict.reason}); 'bulunamadi' donuldu`],
  };
}

// ─── Graph ────────────────────────────────────────────────────────────

function routeByIntent(state: AgentStateType): string {
  if (state.intent === "chitchat") return "chitchat";
  if (state.intent === "service_routing") return "routing";
  return "retrieve";
}

function routeAfterRetrieve(state: AgentStateType): string {
  switch (state.intent) {
    case "entity":
      return "entity";
    case "doc_find":
      return "docfinder";
    default:
      return "synthesis";
  }
}

function routeAfterGrader(state: AgentStateType): string {
  if (state.graderDecision !== "retry") return END;
  // Yonlendirme ayri koleksiyonda arar — retry'i retrieve'e degil routing'e dondur,
  // aksi halde ikinci deneme yanlis korpusta ve yanlis node'da biter.
  return state.intent === "service_routing" ? "retry_routing" : "retry";
}

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
