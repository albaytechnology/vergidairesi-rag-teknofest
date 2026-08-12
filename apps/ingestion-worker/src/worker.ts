/**
 * Ingest worker'lari — iki asamali hat:
 *
 *   parse   : kuyruktan dosya alir, Docling ile parse eder, data/parsed/ + Postgres
 *   process : parse biten belgeyi chunk → analiz → servis yonlendirme → embed
 *
 * Iki ayri kuyruk cunku process adimi LLM'e bagli ve yavas; ayni worker'da
 * olsaydi Docling'in onunu tikardi.
 *
 * Calistir: pnpm worker
 */
import { Worker, type Job, type Queue } from "bullmq";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DoclingClient,
  migrate,
  upsertDocument,
  setStatus,
  markSessionUpload,
  pool,
} from "@albay/ingestion";
import {
  createRedisConnection,
  createProcessQueue,
  PARSE_QUEUE,
  PROCESS_QUEUE,
  type ParseJobData,
  type ProcessJobData,
} from "./helpers/redis.ts";
import { processDocument } from "./helpers/pipeline.ts";

const OUTPUT_DIR = join(process.cwd(), "data", "parsed");
await mkdir(OUTPUT_DIR, { recursive: true });
await migrate();

const docling = new DoclingClient();

/** txt/md dosyalari Docling'e gerek olmadan dogrudan okunur. */
const PLAIN_TEXT = new Set([".txt", ".md"]);

/** Parse bitince zinciri baslatir; kuyruk worker baslarken kurulur. */
let processQueue: Queue<ProcessJobData> | null = null;

async function processFile(job: Job<ParseJobData>): Promise<string> {
  const { path } = job.data;
  const fileStat = await stat(path);
  const buf = await readFile(path);
  const hash = createHash("sha256").update(buf).digest("hex");
  const ext = extname(path).toLowerCase();

  const { row, alreadyParsed } = await upsertDocument({
    id: randomUUID(),
    path,
    filename: basename(path),
    format: ext.replace(".", ""),
    sizeBytes: fileStat.size,
    hash,
  });
  if (alreadyParsed) return `atlandi (degismemis): ${basename(path)}`;
  const corpus = job.data.corpus ?? "documents";

  await setStatus(row.id, "parsing");
  try {
    let markdown: string;
    let doclingJson: unknown = null;

    if (PLAIN_TEXT.has(ext)) {
      markdown = buf.toString("utf-8");
    } else {
      const result = await docling.convertFile(path);
      markdown = result.markdown;
      doclingJson = result.doclingJson;
    }

    const mdPath = join(OUTPUT_DIR, `${row.id}.md`);
    await writeFile(mdPath, markdown, "utf-8");

    let jsonPath: string | undefined;
    if (doclingJson) {
      jsonPath = join(OUTPUT_DIR, `${row.id}.json`);
      await writeFile(jsonPath, JSON.stringify(doclingJson), "utf-8");
    }

    await setStatus(row.id, "parsed", {
      parsedMdPath: mdPath,
      doclingJsonPath: jsonPath,
    });

    // Sohbet eki ise kalici olarak isaretle ve analiz/yonlendirmeyi ATLA:
    // bu bir basvuru degil, referans belgesi. Yonlendirilirse servis havuzunda
    // cevap yazisi bekleyen bir dilekce gibi gorunur.
    const { sessionId } = job.data;
    if (sessionId) await markSessionUpload(row.id, sessionId);

    await processQueue?.add(
      "process",
      { docId: row.id, corpus, skipAnalysis: Boolean(sessionId) },
      { jobId: row.id },
    );
    return `parse edildi: ${basename(path)} (${markdown.length} karakter) → hat kuyruguna alindi`;
  } catch (err) {
    await setStatus(row.id, "failed", { error: (err as Error).message });
    throw err; // BullMQ retry mekanizmasi devralsin
  }
}

const connection = await createRedisConnection();
processQueue = createProcessQueue(connection);

const parseWorker = new Worker<ParseJobData>(PARSE_QUEUE, processFile, {
  connection,
  concurrency: 2, // Docling agir — ayni anda 2 dosya yeterli
});

const pipelineWorker = new Worker<ProcessJobData>(
  PROCESS_QUEUE,
  async (job: Job<ProcessJobData>) => {
    const sonuc = await processDocument(job.data.docId, {
      corpus: job.data.corpus,
      skipAnalysis: job.data.skipAnalysis,
    });
    const hedef =
      sonuc.routingStatus === "routed"
        ? `→ ${sonuc.routedService}`
        : sonuc.routingStatus === "belirlenemedi"
          ? "→ belirlenemedi (manuel inceleme)"
          : "";
    return `${sonuc.filename}: ${sonuc.chunkCount} chunk ${hedef}`;
  },
  {
    connection,
    // LLM cagrilari seri — uzak Ollama'yi bogmamak icin tek is
    concurrency: 1,
  },
);

parseWorker.on("completed", (job, result) => {
  console.log(`✓ [parse] ${result}`);
});
parseWorker.on("failed", (job, err) => {
  console.error(
    `✗ [parse] ${basename(job?.data.path ?? "?")}: ${err.message}` +
      ` (deneme ${job?.attemptsMade}/${job?.opts.attempts})`,
  );
});

pipelineWorker.on("completed", (_job, result) => {
  console.log(`✓ [hat]   ${result}`);
});
pipelineWorker.on("failed", (job, err) => {
  console.error(`✗ [hat]   ${job?.data.docId?.slice(0, 8)}: ${err.message}`);
});

console.log("Worker'lar dinliyor: parse + hat (chunk→analiz→yonlendirme→embed)");
console.log("Durdurmak icin Ctrl+C");

process.on("SIGINT", async () => {
  console.log("\nKapatiliyor...");
  await Promise.all([parseWorker.close(), pipelineWorker.close()]);
  await processQueue?.close();
  await pool.end();
  connection.disconnect();
  process.exit(0);
});
