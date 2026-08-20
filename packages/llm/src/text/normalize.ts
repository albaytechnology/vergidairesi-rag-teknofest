/**
 * Metin normallestirme yardimcilari.
 *
 * Iki kullanim yerinde de ayni sorun var: LLM'in dondurdugu bir degeri ham
 * belge metniyle karsilastirmak. Taraflardan biri normallestirilmezse aksan,
 * buyuk/kucuk harf ya da bosluk farki yuzunden eslesme kacar.
 */

/** Rakam disindaki her seyi atar (numara karsilastirmalari icin). */
export const onlyDigits = (raw: string): string => raw.replace(/\D/g, "");

/** Turkce'ye duyarli kucuk harf + aksan katlama (metin karsilastirmasi icin). */
export const trFold = (s: string): string =>
  s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("î", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replaceAll("â", "a")
    .replace(/\s+/g, " ");
