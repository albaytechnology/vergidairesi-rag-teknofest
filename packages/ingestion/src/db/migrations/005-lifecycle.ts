/**
 * Faz 5e: evrakin YASAM DONGUSU (Yazisma ve Arsiv Servisi takibi).
 *
 * Neden ayri bir sutun: documents.status ZATEN VAR ve parse hattinin
 * durumunu tutuyor (pending/parsing/parsed/failed). Ayni ada yeni bir
 * anlam yuklemek worker'i bozardi; is akisi durumu bagimsiz izlenir.
 *   new         → yuklendi, henuz siniflandirilmadi
 *   routed      → servise yonlendirildi
 *   in_progress → calisan belgeyi acti
 *   completed   → cevap yazisi PDF olarak disari alindi
 */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'new';
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  -- Hangi kararla cevaplandigi. response_letters'a yalnizca "kaydet" denince
  -- yazildigi icin, PDF'i kaydetmeden indiren kullanicida orasi bos kalir;
  -- arsiv kartinda karar gorunsun diye tamamlama aninda buraya da yazilir.
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS completed_decision TEXT;
  CREATE INDEX IF NOT EXISTS idx_documents_lifecycle ON documents (lifecycle_status);
  -- Sutun eklenmeden once yonlendirilmis belgeler 'new' gorunmesin.
  UPDATE documents SET lifecycle_status = 'routed'
   WHERE lifecycle_status = 'new' AND routing_status <> 'pending';
`;
