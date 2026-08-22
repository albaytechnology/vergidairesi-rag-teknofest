/**
 * LLM katmani — modelle konusan TEK paket.
 *
 * Ollama'nin var oldugunu bilen yalnizca bu paket; tuketiciler alt yollari
 * degil, bu yuzeyi import eder.
 *
 *   ollama/          sunucu istemcisi, akis cozumu, JSON semali cagri iskeleti
 *   classification/  arsiv dokumanini etiketleme (docType, PII, ozet)
 *   analysis/        gelen evrakin analizi + ciktinin belge metnine dayandirilmasi
 *   identifiers/     TCKN / VKN checksum dogrulamasi ve metinden aday tarama
 *   text/            paylasilan metin normallestirme yardimcilari
 */
export { OllamaClient } from "./ollama/client.ts";
export type { ChatMessage, ChatOptions } from "./ollama/types.ts";

export { classifyDocument, type ClassifyInput } from "./classification/classify.ts";

export { analyzeDocument, type AnalyzeInput } from "./analysis/analyze.ts";
export { analyzeDocumentGaps, type GapsInput } from "./analysis/gaps.ts";
export { groundAlacakTuru } from "./analysis/grounding.ts";

export { isValidTckn, isValidVkn } from "./identifiers/checksum.ts";
export { validateTckn, validateVkn } from "./identifiers/validate.ts";
export { extractIdentifierCandidates, type IdentifierCandidates } from "./identifiers/extract.ts";
