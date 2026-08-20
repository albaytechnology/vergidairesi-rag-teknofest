/** Faz 5b: servis yonlendirme sonucu (ingest aninda hesaplanir, havuz bundan cikar). */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_birim TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_service TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_confidence REAL;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_reasoning TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_regulation_refs JSONB;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;
  -- Ayni tur evrakin ayni servise gitmesini denetlemek icin (pnpm routing:audit)
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_key TEXT;
  CREATE INDEX IF NOT EXISTS idx_documents_routed_service ON documents (routed_service);
  CREATE INDEX IF NOT EXISTS idx_documents_routing_status ON documents (routing_status);
`;
