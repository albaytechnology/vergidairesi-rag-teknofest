/**
 * Paylasilan Ollama istemcisi.
 *
 * Istemci durumsuzdur (yalnizca baseUrl tutar); her modulun kendi ornegini
 * kurmasi yerine tek ornek paylasilir, boylece yapilandirma tek yerden gelir.
 */
import { OllamaClient } from "@albay/llm";

export const ollama = new OllamaClient();
