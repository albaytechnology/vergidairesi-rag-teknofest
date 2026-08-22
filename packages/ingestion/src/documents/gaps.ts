/** Eksik bilgi / tutarsizlik taramasinin saklanmasi ve toplu tarama listesi. */
import type { DocumentGap } from "@albay/shared";
import { pool } from "../db/pool.ts";

export async function saveDocumentGaps(docId: string, gaps: DocumentGap[]): Promise<void> {
  await pool.query(
    `UPDATE documents SET gap_findings = $2, gaps_scanned_at = now(), updated_at = now()
     WHERE id = $1`,
    [docId, JSON.stringify(gaps)],
  );
}

export interface DocToScanGaps {
  id: string;
  filename: string;
  parsed_md_path: string;
}

/**
 * Taranacak evraklar.
 *
 * Yalnizca EVRAK korpusu ve resmi evrak: yonetmelik metinlerinde "eksik bilgi"
 * kavraminin karsiligi yok, sohbet ekleri de islenecek bir evrak degil.
 */
export async function docsToScanGaps(force = false): Promise<DocToScanGaps[]> {
  const res = await pool.query<DocToScanGaps>(
    `SELECT id, filename, parsed_md_path FROM documents
      WHERE corpus = 'documents' AND session_id IS NULL
        AND parsed_md_path IS NOT NULL
        ${force ? "" : "AND gaps_scanned_at IS NULL"}
      ORDER BY created_at`,
  );
  return res.rows;
}
