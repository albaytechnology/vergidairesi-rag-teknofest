/** Faz 1-2: ham evrak kaydi ve parcalari — hattin iskeleti. */
export const sql = `
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    format TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    parsed_md_path TEXT,
    docling_json_path TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
  CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents (hash);

  CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY,
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'child',
    text TEXT NOT NULL,
    page INT,
    section TEXT,
    parent_id UUID,
    token_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks (doc_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks (kind);
`;
