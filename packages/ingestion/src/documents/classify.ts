import { pool } from "../db/pool.ts";

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
     WHERE d.status = 'parsed' AND d.corpus = 'documents' ${force ? "" : "AND d.classified_at IS NULL"}
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
