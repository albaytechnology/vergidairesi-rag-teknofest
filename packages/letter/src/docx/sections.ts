/**
 * Yazinin Word paragraflari — yonetmelikteki blok sirasiyla.
 *
 * Blok metinleri ../blocks.ts'ten gelir; boylece HTML ciktisiyla ayni kurallara
 * uyar (ilgi harfi, muhatap hitabi, ek basligi).
 */
import { AlignmentType, Paragraph, TabStopPosition, TabStopType, TextRun } from "docx";
import type { LetterModel } from "@albay/shared";
import { ekBasligi, ekSatiri, ilgiSatiri, iletisimSatirlari, muhatapAdi } from "../blocks.ts";
import { FONT, KUCUK, MINIK, PUNTO, satir } from "./paragraph.ts";

export function govde(model: LetterModel): Paragraph[] {
  const p: Paragraph[] = [];

  if (model.taslak) {
    p.push(
      satir("— TASLAK: güvenli elektronik imza ile imzalanmamıştır —", {
        align: AlignmentType.CENTER,
        size: MINIK,
        bold: true,
        after: 200,
      }),
    );
  }

  // Antet
  p.push(satir("T.C.", { align: AlignmentType.CENTER }));
  p.push(
    satir(model.kurumAdi.toLocaleUpperCase("tr-TR"), {
      align: AlignmentType.CENTER,
      bold: true,
    }),
  );
  p.push(satir(model.birimAdi, { align: AlignmentType.CENTER, after: 400 }));

  // Sayi (solda) + tarih (sagda, sag sekme durakli)
  p.push(
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: `Sayı   : ${model.sayi}`, font: FONT, size: PUNTO }),
        new TextRun({ text: `\t${model.tarih}`, font: FONT, size: PUNTO }),
      ],
    }),
  );
  p.push(satir(`Konu  : ${model.konu}`, { after: 600 }));

  // Muhatap
  p.push(satir(muhatapAdi(model.muhatap), { align: AlignmentType.CENTER, bold: true }));
  if (model.muhatap.vknTckn) {
    p.push(
      satir(`(VKN/TCKN: ${model.muhatap.vknTckn})`, {
        align: AlignmentType.CENTER,
        size: KUCUK,
      }),
    );
  }
  if (model.muhatap.adres) {
    p.push(satir(model.muhatap.adres, { align: AlignmentType.CENTER, size: KUCUK }));
  }
  p.push(satir("", { after: 400 }));

  // Ilgi — ilk satir etiketli, devami hizalama boslugu ile
  model.ilgiSatirlari.forEach((s, i) => {
    const etiket = i === 0 ? "İlgi    : " : "          ";
    p.push(satir(`${etiket}${ilgiSatiri(s, i)}`));
  });
  if (model.ilgiSatirlari.length) p.push(satir("", { after: 200 }));

  // Metin
  for (const paragraf of model.paragraflar) {
    p.push(satir(paragraf, { align: AlignmentType.JUSTIFIED, indent: true, after: 160 }));
  }
  p.push(satir(model.kapanis, { align: AlignmentType.JUSTIFIED, indent: true, after: 600 }));

  // Imza
  p.push(satir(model.imzaAd, { align: AlignmentType.RIGHT }));
  p.push(satir(model.imzaUnvan, { align: AlignmentType.RIGHT, after: 400 }));

  if (model.ekler.length) {
    p.push(satir(ekBasligi(model.ekler), { bold: true, size: KUCUK }));
    model.ekler.forEach((e, i) => p.push(satir(ekSatiri(e, i), { size: KUCUK })));
    p.push(satir("", { after: 200 }));
  }
  if (model.dagitim.length) {
    p.push(satir("Dağıtım:", { bold: true, size: KUCUK }));
    for (const d of model.dagitim) p.push(satir(d, { size: KUCUK }));
    p.push(satir("", { after: 200 }));
  }

  const iletisim = iletisimSatirlari(model.iletisim);
  if (iletisim.length) {
    p.push(satir(iletisim.join("  •  "), { size: MINIK, before: 400 }));
  }
  return p;
}
