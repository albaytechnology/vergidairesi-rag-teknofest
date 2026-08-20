/**
 * Ingest hattinin kullandigi tam akis: yonlendir → denet → gerekirse bir kez
 * daha dene (reddedilen servis elenerek) → hala dayanaksizsa belirlenemedi.
 *
 * graph/ ayni adimlari LangGraph node'lari olarak kurar; ortak cekirdek
 * routeOnce + gradeRouting'dir, mantik iki yerde tekrarlanmaz.
 */
import { belirlenemediYap } from "./decision.ts";
import { formatRoutingDecision } from "./format.ts";
import { gradeRouting } from "./grade.ts";
import { routeOnce } from "./route-once.ts";
import type { RouteInput, RouteResult } from "./types.ts";

export async function routeDocument(input: RouteInput): Promise<RouteResult> {
  const elenenler = [...(input.elenenServisler ?? [])];
  let sonuc = await routeOnce({ ...input, elenenServisler: elenenler });
  const trace = [...sonuc.trace];

  for (let deneme = 0; deneme < 1; deneme++) {
    const verdict = await gradeRouting({
      metin: input.metin,
      decision: sonuc.decision,
      hits: sonuc.hits,
      kararMetni: formatRoutingDecision(sonuc.decision, sonuc.hits),
    });
    if (verdict.onaylandi) {
      trace.push(`grader → onaylandi (${verdict.reason})`);
      return { ...sonuc, trace };
    }

    trace.push(`grader → ${sonuc.decision.servis ?? "karar"} reddedildi (${verdict.reason})`);
    if (sonuc.decision.servis) elenenler.push(sonuc.decision.servis);
    sonuc = await routeOnce({
      ...input,
      elenenServisler: elenenler,
      denetimGeriBildirimi: verdict.reason,
    });
    trace.push(...sonuc.trace);
  }

  // Ikinci deneme de denetimden gecmeliydi; gecmezse dayanaksiz sayilir.
  const sonVerdict = await gradeRouting({
    metin: input.metin,
    decision: sonuc.decision,
    hits: sonuc.hits,
    kararMetni: formatRoutingDecision(sonuc.decision, sonuc.hits),
  });
  if (sonVerdict.onaylandi) {
    trace.push(`grader → onaylandi (${sonVerdict.reason})`);
    return { ...sonuc, trace };
  }
  trace.push(`grader → ikinci deneme de reddedildi (${sonVerdict.reason}); belirlenemedi`);
  return {
    hits: sonuc.hits,
    decision: belirlenemediYap(sonuc.decision, sonVerdict.reason),
    trace,
  };
}
