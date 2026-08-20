import type { ServiceRoutingDecision } from "@albay/shared";
import { pool } from "../db/pool.ts";

export async function saveRoutingDecision(
  docId: string,
  d: ServiceRoutingDecision,
  routingKey?: string,
): Promise<void> {
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
      d.anaBirim ?? d.digerBirim,
      d.belirlenemedi ? null : d.servis,
      d.guvenSkoru,
      d.gerekce,
      JSON.stringify(d.ilgiliMaddeler),
      d.belirlenemedi ? "belirlenemedi" : "routed",
      routingKey ?? null,
    ],
  );
}
