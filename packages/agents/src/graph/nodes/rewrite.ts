/**
 * Corrective-RAG'in sorgu yeniden yazma adimi. Iki grader de (cevap ve
 * yonlendirme) reddettiginde ayni sekilde tekrar dener, bu yuzden ortak.
 */
import { ollama } from "../../common/ollama.ts";
import { REWRITE_PROMPT } from "../prompts/grader.ts";

export async function rewriteQuery(question: string, eskiSorgu: string): Promise<string> {
  const yeni = await ollama.chat([
    { role: "system", content: REWRITE_PROMPT },
    { role: "user", content: `Soru: ${question}\nEski sorgu: ${eskiSorgu}` },
  ]);
  return yeni.trim().replace(/^["']|["']$/g, "");
}
