import type { ServiceRoutingDecision } from "@albay/shared";
import { pool } from "../db/pool.ts";
import { isRegulationService } from "./catalog.ts";

/**
 * Katalogda karsiligi olmayan servis adini dayanaksiz sayar.
 *
 * NEDEN: `servis` serbest metindir ve model oraya bir BIRIM adi ("Vergilendirme")
 * ya da uydurma bir ad yazabiliyor. Boyle bir kayit hicbir servis havuzuna
 * (routed_service = <katalog adi>) dusmez, ama routed_service dolu oldugu icin
 * yonlendirilemeyenler havuzuna da girmez — evrak arayuzden sessizce kaybolur.
 * Sessiz kaybolmanin tek dogru karsiligi manuel incelemedir.
 *
 * Gerekce SILINMEZ, uzerine not dusulur: evrakla ilgilenecek calisanin modelin
 * neyi neden onerdigini gormesi gerekiyor.
 */
function katalogDisiKarar(d: ServiceRoutingDecision): ServiceRoutingDecision {
  return {
    ...d,
    anaBirim: null,
    digerBirim: null,
    servis: null,
    altServis: null,
    ilgiliMaddeler: [],
    guvenSkoru: 0,
    belirlenemedi: true,
    gerekce:
      `${d.gerekce}\n\n[Otomatik kontrol] Karar "${d.servis}" adını gösteriyor;` +
      " yönetmelik kataloğunda böyle bir servis yok. Evrak manuel incelemeye alındı.",
  };
}

/**
 * Yonlendirme kararinin TEK yazma noktasi — hem ingest hatti hem "yeniden
 * hesapla" ucu buradan gecer. Katalog kontrolu de bu yuzden burada duruyor:
 * cagiranlara birakilsa, ikisinden birinin gunun birinde atlamasi demekti.
 */
export async function saveRoutingDecision(
  docId: string,
  decision: ServiceRoutingDecision,
  routingKey?: string,
): Promise<void> {
  const katalogDisi =
    !decision.belirlenemedi &&
    !!decision.servis &&
    !(await isRegulationService(decision.servis));
  const d = katalogDisi ? katalogDisiKarar(decision) : decision;

  await pool.query(
    `UPDATE documents SET
       routed_birim = $2, routed_service = $3, routing_confidence = $4,
       routing_reasoning = $5, routing_regulation_refs = $6, routing_status = $7,
       routing_key = COALESCE($8, routing_key),
       routed_at = now(), updated_at = now(),
       -- Yasam dongusu yalnizca ILERI gider: uzerinde calisilmis ya da
       -- cevaplanmis bir evrak yeniden yonlendirilirse 'routed'a dusmemeli.
       lifecycle_status = CASE WHEN lifecycle_status = 'new' THEN 'routed'
                               ELSE lifecycle_status END
     WHERE id = $1`,
    [
      docId,
      d.belirlenemedi ? null : (d.anaBirim ?? d.digerBirim),
      d.belirlenemedi ? null : d.servis,
      d.guvenSkoru,
      d.gerekce,
      JSON.stringify(d.ilgiliMaddeler),
      d.belirlenemedi ? "belirlenemedi" : "routed",
      routingKey ?? null,
    ],
  );
}
