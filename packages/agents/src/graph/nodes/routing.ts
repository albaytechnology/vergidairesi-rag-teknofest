/** Servis yonlendirmesinin graph adimi — cekirdek mantik routing/ icinde. */
import { uniqueSources } from "../../common/context.ts";
import { formatRoutingDecision } from "../../routing/format.ts";
import { routeOnce } from "../../routing/route-once.ts";
import type { AgentStateType } from "../state.ts";

export async function routingNode(state: AgentStateType) {
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
