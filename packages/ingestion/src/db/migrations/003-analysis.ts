/** Faz 5b: evrak analizi (classify'dan daha ayrintili, vergi dairesi evragina ozel). */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_subject TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_summary_long TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_entities JSONB;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
  -- Faz 5c: yonlendirmenin ve cevap yazisinin girdisi olan alanlar. routing_key
  -- bunlardan turedigi halde bilesenleri saklanmiyordu; yeniden yonlendirme ve
  -- yazi uretimi analizi bastan calistirmadan yapilabilsin diye kalici hale geldi.
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS islem_turu TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS alacak_turu TEXT;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_title_suggestion TEXT;
`;
