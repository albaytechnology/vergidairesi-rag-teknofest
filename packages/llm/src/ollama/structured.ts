/**
 * JSON semali cagrilarin ortak iskeleti.
 *
 * Hem siniflandirma hem evrak analizi ayni sekilde calisiyor: sema zorlanmis
 * bir chat cagrisi, JSON.parse ve sema dogrulamasi. Model arada bozuk JSON ya
 * da eksik alan dondurdugu icin cagri bir kez yeniden denenir; iki deneme de
 * duserse alan adiyla birlikte hata firlatilir.
 */
import { OllamaClient } from "./client.ts";

export interface StructuredCallOptions<T> {
  system: string;
  user: string;
  /** Ollama'ya gonderilen JSON Schema (structured output). */
  schema: Record<string, unknown>;
  temperature: number;
  /** Cozulen JSON'u dogrulayip tiplenmis degere ceviren fonksiyon (zod semasi). */
  parse: (value: unknown) => T;
  /** Hata mesajinin basina yazilacak islem adi — orn. "Evrak analizi". */
  islemAdi: string;
  denemeSayisi?: number;
}

export async function structuredJsonCall<T>(
  ollama: OllamaClient,
  opts: StructuredCallOptions<T>,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < (opts.denemeSayisi ?? 2); attempt++) {
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        { format: opts.schema, temperature: opts.temperature },
      );
      return opts.parse(JSON.parse(raw));
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(`${opts.islemAdi} basarisiz: ${lastError?.message}`);
}
