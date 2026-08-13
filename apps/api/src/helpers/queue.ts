/**
 * API'nin ingest kuyruguna erisimi.
 *
 * Kuyruk tanimlari ingestion-worker'da; API yalnizca is EKLER, isleyen taraf
 * her zaman worker'dir. Boylece LLM/Docling yuku HTTP istegini bloklamaz.
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config, type ParseJobData } from "@albay/shared";

const PARSE_QUEUE = "parse";


let connection: Redis | null = null;
let parseQueue: Queue<ParseJobData> | null = null;

export async function getParseQueue(): Promise<Queue<ParseJobData>> {
  if (parseQueue) return parseQueue;
  connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  connection.on("error", (err: Error) => console.error(`Redis: ${err.message}`));
  await connection.connect();
  parseQueue = new Queue<ParseJobData>(PARSE_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: { count: 5000 },
    },
  });
  return parseQueue;
}

/**
 * Redis erisilebilirlik kontrolu (readiness probe icin).
 *
 * Kuyrugu (dolayisiyla baglantiyi) hazirlar ve PING atar; Redis kapaliysa
 * firlar. Boylece /api/ready hattin is ekleyebilir durumda oldugunu dogrular.
 */
export async function pingRedis(): Promise<void> {
  await getParseQueue();
  await connection!.ping();
}

export async function closeQueues(): Promise<void> {
  await parseQueue?.close();
  connection?.disconnect();
  parseQueue = null;
  connection = null;
}
