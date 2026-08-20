/** Ollama structured output icin JSON Schema (zod semasiyla ayni sekil). */
export const CLASSIFY_JSON_SCHEMA: Record<string, unknown> = {
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
};
