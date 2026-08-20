/**
 * Madde numaralarinin cozulmesi — ayristirmanin IKINCI gecisi.
 *
 * Ilk gecis maddeleri sirayla toplar ama bazi basliklarda "Madde N" ibaresi
 * OCR'da kaybolmustur; o maddeler numarasiz (PendingArticle) bekler. Numara
 * ancak komsu maddeler onu TEK BIR sekilde belirliyorsa atanir.
 *
 * Aritmetik kesin degilse madde ayri tutulmaz, onceki maddenin govdesine geri
 * katilir: yanlis madde atfi uretmektense parcayi buyutmek yeglenir — bir
 * yonetmelik maddesine yanlis numara vermek, dayanaksiz bir hukuki atif demek.
 */
import type { RegulationChunkMetadata } from "@albay/shared";

/** Numarasi kaynak metinde okunamamis madde — ikinci gecise birakilir. */
export interface PendingArticle {
  baslik: string;
  kisim: string | null;
  bolum: string | null;
  body: string[];
  explicitNo: number | null;
}

export interface ParsedArticle {
  metadata: RegulationChunkMetadata;
  body: string[];
}

export function resolveArticleNumbers(pending: PendingArticle[]): ParsedArticle[] {
  const out: ParsedArticle[] = [];

  for (let i = 0; i < pending.length; i++) {
    const article = pending[i]!;
    if (article.explicitNo !== null) {
      out.push(toParsedArticle(article, String(article.explicitNo), true));
      continue;
    }

    const prev = findExplicit(pending, i, -1);
    const next = findExplicit(pending, i, 1);
    const inferred = prev !== null && next !== null && next - prev === 2 ? prev + 1 : null;

    if (inferred === null) {
      const target = out[out.length - 1];
      if (target) {
        target.body.push("", article.baslik, ...article.body);
      }
      continue;
    }
    out.push(toParsedArticle(article, String(inferred), false));
  }

  return out;
}

function findExplicit(pending: PendingArticle[], from: number, step: 1 | -1): number | null {
  for (let i = from + step; i >= 0 && i < pending.length; i += step) {
    const no = pending[i]!.explicitNo;
    if (no !== null) return no;
  }
  return null;
}

function toParsedArticle(
  article: PendingArticle,
  maddeNo: string,
  maddeNoKesin: boolean,
): ParsedArticle {
  return {
    metadata: {
      kisim: article.kisim,
      bolum: article.bolum,
      hizmetBirimi: null,
      altBolum: null,
      servis: null,
      servisNo: null,
      maddeNo,
      baslik: article.baslik,
      maddeNoKesin,
    },
    body: article.body,
  };
}
