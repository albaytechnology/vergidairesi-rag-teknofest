/**
 * Ham belge metninden checksum'i tutan numaralarin taranmasi.
 *
 * LLM cikarimina ALTERNATIF degil, capraz kontrol: LLM'in buldugu numara
 * metinde gercekten geciyor mu, ya da LLM hic bulamadiysa metinde var mi?
 */
import { onlyDigits } from "../text/normalize.ts";
import { isValidTckn, isValidVkn } from "./checksum.ts";

export interface IdentifierCandidates {
  tckn: string[];
  vkn: string[];
}

export function extractIdentifierCandidates(text: string): IdentifierCandidates {
  const tckn = new Set<string>();
  const vkn = new Set<string>();
  for (const match of text.matchAll(/\b\d[\d\s.]{8,14}\d\b/g)) {
    const s = onlyDigits(match[0]);
    if (s.length === 11 && isValidTckn(s)) tckn.add(s);
    else if (s.length === 10 && isValidVkn(s)) vkn.add(s);
  }
  return { tckn: [...tckn], vkn: [...vkn] };
}
