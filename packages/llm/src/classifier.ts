import { DocClassificationSchema, type DocClassification } from "@albay/shared";
import { OllamaClient } from "./ollama.ts";

/** Ollama structured output icin JSON Schema (zod semasiyla ayni sekil). */
const CLASSIFY_JSON_SCHEMA = {
  type: "object",
  properties: {
    docType: {
      type: "string",
      enum: ["sozlesme", "personel_kaydi", "prosedur", "rapor", "diger"],
    },
    entities: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    containsPII: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: ["docType", "entities", "summary", "containsPII", "confidence"],
} as const;

const SYSTEM_PROMPT = `Sen Albay Teknoloji'nin kurumsal dokuman siniflandirma asistanisin.
Sana bir dokumanin dosya adi ve icerik ornegi verilecek. Gorevin:

1. docType: dokuman tipini sec — sozlesme | personel_kaydi | prosedur | rapor | diger
2. entities: dokumanda gecen onemli kisi ve kurum adlarini listele (en fazla 10, tekrarsiz)
3. summary: 1-2 cumlelik Turkce ozet
4. containsPII: kisisel veri var mi? Su durumlarda MUTLAKA true:
   - TC kimlik numarasi (11 haneli)
   - Telefon, ev adresi, dogum tarihi
   - Maas, IBAN, banka bilgisi
   - Saglik/ozluk bilgisi
5. confidence: siniflandirmadan ne kadar eminsin (0.0 - 1.0)

SADECE JSON dondur. Emin olmadigin alanda uydurma: entities bos kalabilir,
confidence dusuk olabilir.`;

export async function classifyDocument(
  ollama: OllamaClient,
  input: { filename: string; sampleText: string },
): Promise<DocClassification> {
  const userPrompt = `Dosya adi: ${input.filename}\n\nIcerik ornegi:\n${input.sampleText.slice(0, 6000)}`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        { format: CLASSIFY_JSON_SCHEMA as unknown as Record<string, unknown>, temperature: 0.1 },
      );
      const parsed = DocClassificationSchema.parse(JSON.parse(raw));
      return {
        ...parsed,
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        entities: [...new Set(parsed.entities)].slice(0, 10),
      };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(`Siniflandirma basarisiz: ${lastError?.message}`);
}
