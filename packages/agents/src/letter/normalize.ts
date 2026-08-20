/** Cok satirli/markdown'lu model ciktisini duz paragraflara indirger. */
import type { LetterBody } from "@albay/shared";

export function normalizeBody(body: LetterBody): LetterBody {
  const temizle = (s: string) =>
    s
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    ilgiSatirlari: body.ilgiSatirlari.map(temizle).filter(Boolean),
    paragraflar: body.paragraflar.map(temizle).filter(Boolean),
    gerekce: temizle(body.gerekce),
  };
}
