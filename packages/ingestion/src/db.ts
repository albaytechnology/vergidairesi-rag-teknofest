import pg from "pg";
import { config } from "@albay/shared";

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export type DocStatus = "pending" | "parsing" | "parsed" | "failed";

export interface DocumentRow {
  id: string;
  path: string;
  filename: string;
  format: string;
  size_bytes: string;
  hash: string;
  status: DocStatus;
  parsed_md_path: string | null;
  docling_json_path: string | null;
  error: string | null;
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      format TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      parsed_md_path TEXT,
      docling_json_path TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
    CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents (hash);

    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY,
      doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'child',
      text TEXT NOT NULL,
      page INT,
      section TEXT,
      parent_id UUID,
      token_count INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks (doc_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks (kind);

    -- Faz 3: siniflandirma + embedding takibi
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_confidence REAL;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
  `);
}

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

export interface ChunkInsert {
  id: string;
  docId: string;
  kind: "child" | "parent";
  text: string;
  page: number | null;
  section: string | null;
  parentId: string | null;
  tokenCount: number;
}

export async function replaceChunks(
  docId: string,
  chunks: ChunkInsert[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE doc_id = $1", [docId]);
    for (const c of chunks) {
      await client.query(
        `INSERT INTO chunks (id, doc_id, kind, text, page, section, parent_id, token_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.id, c.docId, c.kind, c.text, c.page, c.section, c.parentId, c.tokenCount],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function chunkCounts(): Promise<{
  docs: number;
  children: number;
  parents: number;
  avgTokens: number;
}> {
  const res = await pool.query<{
    docs: string;
    children: string;
    parents: string;
    avg_tokens: string;
  }>(`
    SELECT
      COUNT(DISTINCT doc_id) docs,
      COUNT(*) FILTER (WHERE kind = 'child') children,
      COUNT(*) FILTER (WHERE kind = 'parent') parents,
      COALESCE(AVG(token_count) FILTER (WHERE kind = 'child'), 0) avg_tokens
    FROM chunks
  `);
  const r = res.rows[0]!;
  return {
    docs: Number(r.docs),
    children: Number(r.children),
    parents: Number(r.parents),
    avgTokens: Math.round(Number(r.avg_tokens)),
  };
}

// ─── Faz 3: siniflandirma ─────────────────────────────────────────────

export interface DocToClassify {
  id: string;
  filename: string;
  sample_text: string;
}

/** Siniflandirilmamis (veya force ile hepsi) parsed dokumanlari, ilk 3 child chunk'iyla dondurur. */
export async function docsToClassify(force = false): Promise<DocToClassify[]> {
  const res = await pool.query<DocToClassify>(
    `SELECT d.id, d.filename,
            COALESCE(string_agg(sub.text, E'\\n\\n'), '') AS sample_text
     FROM documents d
     LEFT JOIN LATERAL (
       SELECT c.text FROM chunks c
       WHERE c.doc_id = d.id AND c.kind = 'child'
       ORDER BY c.created_at LIMIT 3
     ) sub ON true
     WHERE d.status = 'parsed' ${force ? "" : "AND d.classified_at IS NULL"}
     GROUP BY d.id`,
  );
  return res.rows;
}

export async function saveClassification(
  docId: string,
  c: {
    docType: string;
    entities: string[];
    summary: string;
    containsPII: boolean;
    confidence: number;
  },
  reviewThreshold = 0.6,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       doc_type = $2, entities = $3, summary = $4, contains_pii = $5,
       classification_confidence = $6, needs_review = $7,
       classified_at = now(), updated_at = now()
     WHERE id = $1`,
    [
      docId,
      c.docType,
      JSON.stringify(c.entities),
      c.summary,
      c.containsPII,
      c.confidence,
      c.confidence < reviewThreshold,
    ],
  );
}

// ─── Faz 3: embedding ─────────────────────────────────────────────────

export interface ChunkToEmbed {
  id: string;
  doc_id: string;
  text: string;
  page: number | null;
  section: string | null;
  parent_id: string | null;
  filename: string;
  path: string;
  doc_type: string | null;
  contains_pii: boolean | null;
  entities: string[];
}

export async function chunksToEmbed(limit = 64): Promise<ChunkToEmbed[]> {
  const res = await pool.query<ChunkToEmbed>(
    `SELECT c.id, c.doc_id, c.text, c.page, c.section, c.parent_id,
            d.filename, d.path, d.doc_type, d.contains_pii,
            COALESCE(d.entities, '[]') AS entities
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE c.kind = 'child' AND c.embedded_at IS NULL
     ORDER BY c.doc_id
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function markEmbedded(chunkIds: string[]): Promise<void> {
  if (!chunkIds.length) return;
  await pool.query(
    "UPDATE chunks SET embedded_at = now() WHERE id = ANY($1::uuid[])",
    [chunkIds],
  );
}

export async function resetEmbeddings(): Promise<void> {
  await pool.query("UPDATE chunks SET embedded_at = NULL");
}

export async function statusCounts(): Promise<Record<string, number>> {
  const res = await pool.query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) count FROM documents GROUP BY status",
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.count)]));
}
