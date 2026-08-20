import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.ts";

export interface ResponseLetterRow {
  id: string;
  document_id: string;
  decision: string;
  decision_reason: string | null;
  mukellef_vkn: string | null;
  letter_no: string | null;
  sayi: string | null;
  letter_model: unknown;
  letter_html: string;
  created_at: string;
}

/**
 * Giden evrak sira numarasi uretir.
 *
 * Sadece yazi kaydedilirken cagrilir. Onizleme her tuş vurusunda yeniden
 * uretilebildigi icin, onizlemede numara tuketilseydi defterde koca bosluklar
 * olusurdu; onizleme yer tutucu ("[SIRA NO]") gosterir.
 */
export async function nextLetterNo(): Promise<number> {
  const res = await pool.query<{ n: string }>(
    "SELECT nextval('response_letter_no_seq') AS n",
  );
  return Number(res.rows[0]!.n);
}

export async function saveResponseLetter(letter: {
  documentId: string;
  decision: string;
  decisionReason: string | null;
  mukellefVkn: string | null;
  letterNo: number | null;
  sayi: string | null;
  letterModel: unknown;
  letterHtml: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO response_letters
       (id, document_id, decision, decision_reason, mukellef_vkn,
        letter_no, sayi, letter_model, letter_html)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      letter.documentId,
      letter.decision,
      letter.decisionReason,
      letter.mukellefVkn,
      letter.letterNo,
      letter.sayi,
      JSON.stringify(letter.letterModel),
      letter.letterHtml,
    ],
  );
  return id;
}

/** Bir evrak icin uretilmis yazilar, en yenisi basta. */
export async function listResponseLetters(docId: string): Promise<ResponseLetterRow[]> {
  const res = await pool.query<ResponseLetterRow>(
    "SELECT * FROM response_letters WHERE document_id = $1 ORDER BY created_at DESC",
    [docId],
  );
  return res.rows;
}

export async function getResponseLetter(id: string): Promise<ResponseLetterRow | null> {
  const res = await pool.query<ResponseLetterRow>(
    "SELECT * FROM response_letters WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}
