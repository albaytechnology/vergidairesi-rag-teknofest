/**
 * Word paragrafi kurma ve olcu sabitleri.
 *
 * docx kitapligi olculeri twip ve yarim punto cinsinden istiyor; ham sayilarin
 * govde kodunun icine dagilmasi yerine burada adlandirildilar.
 */
import { AlignmentType, Paragraph, TextRun } from "docx";

export const FONT = "Times New Roman";
export const PUNTO = 24; // yarim punto birimi → 12 punto
export const KUCUK = 22; // 11 punto
export const MINIK = 16; // 8 punto — iletisim blogu
/** 1 cm ≈ 566,93 twip. Yonetmelik: her yandan 2,5 cm. */
export const KENAR = 1417;
/** Paragraf basi girintisi: 1,25 cm. */
const GIRINTI = 709;

export interface SatirOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bold?: boolean;
  size?: number;
  /** Paragraf basi girintisi (1,25 cm). */
  indent?: boolean;
  before?: number;
  after?: number;
}

export function satir(text: string, opts: SatirOpts = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    indent: opts.indent ? { firstLine: GIRINTI } : undefined,
    children: [
      new TextRun({ text, font: FONT, size: opts.size ?? PUNTO, bold: opts.bold ?? false }),
    ],
  });
}
