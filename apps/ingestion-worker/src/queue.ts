import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@albay/shared";

export const PARSE_QUEUE = "parse";

export interface ParseJobData {
  /** Kaynak dosyanin mutlak yolu */
  path: string;
}

export function makeRedis(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export function makeParseQueue(connection: Redis): Queue<ParseJobData> {
  return new Queue<ParseJobData>(PARSE_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
