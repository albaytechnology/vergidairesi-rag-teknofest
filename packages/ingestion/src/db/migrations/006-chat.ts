/** Faz 5b: belge bazli chat gecmisi (multi-turn hafiza). */
export const sql = `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- created_at tek basina siralama icin yeterli degil: ayni istekte yazilan
  -- soru/cevap ciftinin zaman damgasi cakisabiliyor. seq kesin sira verir.
  ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS seq BIGSERIAL;
  CREATE INDEX IF NOT EXISTS idx_chat_messages_doc
    ON chat_messages (document_id, seq);
`;
