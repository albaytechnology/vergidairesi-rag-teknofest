/**
 * Bir klasordeki tum desteklenen dosyalari parse kuyruguna ekler.
 * Calistir: pnpm ingest /yol/dokuman/klasoru
 */
import { readdir, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { createRedisConnection, createParseQueue } from "./helpers/redis.ts";

const SUPPORTED = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".html"]);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const isHidden = (name: string) => name.startsWith(".");
const isSupported = (name: string) => SUPPORTED.has(extname(name).toLowerCase());

async function collectSupportedFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (isHidden(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectSupportedFiles(full)));
    else if (isSupported(entry.name)) out.push(full);
  }
  return out;
}

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith("--"));
if (!dirArg) fail("Kullanim: pnpm ingest <klasor-yolu> [--corpus regulations]");

const corpusArg = args[args.indexOf("--corpus") + 1];
const corpus = args.includes("--corpus") && corpusArg === "regulations" ? "regulations" : "documents";

const root = resolve(dirArg);
const rootStat = await stat(root).catch(() => null);
if (!rootStat) fail(`Yol bulunamadi: ${root}`);
if (!rootStat.isDirectory()) fail(`Bir klasor degil: ${root}`);

const files = await collectSupportedFiles(root);
if (!files.length) fail(`Desteklenen dosya yok (${[...SUPPORTED].join(", ")}): ${root}`);
console.log(`${files.length} desteklenen dosya bulundu (${root}) — corpus: ${corpus}`);

const connection = await createRedisConnection();
const queue = createParseQueue(connection);

/** Bu durumlardaki bir is halen sirada; ayni dosyayi tekrar eklemek anlamsiz. */
const PENDING: ReadonlySet<string> = new Set([
  "waiting",
  "waiting-children",
  "prioritized",
  "active",
  "delayed",
]);

// Ayni dosya yolu -> ayni jobId, boylece bekleyen isler cift kayit olmaz.
const entries = files.map((path) => ({
  path,
  jobId: createHash("sha1").update(path).digest("hex"),
}));

// addBulk, tekrar eden jobId'leri sessizce eler ama donen dizide bunlari
// eklenmis gibi gosterir. Bu yuzden durumu eklemeden once kendimiz okuyoruz.
const checked = await Promise.all(
  entries.map(async (entry) => {
    const job = await queue.getJob(entry.jobId);
    if (!job) return { entry, skipped: false };
    if (PENDING.has((await job.getState()) ?? "")) return { entry, skipped: true };
    // Bitmis eski kayit ayni jobId'yi isgal ediyor: silinmezse dosya bir daha
    // hic islenemez. Silme basarisiz olursa is atlanmis sayilir ki rapor sismesin.
    return job
      .remove()
      .then(() => ({ entry, skipped: false }))
      .catch(() => ({ entry, skipped: true }));
  }),
);

const toAdd = checked.filter((c) => !c.skipped).map((c) => c.entry);
const skipped = checked.length - toAdd.length;

if (toAdd.length) {
  await queue.addBulk(
    toAdd.map(({ path, jobId }) => ({
      name: "parse",
      data: { path, corpus } as const,
      opts: { jobId },
    })),
  );
}

console.log(`${toAdd.length} is kuyruga eklendi.`);
if (skipped) console.log(`${skipped} dosya atlandi — ayni yol icin is zaten kuyrukta.`);
if (toAdd.length) console.log("Worker'i baslat: pnpm worker");

await queue.close();
connection.disconnect();
