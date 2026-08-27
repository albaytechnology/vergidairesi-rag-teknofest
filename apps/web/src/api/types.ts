/**
 * API sozlesmesinin arayuz tarafindaki karsiligi.
 *
 * Sunucu tipleri zod ile @albay/shared'da tanimli; burada onlari import etmiyoruz
 * cunku o paket node hedefli (dotenv, process.env okuyan config). Arayuz yalnizca
 * HTTP govdelerini tanimasi yeter — bu dosya o govdelerin aynasidir.
 */

export interface ServiceRow {
  servis: string;
  hizmetBirimi: string | null;
  altBolum: string | null;
  maddeNo: string;
  /** Cevap yazısı üretilmemiş evrak — asıl iş yükü. */
  bekleyen: number;
  /** Cevaplanmış evrak; havuzda görünür ama iş beklemez. */
  tamamlanan: number;
}

export interface ServicesResponse {
  services: ServiceRow[];
  belirlenemedi: number;
}

export interface Entities {
  vkn: string | null;
  tckn: string | null;
  tarihler: string[];
  tutarlar: string[];
  plakalar: string[];
  donemler: string[];
  kisiKurumlar: string[];
}

export interface MaddeRef {
  maddeNo: string;
  baslik: string;
}

/** Evrakin is akisi durumu — parse durumundan (status) ayridir. */
export type LifecycleStatus = "new" | "routed" | "in_progress" | "completed";

export interface DocumentSummary {
  id: string;
  filename: string;
  format: string;
  status: string;
  konu: string | null;
  ozet: string | null;
  docType: string | null;
  entities: Entities | null;
  containsPII: boolean | null;
  /** Eksik bilgi taramasinin bulgulari. null: evrak hic taranmadi. */
  eksikler: DocumentGap[] | null;
  routing: {
    birim: string | null;
    servis: string | null;
    guvenSkoru: number | null;
    gerekce: string | null;
    maddeler: MaddeRef[];
    durum: string;
    /** true: cevap yazısı mükellefe değil Vergi Mahkemesi Başkanlığı'na yazılır. */
    mahkemeYazismasi: boolean;
    /** Servisi kim atadı: "llm" (model) · "manuel" (çalışan). Hiç atanmadıysa null. */
    kaynak: "llm" | "manuel" | null;
  };
  yasamDongusu: LifecycleStatus;
  tamamlanmaTarihi: string | null;
  createdAt: string;
}

/** Belgede eksik ya da kendi icinde celiskili bilgi. kanit: belgeden birebir alinti (yoksa ""). */
export interface DocumentGap {
  tur: "eksik" | "tutarsizlik";
  baslik: string;
  aciklama: string;
  onem: "kritik" | "orta" | "dusuk";
  kanit: string;
}

export interface ArchiveResponse {
  /** sonKarar: tamamlanan evrakta hangi kararla cevaplandığı. */
  documents: (DocumentSummary & { sonKarar: string | null })[];
  sayilar: { bekleyen: number; tamamlanan: number };
}

export interface ChatMessage {
  id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  /**
   * Dolu ise bu asistan mesaji bir METIN degil, "cevap yazısı oluştur" KARTIDIR;
   * geçmiş yeniden kurulurken kart bu alandan tanınır.
   */
  letter_intent: { karar: LetterDecision | null; gerekce: string | null } | null;
  created_at: string;
}

export type LetterDecision = "onay" | "kismi_onay" | "red" | "eksik_belge" | "bilgilendirme";

export interface LetterModel {
  taslak: boolean;
  kurumAdi: string;
  birimAdi: string;
  sayi: string;
  tarih: string;
  konu: string;
  muhatap: {
    ad: string;
    tur: "kisi" | "kurum";
    adres: string | null;
    vknTckn: string | null;
  };
  ilgiSatirlari: string[];
  paragraflar: string[];
  kapanis: string;
  imzaAd: string;
  imzaUnvan: string;
  ekler: string[];
  dagitim: string[];
  iletisim: { adres: string; telefon: string; eposta: string; web: string; kep: string };
  eksikAlanlar: string[];
}

export interface LetterDraftResponse {
  model: LetterModel;
  html: string;
  body: { ilgiSatirlari: string[]; paragraflar: string[]; gerekce: string };
  /** Evrakta karsiligi bulunamayan sayisal degerler — arayuzde uyari olarak gosterilir. */
  dayanaksizSayilar: string[];
  eksikAlanlar: string[];
  trace: string[];
}

/**
 * Kaydetme cevabi. Yazi yeniden URETILMEZ: donen model ekrana gonderilenin
 * sayi satiri doldurulmus halidir, uyarilar ve govde aynen korunur.
 */
export interface LetterSaveResponse {
  letterId: string;
  sayiNo: number;
  model: LetterModel;
  html: string;
}

/**
 * "kayip": sunucuda ne belge kaydi ne de kuyrukta isi var — takip edilecek bir
 * sey kalmamis (orn. veri tabani sifirlandiktan sonra sekmede duran eski kayit).
 * Ayri bir asama olmasinin nedeni: eskiden bu durum "kuyrukta" diye donuyor ve
 * satir sonsuza kadar "belge okunuyor" gorunuyordu.
 */
export type UploadStage = "kuyrukta" | "isleniyor" | "hazir" | "hata" | "kayip";

/** Hattin adimlari — ilerleme cubugu tek tek bunlardan doluyor. */
export type UploadStep =
  | "parse"
  | "chunk"
  | "kunye"
  | "ozet"
  | "yonlendirme"
  | "eksik"
  | "indeks";

/** "atlandi": bu belge turunde adim hic calismaz (sohbet eki, yonetmelik metni). */
export type StepState = "bekliyor" | "calisiyor" | "bitti" | "atlandi" | "hata";

export interface UploadStepStatus {
  ad: UploadStep;
  durum: StepState;
}

export interface UploadStatus {
  path: string;
  asama: UploadStage;
  adimlar: UploadStepStatus[];
  id: string | null;
  filename?: string;
  servis: string | null;
}
