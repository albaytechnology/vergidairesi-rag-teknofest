/** Yonlendirme kararinin insan okunur, atifli metne cevrilmesi. */
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";
import { ROUTING_NOT_DETERMINED } from "./decision.ts";
import { normalizeMaddeNo, uncertainMaddeNumbers } from "./madde.ts";

export function formatRoutingDecision(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): string {
  if (decision.belirlenemedi) {
    return `${ROUTING_NOT_DETERMINED}\n\nGerekce: ${decision.gerekce}`;
  }

  const birim = decision.anaBirim
    ? `Ana Hizmet Birimi > ${decision.anaBirim}`
    : decision.digerBirim
      ? `Diger Hizmet Birimi > ${decision.digerBirim}`
      : "Birim belirlenemedi";
  const belirsizMaddeler = uncertainMaddeNumbers(hits);
  const maddeler = decision.ilgiliMaddeler
    .map((m, i) => {
      const not = belirsizMaddeler.has(normalizeMaddeNo(m.maddeNo))
        ? " (madde numarasi kaynak metinden okunamadi, sira ile turetildi)"
        : "";
      return `[${i + 1}] Madde ${m.maddeNo} - ${m.baslik}${not}`;
    })
    .join("\n");
  const altServis = decision.altServis
    ? `Alt servis/masa: ${decision.altServis}`
    : "Alt servis/masa: belirtilmedi (yonetmelik yalnizca servis seviyesinde dayanak sagliyor;" +
      " masalar arasi gorev dagilimi Islem Yonergesi'nde)";

  // Model gerekceyi bos birakabiliyor — dayanak maddelerden kisa bir gerekce uret.
  const gerekce =
    decision.gerekce.trim() ||
    `Karar, ${decision.ilgiliMaddeler.map((m) => `Madde ${m.maddeNo}`).join(", ")} kapsamindaki` +
      " gorev tanimina dayanmaktadir.";

  return [
    `Yonlendirme: ${birim}${decision.servis ? ` > ${decision.servis}` : ""}`,
    altServis,
    `Guven skoru: ${decision.guvenSkoru.toFixed(2)}`,
    `Gerekce: ${gerekce}`,
    maddeler ? `\nDayanak maddeler:\n${maddeler}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
