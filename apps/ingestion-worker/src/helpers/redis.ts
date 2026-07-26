import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@albay/shared";

export const PARSE_QUEUE = "parse";

export interface ParseJobData {
  /** Kaynak dosyanin mutlak yolu */
  path: string;
}

/**
 * Redis baglantisini acar. lazyConnect + connect sayesinde Redis kapaliysa
 * hata burada firlar; aksi halde maxRetriesPerRequest: null yuzunden ilk
 * komut sessizce sonsuza kadar bekler.
 */
export async function createRedisConnection(): Promise<Redis> {
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  // Dinleyici olmazsa ioredis her kopusta "Unhandled error event" basar.
  connection.on("error", (err: Error) => console.error(`Redis: ${err.message}`));

  try {
    await connection.connect();
  } catch {
    connection.disconnect();
    throw new Error(`Redis'e baglanilamadi: ${config.REDIS_URL}`);
  }
  return connection;
}

export function createParseQueue(connection: Redis): Queue<ParseJobData> {
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
