import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "@albay/shared";
import type { SparseVector } from "./sparse.ts";

export const client = new QdrantClient({ url: config.QDRANT_URL });

export interface ChunkPoint {
  id: string; // chunk UUID
  dense: number[];
  sparse: SparseVector;
  payload: {
    doc_id: string;
    filename: string;
    path: string;
    doc_type: string | null;
    contains_pii: boolean | null;
    entities: string[];
    section: string | null;
    page: number | null;
    parent_id: string | null;
    text: string;
  };
}

/** Collection yoksa olusturur; payload indexlerini acar. Idempotent. */
export async function ensureCollection(denseSize: number): Promise<void> {
  const name = config.QDRANT_COLLECTION;
  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === name)) {
    await client.createCollection(name, {
      vectors: {
        dense: { size: denseSize, distance: "Cosine" },
      },
      sparse_vectors: {
        sparse: { modifier: "idf" },
      },
    });
    console.log(`✓ Qdrant collection olusturuldu: ${name} (dense=${denseSize}, sparse=idf)`);
  }

  // Filtreleme yapilacak alanlara payload index (varsa hata verir -> yut)
  const indexes: { field: string; schema: "keyword" | "bool" | "integer" }[] = [
    { field: "doc_type", schema: "keyword" },
    { field: "contains_pii", schema: "bool" },
    { field: "entities", schema: "keyword" },
    { field: "filename", schema: "keyword" },
    { field: "doc_id", schema: "keyword" },
  ];
  for (const idx of indexes) {
    try {
      await client.createPayloadIndex(name, {
        field_name: idx.field,
        field_schema: idx.schema,
        wait: true,
      });
    } catch {
      // zaten var — sorun degil
    }
  }
}

export async function upsertChunkPoints(points: ChunkPoint[]): Promise<void> {
  if (!points.length) return;
  await client.upsert(config.QDRANT_COLLECTION, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: {
        dense: p.dense,
        sparse: { indices: p.sparse.indices, values: p.sparse.values },
      },
      payload: p.payload,
    })),
  });
}

export async function deleteByDocId(docId: string): Promise<void> {
  await client.delete(config.QDRANT_COLLECTION, {
    wait: true,
    filter: { must: [{ key: "doc_id", match: { value: docId } }] },
  });
}

export async function collectionInfo(): Promise<{ points: number }> {
  const info = await client.getCollection(config.QDRANT_COLLECTION);
  return { points: info.points_count ?? 0 };
}
