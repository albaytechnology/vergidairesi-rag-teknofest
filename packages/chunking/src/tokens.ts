/**
 * Yaklasik token sayaci.
 * Kesin tokenizer (Qwen BPE) yerine hizli bir sezgisel kullaniyoruz:
 * Turkce metinde ortalama ~3.5 karakter/token. Chunk boyut politikasi
 * icin yeterli hassasiyet — kesinlik gerekirse Faz 3'te gercek
 * tokenizer'a gecilebilir.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
