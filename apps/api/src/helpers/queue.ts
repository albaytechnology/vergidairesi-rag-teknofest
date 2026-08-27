/**
 * API'nin ingest kuyruguna erisimi.
 *
 * Kuyruk tanimlari ingestion-worker'da; API yalnizca is EKLER, isleyen taraf
 * her zaman worker'dir. Boylece LLM/Docling yuku HTTP istegini bloklamaz.
 */
import { createHash } from "node:crypto";
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
 * Is kimligi DOSYA YOLUNDAN turer: ayni dosya iki kez kuyruga girmesin.
 * Yukleme ucu isi bu kimlikle ekler, durum ucu ayni kimlikle arar — tek yerde
 * durmali, yoksa "is var mi" sorusu sessizce hep "yok" cevabini verir.
 */
export function parseJobId(path: string): string {
  return createHash("sha1").update(path).digest("hex");
}

/**
 * Bu dosyanin parse isi HALEN kuyrukta mi?
 *
 * Durum ucu, belge kaydi bulunamayan bir yol icin "kuyrukta" diyordu; bu,
 * "sira bekliyor" ile "bu is artik yok" durumlarini ayni gosteriyordu. Kaydi
 * silinmis (orn. veri tabani sifirlanmis) bir yukleme, arayuzde sonsuza kadar
 * "belge okunuyor" diye donuyordu. Kuyrukta karsiligi olup olmadigina bakmak
 * bu ikisini kesin olarak ayirir — zaman asimi tahminine gerek kalmaz.
 */
export async function parseIsiVarMi(path: string): Promise<boolean> {
  const kuyruk = await getParseQueue();
  return Boolean(await kuyruk.getJob(parseJobId(path)));
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
