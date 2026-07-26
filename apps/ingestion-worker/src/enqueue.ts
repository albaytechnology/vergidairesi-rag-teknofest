/**
 * Bir klasordeki tum desteklenen dosyalari parse kuyruguna ekler.
 * Calistir: pnpm ingest /yol/dokuman/klasoru
 */
import { readdir, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { makeRedis, makeParseQueue } from "./queue.ts";

const SUPPORTED = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".html"]);

const dirArg = process.argv[2];
if (!dirArg) {
  console.error("Kullanim: pnpm ingest <klasor-yolu>");
  process.exit(1);
}
const root = resolve(dirArg);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (SUPPORTED.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const rootStat = await stat(root).catch(() => null);
if (!rootStat?.isDirectory()) {
  console.error(`Klasor bulunamadi: ${root}`);
  process.exit(1);
}

const files = await walk(root);
console.log(`${files.length} desteklenen dosya bulundu (${root})`);

const connection = makeRedis();
const queue = makeParseQueue(connection);

for (const path of files) {
  // Ayni dosya icin ayni jobId -> kuyruga cift kayit girmez
  const jobId = createHash("sha1").update(path).digest("hex");
  await queue.add("parse", { path }, { jobId });
}

console.log(`${files.length} is kuyruga eklendi. Worker'i baslat: pnpm worker`);
await queue.close();
connection.disconnect();
