/**
 * Ajan katmani — soruyu/evraki cevaba ve karara ceviren akislar.
 *
 * Tuketiciler alt yollari degil, yalnizca bu yuzeyi import eder.
 *
 *   graph/     korpus genelinde calisan multi-agent akis (LangGraph)
 *   chat/      belge kapsamli, akisli sohbet ve niyet ayrimi
 *   routing/   evrakin hangi servise gidecegi + LLM'siz guvence katmanlari
 *   letter/    resmi cevap yazisi taslagi + sayi dogrulamasi
 *   common/    paylasilan parcalar: baglam kurulumu, ortak kurallar, Ollama istemcisi
 */
export { buildGraph, ask, type AskResult } from "./graph/build.ts";
export type { AgentStateType } from "./graph/state.ts";

export { buildContext, uniqueSources } from "./common/context.ts";
export { NOT_FOUND_ANSWER, isNotFoundAnswer } from "./common/not-found.ts";

export { askStream, askDocument } from "./chat/stream.ts";
export type { ChatEvent, ChatTurn, AskStreamOptions } from "./chat/types.ts";
export { classifyChatIntent, type ChatIntent } from "./chat/intent.ts";

export { draftResponseLetter } from "./letter/draft.ts";
export { verifyLetterNumbers } from "./letter/verify-numbers.ts";
export type { LetterDraftInput, LetterDraftResult } from "./letter/types.ts";

export { routeDocument } from "./routing/route-document.ts";
export { routeOnce } from "./routing/route-once.ts";
export { gradeRouting } from "./routing/grade.ts";
export { formatRoutingDecision } from "./routing/format.ts";
export { verifyCitations } from "./routing/verify-citations.ts";
export { reconcileBirim } from "./routing/reconcile.ts";
export { diversifyByService } from "./routing/retrieve.ts";
export { ROUTING_NOT_DETERMINED } from "./routing/decision.ts";
export {
  sameService,
  sameServiceStrict,
  isEntryPointService,
  isServiceForOrgType,
} from "./routing/services.ts";
export { normalizeMaddeNo, maddeNumbersOf, uncertainMaddeNumbers } from "./routing/madde.ts";
export { trNormalize } from "./common/tr-text.ts";
export type { RouteInput, RouteResult, RoutingVerdict } from "./routing/types.ts";
