/**
 * Vergi Dairesi servis yonlendirmesinin tek gecisi:
 * yonetmelikte ara → LLM karari → atif dogrulama → birim uzlastirma.
 *
 * Bu yol hem sorgu zamaninda (graph/nodes/routing.ts) hem ingest zamaninda
 * (route-document.ts) kullanilir; karar mantigi tek yerde durur.
 *
 * Guvence katmanlari, hepsi LLM'den bagimsiz:
 *   1. verify-citations.ts — getirilmeyen maddeye yapilan atif dusurulur
 *   2. reconcile.ts        — birim/servis adi chunk metadata'sindan turetilir
 *   3. grade.ts            — yalnizca secilen servisin gorev tanimi gosterilerek denetim
 */
import { config, ServiceRoutingDecisionSchema } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";
import { buildContext } from "../common/context.ts";
import { ollama } from "../common/ollama.ts";
import { belirlenemediYap, BOS_KARAR } from "./decision.ts";
import { routingPrompt, ROUTING_SCHEMA } from "./prompts.ts";
import { reconcileBirim } from "./reconcile.ts";
import { fetchRegulationHits } from "./retrieve.ts";
import type { RouteInput, RouteResult } from "./types.ts";
import { verifyCitations } from "./verify-citations.ts";

export async function routeOnce(input: RouteInput): Promise<RouteResult> {
  const hits = await fetchRegulationHits(input.aramaSorgusu || input.metin);

  if (!hits.length) {
    return {
      hits,
      decision: belirlenemediYap(
        BOS_KARAR,
        "Yonetmelik koleksiyonunda ilgili madde bulunamadi.",
      ),
      trace: ["routing → yonetmelik parcasi bulunamadi"],
    };
  }

  const raw = await ollama.chat(
    [
      { role: "system", content: routingPrompt(config.TAX_OFFICE_ORG_TYPE) },
      { role: "user", content: kullaniciPromptu(input, hits) },
    ],
    { format: ROUTING_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );

  const parsed = ServiceRoutingDecisionSchema.parse(JSON.parse(raw));
  const verified = verifyCitations(parsed, hits);
  const { decision, duzeltildi } = reconcileBirim(verified.decision, hits);

  return {
    decision,
    hits,
    trace: [
      verified.uydurulan.length
        ? `routing → dogrulanmayan madde atfi atildi: ${verified.uydurulan.join(", ")}`
        : "",
      duzeltildi ? "routing → birim atamasi yonetmelik hiyerarsisinden duzeltildi" : "",
      decision.belirlenemedi
        ? "routing → belirlenemedi"
        : `routing → ${decision.servis ?? decision.anaBirim ?? decision.digerBirim}` +
          ` (Madde ${decision.ilgiliMaddeler.map((m) => m.maddeNo).join(", ")})`,
    ].filter(Boolean),
  };
}

/** Evrak metni + onceki turun geri bildirimi + yonetmelik parcalari. */
function kullaniciPromptu(input: RouteInput, hits: SearchHit[]): string {
  return (
    `Belge/yazisma metni:\n${input.metin}\n\n` +
    (input.aramaSorgusu ? `Sinif/anahtar sorgu:\n${input.aramaSorgusu}\n\n` : "") +
    (input.elenenServisler?.length
      ? `ONCEKI DENEMEDE REDDEDILEN servisler (gorev tanimlari bu evraki kapsamiyor,` +
        ` TEKRAR ONERME): ${input.elenenServisler.join(", ")}\n\n`
      : "") +
    (input.denetimGeriBildirimi
      ? `DENETCININ ONCEKI KARARI REDDETME GEREKCESI — bu tespiti dikkate al ve\n` +
        `isaret ettigi maddeyi/servisi yeniden degerlendir:\n` +
        `${input.denetimGeriBildirimi}\n\n`
      : "") +
    `Yonetmelik parcalari:\n${buildContext(hits)}`
  );
}
