import type { Corpus } from "@albay/shared";
import { pool } from "../db/pool.ts";
import type { DocStatus, DocumentDetail, DocumentRow } from "./types.ts";

/** Dosyayi path'e gore upsert eder. Ayni hash zaten 'parsed' ise tekrar islemeye gerek yok. */
export async function upsertDocument(doc: {
  id: string;
  path: string;
  filename: string;
  format: string;
  sizeBytes: number;
  hash: string;
}): Promise<{ row: DocumentRow; alreadyParsed: boolean }> {
  const existing = await pool.query<DocumentRow>(
    "SELECT * FROM documents WHERE path = $1",
    [doc.path],
  );
  const prev = existing.rows[0];
  if (prev && prev.hash === doc.hash && prev.status === "parsed") {
    return { row: prev, alreadyParsed: true };
  }
  const res = await pool.query<DocumentRow>(
    `INSERT INTO documents (id, path, filename, format, size_bytes, hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT (path) DO UPDATE SET
       hash = EXCLUDED.hash,
       size_bytes = EXCLUDED.size_bytes,
       status = 'pending',
       error = NULL,
       updated_at = now()
     RETURNING *`,
    [doc.id, doc.path, doc.filename, doc.format, doc.sizeBytes, doc.hash],
  );
  const row = res.rows[0];
  if (!row) throw new Error("upsert basarisiz");
  return { row, alreadyParsed: false };
}

export async function setStatus(
  id: string,
  status: DocStatus,
  fields: Partial<{
    parsedMdPath: string;
    doclingJsonPath: string;
    error: string;
  }> = {},
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       status = $2,
       parsed_md_path = COALESCE($3, parsed_md_path),
       docling_json_path = COALESCE($4, docling_json_path),
       error = $5,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      status,
      fields.parsedMdPath ?? null,
      fields.doclingJsonPath ?? null,
      fields.error ?? null,
    ],
  );
}

export async function setDocumentCorpus(id: string, corpus: Corpus): Promise<void> {
  await pool.query("UPDATE documents SET corpus = $2, updated_at = now() WHERE id = $1", [
    id,
    corpus,
  ]);
}

export async function getDocumentDetail(docId: string): Promise<DocumentDetail | null> {
  const res = await pool.query<DocumentDetail>("SELECT * FROM documents WHERE id = $1", [docId]);
  return res.rows[0] ?? null;
}

export async function statusCounts(): Promise<Record<string, number>> {
  const res = await pool.query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) count FROM documents GROUP BY status",
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.count)]));
}
