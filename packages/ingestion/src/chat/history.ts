import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.ts";

export interface ChatMessageRow {
  id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  created_at: string;
}

export async function appendChatMessage(msg: {
  documentId: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (id, document_id, role, content, sources)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), msg.documentId, msg.role, msg.content, JSON.stringify(msg.sources ?? [])],
  );
}

/**
 * Soru ve cevabi TEK islemde yazar.
 *
 * Ayri ayri yazilirsa istemci akis ortasinda baglantiyi kestiginde gecmiste
 * cevapsiz bir kullanici mesaji kalir; bir sonraki turda modele ust uste iki
 * "user" mesaji gider. Ya ikisi birden yazilir ya da hicbiri.
 */
export async function appendChatExchange(exchange: {
  documentId: string;
  question: string;
  answer: string;
  sources?: string[];
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO chat_messages (id, document_id, role, content, sources)
       VALUES ($1, $2, 'user', $3, '[]'::jsonb)`,
      [randomUUID(), exchange.documentId, exchange.question],
    );
    await client.query(
      `INSERT INTO chat_messages (id, document_id, role, content, sources)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        randomUUID(),
        exchange.documentId,
        exchange.answer,
        JSON.stringify(exchange.sources ?? []),
      ],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Son N mesaj, kronolojik sirada (multi-turn hafiza icin). */
export async function getChatHistory(documentId: string, limit = 20): Promise<ChatMessageRow[]> {
  const res = await pool.query<ChatMessageRow>(
    `SELECT * FROM (
       SELECT * FROM chat_messages WHERE document_id = $1
       ORDER BY seq DESC LIMIT $2
     ) t ORDER BY seq ASC`,
    [documentId, limit],
  );
  return res.rows;
}
