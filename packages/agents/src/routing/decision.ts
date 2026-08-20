/** "Belirlenemedi" karari — dayanaksiz yonlendirmenin tek cikis yolu. */
import type { ServiceRoutingDecision } from "@albay/shared";

export const ROUTING_NOT_DETERMINED = "belirlenemedi — manuel inceleme gerekli";

/** Karari dayanaksiz ilan eder — servis atamasi silinir, gerekce korunur. */
export function belirlenemediYap(
  decision: ServiceRoutingDecision,
  gerekce: string,
): ServiceRoutingDecision {
  return {
    ...decision,
    anaBirim: null,
    digerBirim: null,
    servis: null,
    altServis: null,
    ilgiliMaddeler: [],
    guvenSkoru: 0,
    belirlenemedi: true,
    gerekce,
  };
}

/** Model hic calismadan (orn. hic parca bulunamadan) dusen karar icin bos taban. */
export const BOS_KARAR: ServiceRoutingDecision = {
  anaBirim: null,
  digerBirim: null,
  servis: null,
  altServis: null,
  ilgiliMaddeler: [],
  guvenSkoru: 0,
  belirlenemedi: true,
  gerekce: "",
};
