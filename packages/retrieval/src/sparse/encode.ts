/**
 * BM25 tarzi sparse vektor kodlayici (hybrid aramanin anahtar-kelime bacagi).
 *
 * Yaklasim: metni tokenize et, her terimi 32-bit id'ye hashle, deger olarak
 * terim frekansini gonder. IDF agirligini Qdrant tarafinda collection'in sparse
 * alanindaki `modifier: "idf"` ayari uygular — boylece istemci tarafinda korpus
 * istatistigi tutmamiz gerekmez.
 */
import { tokenize } from "./tokenize.ts";

export interface SparseVector {
  indices: number[];
  values: number[];
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
