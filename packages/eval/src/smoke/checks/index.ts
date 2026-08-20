import type { Check } from "../types.ts";
import { qdrantCheck } from "./qdrant.ts";
import { redisCheck } from "./redis.ts";
import { postgresCheck } from "./postgres.ts";
import { doclingCheck } from "./docling.ts";
import { ollamaModelsCheck, embeddingCheck, chatCheck } from "./ollama.ts";
import { apiCheck } from "./api.ts";
import { chromiumCheck } from "./chromium.ts";

/**
 * Faz 0 altyapi kontrolleri — rapordaki sira budur.
 *
 * Once tasiyici servisler (depolama, kuyruk, parse), sonra model katmani,
 * en sonda uygulama katmani: bir alt katman dustugunde ustteki hatalar
 * ikincil oldugu icin raporu asagidan yukari okumak yeterli olsun.
 */
export const checks: Check[] = [
  qdrantCheck,
  redisCheck,
  postgresCheck,
  doclingCheck,
  ollamaModelsCheck,
  embeddingCheck,
  chatCheck,
  apiCheck,
  chromiumCheck,
];

export {
  qdrantCheck,
  redisCheck,
  postgresCheck,
  doclingCheck,
  ollamaModelsCheck,
  embeddingCheck,
  chatCheck,
  apiCheck,
  chromiumCheck,
};
