/**
 * Metin karsilastirmalari.
 *
 * Turkce'ye ozgu buyuk/kucuk harf kurallari ("I/ı", "i/İ") varsayilan
 * toLowerCase ile bozuldugu icin her yerde tr-TR yerelini kullaniyoruz;
 * aksi halde "İSTANBUL" ile "istanbul" eslesmez.
 */
function foldTR(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}

/** Metin, aranan ifadeyi (buyuk/kucuk harf duyarsiz) iceriyor mu? */
export function containsTR(haystack: string, needle: string): boolean {
  return foldTR(haystack).includes(foldTR(needle));
}

/** Ifadelerin HEPSI metinde geciyor mu? */
export function containsAll(haystack: string, needles: string[]): boolean {
  return needles.every((n) => containsTR(haystack, n));
}

/** Ifadelerden EN AZ BIRI metinde geciyor mu? */
export function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => containsTR(haystack, n));
}

/**
 * Beklenen dokumanlardan en az biri kaynak listesinde geciyor mu?
 *
 * Kaynak yollari tam dosya yolu olabildigi icin karsilastirma "icerir"
 * yonunde: kaynak, beklenen dosya adini iceriyorsa isabet sayilir.
 */
export function matchesAnySource(sources: string[], expectedDocs: string[]): boolean {
  return expectedDocs.some((doc) => sources.some((s) => containsTR(s, doc)));
}
