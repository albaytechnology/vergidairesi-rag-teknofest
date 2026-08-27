import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_CHAT_MODEL: z.string().default("qwen3.8:27b"),
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
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("127.0.0.1"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("data/uploads"),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(25),
  LETTER_KURUM_ADI: z.string().default(""),
  LETTER_BIRIM_ADI: z.string().default(""),
  LETTER_DETSIS_NO: z.string().default(""),
  LETTER_DOSYA_PLANI: z.string().default(""),
  LETTER_IMZA_AD: z.string().default(""),
  LETTER_IMZA_UNVAN: z.string().default(""),
  LETTER_ADRES: z.string().default(""),
  LETTER_TELEFON: z.string().default(""),
  LETTER_EPOSTA: z.string().default(""),
  LETTER_WEB: z.string().default(""),
  LETTER_KEP: z.string().default(""),
  RERANKER_URL: z.string().url().optional(),
  RAGFLOW_BASE_URL: z.string().url().optional(),
  RAGFLOW_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
