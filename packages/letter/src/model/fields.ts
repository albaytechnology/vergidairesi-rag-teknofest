/**
 * Modelin tek tek alanlarinin turetilmesi.
 *
 * Her biri kucuk ve saf: girdi ne olursa olsun UYDURMA yapmazlar, bilinmeyen
 * alan yer tutucuya duser ve eksik olarak raporlanir.
 */
import type { DocumentAnalysis, LetterDecision, LetterRecipient } from "@albay/shared";

/**
 * Yazinin muhatabi kim.
 *
 * "mahkeme" Ihtilafli Isler Servisi'ne yonlendirilmis evraka ozgudur: evrak bir
 * dava dilekcesidir, cevap mukellefe degil Vergi Mahkemesi Baskanligi'na gider.
 * Muhatap, kapanis cumlesi ve govdenin uslubu bu tek alandan turer.
 */
export type LetterAddressee = "mukellef" | "mahkeme";

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
  hitap: LetterAddressee = "mukellef",
): LetterRecipient {
  const form = formdan ?? {};

  if (hitap === "mahkeme") return mahkemeMuhatabi(form, entities, eksikAlanlar);

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

/**
 * Mahkeme muhatabi.
 *
 * Ad, formdan gelmediyse evrakta gecen mahkeme adindan alinir — davanin acildigi
 * mahkeme dilekcede yazar. Bulunamazsa YER TUTUCU basilir ve eksik olarak
 * raporlanir: yanlis mahkemeye yazi cikmasindansa bosluk kalsin.
 *
 * Mukellefin vergi/kimlik numarasi muhatap blogunda YAZILMAZ; o numara davacinin,
 * muhatap ise mahkeme. Numara govdede davaciyi tanimlarken kullanilir.
 */
function mahkemeMuhatabi(
  form: Partial<LetterRecipient>,
  entities: DocumentAnalysis["entities"],
  eksikAlanlar: string[],
): LetterRecipient {
  const evraktan = entities.kisiKurumlar.find((k) => /mahkeme/i.test(k)) ?? "";
  const ham = (form.ad ?? evraktan).trim();
  if (!ham) eksikAlanlar.push("Vergi mahkemesi adı (evrakta bulunamadı)");

  return {
    ad: ham ? mahkemeBaskanligi(ham) : YER_TUTUCU("VERGİ MAHKEMESİ BAŞKANLIĞI"),
    // Mahkeme her zaman kurumdur; formdan "kisi" gelse bile ezilir.
    tur: "kurum",
    adres: form.adres?.trim() || null,
    vknTckn: null,
  };
}

/**
 * "İstanbul Vergi Mahkemesi" -> "İstanbul Vergi Mahkemesi Başkanlığı".
 *
 * Yalnizca resmi unvan ekleniyor; mahkemenin adi (il, sira numarasi) evrakta
 * yazdigi gibi birakiliyor — eksik bir ad tamamlanmaz.
 */
function mahkemeBaskanligi(ad: string): string {
  const temiz = ad.replace(/\s+/g, " ").trim().replace(/['’]?(na|ne|nden|dan|den)$/i, "");
  return /başkanlığı$/i.test(temiz) ? temiz : `${temiz} Başkanlığı`;
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
 * makama ve mahkemeye yazilan yazilara ozgudur.
 */
export function kapanisCumlesi(
  karar: LetterDecision,
  tur: LetterRecipient["tur"],
  hitap: LetterAddressee = "mukellef",
): string {
  // Mahkemeye yazilan yazi karar bildirmez, savunma/bilgi sunar: karara gore
  // degismez ve "rica" degil "arz" ile kapanir.
  if (hitap === "mahkeme") return "Bilgi ve gereğini arz ederim.";

  if (karar === "eksik_belge") {
    return "Eksik belge ve bilgilerin tamamlanması hususunda gereğini rica ederim.";
  }
  return tur === "kurum"
    ? "Bilgilerini ve gereğini rica ederim."
    : "Bilgi edinilmesini rica ederim.";
}

export const trTarih = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
