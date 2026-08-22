/**
 * Evrakta eksik ve tutarsiz bilgilerin taranmasi.
 *
 * analyze.ts evraki ANLAMLANDIRIR (konu, ozet, entity); bu modul evraki
 * DENETLER: cevap yazisi kurulmadan once calisanin mukelleften tamamlatmasi
 * gereken bilgiler ile belgenin kendi icindeki celiskiler.
 *
 * Cikti kalici degildir — hat sonunda bir kez uretilip veritabanina yazilan
 * analizin aksine, calisan istedigi anda tazeleyebilsin diye istek uzerine
 * hesaplanir.
 */
import { DocumentGapReportSchema, type DocumentGapReport } from "@albay/shared";
import { OllamaClient } from "../ollama/client.ts";
import { structuredJsonCall } from "../ollama/structured.ts";
import { GAPS_SYSTEM_PROMPT } from "./prompt.ts";
import { GAPS_JSON_SCHEMA } from "./schema.ts";

export interface GapsInput {
  filename: string;
  /** Belgenin tam metni (ya da yeterince genis bir on parcasi). */
  text: string;
}

/**
 * Bulgulari kritikten dusuge dogru siralar ve kanitsiz iddialari ayiklar.
 *
 * Model kanit alanini bos birakmakta serbest (hic yazilmamis bir alan icin
 * alinti yoktur), ama belgede GECMEYEN bir alinti yazdiysa bulgu dusurulur:
 * dogrulanamayan bir alinti, bulgunun uydurulmus olma ihtimalini isaret eder.
 */
export async function analyzeDocumentGaps(
  ollama: OllamaClient,
  input: GapsInput,
): Promise<DocumentGapReport> {
  const metin = input.text.slice(0, 12000);
  const parsed = await structuredJsonCall(ollama, {
    system: GAPS_SYSTEM_PROMPT,
    user: `Dosya adi: ${input.filename}\n\nEvrak metni:\n${metin}`,
    schema: GAPS_JSON_SCHEMA,
    // temperature 0: ayni evrak iki taramada ayni bulgu listesini vermeli —
    // calisan "az once vardi, simdi yok" durumuyla karsilasmasin.
    temperature: 0,
    parse: (value) => DocumentGapReportSchema.parse(value),
    islemAdi: "Eksik bilgi taramasi",
  });

  const oncelik = { kritik: 0, orta: 1, dusuk: 2 };
  return {
    bulgular: parsed.bulgular
      .filter((b) => b.kanit === "" || icerir(metin, b.kanit))
      .sort((a, b) => oncelik[a.onem] - oncelik[b.onem])
      .slice(0, 8),
  };
}

/**
 * Alinti belgede geciyor mu?
 *
 * Bir tutarsizlik bulgusunun kaniti dogasi geregi belgenin IKI AYRI yerinden
 * gelir ve model bunlari " … " ile birlestirir; alintiyi tek parca olarak
 * aramak bu bulgularin hepsini elerdi. Parcalar ayri ayri dogrulanir, hepsi
 * belgede geciyorsa kanit gecerli sayilir.
 *
 * Satir sonu ve bosluk farklari yok sayilir: kaynak metin taranarak
 * uretildigi icin ayni ibare belgede farkli sarilmis olabilir.
 */
function icerir(metin: string, alinti: string): boolean {
  const sadelestir = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
  const govde = sadelestir(metin);
  const parcalar = alinti
    .split(/…|\.\.\./)
    .map(sadelestir)
    .filter((p) => p.length > 0);
  return parcalar.length > 0 && parcalar.every((p) => govde.includes(p));
}
