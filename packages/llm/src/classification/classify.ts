/**
 * Kurum korpusu icin genel dokuman siniflandirma.
 *
 * analysis/ klasorunden farki: burada amac arsivdeki bir dokumani etiketlemek;
 * orada gelen bir evraki islenebilir alanlara acmak.
 */
import { DocClassificationSchema, type DocClassification } from "@albay/shared";
import { OllamaClient } from "../ollama/client.ts";
import { structuredJsonCall } from "../ollama/structured.ts";
import { CLASSIFY_SYSTEM_PROMPT } from "./prompt.ts";
import { CLASSIFY_JSON_SCHEMA } from "./schema.ts";

export interface ClassifyInput {
  filename: string;
  sampleText: string;
}

export async function classifyDocument(
  ollama: OllamaClient,
  input: ClassifyInput,
): Promise<DocClassification> {
  const parsed = await structuredJsonCall(ollama, {
    system: CLASSIFY_SYSTEM_PROMPT,
    user: `Dosya adi: ${input.filename}\n\nIcerik ornegi:\n${input.sampleText.slice(0, 6000)}`,
    schema: CLASSIFY_JSON_SCHEMA,
    temperature: 0.1,
    parse: (value) => DocClassificationSchema.parse(value),
    islemAdi: "Siniflandirma",
  });

  return {
    ...parsed,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    entities: [...new Set(parsed.entities)].slice(0, 10),
  };
}
