/**
 * Cevap yazisi taslagi uretimi (Faz 5c).
 *
 * Bicimlendirme burada YOK: bu modul yalnizca yazinin metnini (ilgi satirlari +
 * govde paragraflari) uretir, resmi yazi duzenini packages/letter kurar. Boylece
 * sablon LLM'siz test edilebilir, uretim de sablondan bagimsiz degistirilebilir.
 *
 * Kritik davranis: modelin yazdigi her sayisal deger, evrak analizindeki
 * degerlerle capraz kontrol edilir. Mukellefe gonderilecek resmi bir yaziya
 * uydurulmus bir tutar/tarih/taksit sayisi girmesi, sistemin uretebilecegi en
 * pahali hatadir; prompt kurali tek basina yeterli guvence degildir.
 */
import { OllamaClient } from "@albay/llm";
import {
  LetterBodySchema,
  type DocumentAnalysis,
  type LetterBody,
  type LetterDecision,
} from "@albay/shared";
import { RESPONSE_LETTER_PROMPT, RESPONSE_LETTER_SCHEMA } from "./prompts.ts";

const ollama = new OllamaClient();

/** Gerekce zorunlu olan kararlar — olumsuz ya da kosullu sonuclar. */
const GEREKCE_ZORUNLU: ReadonlySet<LetterDecision> = new Set([
  "red",
  "kismi_onay",
  "eksik_belge",
]);

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

export interface LetterDraftInput {
  analiz: DocumentAnalysis;
  karar: LetterDecision;
  /** Servis calisaninin kendi gerekcesi. Verilirse modelinkinin yerine gecer. */
  kararGerekcesi?: string;
  /** Yonlendirme kararindan gelen mevzuat maddeleri — atif yapilabilecek tek kaynak. */
  maddeler?: { maddeNo: string; baslik: string }[];
  /** Evrakin ham metni. Sayi dogrulamasinda ek kaynak olarak kullanilir. */
  belgeMetni?: string;
}

export interface LetterDraftResult {
  body: LetterBody;
  /** Kaynakta karsiligi bulunamayan sayisal degerler — arayuzde isaretlenir. */
  dayanaksizSayilar: string[];
  trace: string[];
}

/**
 * Deneme sayisi. Ilk deneme taslagi uretir; kalanlar ya sema hatasini ya da
 * yakalanan uydurma sayilari duzeltmek icindir (corrective-RAG'daki
 * grader → geri bildirimle yeniden dene deseninin aynisi).
 */
const MAX_DENEME = 3;

export async function draftResponseLetter(input: LetterDraftInput): Promise<LetterDraftResult> {
  const trace: string[] = [];
  const temelPrompt = kullaniciPromptu(input);
  const kaynak = kaynakMetni(input);

  let lastError: Error | null = null;
  let sonSonuc: { body: LetterBody; dayanaksizSayilar: string[] } | null = null;

  for (let attempt = 0; attempt < MAX_DENEME; attempt++) {
    const userPrompt =
      sonSonuc?.dayanaksizSayilar.length
        ? `${temelPrompt}\n\n${duzeltmeTalimati(sonSonuc.dayanaksizSayilar)}`
        : temelPrompt;
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: RESPONSE_LETTER_PROMPT },
          { role: "user", content: userPrompt },
        ],
        // Sicaklik 0.2: resmi yazi dilinin akiciligi icin biraz alan birakiliyor;
        // sayisal degerler zaten asagida deterministik olarak denetleniyor.
        {
          format: RESPONSE_LETTER_SCHEMA as unknown as Record<string, unknown>,
          temperature: 0.2,
        },
      );
      const body = normalize(LetterBodySchema.parse(JSON.parse(raw)));

      // Insan gerekcesi modelinkini ezer — karari veren o.
      const gerekce = input.kararGerekcesi?.trim() || body.gerekce;
      if (GEREKCE_ZORUNLU.has(input.karar) && !gerekce) {
        throw new Error(`'${input.karar}' karari icin gerekce zorunlu, model bos dondu`);
      }

      const nihai: LetterBody = {
        ...body,
        gerekce: GEREKCE_ZORUNLU.has(input.karar) ? gerekce : "",
      };
      const dayanaksizSayilar = verifyLetterNumbers(nihai, kaynak);
      trace.push(`taslak → ${nihai.paragraflar.length} paragraf (deneme ${attempt + 1})`);
      sonSonuc = { body: nihai, dayanaksizSayilar };

      if (!dayanaksizSayilar.length) return { ...sonSonuc, trace };
      trace.push(`kaynakta bulunmayan sayisal deger → ${dayanaksizSayilar.join(", ")}`);
      // Son denemede de duzelmediyse uyariyla birlikte don: yazi insan
      // onayindan geciyor, tamamen reddetmek calisani bos birakirdi.
    } catch (err) {
      lastError = err as Error;
      trace.push(`deneme ${attempt + 1} basarisiz: ${lastError.message}`);
    }
  }

  if (sonSonuc) {
    trace.push("UYARI: uydurma sayilar duzeltilemedi — arayuzde isaretlenecek");
    return { ...sonSonuc, trace };
  }
  throw new Error(`Cevap yazisi taslagi uretilemedi: ${lastError?.message}`);
}

const duzeltmeTalimati = (sayilar: string[]): string =>
  `DUZELTME: Onceki taslaginda su sayisal degerler yer aldi ama evrakta ` +
  `KARSILIGI YOK: ${sayilar.join(", ")}. Bunlar uydurmadir. Yaziyi bastan yaz ve ` +
  `bu degerleri KULLANMA — ilgili cumleyi ya sayisiz kur ya da tamamen cikar. ` +
  `Ornegin evrakin sayisi bilinmiyorsa ilgi satirini "a) ... tarihli dilekceniz." ` +
  `seklinde, sayi belirtmeden yaz.`;

function kullaniciPromptu(input: LetterDraftInput): string {
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

const liste = (xs: string[]): string => (xs.length ? xs.join(" | ") : "yok");

/** Sayi dogrulamasinda "dogru kabul edilen" kaynak metin. */
function kaynakMetni(input: LetterDraftInput): string {
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

/** En az iki basamakli sayisal ifadeler — tek haneliler siralamada gecer, gurultu. */
const SAYI_RE = /\d[\d.,:/]*\d|\d{2,}/g;

/**
 * Yazidaki sayisal degerlerin kaynakta karsiligi olup olmadigini denetler.
 *
 * Karsilastirma basamaklar uzerinden yapilir: "18.247,00 TL" ile "18.247 TL"
 * ayni degerdir ama karakter karakter esit degildir. Bu yuzden ON EK iliskisi
 * de kabul edilir (18247 ↔ 1824700) — kurus ve bicim farki yanlis alarm uretmesin.
 *
 * Serbest alt-dize eslesmesi BILEREK kullanilmiyor: uydurulmus "2,5" orani
 * (basamaklari "25") kaynaktaki "2025/3" (basamaklari "20253") icinde geciyor
 * ve gercek bir uydurma denetimden kaciyordu. On ek kurali ise en az uc
 * basamak ister, boylece kisa sayilar ancak birebir esitse gecer.
 *
 * Tek haneliler denetlenmez (siralama/madde imi gurultusu).
 */
const ONEK_ESIGI = 3;

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

/** Cok satirli/markdown'lu model ciktisini duz paragraflara indirger. */
function normalize(body: LetterBody): LetterBody {
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
