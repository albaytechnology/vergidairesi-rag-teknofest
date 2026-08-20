/**
 * Yonlendirme kararinin baglamini kurar: yonetmelik koleksiyonunda ara, orgut
 * tipine uymayan parcalari ele, kalani servis basina cesitlendir.
 */
import { config } from "@albay/shared";
import { hybridSearch, type SearchHit } from "@albay/retrieval";
import { isServiceForOrgType } from "./services.ts";

/**
 * Yonetmelik koleksiyonu kucuk (~60 parca) ama servis paleti genis: dogru servisi
 * secebilmek icin adaylari genis tut, aksi halde model yalnizca kelime benzerligi
 * yuksek birkac servisi gorur.
 */
const ROUTING_TOP_K = 14;
const ROUTING_CANDIDATES = 60;
/** Havuzdan cekilen ham aday sayisi — cesitlendirmeden once. */
const ROUTING_RAW_K = 28;
/** Tek bir servisin baglami doldurmasini engelleyen ust sinir. */
const PER_SERVICE_LIMIT = 2;

/**
 * Servis basina ust sinir uygulayarak baglami cesitlendirir.
 *
 * NEDEN: yonlendirme, "hangi servis" sorusunun cevabini bir KATALOG icinden
 * secmek demek; model secenekleri yan yana gormeli. Duz benzerlik siralamasi
 * bunu vermiyor — ornegin yonetmelik Sureksiz Yukumlulukler servisinin altinda
 * vergi turlerini TEK TEK sayarken (MTV, tasit alim, tapu harci, veraset),
 * Surekli servisin altinda vergi adi gecmiyor. Bu yuzden icinde herhangi bir
 * vergi adi gecen her sorgu Sureksiz parcalarini yukari cekiyor ve model
 * "KDV bu listede YOK" cikarimini yapamadan Sureksiz'i seciyordu.
 *
 * Servis basina en fazla 2 parca alinca her iki servisin gorev tanimi da
 * baglamda oluyor ve karsilastirma mumkun hale geliyor.
 */
export function diversifyByService(
  hits: SearchHit[],
  perService = PER_SERVICE_LIMIT,
  limit = ROUTING_TOP_K,
): SearchHit[] {
  const sayac = new Map<string, number>();
  const secilen: SearchHit[] = [];
  const artakalan: SearchHit[] = [];

  for (const h of hits) {
    const servis = h.metadata?.servis;
    // Servise bagli olmayan parcalar (genel maddeler) madde bazinda gruplanir,
    // yoksa tek bir maddenin parcalari baglami doldurabiliyor.
    const anahtar =
      typeof servis === "string" && servis
        ? `servis:${servis}`
        : `madde:${String(h.metadata?.maddeNo ?? "?")}`;
    const adet = sayac.get(anahtar) ?? 0;
    if (adet < perService) {
      sayac.set(anahtar, adet + 1);
      secilen.push(h);
    } else {
      artakalan.push(h);
    }
  }
  // Yer kalirsa elenenlerle doldur — bilgi atmiyoruz, yalnizca sirayi degistiriyoruz.
  return [...secilen, ...artakalan].slice(0, limit);
}

/**
 * Orgut tipine gore gecersiz servis parcalarini eler.
 *
 * Madde 12 yalnizca BAGLI VERGI DAIRELERI icindir (Tahakkuk / Tahsilat Servisi);
 * baskanlik veya mudurluk tipinde boyle bir servis YOKTUR. Filtre olmadan model
 * bu parcalari gorup "Tahakkuk Servisi" onerebiliyordu — kurumda karsiligi olmayan
 * bir hedef. Tersi de gecerli: bagli vergi dairesinde Madde 10/11 servisleri yok.
 */
function orgTipineUygun(hit: SearchHit, orgType: string): boolean {
  const servisli = typeof hit.metadata?.servis === "string" && hit.metadata.servis;
  if (!servisli) return true; // genel maddeler her tipte gecerli
  return isServiceForOrgType(String(hit.metadata?.maddeNo ?? ""), orgType);
}

/** Karar icin kullanilacak yonetmelik parcalari (filtrelenmis ve cesitlendirilmis). */
export async function fetchRegulationHits(query: string): Promise<SearchHit[]> {
  const hamHits = await hybridSearch(query, {
    topK: ROUTING_RAW_K,
    candidates: ROUTING_CANDIDATES,
    collection: config.QDRANT_REGULATIONS_COLLECTION,
    filters: { includePII: true },
    skipRerank: true,
  });
  return diversifyByService(hamHits.filter((h) => orgTipineUygun(h, config.TAX_OFFICE_ORG_TYPE)));
}
