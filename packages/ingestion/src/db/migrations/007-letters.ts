/** Faz 5b: uretilen cevap yazilari (son hali insan tarafindan duzenlenmis olabilir). */
export const sql = `
  CREATE TABLE IF NOT EXISTS response_letters (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    decision TEXT NOT NULL,
    decision_reason TEXT,
    mukellef_vkn TEXT,
    letter_model JSONB NOT NULL,
    letter_html TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_response_letters_doc ON response_letters (document_id);

  -- Faz 5c: yazinin "Sayi" alanindaki giden evrak sira numarasi.
  -- Numara ancak yazi KAYDEDILIRKEN alinir; her onizleme icin numara
  -- tuketilirse giden evrak defterinde bosluklar olusur.
  ALTER TABLE response_letters ADD COLUMN IF NOT EXISTS letter_no BIGINT;
  ALTER TABLE response_letters ADD COLUMN IF NOT EXISTS sayi TEXT;
  CREATE SEQUENCE IF NOT EXISTS response_letter_no_seq START 1;
`;
