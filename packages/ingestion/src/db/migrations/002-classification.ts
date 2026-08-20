/** Faz 3: siniflandirma + embedding takibi. */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS corpus TEXT NOT NULL DEFAULT 'documents';
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]';
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_confidence REAL;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
  CREATE INDEX IF NOT EXISTS idx_documents_corpus ON documents (corpus);
`;
