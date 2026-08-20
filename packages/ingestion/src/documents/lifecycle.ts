import { pool } from "../db/pool.ts";

/** Evrakin is akisi durumu — parse hattinin DocStatus'undan bagimsizdir. */
export type LifecycleStatus = "new" | "routed" | "in_progress" | "completed";

/** Durumlarin ileri siralamasi; geri dusmeyi engellemek icin. */
const YASAM_SIRASI: Record<LifecycleStatus, number> = {
  new: 0,
  routed: 1,
  in_progress: 2,
  completed: 3,
};

/**
 * Yasam dongusu durumunu ILERI yonde gunceller.
 *
 * Geri dusme bilerek engelli: calisan belgeyi ikinci kez actiginda ya da
 * cevaplanmis bir evraga geri dondugunde durum gerilerse, arsiv panelindeki
 * "cevap yazildi" bilgisi kaybolur ve is takibi yaniltici hale gelir.
 */
export async function setLifecycleStatus(
  docId: string,
  durum: LifecycleStatus,
  karar?: string,
): Promise<void> {
  const geriDusmeyecekler = (Object.keys(YASAM_SIRASI) as LifecycleStatus[]).filter(
    (d) => YASAM_SIRASI[d] >= YASAM_SIRASI[durum],
  );
  await pool.query(
    `UPDATE documents
        SET lifecycle_status = $2,
            completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
            completed_decision = CASE WHEN $2 = 'completed'
                                      THEN COALESCE($4, completed_decision)
                                      ELSE completed_decision END,
            updated_at = now()
      WHERE id = $1 AND lifecycle_status <> ALL($3::text[])`,
    [docId, durum, geriDusmeyecekler, karar ?? null],
  );
}
