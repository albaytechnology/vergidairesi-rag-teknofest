/**
 * Resmi yazi → DOCX.
 *
 * PDF'in aksine girdi HTML degil YAPISAL MODELDIR: Word ciktisi kurum icinde
 * uzerine yazilmaya devam edilecek bir taslak oldugu icin, stil bilgisi
 * HTML'den cevrilmis satir yiginlari yerine gercek Word paragraflari olarak
 * uretilir.
 *
 * ONEMLI SINIR: bu nedenle onizlemede HTML uzerinde yapilan serbest metin
 * duzeltmeleri DOCX'e kendiliginden yansimaz. Arayuz, duzenlenmis paragraflari
 * modele geri yazip oyle gondermelidir (bkz. POST /api/response-letter/docx).
 */
import { Document, Packer } from "docx";
import type { LetterModel } from "@albay/shared";
import { FONT, KENAR, PUNTO } from "./paragraph.ts";
import { govde } from "./sections.ts";

export async function letterToDocx(model: LetterModel): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: PUNTO } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4, twip
            margin: { top: KENAR, right: KENAR, bottom: KENAR, left: KENAR },
          },
        },
        children: govde(model),
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
