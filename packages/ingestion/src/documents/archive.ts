import { pool } from "../db/pool.ts";
import { OTURUM_EKI_DEGIL } from "./filters.ts";
import type { DocumentDetail } from "./types.ts";

/**
 * Arsiv listesi: cevap yazisi yazilmis / yazilmamis tum evrak.
 *
 * Servis havuzlarindan farkli olarak SERVISE GORE filtrelemez — Yazisma ve
 * Arsiv Servisi kuruma giren her belgeyi bastan sona takip eder (M.11-B-I-6).
 * Oturuma ozel ekler burada da yok: onlar resmi evrak degil.
 */
export async function listArchiveDocuments(
  tamamlandi: boolean,
  limit = 200,
): Promise<(DocumentDetail & { son_karar: string | null })[]> {
  const res = await pool.query<DocumentDetail & { son_karar: string | null }>(
    `SELECT d.*,
            -- Tamamlanan evrakta hangi kararla cevaplandigi kartta gorunmeli.
            -- Once PDF disa alinirken yazilan deger, yoksa kaydedilmis yazidan:
            -- response_letters'a yalnizca "Kaydet" denince yazildigi icin tek
            -- basina ona bakmak, PDF'i kaydetmeden indiren kullanicida bos birakir.
            COALESCE(
              d.completed_decision,
              (SELECT r.decision FROM response_letters r
                WHERE r.document_id = d.id
                ORDER BY r.created_at DESC LIMIT 1)
            ) AS son_karar
       FROM documents d
      WHERE d.corpus = 'documents'
        AND d.lifecycle_status ${tamamlandi ? "=" : "<>"} 'completed'
        AND d.${OTURUM_EKI_DEGIL}
      ORDER BY ${tamamlandi ? "d.completed_at" : "d.created_at"} DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function archiveCounts(): Promise<{ bekleyen: number; tamamlanan: number }> {
  const res = await pool.query<{ tamamlanan: string; bekleyen: string }>(
    `SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'completed')  AS tamamlanan,
            COUNT(*) FILTER (WHERE lifecycle_status <> 'completed') AS bekleyen
       FROM documents
      WHERE corpus = 'documents' AND ${OTURUM_EKI_DEGIL}`,
  );
  const r = res.rows[0]!;
  return { bekleyen: Number(r.bekleyen), tamamlanan: Number(r.tamamlanan) };
}
