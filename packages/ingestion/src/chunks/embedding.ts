import type { Corpus } from "@albay/shared";
import { pool } from "../db/pool.ts";
import type { ChunkToEmbed } from "./types.ts";

/** Bir belgenin embed bekleyen parcalarini secen ortak SELECT govdesi. */
const EMBED_SECIMI = `
  SELECT c.id, c.doc_id, c.text, c.page, c.section, c.parent_id,
         d.filename, d.path, d.corpus, d.doc_type, d.contains_pii,
         COALESCE(d.entities, '[]') AS entities,
         COALESCE(c.metadata, '{}') AS metadata
  FROM chunks c
  JOIN documents d ON d.id = c.doc_id
  WHERE c.kind = 'child' AND c.embedded_at IS NULL`;

/** Korpus genelinde embed bekleyen parcalar (toplu embed icin). */
export async function chunksToEmbed(limit = 64, corpus: Corpus = "documents"): Promise<ChunkToEmbed[]> {
  const res = await pool.query<ChunkToEmbed>(
    `${EMBED_SECIMI} AND d.corpus = $2
     ORDER BY c.doc_id
     LIMIT $1`,
    [limit, corpus],
  );
  return res.rows;
}

/** Tek bir dokumanin embed bekleyen chunk'lari — pipeline belge belge ilerler. */
export async function chunksToEmbedForDoc(docId: string, limit = 64): Promise<ChunkToEmbed[]> {
  const res = await pool.query<ChunkToEmbed>(
    `${EMBED_SECIMI} AND c.doc_id = $1
     ORDER BY c.created_at
     LIMIT $2`,
    [docId, limit],
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

export async function resetEmbeddings(corpus: Corpus = "documents"): Promise<void> {
  await pool.query(
    `UPDATE chunks c SET embedded_at = NULL
     FROM documents d
     WHERE c.doc_id = d.id AND d.corpus = $1`,
    [corpus],
  );
}
