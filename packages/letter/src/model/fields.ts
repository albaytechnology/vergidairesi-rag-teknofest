/**
 * Modelin tek tek alanlarinin turetilmesi.
 *
 * Her biri kucuk ve saf: girdi ne olursa olsun UYDURMA yapmazlar, bilinmeyen
 * alan yer tutucuya duser ve eksik olarak raporlanir.
 */
import type { DocumentAnalysis, LetterDecision, LetterRecipient } from "@albay/shared";

/** Yer tutucu bicimi — sablonda vurgulanarak basilir, gozden kacmasin diye. */
export const YER_TUTUCU = (alan: string): string => `[${alan}]`;

/**
 * Muhatap. Formdan gelen deger analizden gelene ustundur — adi okuyan insandir.
 * Hicbiri yoksa yer tutucu basilir: yanlis kisiye yazi cikmasindansa bos kalsin.
 */
export function muhatabiKur(
  formdan: Partial<LetterRecipient> | undefined,
  entities: DocumentAnalysis["entities"],
  eksikAlanlar: string[],
): LetterRecipient {
  const form = formdan ?? {};
  const analizden = entities.kisiKurumlar[0] ?? "";
  const ad = (form.ad ?? analizden).trim();
  if (!ad) eksikAlanlar.push("Muhatap adı (form)");

  return {
    ad: ad || YER_TUTUCU("MUHATAP"),
    tur: form.tur ?? "kisi",
    adres: form.adres?.trim() || null,
    // Checksum'dan gecmis numara yoksa null kalir (analyzer garanti eder).
    vknTckn: form.vknTckn?.trim() || entities.vkn || entities.tckn || null,
  };
}

/** Konu satiri kisa olmali (yonetmelik: sayfanin ortasini gecmez). */
export function konuSatiri(analiz: Pick<DocumentAnalysis, "konu" | "baslikOnerisi">): string {
  const aday = analiz.baslikOnerisi.trim() || analiz.konu.trim();
  const temiz = aday.replace(/\s+/g, " ").replace(/[.]+$/, "");
  return temiz.length > 90 ? `${temiz.slice(0, 87).trimEnd()}...` : temiz;
}

/**
 * Kapanis cumlesi karardan turetilir, modele birakilmaz.
 * Mukellefe (gercek/tuzel kisi) "rica ederim" kullanilir; "arz ederim" ust
 * makama yazilan yazilara ozgudur ve buraya uymaz.
 */
export function kapanisCumlesi(karar: LetterDecision, tur: LetterRecipient["tur"]): string {
  if (karar === "eksik_belge") {
    return "Eksik belge ve bilgilerin tamamlanması hususunda gereğini rica ederim.";
  }
  return tur === "kurum"
    ? "Bilgilerini ve gereğini rica ederim."
    : "Bilgi edinilmesini rica ederim.";
}

export const trTarih = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
