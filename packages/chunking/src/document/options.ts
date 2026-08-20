/**
 * Belge chunker'inin girdisi ve boyut politikasi.
 *
 * Varsayilanlar tek yerde: bir esigi degistirmek isteyenin chunk'lama
 * mantiginin icinde sayi aramasi gerekmesin.
 */
export interface ChunkOptions {
  /** Hedef chunk boyutu (token) */
  targetTokens?: number;
  /** Tek chunk'in ust siniri (tablo haric — tablolar asla bolunmez) */
  maxTokens?: number;
  /** Uzun paragraf bolunurken cumle bazli overlap orani */
  overlapRatio?: number;
  /** Parent chunk ust siniri */
  maxParentTokens?: number;
}

export const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 650,
  maxTokens: 900,
  overlapRatio: 0.12,
  maxParentTokens: 3500,
};

export interface ChunkInput {
  docId: string;
  filename: string;
  markdown: string;
  doclingJson?: unknown;
  options?: ChunkOptions;
}
