/**
 * Evrakin eksik/tutarsiz bilgi taramasi.
 *
 * Once istek uzerine hesaplanip atiliyordu; arayuzde bir dugmeye basmak
 * gerekiyordu ve sonuc hicbir yerde durmadigi icin sohbet ayni bulgulari
 * goremiyordu. Tarama artik hattin bir adimi ve sonucu belgeyle birlikte
 * duruyor — panel ile sohbet ayni listeye bakiyor.
 *
 * gaps_scanned_at, "tarama yapildi ama bulgu cikmadi" ile "hic taranmadi"
 * durumlarini ayirir: ikisi de bos bir liste gibi gorunur, ama biri temiz
 * bir evrak, digeri eksik bir islem.
 */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS gap_findings JSONB;
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS gaps_scanned_at TIMESTAMPTZ;
`;
