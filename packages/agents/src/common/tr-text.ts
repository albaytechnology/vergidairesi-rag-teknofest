/**
 * Servis/madde adlarinin karsilastirilmasi icin Turkce metin katlama.
 *
 * Noktalama ve fazla bosluk da atilir: "M.11-A-I-2-f" ile "M 11 A I 2 f" ayni
 * seye isaret eder, karsilastirma bunlari ayirmamali.
 */
export const trNormalize = (s: string): string =>
  s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
