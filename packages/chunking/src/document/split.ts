/**
 * Tek basina bir chunk'a sigmayan metnin bolunmesi.
 *
 * Bolme noktasi cumle sinirlaridir; kelime ortasindan kesilen bir parca hem
 * embedding'de hem de LLM'e verildiginde anlamini kaybeder. Parcalar arasinda
 * kucuk bir ortusme birakilir ki sinirin iki yanina dusen bir ifade
 * (ornegin "... bu sure 30 gundur." + "Sure asilirsa ...") en az bir parcada
 * butun halde bulunsun.
 */
import { estimateTokens } from "../tokens.ts";
import type { ChunkOptions } from "./options.ts";

export function splitLongText(text: string, opts: Required<ChunkOptions>): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|\s*[^.!?\n]+$/g) ?? [text];
  const pieces: string[] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const s of sentences) {
    const t = estimateTokens(s);
    if (tokens + t > opts.targetTokens && current.length) {
      pieces.push(current.join("").trim());
      // Overlap: son cumlelerden ~overlapRatio kadar geri tasi
      const overlapTarget = opts.targetTokens * opts.overlapRatio;
      const kept: string[] = [];
      let keptTokens = 0;
      for (let i = current.length - 1; i >= 0 && keptTokens < overlapTarget; i--) {
        kept.unshift(current[i]!);
        keptTokens += estimateTokens(current[i]!);
      }
      current = kept;
      tokens = keptTokens;
    }
    current.push(s);
    tokens += t;
  }
  if (current.length) pieces.push(current.join("").trim());
  return pieces.filter((p) => p.length > 0);
}
