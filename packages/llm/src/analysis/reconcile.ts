/**
 * LLM'in okudugu entity'lerin ham metinle capraz kontrolu ve temizligi.
 */
import type { DocumentAnalysis } from "@albay/shared";
import { extractIdentifierCandidates } from "../identifiers/extract.ts";
import { validateTckn, validateVkn } from "../identifiers/validate.ts";

/** LLM'in okudugu kimlik numaralarini checksum ve ham metinle capraz kontrol eder. */
export function reconcileIdentifiers(
  entities: DocumentAnalysis["entities"],
  text: string,
): DocumentAnalysis["entities"] {
  const adaylar = extractIdentifierCandidates(text);

  // Once LLM'in okudugunu dogrula; gecmezse metinde tek bir gecerli aday varsa onu kullan.
  const vkn =
    validateVkn(entities.vkn) ??
    (adaylar.vkn.length === 1 ? adaylar.vkn[0]! : null) ??
    (adaylar.tckn.length === 1 ? adaylar.tckn[0]! : null);
  const tckn =
    validateTckn(entities.tckn) ?? (adaylar.tckn.length === 1 ? adaylar.tckn[0]! : null);

  return {
    ...entities,
    vkn,
    tckn,
    tarihler: benzersiz(entities.tarihler),
    tutarlar: benzersiz(entities.tutarlar),
    plakalar: benzersiz(entities.plakalar),
    donemler: benzersiz(entities.donemler),
    kisiKurumlar: benzersiz(entities.kisiKurumlar).slice(0, 10),
  };
}

const benzersiz = (xs: string[]): string[] =>
  [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
