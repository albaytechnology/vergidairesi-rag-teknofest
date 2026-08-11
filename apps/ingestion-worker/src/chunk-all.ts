/**
 * Parse edilmis tum dokumanlari chunk'lar ve Postgres'e yazar.
 * Calistir: pnpm chunk            (sadece chunk'lanmamis dokumanlar)
 *           pnpm chunk -- --force (hepsini yeniden chunk'la)
 */
import { readFile } from "node:fs/promises";
import { chunkDocument, chunkRegulationDocument } from "@albay/chunking";
import type { Corpus } from "@albay/shared";
import { pool, replaceChunks, chunkCounts, migrate, setDocumentCorpus } from "@albay/ingestion";
import { deleteByDocId } from "@albay/retrieval";
import { config } from "@albay/shared";

const force = process.argv.includes("--force");
const corpus = getArg("--corpus") === "regulations" ? "regulations" : "documents";
const fileMatch = getArg("--file");

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * --file verilmediyse yonetmelik adaylarini isimden/yolundan sec.
 * Ek olarak "yonetmeligi", "yönetmeliğe" gibi cekimli halleri de yakalamak icin
 * govde ("yonetmel") uzerinden eslesiriz — tam kelime araniyorsa --file kullanilir.
 */
function isRegulationCandidate(doc: { filename: string; path: string }): boolean {
  const haystack = `${doc.filename} ${doc.path}`.toLocaleLowerCase("tr-TR");
  if (fileMatch) return haystack.includes(fileMatch.toLocaleLowerCase("tr-TR"));
  return ["yonetmel", "yönetmel", "regulation", "mevzuat"].some((stem) =>
    haystack.includes(stem),
  );
}

await migrate();

const COLUMNS = "d.id, d.filename, d.path, d.parsed_md_path, d.docling_json_path";

/**
 * regulations modunda korpus filtresi uygulanmaz: bir dokuman yonetmelik korpusuna
 * ilk kez BURADA atanir (setDocumentCorpus), dolayisiyla henuz corpus='documents'
 * olabilir. Aday secimi isRegulationCandidate ile isim/yol uzerinden yapilir.
 */
const corpusFilter = corpus === "regulations" ? "" : "AND d.corpus = $1";
const docsQuery = force
  ? `SELECT ${COLUMNS} FROM documents d WHERE d.status = 'parsed' ${corpusFilter}`
  : `SELECT ${COLUMNS}
     FROM documents d
     LEFT JOIN chunks c ON c.doc_id = d.id
     WHERE d.status = 'parsed' ${corpusFilter} AND c.id IS NULL
     GROUP BY d.id`;

const docs = await pool.query<{
  id: string;
  filename: string;
  path: string;
  parsed_md_path: string;
  docling_json_path: string | null;
}>(docsQuery, corpus === "regulations" ? [] : [corpus]);

const rows =
  corpus === "regulations"
    ? docs.rows.filter((doc) => isRegulationCandidate(doc))
    : docs.rows;

console.log(
  `${rows.length} dokuman chunk'lanacak${force ? " (force)" : ""} — corpus: ${corpus}`,
);
if (corpus === "regulations" && !fileMatch) {
  console.log("Not: regulations icin yalnizca adinda yonetmelik/regulation gecen dosyalar secildi.");
}

let done = 0;
for (const doc of rows) {
  try {
    await setDocumentCorpus(doc.id, corpus as Corpus);
    // Yeni chunk'lar yeni UUID alir; eski vektorler silinmezse Qdrant'ta oksuz
    // kalir ve aramada gorunmeye devam eder.
    await deleteByDocId(
      doc.id,
      corpus === "regulations" ? config.QDRANT_REGULATIONS_COLLECTION : config.QDRANT_COLLECTION,
    );
    const markdown = await readFile(doc.parsed_md_path, "utf-8");
    let doclingJson: unknown;
    if (doc.docling_json_path) {
      doclingJson = JSON.parse(await readFile(doc.docling_json_path, "utf-8"));
    }
    const chunks =
      corpus === "regulations"
        ? chunkRegulationDocument({
            docId: doc.id,
            filename: doc.filename,
            markdown,
            doclingJson,
          })
        : chunkDocument({
            docId: doc.id,
            filename: doc.filename,
            markdown,
            doclingJson,
          });
    await replaceChunks(doc.id, chunks);
    done++;
    const children = chunks.filter((c) => c.kind === "child").length;
    console.log(`✓ ${doc.filename}: ${children} child + ${chunks.length - children} parent`);
  } catch (err) {
    console.error(`✗ ${doc.filename}: ${(err as Error).message}`);
  }
}

const stats = await chunkCounts();
console.log(`\n─── Ozet ─────────────────────────`);
console.log(`Dokuman        : ${stats.docs}`);
console.log(`Child chunk    : ${stats.children}`);
console.log(`Parent chunk   : ${stats.parents}`);
console.log(`Ort. child boy : ~${stats.avgTokens} token`);
console.log(`(${done}/${rows.length} dokuman islendi)`);
await pool.end();
