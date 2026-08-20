/**
 * Yazidaki sayisal degerlerin kaynakta karsiligi olup olmadiginin denetimi.
 *
 * Mukellefe gonderilecek resmi bir yaziya uydurulmus bir tutar/tarih/taksit
 * sayisi girmesi, sistemin uretebilecegi en pahali hatadir; prompt kurali tek
 * basina yeterli guvence degildir.
 */
import type { LetterBody } from "@albay/shared";
import type { LetterDraftInput } from "./types.ts";

/** En az iki basamakli sayisal ifadeler — tek haneliler siralamada gecer, gurultu. */
const SAYI_RE = /\d[\d.,:/]*\d|\d{2,}/g;

/**
 * Karsilastirma basamaklar uzerinden yapilir: "18.247,00 TL" ile "18.247 TL"
 * ayni degerdir ama karakter karakter esit degildir. Bu yuzden ON EK iliskisi
 * de kabul edilir (18247 ↔ 1824700) — kurus ve bicim farki yanlis alarm uretmesin.
 *
 * Serbest alt-dize eslesmesi BILEREK kullanilmiyor: uydurulmus "2,5" orani
 * (basamaklari "25") kaynaktaki "2025/3" (basamaklari "20253") icinde geciyor
 * ve gercek bir uydurma denetimden kaciyordu. On ek kurali ise en az uc
 * basamak ister, boylece kisa sayilar ancak birebir esitse gecer.
 */
const ONEK_ESIGI = 3;

/** Sayi dogrulamasinda "dogru kabul edilen" kaynak metin. */
export function kaynakMetni(input: LetterDraftInput): string {
  const e = input.analiz.entities;
  return [
    input.analiz.konu,
    input.analiz.ozet,
    input.analiz.alacakTuru,
    ...e.tarihler,
    ...e.tutarlar,
    ...e.donemler,
    ...e.plakalar,
    ...e.kisiKurumlar,
    e.vkn ?? "",
    e.tckn ?? "",
    ...(input.maddeler ?? []).flatMap((m) => [m.maddeNo, m.baslik]),
    input.kararGerekcesi ?? "",
    input.belgeMetni ?? "",
  ].join("\n");
}

/** Kaynakta karsiligi bulunamayan sayisal degerleri dondurur (tek haneliler haric). */
export function verifyLetterNumbers(body: LetterBody, kaynak: string): string[] {
  const kaynakBasamaklar = [...kaynak.matchAll(SAYI_RE)].map(basamaklar).filter(Boolean);
  const kaynakDuz = kaynak.replace(/\s+/g, " ");

  const metin = [...body.ilgiSatirlari, ...body.paragraflar, body.gerekce].join("\n");
  const suphe = new Set<string>();

  for (const eslesme of metin.matchAll(SAYI_RE)) {
    const ham = eslesme[0];
    const d = basamaklar(eslesme);
    if (d.length < 2) continue;
    if (kaynakDuz.includes(ham)) continue;
    if (kaynakBasamaklar.some((k) => desteklenir(d, k))) continue;
    suphe.add(ham);
  }
  return [...suphe];
}

const desteklenir = (yazidaki: string, kaynaktaki: string): boolean =>
  yazidaki === kaynaktaki ||
  (yazidaki.length >= ONEK_ESIGI && kaynaktaki.startsWith(yazidaki)) ||
  (kaynaktaki.length >= ONEK_ESIGI && yazidaki.startsWith(kaynaktaki));

const basamaklar = (m: RegExpMatchArray | RegExpExecArray): string =>
  m[0].replace(/\D/g, "");
