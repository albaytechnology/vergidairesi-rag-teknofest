/** Belge kapsamli retrieval — sohbet acik evraka (ve eklerine) bakar. */
import { config } from "@albay/shared";
import { hybridSearch, type SearchHit } from "@albay/retrieval";
import { normalizeMaddeNo } from "../routing/madde.ts";

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

/**
 * Yonlendirmenin dayandigi yonetmelik maddelerinin metnini getirir.
 *
 * Sorgu yalnizca calisanin sorusu degil, kararin dayandigi madde basliklariyla
 * birlikte kurulur: "yonlendirme neden bu servis?" tek basina yonetmelik
 * koleksiyonunda hicbir seye benzemez — eslesmeyi saglayan sey servis adi ve
 * madde baslikleridir.
 *
 * Karara dayanak gosterilen maddeler one alinir: model once KARARIN dayanagini
 * gormeli, benzer baska bir servisin gorev tanimini degil.
 */
export async function searchRegulations(
  question: string,
  servis: string | null,
  maddeler: { maddeNo: string; baslik: string }[],
  topK = 4,
): Promise<SearchHit[]> {
  const sorgu = [question, servis ?? "", ...maddeler.map((m) => m.baslik)]
    .filter(Boolean)
    .join(" ");
  const hits = await hybridSearch(sorgu, {
    topK,
    collection: config.QDRANT_REGULATIONS_COLLECTION,
  });

  const dayanak = new Set(maddeler.map((m) => normalizeMaddeNo(m.maddeNo)));
  return [...hits].sort((a, b) => oncelik(a, dayanak) - oncelik(b, dayanak));
}

const oncelik = (hit: SearchHit, dayanak: Set<string>): number =>
  dayanak.has(normalizeMaddeNo(String(hit.metadata?.maddeNo ?? ""))) ? 0 : 1;
