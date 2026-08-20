/**
 * Sparse aramanin Turkce metin hazirligi.
 *
 * Sorgu ve belge ayni boru hattindan gecmeli: kucultme, ASCII'ye indirgeme ve
 * stopword ayiklama iki tarafta da birebir ayni olmazsa terimler eslesmez.
 */

/** Kucuk bir Turkce stopword listesi — sparse eslesmede gurultuyu azaltir. */
const STOPWORDS = new Set([
  "acaba", "ama", "ancak", "aslinda", "az", "bazi", "belki", "ben", "bir",
  "birkac", "biz", "bu", "cok", "cunku", "da", "daha", "de", "degil", "diye",
  "eger", "en", "gibi", "hem", "hep", "hepsi", "her", "hic", "icin", "ile",
  "ise", "kez", "ki", "kim", "mi", "mu", "nasil", "ne", "neden", "nerde",
  "nerede", "nereye", "nicin", "niye", "o", "sanki", "sey", "siz", "su",
  "tum", "ve", "veya", "ya", "yani", "olarak", "olan", "uzere", "kadar",
]);

/** Turkce'ye duyarli kucuk harfe cevirme (I -> i degil, I -> ı; İ -> i). */
const trLower = (s: string) => s.toLocaleLowerCase("tr-TR");

/** ASCII'ye indirger — "sözleşme" ve "sozlesme" ayni terime eslessin. */
const deaccent = (s: string) =>
  s
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u");

export function tokenize(text: string): string[] {
  return deaccent(trLower(text))
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
