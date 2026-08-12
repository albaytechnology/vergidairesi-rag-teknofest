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
  routing: {
    birim: string | null;
    servis: string | null;
    guvenSkoru: number | null;
    gerekce: string | null;
    maddeler: MaddeRef[];
    durum: string;
  };
  yasamDongusu: LifecycleStatus;
  tamamlanmaTarihi: string | null;
  createdAt: string;
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
  letterId: string | null;
  model: LetterModel;
  html: string;
  body: { ilgiSatirlari: string[]; paragraflar: string[]; gerekce: string };
  /** Evrakta karsiligi bulunamayan sayisal degerler — arayuzde uyari olarak gosterilir. */
  dayanaksizSayilar: string[];
  eksikAlanlar: string[];
  trace: string[];
}

export type UploadStage = "kuyrukta" | "isleniyor" | "hazir" | "hata";

export interface UploadStatus {
  path: string;
  asama: UploadStage;
  id: string | null;
  filename?: string;
  servis: string | null;
}
