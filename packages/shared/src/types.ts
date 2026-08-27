import { z } from "zod";

/** Chunk semasi. kind: "child" = arama icin kucuk parca, "parent" = LLM'e genis baglam. */
export const ChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  kind: z.enum(["child", "parent"]),
  text: z.string(),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  parentId: z.string().nullable(),
  tokenCount: z.number().int(),
  metadata: z.record(z.unknown()).optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const CorpusSchema = z.enum(["documents", "regulations"]);
export type Corpus = z.infer<typeof CorpusSchema>;

/**
 * Parse kuyrugu is sozlesmesi — URETICI (apps/api, enqueue CLI) ile TUKETICI
 * (ingestion-worker) arasinda paylasilir.
 *
 * Burada duruyor cunku iki tarafta ayri ayri tanimliyken sessizce ayristilar:
 * API'ye sessionId eklendi, worker'in tipinde yoktu ve alan is govdesinden
 * dusuyordu. Tek tanim, bu sinifin hatalarini derleme zamaninda yakalar.
 */
export interface ParseJobData {
  /** Kaynak dosyanin mutlak yolu. */
  path: string;
  /** Hangi korpusa ait; verilmezse "documents". */
  corpus?: Corpus;
  /**
   * Doluysa bu dosya bir SOHBET EKIDIR, resmi evrak degil: analiz ve servis
   * yonlendirmesi calistirilmaz, yalnizca aranabilir olmasi icin chunk/embed
   * edilir ve belge kalici olarak bu oturuma baglanir.
   */
  sessionId?: string;
}

export interface ProcessJobData {
  docId: string;
  corpus?: Corpus;
  /** Sohbet ekleri icin true: analiz + yonlendirme atlanir. */
  skipAnalysis?: boolean;
}

export const RegulationChunkMetadataSchema = z.object({
  kisim: z.string().nullable(),
  bolum: z.string().nullable(),
  hizmetBirimi: z.string().nullable(),
  altBolum: z.string().nullable(),
  servis: z.string().nullable(),
  /** Servisin madde icindeki sira numarasi ("2" -> "2) Surekli Yukumlulukler...").
   *  Atif yollarini ("11-A-I-2-f") kesin olarak parcaya baglamak icin gerekli. */
  servisNo: z.string().nullable(),
  maddeNo: z.string(),
  baslik: z.string(),
  /**
   * false ise madde numarasi kaynak metinden okunamadi (OCR kaybi) ve komsu
   * maddelerin numaralarindan aritmetikle turetildi. Atif verilirken bu bayrak
   * dikkate alinmali — "kesin degil" olarak sunulmali.
   */
  maddeNoKesin: z.boolean(),
});
export type RegulationChunkMetadata = z.infer<typeof RegulationChunkMetadataSchema>;

export const ServiceRoutingDecisionSchema = z.object({
  anaBirim: z
    .enum(["Vergilendirme", "Muhasebe", "Kovusturma", "Tarama ve Kontrol"])
    .nullable(),
  digerBirim: z
    // Yazisma ve Arsiv Servisi bilerek YOK: evrakin giris noktasidir (M.11-B-I-6),
    // yonlendirme hedefi degildir — evrak zaten oradan geliyor.
    .enum(["Gelir", "Vergi Denetmenleri", "Takdir", "Uzlasma", "Ozluk ve Destek"])
    .nullable(),
  servis: z.string().nullable(),
  altServis: z.string().nullable(),
  ilgiliMaddeler: z.array(
    z.object({
      maddeNo: z.string(),
      baslik: z.string(),
    }),
  ),
  guvenSkoru: z.number().min(0).max(1),
  belirlenemedi: z.boolean(),
  gerekce: z.string(),
});
export type ServiceRoutingDecision = z.infer<typeof ServiceRoutingDecisionSchema>;

/**
 * Vergi dairesine gelen evrakin analiz ciktisi (Faz 5b).
 *
 * Faz 3'teki DocClassification kurum korpusu icin genel bir siniflandirmaydi;
 * bu sema evraga ozel: konu/baslik cikarimi, uzun ozet ve yapisal entity'ler.
 * Sayisal kimlikler (VKN/TCKN) LLM'den geldigi gibi kabul edilmez —
 * packages/llm/src/identifiers/ icindeki checksum dogrulamasindan gecer,
 * gecemezse null yazilir. Resmi yaziya uydurma vergi numarasi girmesini
 * engelleyen katman budur.
 */
export const EvrakDocTypeSchema = z.enum([
  "dilekce",
  "resmi_yazi",
  "bildirim",
  "beyanname_eki",
  "tebligat",
  "mahkeme_karari",
  "diger",
]);
export type EvrakDocType = z.infer<typeof EvrakDocTypeSchema>;

/** Entity'ler belgede GECTIGI GIBI tutulur — normalizasyon uydurma riski tasir. */
export const ExtractedEntitiesSchema = z.object({
  vkn: z.string().nullable(),
  tckn: z.string().nullable(),
  tarihler: z.array(z.string()),
  tutarlar: z.array(z.string()),
  plakalar: z.array(z.string()),
  donemler: z.array(z.string()),
  kisiKurumlar: z.array(z.string()),
});
export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;

/**
 * Evrakla TALEP EDILEN islem. Servis yonlendirmesinin birincil sinyali budur.
 *
 * NEDEN ENUM: yonlendirme serbest metinli "konu" cumlesine dayandiginda, ayni
 * turdeki iki evrak farkli servislere gidebiliyordu — cunku konu cumlesinin
 * ayrinti duzeyi belgeden belgeye degisiyor (birinde plaka/seri no/tutar var,
 * digerinde yok) ve bu cumle dogrudan retrieval sorgusu oluyor. Dusuk kardinaliteli
 * bir enum, ayni tur evrakin ayni sorguyu uretmesini garanti eder.
 */
export const IslemTuruSchema = z.enum([
  "tecil_taksitlendirme",
  "beyanname_verme",
  "uzlasma_talebi",
  "dava_itiraz",
  "odeme_iade_duzeltme",
  "sicil_mukellefiyet",
  "haciz_satis",
  "bilgi_belge_talebi",
  "diger",
]);
export type IslemTuru = z.infer<typeof IslemTuruSchema>;

/**
 * Evrakin KUNYESI: turu, talep edilen islem, alacak turu ve yapisal alanlar.
 *
 * Ozetten AYRI duruyor cunku iki is birbirinden farkli: kunye, belgede yazan
 * alanlarin sabit bir sozlukten (enum) ya da birebir metinden okunmasi;
 * ozet ise serbest metin uretimi. Ikisi tek cagriya sikistirildiginda model
 * once uzun bir ozet yazip kunye alanlarini o ozete gore dolduruyordu —
 * yonlendirmenin birincil sinyali olan islemTuru, belgenin kendisi yerine
 * modelin kendi cumlesinin turevi haline geliyordu.
 *
 * Sira da bu yuzden onemli: once kunye, sonra ozet (bkz. llm/analysis).
 */
export const DocumentKunyeSchema = z.object({
  docType: EvrakDocTypeSchema,
  /** Talep edilen islem — yonlendirmenin birincil sinyali. */
  islemTuru: IslemTuruSchema,
  /** Islemin konusu olan vergi/alacak turu, belgede gectigi gibi. Yoksa "". */
  alacakTuru: z.string(),
  entities: ExtractedEntitiesSchema,
  containsPII: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type DocumentKunye = z.infer<typeof DocumentKunyeSchema>;

/** Evrakin insan tarafindan okunacak yuzu: konu cumlesi, kisa baslik, ozet. */
export const DocumentOzetSchema = z.object({
  konu: z.string(),
  baslikOnerisi: z.string(),
  ozet: z.string(),
});
export type DocumentOzet = z.infer<typeof DocumentOzetSchema>;

/** Iki adimin birlesimi — hattan sonra evrakin tam analizi budur. */
export const DocumentAnalysisSchema = DocumentOzetSchema.merge(DocumentKunyeSchema);
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

/**
 * Evrakta EKSIK ya da KENDI ICINDE CELISKILI olan bilgiler.
 *
 * Analizden (DocumentAnalysisSchema) farki: o, evrakta NE YAZDIGINI cikarir;
 * bu, evrakta NE YAZMADIGINI ya da iki yerde farkli yazdigini gosterir —
 * calisan cevap yazisini kurmadan once neyi tamamlatmasi gerektigini gorsun.
 *
 * kanit alani zorunlu: bulgu belgeden birebir bir alintiya baglanmazsa
 * calisanin dogrulayacagi bir sey kalmaz ve "eksik" iddiasi modelin sozune
 * kalir. Alinti bulunamayan bulgu (orn. hic yazilmamis bir alan) icin bos
 * string yazilir; arayuz o zaman alinti satirini basmaz.
 */
export const DocumentGapSchema = z.object({
  /** "eksik": belgede hic yok. "tutarsizlik": iki yerde farkli/celiskili yazilmis. */
  tur: z.enum(["eksik", "tutarsizlik"]),
  baslik: z.string(),
  aciklama: z.string(),
  onem: z.enum(["kritik", "orta", "dusuk"]),
  /** Belgeden birebir alinti; alintilanacak bir yer yoksa "". */
  kanit: z.string(),
});
export type DocumentGap = z.infer<typeof DocumentGapSchema>;

export const DocumentGapReportSchema = z.object({
  bulgular: z.array(DocumentGapSchema),
});
export type DocumentGapReport = z.infer<typeof DocumentGapReportSchema>;

// ─── Faz 5c: cevap yazisi ─────────────────────────────────────────────

/** Evraga verilecek karar. Yaziyi yazan degil, servis calisani secer. */
export const LetterDecisionSchema = z.enum([
  "onay",
  "kismi_onay",
  "red",
  "eksik_belge",
  "bilgilendirme",
]);
export type LetterDecision = z.infer<typeof LetterDecisionSchema>;

/**
 * Evrak sohbetinde bir mesajin niyeti.
 *
 * "cevap_yazisi": calisan muhataba gonderilecek resmi bir yazi istiyor —
 * RAG cevabi degil, sablonla uretilen yazi. Diger her sey "soru".
 * karar/gerekce mesajdan cikarilabildiginde dolar, aksi halde null.
 */
export const ChatIntentSchema = z.object({
  tur: z.enum(["soru", "cevap_yazisi"]),
  karar: LetterDecisionSchema.nullish(),
  gerekce: z.string().nullish(),
});
export type ChatIntent = z.infer<typeof ChatIntentSchema>;

/**
 * LLM'in cevap yazisinda uretebilecegi TEK sey: ilgi satirlari ve govde
 * paragraflari. Sayi, tarih, konu, muhatap, kapanis ve imza bloklari
 * sablondan/veritabanindan deterministik gelir — resmi yazinin bicimsel
 * ogeleri model ciktisina birakilmaz.
 */
export const LetterBodySchema = z.object({
  /** "a) 15/07/2026 tarihli dilekceniz." — yalnizca belgede gecen tarih/sayi ile. */
  ilgiSatirlari: z.array(z.string()),
  paragraflar: z.array(z.string()).min(1),
  /** Karar olumsuzsa (red/kismi_onay/eksik_belge) zorunlu; aksi halde "". */
  gerekce: z.string(),
});
export type LetterBody = z.infer<typeof LetterBodySchema>;

export const LetterRecipientSchema = z.object({
  ad: z.string(),
  tur: z.enum(["kisi", "kurum"]),
  adres: z.string().nullable(),
  /** Muhatabin vergi/kimlik numarasi — checksum'dan gecmisse yazilir. */
  vknTckn: z.string().nullable(),
});
export type LetterRecipient = z.infer<typeof LetterRecipientSchema>;

/**
 * Resmi yazinin tam modeli. Sirasi "Resmi Yazismalarda Uygulanacak Usul ve
 * Esaslar Hakkinda Yonetmelik" (2646 sayili CB Karari) blok duzenine uyar:
 * baslik → sayi/tarih → konu → muhatap → ilgi → metin → kapanis → imza →
 * ek → dagitim → iletisim.
 *
 * eksikAlanlar: kurum kodu, imza sahibi gibi YAPILANDIRMADAN gelmesi gereken
 * ama bos birakilmis alanlar. Sablon bunlari uydurmaz, gorunur bir yer
 * tutucuyla basar ve listeyi arayuze bildirir.
 */
export const LetterModelSchema = z.object({
  taslak: z.boolean(),
  kurumAdi: z.string(),
  birimAdi: z.string(),
  sayi: z.string(),
  tarih: z.string(),
  konu: z.string(),
  muhatap: LetterRecipientSchema,
  ilgiSatirlari: z.array(z.string()),
  paragraflar: z.array(z.string()),
  kapanis: z.string(),
  imzaAd: z.string(),
  imzaUnvan: z.string(),
  ekler: z.array(z.string()),
  dagitim: z.array(z.string()),
  iletisim: z.object({
    adres: z.string(),
    telefon: z.string(),
    eposta: z.string(),
    web: z.string(),
    kep: z.string(),
  }),
  eksikAlanlar: z.array(z.string()),
});
export type LetterModel = z.infer<typeof LetterModelSchema>;

/** Faz 3'te LLM siniflandirma ciktisi. */
export const DocClassificationSchema = z.object({
  docType: z.enum(["sozlesme", "personel_kaydi", "prosedur", "rapor", "diger"]),
  entities: z.array(z.string()),
  summary: z.string(),
  containsPII: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type DocClassification = z.infer<typeof DocClassificationSchema>;

/** Eval hedeflerinin ortak arayuzu (RAGFlow, yeni sistem...). */
export interface EvalTarget {
  name: string;
  ask(question: string): Promise<{ answer: string; sources: string[] }>;
}
