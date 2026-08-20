import { pool } from "../db/pool.ts";

/** Parse sirasinda: belgeyi bir sohbet ekine baglar (kalici isaret). */
export async function markSessionUpload(docId: string, sessionId: string): Promise<void> {
  await pool.query(
    "UPDATE documents SET session_id = $2, updated_at = now() WHERE id = $1",
    [docId, sessionId],
  );
}

/**
 * Bir sohbetin ek belgeleri.
 *
 * Kaynak session_uploads degil documents.session_id: eki yukleyen worker onu
 * belgenin uzerine yaziyor, dolayisiyla /bind cagrilmasini beklemeye ve TTL'in
 * dolmasiyla ekin sessizce aranamaz hale gelmesine gerek yok.
 */
export async function sessionDocumentIds(sessionId: string): Promise<string[]> {
  const res = await pool.query<{ id: string }>(
    "SELECT id FROM documents WHERE session_id = $1",
    [sessionId],
  );
  return res.rows.map((r) => r.id);
}

/**
 * TTL'li oturum kaydi (session_uploads tablosu).
 *
 * Kalici ayrimi documents.session_id tasidigi icin akis artik buna bagli degil;
 * gecici ekin ne zaman temizlenebilecegini gosteren kayit olarak duruyor.
 */
export async function registerSessionUpload(
  sessionId: string,
  documentId: string,
  ttlHours = 12,
): Promise<void> {
  await pool.query(
    `INSERT INTO session_uploads (session_id, document_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)
     ON CONFLICT (session_id, document_id) DO NOTHING`,
    [sessionId, documentId, String(ttlHours)],
  );
}
