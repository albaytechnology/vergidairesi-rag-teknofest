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

const dirArg = process.argv[2];
if (!dirArg) fail("Kullanim: pnpm ingest <klasor-yolu>");

const root = resolve(dirArg);
const rootStat = await stat(root).catch(() => null);
if (!rootStat) fail(`Yol bulunamadi: ${root}`);
if (!rootStat.isDirectory()) fail(`Bir klasor degil: ${root}`);

const files = await collectSupportedFiles(root);
if (!files.length) fail(`Desteklenen dosya yok (${[...SUPPORTED].join(", ")}): ${root}`);
console.log(`${files.length} desteklenen dosya bulundu (${root})`);

const connection = await createRedisConnection();
const queue = createParseQueue(connection);

await queue.addBulk(
  files.map((path) => ({
    name: "parse",
    data: { path },
    opts: { jobId: createHash("sha1").update(path).digest("hex") },
  })),
);

console.log(`${files.length} is kuyruga eklendi. Worker'i baslat: pnpm worker`);
await queue.close();
connection.disconnect();
