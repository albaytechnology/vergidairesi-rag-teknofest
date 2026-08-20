/**
 * Nokta yazma ve silme.
 *
 * ChunkPoint, indeksin sozlesmesidir: ingestion tarafinin urettigi her parca bu
 * sekle donusur ve arama tarafi yalnizca buradaki payload alanlarina guvenir.
 */
import { config, type Corpus } from "@albay/shared";
import { client, collectionExists } from "../client.ts";
import type { SparseVector } from "../sparse/encode.ts";

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

export async function deleteByDocId(
  docId: string,
  collection = config.QDRANT_COLLECTION,
): Promise<void> {
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
