/**
 * BM25 tarzi sparse vektor kodlayici (hybrid aramanin anahtar-kelime bacagi).
 *
 * Yaklasim: metni Turkce'ye uygun tokenize et, her terimi 32-bit id'ye hashle,
 * deger olarak terim frekansini gonder. IDF agirligini Qdrant tarafinda
 * collection'in sparse alanindaki `modifier: "idf"` ayari uygular —
 * boylece istemci tarafinda korpus istatistigi tutmamiz gerekmez.
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

/** FNV-1a 32-bit hash — terim -> sparse index. */
export function termId(term: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * BM25'in dokuman-ici TF bileseni: tf * (k1+1) / (tf + k1 * (1 - b + b * len/avgLen))
 * IDF bileseni Qdrant'ta (modifier: idf).
 */
export function encodeSparse(
  text: string,
  opts: { k1?: number; b?: number; avgDocLen?: number } = {},
): SparseVector {
  const { k1 = 1.2, b = 0.75, avgDocLen = 350 } = opts;
  const tokens = tokenize(text);
  if (!tokens.length) return { indices: [], values: [] };

  const counts = new Map<number, number>();
  for (const t of tokens) {
    const id = termId(t);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const norm = k1 * (1 - b + (b * tokens.length) / avgDocLen);
  const indices: number[] = [];
  const values: number[] = [];
  for (const [id, tf] of counts) {
    indices.push(id);
    values.push((tf * (k1 + 1)) / (tf + norm));
  }
  return { indices, values };
}
