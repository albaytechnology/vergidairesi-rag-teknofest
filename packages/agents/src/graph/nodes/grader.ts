/**
 * Cevabin parcalara dayanip dayanmadiginin denetimi (corrective-RAG).
 * Reddedilirse sorgu bir kez yeniden yazilip tekrar denenir, sonra pes edilir.
 */
import { buildContext } from "../../common/context.ts";
import { isNotFoundAnswer, NOT_FOUND_ANSWER } from "../../common/not-found.ts";
import { ollama } from "../../common/ollama.ts";
import { GRADER_PROMPT, GRADER_SCHEMA } from "../prompts/grader.ts";
import type { AgentStateType } from "../state.ts";
import { rewriteQuery } from "./rewrite.ts";
import { routingGrader } from "./routing-grader.ts";

export async function graderNode(state: AgentStateType) {
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
    return {
      retries: state.retries + 1,
      searchQuery: await rewriteQuery(state.question, state.searchQuery),
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
