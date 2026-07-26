import { z } from "zod";

/** Chunk semasi. kind: "child" = arama icin kucuk parca, "parent" = LLM'e genis baglam. */
export const ChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  kind: z.enum(["child", "parent"]),
  text: z.string(),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  parentId: z.string().nullable(),
  tokenCount: z.number().int(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

/** Faz 3'te LLM siniflandirma ciktisi. */
export const DocClassificationSchema = z.object({
  docType: z.enum(["sozlesme", "personel_kaydi", "prosedur", "rapor", "diger"]),
  entities: z.array(z.string()),
  summary: z.string(),
  containsPII: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type DocClassification = z.infer<typeof DocClassificationSchema>;

/** Eval hedeflerinin ortak arayuzu (RAGFlow, yeni sistem...). */
export interface EvalTarget {
  name: string;
  ask(question: string): Promise<{ answer: string; sources: string[] }>;
}
