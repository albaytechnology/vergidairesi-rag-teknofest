/**
 * Kararin servis ve birim atamasini yonetmelik parcalarina dayandirir.
 *
 * Model dogru maddeyi gosterip yanlis servisi adlandirabiliyor ya da dogru
 * servisi yanlis birime baglayabiliyor; iki bilginin de kesin kaynagi chunk
 * metadata'sidir, LLM'in tahmini degil.
 */
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";
import { trNormalize } from "../common/tr-text.ts";
import { belirlenemediYap } from "./decision.ts";
import { normalizeMaddeNo, parseCitationPath } from "./madde.ts";
import { isEntryPointService, sameService, sameServiceStrict } from "./services.ts";

/** Ana hizmet birimi, yonetmelikteki alt bolum basligindan (I-/II-/III-/IV-) okunur. */
const ANA_BIRIMLER: [RegExp, ServiceRoutingDecision["anaBirim"]][] = [
  [/vergilendirme/, "Vergilendirme"],
  [/muhasebe/, "Muhasebe"],
  [/kovusturma/, "Kovusturma"],
  [/tarama ve kontrol/, "Tarama ve Kontrol"],
];

/** Diger hizmet birimi, servis adindan okunur. */
const DIGER_BIRIMLER: [RegExp, ServiceRoutingDecision["digerBirim"]][] = [
  [/vergi denetmenleri/, "Vergi Denetmenleri"],
  [/takdir/, "Takdir"],
  [/uzlasma/, "Uzlasma"],
  [/ozluk/, "Ozluk ve Destek"],
  [/^gelir servisi/, "Gelir"],
];

/**
 * Atif verilen gorev maddesinin SAHIBI olan servisi bulur.
 *
 * NEDEN: model dogru maddeyi gosterip yanlis servis adi yazabiliyor — gozlenen
 * ornek: karar "Sureksiz Yukumlulukler Vergilendirme Servisi" diyor ama dayanak
 * olarak "Madde 11-A-I-2-f"yi gosteriyor; oysa o madde SUREKLI servisin gorev
 * maddesi. Karar kendi kanitiyla celisiyor. Hangisi daha guvenilir? Atif, cunku
 * yonetmelikteki yeri kesin ve verifyCitations onu zaten dogrulamis durumda.
 *
 * Bu yuzden atif yolu bir parcaya birebir baglanabiliyorsa servis adi o parcadan
 * alinir. Baglanamiyorsa (orn. Madde 10 on soz parcasi) hicbir sey degistirilmez.
 */
function citedServices(decision: ServiceRoutingDecision, hits: SearchHit[]): string[] {
  const bulunan = new Set<string>();
  for (const atif of decision.ilgiliMaddeler) {
    const yol = parseCitationPath(atif.maddeNo);
    if (!yol.servisNo) continue;

    for (const h of hits) {
      const m = h.metadata ?? {};
      if (normalizeMaddeNo(String(m.maddeNo ?? "")) !== yol.maddeNo) continue;
      if (typeof m.servis !== "string" || !m.servis) continue;
      if (String(m.servisNo ?? "") !== yol.servisNo) continue;
      if (yol.birim && !String(m.hizmetBirimi ?? "").trim().startsWith(`${yol.birim})`)) continue;
      if (yol.altBolum && !String(m.altBolum ?? "").trim().startsWith(`${yol.altBolum}-`)) continue;
      bulunan.add(m.servis);
    }
  }
  return [...bulunan];
}

/**
 * Kararin adlandirdigi servis, atif verdigi maddelerin sahibi degilse duzeltir.
 *
 * SINIR: yalnizca CELISKI varsa mudahale eder. Adlandirilan servis atiflar
 * arasindaysa dokunulmaz — cunku bir karar hakli olarak birden fazla maddeye
 * dayanabilir (orn. MTV tecili hem Madde 10-A-I-3'e (MTV masasi Sureksiz'de)
 * hem Madde 11-A-I-2-f'ye (tecil gorevi) dayanir). Her atifa korukorune
 * hizalamak, dogru karari yanlis maddeye dogru cekiyordu.
 */
function resolveCitedService(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): string | null {
  const servisler = citedServices(decision, hits);
  if (!servisler.length) return null;
  if (decision.servis && servisler.some((s) => sameServiceStrict(s, decision.servis!))) return null;
  return servisler.length === 1 ? servisler[0]! : null;
}

/**
 * Birim atamasini LLM'in tahminine degil, atif verilen parcanin yonetmelik
 * hiyerarsisine dayandirir. Model dogru servisi bulup yanlis birime baglayabiliyor
 * (orn. Uzlasma Servisi'ni "Ana Hizmet Birimi > Vergilendirme" altina koymak);
 * oysa dogru cevap chunk metadata'sinda zaten duruyor. Servis adi da parcadaki
 * kanonik yazimla degistirilir.
 */
export function reconcileBirim(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): { decision: ServiceRoutingDecision; duzeltildi: boolean } {
  if (decision.belirlenemedi || !decision.servis) return { decision, duzeltildi: false };

  // Karar, atif verdigi gorev maddesinin sahibi olmayan bir servisi adlandirmis
  // olabilir. Atif daha guvenilir sinyaldir; servis adini ona hizala.
  const atifServisi = resolveCitedService(decision, hits);
  const atiftanDuzeltildi = Boolean(
    atifServisi && !sameServiceStrict(atifServisi, decision.servis),
  );
  if (atifServisi && atiftanDuzeltildi) {
    decision = { ...decision, servis: atifServisi };
  }
  const secilenServis = decision.servis ?? "";

  // Giris noktasi servisine yonlendirme yapilamaz — evrak zaten oradan geliyor.
  if (isEntryPointService(secilenServis)) {
    return {
      decision: belirlenemediYap(
        decision,
        `${secilenServis} evrakin giris noktasidir (kayit ve sevk gorevi), yonlendirme` +
          " hedefi degildir; evrakin ait oldugu asil servis yonetmelikte bulunamadi.",
      ),
      duzeltildi: true,
    };
  }

  // Once kesin ad esitligi: fuzzy eslesme Surekli/Sureksiz'i ayiramadigi icin
  // dogru karari yanlis parcanin adiyla ezebiliyordu.
  const strictHit = hits.find(
    (h) => typeof h.metadata?.servis === "string" && sameServiceStrict(h.metadata.servis, secilenServis),
  );
  const hit =
    strictHit ??
    hits.find((h) => typeof h.metadata?.servis === "string" && sameService(h.metadata.servis, secilenServis));
  if (!hit) return { decision, duzeltildi: false };

  const servis = String(hit.metadata!.servis);
  if (isEntryPointService(servis)) {
    return {
      decision: belirlenemediYap(
        decision,
        `${servis} evrakin giris noktasidir, yonlendirme hedefi degildir.`,
      ),
      duzeltildi: true,
    };
  }

  const hizmetBirimi = trNormalize(String(hit.metadata?.hizmetBirimi ?? ""));
  const altBolum = trNormalize(String(hit.metadata?.altBolum ?? ""));

  let anaBirim: ServiceRoutingDecision["anaBirim"] = null;
  let digerBirim: ServiceRoutingDecision["digerBirim"] = null;
  if (hizmetBirimi.includes("diger hizmet")) {
    digerBirim = DIGER_BIRIMLER.find(([re]) => re.test(trNormalize(servis)))?.[1] ?? null;
  } else if (hizmetBirimi.includes("ana hizmet")) {
    anaBirim = ANA_BIRIMLER.find(([re]) => re.test(altBolum))?.[1] ?? null;
  } else {
    return {
      decision: { ...decision, servis },
      duzeltildi: atiftanDuzeltildi || servis !== decision.servis,
    };
  }

  const duzeltildi =
    atiftanDuzeltildi ||
    anaBirim !== decision.anaBirim ||
    digerBirim !== decision.digerBirim ||
    servis !== decision.servis;
  return { decision: { ...decision, anaBirim, digerBirim, servis }, duzeltildi };
}
