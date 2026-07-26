/**
 * Parse worker — kuyruktan dosya alir, Docling ile parse eder, sonucu
 * data/parsed/ altina + Postgres'e yazar.
 * Calistir: pnpm worker
 */
import { Worker, type Job } from "bullmq";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DoclingClient,
  migrate,
  upsertDocument,
  setStatus,
  pool,
} from "@albay/ingestion";
import { makeRedis, PARSE_QUEUE, type ParseJobData } from "./queue.ts";

const OUTPUT_DIR = join(process.cwd(), "data", "parsed");
await mkdir(OUTPUT_DIR, { recursive: true });
await migrate();

const docling = new DoclingClient();

/** txt/md dosyalari Docling'e gerek olmadan dogrudan okunur. */
const PLAIN_TEXT = new Set([".txt", ".md"]);

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
    return `parse edildi: ${basename(path)} (${markdown.length} karakter)`;
  } catch (err) {
    await setStatus(row.id, "failed", { error: (err as Error).message });
    throw err; // BullMQ retry mekanizmasi devralsin
  }
}

const connection = makeRedis();
const worker = new Worker<ParseJobData>(PARSE_QUEUE, processFile, {
  connection,
  concurrency: 2, // Docling agir — ayni anda 2 dosya yeterli
});

worker.on("completed", (job, result) => {
  console.log(`✓ [${job.id?.slice(0, 8)}] ${result}`);
});
worker.on("failed", (job, err) => {
  console.error(
    `✗ [${job?.id?.slice(0, 8)}] ${basename(job?.data.path ?? "?")}: ${err.message} (deneme ${job?.attemptsMade}/${job?.opts.attempts})`,
  );
});

console.log("Parse worker dinliyor... (durdurmak icin Ctrl+C)");

process.on("SIGINT", async () => {
  console.log("\nKapatiliyor...");
  await worker.close();
  await pool.end();
  connection.disconnect();
  process.exit(0);
});
