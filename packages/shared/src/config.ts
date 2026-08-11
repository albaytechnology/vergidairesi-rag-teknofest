import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_CHAT_MODEL: z.string().default("qwen2.5:14b-instruct"),
  OLLAMA_EMBED_MODEL: z.string().default("bge-m3"),
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  QDRANT_COLLECTION: z.string().default("albay_chunks"),
  QDRANT_REGULATIONS_COLLECTION: z.string().default("albay_regulations"),
  TAX_OFFICE_ORG_TYPE: z.enum(["baskanlik", "mudurluk", "bagli"]).default("baskanlik"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z
    .string()
    .default("postgres://albay:albay_dev_pw@localhost:5432/albay_rag"),
  DOCLING_URL: z.string().url().default("http://localhost:5001"),
  /** Faz 5b — Chat/evrak API'si */
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("127.0.0.1"),
  /** Web arayuzunun adresi (CORS). Virgulle birden fazla verilebilir. */
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  /** Yuklenen evraklarin diske yazildigi klasor (ingest hatti buradan okur). */
  UPLOAD_DIR: z.string().default("data/uploads"),
  /** Tek dosya yukleme siniri (MB). */
  UPLOAD_MAX_MB: z.coerce.number().positive().default(25),
  /**
   * Faz 5c — Resmi yazi antet/imza bilgileri.
   *
   * Bunlar KURUMA OZGUDUR ve sistem tarafindan bilinemez. Bos birakilan her
   * alan cevap yazisinda gorunur bir yer tutucu (ornegin [DETSIS NO]) olarak
   * basilir ve API yanitinda eksikAlanlar listesine eklenir — hicbiri
   * uydurulmaz. Resmi bir yazinin ustune sahte kurum kodu veya sahte imza
   * sahibi yazilmasi, yaziyi gecerli gostererek gercek zarar uretebilir.
   */
  LETTER_KURUM_ADI: z.string().default(""),
  LETTER_BIRIM_ADI: z.string().default(""),
  /** DETSIS (Devlet Teskilati Merkezi Kayit Sistemi) numarasi — sayinin ilk blogu. */
  LETTER_DETSIS_NO: z.string().default(""),
  /** Standart Dosya Plani kodu (orn. 045.01). */
  LETTER_DOSYA_PLANI: z.string().default(""),
  LETTER_IMZA_AD: z.string().default(""),
  LETTER_IMZA_UNVAN: z.string().default(""),
  LETTER_ADRES: z.string().default(""),
  LETTER_TELEFON: z.string().default(""),
  LETTER_EPOSTA: z.string().default(""),
  LETTER_WEB: z.string().default(""),
  LETTER_KEP: z.string().default(""),
  /** Bos birakilirsa rerank adimi atlanir (sadece RRF skoru kullanilir). */
  RERANKER_URL: z.string().url().optional(),
  RAGFLOW_BASE_URL: z.string().url().optional(),
  RAGFLOW_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
