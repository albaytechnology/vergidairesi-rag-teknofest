/**
 * Resmi yazi modelinin kurulmasi.
 *
 * Yazinin bicimsel ogelerinin TAMAMI burada belirlenir; LLM yalnizca ilgi
 * satirlari ve govde paragraflarini verir (bkz. packages/agents/src/letter/).
 * Blok sirasi ve adlandirma "Resmi Yazismalarda Uygulanacak Usul ve Esaslar
 * Hakkinda Yonetmelik" (2646 sayili Cumhurbaskani Karari) duzenine gore.
 *
 * Kurum kodu, imza sahibi, iletisim gibi alanlar SISTEM TARAFINDAN BILINEMEZ.
 * Bos birakilanlar uydurulmaz; gorunur bir yer tutucuyla basilir ve
 * eksikAlanlar listesinde raporlanir. Sahte DETSIS numarasi ya da sahte imza
 * sahibi tasiyan bir yazi, gecerli bir resmi belge gibi kullanilabilir —
 * bu yuzden bosluk birakmak, doldurmaktan guvenlidir.
 */
import type {
  DocumentAnalysis,
  LetterBody,
  LetterDecision,
  LetterModel,
  LetterRecipient,
} from "@albay/shared";
import { kurumBilgileriFromConfig, type KurumBilgileri } from "./institution.ts";
import { YER_TUTUCU, kapanisCumlesi, konuSatiri, muhatabiKur, trTarih } from "./fields.ts";

export interface BuildLetterInput {
  analiz: Pick<DocumentAnalysis, "konu" | "baslikOnerisi" | "entities">;
  body: LetterBody;
  karar: LetterDecision;
  /** Giden evrak sira numarasi (veritabani sayacindan). Yoksa yer tutucu basilir. */
  sayiNo?: number | null;
  tarih?: Date;
  /** Arayuzdeki formdan gelen muhatap bilgisi; verilmeyen alanlar analizden tamamlanir. */
  muhatap?: Partial<LetterRecipient>;
  imza?: { ad?: string; unvan?: string };
  ekler?: string[];
  dagitim?: string[];
  /** false yapilmasi yaziyi imzali hale GETIRMEZ, yalnizca taslak damgasini kaldirir. */
  taslak?: boolean;
  /** Verilmezse ortam degiskenlerinden okunur. */
  kurum?: KurumBilgileri;
}

export function buildLetterModel(input: BuildLetterInput): LetterModel {
  const eksikAlanlar: string[] = [];
  const kurum = input.kurum ?? kurumBilgileriFromConfig();

  /** Bos gelen yapilandirma alanini yer tutucuya cevirir ve rapora ekler. */
  const zorunlu = (deger: string, alanAdi: string, envAdi: string): string => {
    const v = deger.trim();
    if (v) return v;
    eksikAlanlar.push(`${alanAdi} (${envAdi})`);
    return YER_TUTUCU(alanAdi.toLocaleUpperCase("tr-TR"));
  };

  const kurumAdi = zorunlu(kurum.kurumAdi, "Kurum adı", "LETTER_KURUM_ADI");
  const birimAdi = zorunlu(kurum.birimAdi, "Birim adı", "LETTER_BIRIM_ADI");
  const imzaAd = zorunlu(input.imza?.ad ?? kurum.imzaAd, "İmza sahibi", "LETTER_IMZA_AD");
  const imzaUnvan = zorunlu(
    input.imza?.unvan ?? kurum.imzaUnvan,
    "İmza unvanı",
    "LETTER_IMZA_UNVAN",
  );

  const detsis = zorunlu(kurum.detsisNo, "DETSİS no", "LETTER_DETSIS_NO");
  const dosyaPlani = zorunlu(kurum.dosyaPlani, "Dosya planı kodu", "LETTER_DOSYA_PLANI");
  const siraNo =
    input.sayiNo === undefined || input.sayiNo === null
      ? YER_TUTUCU("SIRA NO")
      : String(input.sayiNo);

  const muhatap = muhatabiKur(input.muhatap, input.analiz.entities, eksikAlanlar);

  return {
    taslak: input.taslak ?? true,
    kurumAdi,
    birimAdi,
    // e-Yazisma bicimi: E-<DETSIS>-<dosya plani>-<sira no>
    sayi: `E-${detsis}-${dosyaPlani}-${siraNo}`,
    tarih: trTarih(input.tarih ?? new Date()),
    konu: konuSatiri(input.analiz),
    muhatap,
    ilgiSatirlari: input.body.ilgiSatirlari,
    paragraflar: input.body.paragraflar,
    kapanis: kapanisCumlesi(input.karar, muhatap.tur),
    imzaAd,
    imzaUnvan,
    ekler: input.ekler ?? [],
    dagitim: input.dagitim ?? [],
    iletisim: {
      adres: kurum.adres,
      telefon: kurum.telefon,
      eposta: kurum.eposta,
      web: kurum.web,
      kep: kurum.kep,
    },
    eksikAlanlar,
  };
}
