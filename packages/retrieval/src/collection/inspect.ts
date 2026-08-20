/**
 * Koleksiyon icerigini okuma — Postgres ile Qdrant'i karsilastirmak icin.
 *
 * Iki depo birbirinden kayabilir (yarim kalan is, elle silme); qdrant-sync bu
 * iki sorguyla farki bulup duzeltir.
 */
import { collectionExists, scrollPoints } from "../client.ts";

/** Bir dokumana ait Qdrant point id'leri. */
export async function pointIdsByDocId(collection: string, docId: string): Promise<string[]> {
  if (!(await collectionExists(collection))) return [];
  const ids: string[] = [];
  const sayfa = scrollPoints(collection, {
    filter: { must: [{ key: "doc_id", match: { value: docId } }] },
    limit: 256,
    with_payload: false,
    with_vector: false,
  });
  for await (const p of sayfa) ids.push(String(p.id));
  return ids;
}

/** Koleksiyondaki tum farkli doc_id degerleri. */
export async function distinctDocIds(collection: string): Promise<string[]> {
  if (!(await collectionExists(collection))) return [];
  const docIds = new Set<string>();
  const sayfa = scrollPoints(collection, {
    limit: 256,
    with_payload: ["doc_id"],
    with_vector: false,
  });
  for await (const p of sayfa) {
    const id = (p.payload as { doc_id?: string } | null)?.doc_id;
    if (id) docIds.add(id);
  }
  return [...docIds];
}
