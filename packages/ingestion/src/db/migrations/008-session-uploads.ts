/**
 * Faz 5b: chat oturumuna ozel gecici dokumanlar (ana koleksiyona karismaz).
 *
 * Asagidaki Faz 5e geri doldurmasi session_uploads tablosundan okudugu icin bu
 * adim tablonun olusturulmasindan SONRA gelmeli; sifirdan kurulan veritabaninda
 * aksi halde 42P01 verir. Adim sirasi bu yuzden onemli, bkz. db/migrate.ts.
 */
export const sql = `
  CREATE TABLE IF NOT EXISTS session_uploads (
    session_id TEXT NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, document_id)
  );
  CREATE INDEX IF NOT EXISTS idx_session_uploads_expiry ON session_uploads (expires_at);

  -- Faz 5e: sohbete aticlanan belge, KALICI olarak evraktan ayrilir.
  --
  -- Once bu ayrim session_uploads tablosundaki TTL'li kayittan turetiliyordu;
  -- 12 saat dolunca chat ekleri servis havuzlarina ve arsive geri dusuyordu.
  -- "Bu bir referans belgesi, resmi evrak degil" kalici bir olgudur, gecici
  -- bir kayit uzerinden ifade edilemez.
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_documents_session ON documents (session_id);
  -- Sutun eklenmeden once yuklenmis chat eklerini geriye donuk isaretle ve
  -- yanlislikla aldiklari servis yonlendirmesini temizle.
  UPDATE documents d SET session_id = s.session_id
    FROM session_uploads s
   WHERE s.document_id = d.id AND d.session_id IS NULL;
  UPDATE documents
     SET routed_service = NULL, routed_birim = NULL, routing_confidence = NULL,
         routing_reasoning = NULL, routing_regulation_refs = NULL,
         routing_status = 'pending', routing_key = NULL, lifecycle_status = 'new'
   WHERE session_id IS NOT NULL AND routing_status <> 'pending';
`;
