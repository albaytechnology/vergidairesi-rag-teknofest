/**
 * Yonlendirme kararinin grounding denetimi.
 *
 * Denetim bilerek DARALTILIR: tum parcalari birden gosterince model kendi kararini
 * dogrulamaya meyilli oluyor. Yalnizca secilen servisin gorev tanimini verip
 * "bu gorevler evraki kapsiyor mu" diye sormak, "gelir tablosu -> Gelir Servisi"
 * tipi yuzeysel eslesmeyi ayirt etmeye yetiyor.
 */
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";
import { buildContext } from "../common/context.ts";
import { ollama } from "../common/ollama.ts";
import { ROUTING_GRADER_PROMPT, ROUTING_GRADER_SCHEMA } from "./prompts.ts";
import { sameService } from "./services.ts";
import type { RoutingVerdict } from "./types.ts";

export async function gradeRouting(input: {
  metin: string;
  decision: ServiceRoutingDecision;
  hits: SearchHit[];
  kararMetni: string;
}): Promise<RoutingVerdict> {
  if (input.decision.belirlenemedi) {
    return {
      onaylandi: true,
      masaIddiasi: false,
      reason: "'belirlenemedi' karari, dogru davranis olarak gecildi",
    };
  }

  const servis = input.decision.servis;
  const servisChunks = servis
    ? input.hits.filter(
        (h) => typeof h.metadata?.servis === "string" && sameService(h.metadata.servis, servis),
      )
    : [];
  const denetimBaglami = servisChunks.length
    ? buildContext(servisChunks)
    : buildContext(input.hits);

  const raw = await ollama.chat(
    [
      { role: "system", content: ROUTING_GRADER_PROMPT },
      {
        role: "user",
        content:
          `Belge metni: ${input.metin}\n\n` +
          `Onerilen servis: ${servis ?? "(servis adi verilmedi)"}\n\n` +
          `Bu servisin yonetmelikteki gorev tanimi:\n${denetimBaglami}\n\n` +
          `Uretilen yonlendirme karari:\n${input.kararMetni}`,
      },
    ],
    { format: ROUTING_GRADER_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );
  const verdict = JSON.parse(raw) as {
    servisDayanakli: boolean;
    masaIddiasi: boolean;
    reason: string;
  };
  return {
    onaylandi: verdict.servisDayanakli && !verdict.masaIddiasi,
    masaIddiasi: verdict.masaIddiasi,
    reason: verdict.reason,
  };
}
