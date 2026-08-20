/**
 * Koleksiyon semasi: vektor alanlari ve payload indexleri.
 *
 * Sema bilgisi tek yerde durur cunku hem ana evrak korpusu hem de yonetmelik
 * korpusu ayni sekilde kurulur; ikisi arasinda ayrisma olursa bir tarafta
 * filtreleme sessizce yavaslardi.
 */
import { client } from "../client.ts";
import { config } from "@albay/shared";

/** Filtre uygulanan her alan indexlenir — aksi halde Qdrant tam tarama yapar. */
const PAYLOAD_INDEXES: { field: string; schema: "keyword" | "bool" | "integer" }[] = [
  { field: "doc_type", schema: "keyword" },
  { field: "contains_pii", schema: "bool" },
  { field: "entities", schema: "keyword" },
  { field: "filename", schema: "keyword" },
  { field: "doc_id", schema: "keyword" },
  { field: "corpus", schema: "keyword" },
  { field: "madde_no", schema: "keyword" },
];

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

  for (const idx of PAYLOAD_INDEXES) {
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
