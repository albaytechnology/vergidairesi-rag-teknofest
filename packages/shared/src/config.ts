import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_CHAT_MODEL: z.string().default("qwen2.5:14b-instruct"),
  OLLAMA_EMBED_MODEL: z.string().default("bge-m3"),
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  QDRANT_COLLECTION: z.string().default("albay_chunks"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z
    .string()
    .default("postgres://albay:albay_dev_pw@localhost:5432/albay_rag"),
  DOCLING_URL: z.string().url().default("http://localhost:5001"),
  /** Bos birakilirsa rerank adimi atlanir (sadece RRF skoru kullanilir). */
  RERANKER_URL: z.string().url().optional(),
  RAGFLOW_BASE_URL: z.string().url().optional(),
  RAGFLOW_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
