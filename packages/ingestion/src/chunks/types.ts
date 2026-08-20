import type { Corpus } from "@albay/shared";

/** Chunker'in urettigi, veritabanina yazilmaya hazir parca. */
export interface ChunkInsert {
  id: string;
  docId: string;
  kind: "child" | "parent";
  text: string;
  page: number | null;
  section: string | null;
  parentId: string | null;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

/** Embed edilmeyi bekleyen parca; belge alanlari Qdrant payload'i icin tasinir. */
export interface ChunkToEmbed {
  id: string;
  doc_id: string;
  text: string;
  page: number | null;
  section: string | null;
  parent_id: string | null;
  filename: string;
  path: string;
  corpus: Corpus;
  doc_type: string | null;
  contains_pii: boolean | null;
  entities: string[];
  metadata: Record<string, unknown>;
}
