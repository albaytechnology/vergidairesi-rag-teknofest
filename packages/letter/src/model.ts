/**
 * Resmi yazi modelinin kurulmasi.
 *
 * Yazinin bicimsel ogelerinin TAMAMI burada belirlenir; LLM yalnizca ilgi
 * satirlari ve govde paragraflarini verir (bkz. packages/agents/src/letter.ts).
 * Blok sirasi ve adlandirma "Resmi Yazismalarda Uygulanacak Usul ve Esaslar
 * Hakkinda Yonetmelik" (2646 sayili Cumhurbaskani Karari) duzenine gore.
 *
 * Kurum kodu, imza sahibi, iletisim gibi alanlar SISTEM TARAFINDAN BILINEMEZ.
 * Bos birakilanlar uydurulmaz; gorunur bir yer tutucuyla basilir ve
 * eksikAlanlar listesinde raporlanir. Sahte DETSIS numarasi ya da sahte imza
 * sahibi tasiyan bir yazi, gecerli bir resmi belge gibi kullanilabilir —
 * bu yuzden bosluk birakmak, doldurmaktan guvenlidir.
 */
import {
  config,
  type DocumentAnalysis,
  type LetterBody,
  type LetterDecision,
  type LetterModel,
  type LetterRecipient,
} from "@albay/shared";

/**
 * Antet/imza/iletisim bilgileri. Varsayilani ortam degiskenlerinden gelir;
 * override edilebilir olmasi hem testi env'den bagimsiz kilar hem de ileride
 * tek kurulumun birden fazla vergi dairesine yazi uretmesine izin verir.
 */
export interface KurumBilgileri {
  kurumAdi: string;
  birimAdi: string;
  detsisNo: string;
  dosyaPlani: string;
  imzaAd: string;
  imzaUnvan: string;
  adres: string;
  telefon: string;
  eposta: string;
  web: string;
  kep: string;
}

export const kurumBilgileriFromConfig = (): KurumBilgileri => ({
  kurumAdi: config.LETTER_KURUM_ADI,
  birimAdi: config.LETTER_BIRIM_ADI,
  detsisNo: config.LETTER_DETSIS_NO,
  dosyaPlani: config.LETTER_DOSYA_PLANI,
  imzaAd: config.LETTER_IMZA_AD,
  imzaUnvan: config.LETTER_IMZA_UNVAN,
  adres: config.LETTER_ADRES,
  telefon: config.LETTER_TELEFON,
  eposta: config.LETTER_EPOSTA,
  web: config.LETTER_WEB,
  kep: config.LETTER_KEP,
});

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

/** Yer tutucu bicimi — sablonda vurgulanarak basilir, gozden kacmasin diye. */
export const YER_TUTUCU = (alan: string): string => `[${alan}]`;

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

  const muhatap = muhatabiKur(input, eksikAlanlar);

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

/**
 * Muhatap. Formdan gelen deger analizden gelene ustundur — adi okuyan insandir.
 * Hicbiri yoksa yer tutucu basilir: yanlis kisiye yazi cikmasindansa bos kalsin.
 */
function muhatabiKur(input: BuildLetterInput, eksikAlanlar: string[]): LetterRecipient {
  const formdan = input.muhatap ?? {};
  const analizden = input.analiz.entities.kisiKurumlar[0] ?? "";
  const ad = (formdan.ad ?? analizden).trim();
  if (!ad) eksikAlanlar.push("Muhatap adı (form)");

  const e = input.analiz.entities;
  return {
    ad: ad || YER_TUTUCU("MUHATAP"),
    tur: formdan.tur ?? "kisi",
    adres: formdan.adres?.trim() || null,
    // Checksum'dan gecmis numara yoksa null kalir (analyzer garanti eder).
    vknTckn: formdan.vknTckn?.trim() || e.vkn || e.tckn || null,
  };
}

/** Konu satiri kisa olmali (yonetmelik: sayfanin ortasini gecmez). */
function konuSatiri(analiz: BuildLetterInput["analiz"]): string {
  const aday = analiz.baslikOnerisi.trim() || analiz.konu.trim();
  const temiz = aday.replace(/\s+/g, " ").replace(/[.]+$/, "");
  return temiz.length > 90 ? `${temiz.slice(0, 87).trimEnd()}...` : temiz;
}

/**
 * Kapanis cumlesi karardan turetilir, modele birakilmaz.
 * Mukellefe (gercek/tuzel kisi) "rica ederim" kullanilir; "arz ederim" ust
 * makama yazilan yazilara ozgudur ve buraya uymaz.
 */
function kapanisCumlesi(karar: LetterDecision, tur: LetterRecipient["tur"]): string {
  if (karar === "eksik_belge") {
    return "Eksik belge ve bilgilerin tamamlanması hususunda gereğini rica ederim.";
  }
  return tur === "kurum"
    ? "Bilgilerini ve gereğini rica ederim."
    : "Bilgi edinilmesini rica ederim.";
}

const trTarih = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
