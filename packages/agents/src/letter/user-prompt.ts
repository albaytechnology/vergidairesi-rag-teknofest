/** Modelin gorecegi kullanici mesaji: karar, analiz ve atif yapilabilir mevzuat. */
import type { LetterDecision } from "@albay/shared";
import type { LetterDraftInput } from "./types.ts";

/**
 * Karar aciklamalari bilerek duz cumle; once "Talep UYGUN GORULDU" gibi
 * buyuk harfli etiketler yazilmisti ve model bunlari yaziya oldugu gibi
 * kopyaliyordu ("...talebiniz UYGUN GORULDU."). Etiket gibi gorunmeyen metin
 * kopyalanmiyor, anlatiliyor.
 */
const KARAR_METNI: Record<LetterDecision, string> = {
  onay: "Talep kabul edildi; istenen islem yapilacak.",
  kismi_onay: "Talep kismen kabul edildi; bir bolumu karsilanmiyor.",
  red: "Talep kabul edilmedi.",
  eksik_belge: "Talep degerlendirilemiyor; eksik belge/bilgi tamamlanmali.",
  bilgilendirme: "Karar niteliginde degil; mukellefe bilgi veriliyor.",
};

export function kullaniciPromptu(input: LetterDraftInput): string {
  const { analiz, karar } = input;
  const e = analiz.entities;
  const satirlar = [
    `KARAR: ${KARAR_METNI[karar]}`,
    input.kararGerekcesi ? `Servis calisaninin gerekcesi: ${input.kararGerekcesi}` : "",
    "",
    "EVRAK ANALIZI",
    `Belge turu: ${analiz.docType}`,
    `Konu: ${analiz.konu}`,
    `Talep edilen islem: ${analiz.islemTuru}`,
    analiz.alacakTuru ? `Alacak/vergi turu: ${analiz.alacakTuru}` : "",
    `Ozet: ${analiz.ozet}`,
    "",
    "EVRAKTAN CIKARILAN DEGERLER (yaziya girebilecek TEK sayisal kaynak)",
    `Tarihler: ${liste(e.tarihler)}`,
    `Tutarlar: ${liste(e.tutarlar)}`,
    `Donemler: ${liste(e.donemler)}`,
    `Plakalar: ${liste(e.plakalar)}`,
    `Vergi kimlik no: ${e.vkn ?? "yok"}`,
    `T.C. kimlik no: ${e.tckn ?? "yok"}`,
    `Kisi/kurumlar: ${liste(e.kisiKurumlar)}`,
  ];

  if (input.maddeler?.length) {
    satirlar.push(
      "",
      "ATIF YAPILABILECEK MEVZUAT (baskasina atif yapma)",
      ...input.maddeler.map((m) => `- Madde ${m.maddeNo}: ${m.baslik}`),
    );
  }
  return satirlar.filter((s) => s !== "").join("\n");
}

/** Yakalanan uydurma sayilar icin yeniden deneme talimati. */
export const duzeltmeTalimati = (sayilar: string[]): string =>
  `DUZELTME: Onceki taslaginda su sayisal degerler yer aldi ama evrakta ` +
  `KARSILIGI YOK: ${sayilar.join(", ")}. Bunlar uydurmadir. Yaziyi bastan yaz ve ` +
  `bu degerleri KULLANMA — ilgili cumleyi ya sayisiz kur ya da tamamen cikar. ` +
  `Ornegin evrakin sayisi bilinmiyorsa ilgi satirini "a) ... tarihli dilekceniz." ` +
  `seklinde, sayi belirtmeden yaz.`;

const liste = (xs: string[]): string => (xs.length ? xs.join(" | ") : "yok");
