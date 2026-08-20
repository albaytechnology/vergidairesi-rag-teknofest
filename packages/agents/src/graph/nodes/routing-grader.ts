/**
 * Yonlendirme kararinin grounding denetimi. Madde atiflari zaten routingNode'da
 * deterministik dogrulandi; burada LLM'e SERVIS GOREV TANIMI eslesmesi sorulur.
 */
import { ROUTING_NOT_DETERMINED } from "../../routing/decision.ts";
import { gradeRouting } from "../../routing/grade.ts";
import type { AgentStateType } from "../state.ts";
import { rewriteQuery } from "./rewrite.ts";

export async function routingGrader(state: AgentStateType) {
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
    return {
      retries: state.retries + 1,
      searchQuery: await rewriteQuery(state.question, state.searchQuery),
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
