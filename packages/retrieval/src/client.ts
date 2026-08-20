import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "@albay/shared";

/**
 * Qdrant'a acilan tek istemci.
 *
 * Paketin geri kalani bu ornegi paylasir; koleksiyon basina ayri istemci
 * kurmanin anlami yok, adres tek bir yapilandirmadan geliyor.
 */
export const client = new QdrantClient({ url: config.QDRANT_URL });

export async function collectionExists(name: string): Promise<boolean> {
  const existing = await client.getCollections();
  return existing.collections.some((c) => c.name === name);
}

export async function collectionInfo(
  collection = config.QDRANT_COLLECTION,
): Promise<{ points: number }> {
  const info = await client.getCollection(collection);
  return { points: info.points_count ?? 0 };
}

type ScrollParams = Parameters<typeof client.scroll>[1];
type ScrollPoint = Awaited<ReturnType<typeof client.scroll>>["points"][number];

/**
 * Koleksiyonu sayfa sayfa gezer ve tum noktalari tek tek verir.
 *
 * Qdrant scroll'u imlecli calisiyor; cagiran her yerde ayni do/while'i yazmak
 * yerine dongu burada bir kez kuruldu. Uretici (generator) olmasi, cagiranin
 * tum noktalari bellekte biriktirmek zorunda kalmamasi icin.
 */
export async function* scrollPoints(
  collection: string,
  params: ScrollParams,
): AsyncGenerator<ScrollPoint> {
  let offset: string | number | undefined | null;
  do {
    const res = await client.scroll(collection, { ...params, offset: offset ?? undefined });
    yield* res.points;
    offset = res.next_page_offset as string | number | null | undefined;
  } while (offset != null);
}
