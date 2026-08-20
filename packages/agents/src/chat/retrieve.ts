/** Belge kapsamli retrieval — sohbet yalnizca acik evraka (ve eklerine) bakar. */
import { hybridSearch, type SearchHit } from "@albay/retrieval";

/**
 * Evrak korpusu bastan sona PII icerir (TCKN/VKN/adres/tutar); varsayilan PII
 * filtresi acik kalirsa chat hicbir sey bulamaz. Yetki kontrolu dokuman degil
 * kullanici seviyesinde, Faz 6 ACL katmaninda.
 */
export async function searchInDocuments(
  question: string,
  docIds: string[],
  topK: number,
): Promise<SearchHit[]> {
  const sonuclar = await Promise.all(
    docIds.map((docId) =>
      hybridSearch(question, { topK, filters: { docId, includePII: true } }),
    ),
  );
  return sonuclar.flat().sort((a, b) => b.score - a.score);
}
