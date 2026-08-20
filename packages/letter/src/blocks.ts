/**
 * HTML ve DOCX ciktilarinin PAYLASTIGI blok metni kurallari.
 *
 * Bu kurallar biçimden bagimsizdir: ilgi satirinin harfi, muhatabin nasil
 * anildigi, iletisim satirlarinin sirasi iki ciktida da AYNI olmak zorunda.
 * Onceden her iki sablonda ayri ayri yaziliydi ve birinde yapilan duzeltmenin
 * digerine gecmemesi sessiz bir tutarsizlik kaynagiydi — ornegin tek ekte
 * "Ek:", coklu ekte "Ekler:" kurali.
 *
 * Buradaki fonksiyonlar DUZ METIN uretir; kacislama (HTML) ya da paragraf
 * kurma (DOCX) isini cagiran taraf yapar.
 */
import type { LetterModel, LetterRecipient } from "@albay/shared";

const ILGI_HARFLERI = "abcdefghijklmnopqrstuvwxyz";

/** Muhatabin yaziya girecek adi: kurum buyuk harf, kisi "Sayın" hitabiyla. */
export function muhatapAdi(muhatap: LetterRecipient): string {
  return muhatap.tur === "kurum"
    ? muhatap.ad.toLocaleUpperCase("tr-TR")
    : `Sayın ${muhatap.ad}`;
}

/** Harflendirilmis ilgi satiri. Model harfi kendisi yazdiysa tekrarlanmaz. */
export function ilgiSatiri(satir: string, index: number): string {
  const temiz = satir.trim();
  const harfli = /^[a-zçğıöşü]\s*\)/i.test(temiz);
  return harfli ? temiz : `${ILGI_HARFLERI[index] ?? "+"}) ${temiz}`;
}

/** Tek ek "Ek:", birden fazlasi "Ekler:" olarak baslar. */
export const ekBasligi = (ekler: string[]): string => (ekler.length > 1 ? "Ekler:" : "Ek:");

export const ekSatiri = (ek: string, index: number): string => `${index + 1}- ${ek}`;

/** Dolu olan iletisim alanlari, yaziya girecek sirayla. */
export function iletisimSatirlari(iletisim: LetterModel["iletisim"]): string[] {
  const { adres, telefon, eposta, web, kep } = iletisim;
  return [
    adres && `Adres: ${adres}`,
    telefon && `Telefon: ${telefon}`,
    eposta && `e-Posta: ${eposta}`,
    web && `İnternet adresi: ${web}`,
    kep && `KEP: ${kep}`,
  ].filter((x): x is string => Boolean(x));
}
