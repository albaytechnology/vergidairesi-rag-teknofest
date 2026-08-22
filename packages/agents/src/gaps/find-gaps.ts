/**
 * Evrakin eksik/tutarsiz bilgi taramasi.
 *
 * LLM cagrisinin kendisi @albay/llm'de; burada yalnizca paylasilan Ollama
 * istemcisi bagliniyor — tuketici (apps/api) model katmanini tanimasin,
 * routing ve letter akislarinda oldugu gibi ajan yuzeyinden cagirsin.
 */
import { analyzeDocumentGaps } from "@albay/llm";
import type { DocumentGapReport } from "@albay/shared";
import { ollama } from "../common/ollama.ts";

export async function findDocumentGaps(input: {
  filename: string;
  text: string;
}): Promise<DocumentGapReport> {
  return analyzeDocumentGaps(ollama, input);
}
