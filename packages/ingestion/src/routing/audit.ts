import { pool } from "../db/pool.ts";

export interface RoutingConsistencyRow {
  routing_key: string;
  servisler: string[];
  belgeler: { filename: string; servis: string | null }[];
}

/**
 * Ayni routing_key'e sahip olup FARKLI servise yonlendirilmis evraklar.
 * Bos donmesi beklenir; dolu donuyorsa ayni tur evrak farkli islem goruyor demektir.
 */
export async function routingInconsistencies(): Promise<RoutingConsistencyRow[]> {
  const res = await pool.query<RoutingConsistencyRow>(
    `SELECT routing_key,
            array_agg(DISTINCT COALESCE(routed_service, '(belirlenemedi)')) AS servisler,
            json_agg(json_build_object('filename', filename, 'servis', routed_service)) AS belgeler
     FROM documents
     WHERE corpus = 'documents' AND routing_key IS NOT NULL AND routing_status <> 'pending'
     GROUP BY routing_key
     HAVING COUNT(DISTINCT COALESCE(routed_service, '(belirlenemedi)')) > 1`,
  );
  return res.rows;
}
