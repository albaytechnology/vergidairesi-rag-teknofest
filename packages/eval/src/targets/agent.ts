import { ask } from "@albay/agents";
import type { EvalTarget } from "@albay/shared";

/** Multi-agent graph'i eval hedefi olarak calistirir (Faz 5). */
export const agentTarget: EvalTarget = {
  name: "agent",
  async ask(question: string) {
    const result = await ask(question);
    return { answer: result.answer, sources: result.sources };
  },
};
