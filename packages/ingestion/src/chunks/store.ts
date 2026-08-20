import { pool } from "../db/pool.ts";
import type { ChunkInsert } from "./types.ts";

/**
 * Bir belgenin parcalarini bastan yazar.
 *
 * Silme ve ekleme TEK islemde: yeniden chunk'lama yarida kalirsa belge
 * parcasiz kalmamali.
 */
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
        `INSERT INTO chunks (id, doc_id, kind, text, page, section, parent_id, token_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          c.id,
          c.docId,
          c.kind,
          c.text,
          c.page,
          c.section,
          c.parentId,
          c.tokenCount,
          JSON.stringify(c.metadata ?? {}),
        ],
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
