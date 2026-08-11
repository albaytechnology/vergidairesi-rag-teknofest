import { QdrantClient } from "@qdrant/js-client-rest";
import { config, type Corpus } from "@albay/shared";
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
    corpus?: Corpus;
    metadata?: Record<string, unknown>;
    madde_no?: string;
    madde_baslik?: string;
    text: string;
  };
}

/** Collection yoksa olusturur; payload indexlerini acar. Idempotent. */
export async function ensureCollection(
  denseSize: number,
  name = config.QDRANT_COLLECTION,
): Promise<void> {
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
    { field: "corpus", schema: "keyword" },
    { field: "madde_no", schema: "keyword" },
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
  return upsertChunkPointsToCollection(config.QDRANT_COLLECTION, points);
}

export async function upsertChunkPointsToCollection(
  collection: string,
  points: ChunkPoint[],
): Promise<void> {
  if (!points.length) return;
  await client.upsert(collection, {
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

export async function deleteByDocId(docId: string, collection = config.QDRANT_COLLECTION): Promise<void> {
  if (!(await collectionExists(collection))) return;
  await client.delete(collection, {
    wait: true,
    filter: { must: [{ key: "doc_id", match: { value: docId } }] },
  });
}

export async function deletePoints(collection: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await client.delete(collection, { wait: true, points: ids });
}

/** Bir dokumana ait Qdrant point id'leri — Postgres ile karsilastirmak icin. */
export async function pointIdsByDocId(collection: string, docId: string): Promise<string[]> {
  if (!(await collectionExists(collection))) return [];
  const ids: string[] = [];
  let offset: string | number | undefined | null;
  do {
    const res = await client.scroll(collection, {
      filter: { must: [{ key: "doc_id", match: { value: docId } }] },
      limit: 256,
      with_payload: false,
      with_vector: false,
      offset: offset ?? undefined,
    });
    ids.push(...res.points.map((p) => String(p.id)));
    offset = res.next_page_offset as string | number | null | undefined;
  } while (offset != null);
  return ids;
}

/** Koleksiyondaki tum farkli doc_id degerleri. */
export async function distinctDocIds(collection: string): Promise<string[]> {
  if (!(await collectionExists(collection))) return [];
  const docIds = new Set<string>();
  let offset: string | number | undefined | null;
  do {
    const res = await client.scroll(collection, {
      limit: 256,
      with_payload: ["doc_id"],
      with_vector: false,
      offset: offset ?? undefined,
    });
    for (const p of res.points) {
      const id = (p.payload as { doc_id?: string } | null)?.doc_id;
      if (id) docIds.add(id);
    }
    offset = res.next_page_offset as string | number | null | undefined;
  } while (offset != null);
  return [...docIds];
}

export async function collectionExists(name: string): Promise<boolean> {
  const existing = await client.getCollections();
  return existing.collections.some((c) => c.name === name);
}

export async function collectionInfo(collection = config.QDRANT_COLLECTION): Promise<{ points: number }> {
  const info = await client.getCollection(collection);
  return { points: info.points_count ?? 0 };
}
