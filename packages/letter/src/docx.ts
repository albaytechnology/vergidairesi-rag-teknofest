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
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from "docx";
import type { LetterModel } from "@albay/shared";

const FONT = "Times New Roman";
const PUNTO = 24; // yarim punto birimi → 12 punto
const KUCUK = 22; // 11 punto
const MINIK = 16; // 8 punto — iletisim blogu
/** 1 cm ≈ 566,93 twip. Yonetmelik: her yandan 2,5 cm. */
const KENAR = 1417;
const ILGI_HARFLERI = "abcdefghijklmnopqrstuvwxyz";

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

function govde(model: LetterModel): Paragraph[] {
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
  const muhatapAd =
    model.muhatap.tur === "kurum"
      ? model.muhatap.ad.toLocaleUpperCase("tr-TR")
      : `Sayın ${model.muhatap.ad}`;
  p.push(satir(muhatapAd, { align: AlignmentType.CENTER, bold: true }));
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

  // Ilgi
  model.ilgiSatirlari.forEach((s, i) => {
    const harfli = /^[a-zçğıöşü]\s*\)/i.test(s.trim());
    const etiket = i === 0 ? "İlgi    : " : "          ";
    const harf = harfli ? "" : `${ILGI_HARFLERI[i] ?? "+"}) `;
    p.push(satir(`${etiket}${harf}${s.trim()}`));
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
    p.push(satir(model.ekler.length > 1 ? "Ekler:" : "Ek:", { bold: true, size: KUCUK }));
    model.ekler.forEach((e, i) => p.push(satir(`${i + 1}- ${e}`, { size: KUCUK })));
    p.push(satir("", { after: 200 }));
  }
  if (model.dagitim.length) {
    p.push(satir("Dağıtım:", { bold: true, size: KUCUK }));
    for (const d of model.dagitim) p.push(satir(d, { size: KUCUK }));
    p.push(satir("", { after: 200 }));
  }

  const iletisim = [
    model.iletisim.adres && `Adres: ${model.iletisim.adres}`,
    model.iletisim.telefon && `Telefon: ${model.iletisim.telefon}`,
    model.iletisim.eposta && `e-Posta: ${model.iletisim.eposta}`,
    model.iletisim.web && `İnternet adresi: ${model.iletisim.web}`,
    model.iletisim.kep && `KEP: ${model.iletisim.kep}`,
  ].filter((x): x is string => Boolean(x));
  if (iletisim.length) {
    p.push(satir(iletisim.join("  •  "), { size: MINIK, before: 400 }));
  }
  return p;
}

interface SatirOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bold?: boolean;
  size?: number;
  /** Paragraf basi girintisi (1,25 cm). */
  indent?: boolean;
  before?: number;
  after?: number;
}

function satir(text: string, opts: SatirOpts = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    indent: opts.indent ? { firstLine: 709 } : undefined,
    children: [
      new TextRun({ text, font: FONT, size: opts.size ?? PUNTO, bold: opts.bold ?? false }),
    ],
  });
}
