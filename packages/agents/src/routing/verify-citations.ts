/**
 * Atif denetimi — LLM'e guvenmeden, deterministik.
 */
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";
import { belirlenemediYap } from "./decision.ts";
import { maddeNumbersOf, normalizeMaddeNo } from "./madde.ts";

/**
 * Karar yalnizca GETIRILEN yonetmelik parcalarindaki maddelere atif yapabilir;
 * uydurulan madde numaralari atilir. Geriye dogrulanmis atif kalmiyorsa karar
 * "belirlenemedi"ye dusurulur — dayanaksiz servis atamasi yapilmaz.
 */
export function verifyCitations(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): { decision: ServiceRoutingDecision; uydurulan: string[] } {
  if (decision.belirlenemedi) return { decision, uydurulan: [] };

  const mevcut = maddeNumbersOf(hits);
  const dogrulanan = decision.ilgiliMaddeler.filter((m) => mevcut.has(normalizeMaddeNo(m.maddeNo)));
  const uydurulan = decision.ilgiliMaddeler
    .filter((m) => !mevcut.has(normalizeMaddeNo(m.maddeNo)))
    .map((m) => m.maddeNo);

  if (!dogrulanan.length) {
    return {
      decision: belirlenemediYap(
        decision,
        uydurulan.length
          ? `Kararin dayandirildigi madde(ler) (${uydurulan.join(", ")}) getirilen yonetmelik` +
              " parcalarinda bulunmadi; dogrulanamayan atifla servis atamasi yapilmadi."
          : "Karar hicbir yonetmelik maddesine dayandirilmadi.",
      ),
      uydurulan,
    };
  }

  return { decision: { ...decision, ilgiliMaddeler: dogrulanan }, uydurulan };
}
