import { pool } from "../db/pool.ts";
import { OTURUM_EKI_DEGIL } from "../documents/filters.ts";
import type { DocumentDetail } from "../documents/types.ts";

export interface ServiceQueueRow {
  servis: string | null;
  birim: string | null;
  /** Cevap yazisi HENUZ uretilmemis evrak — calisanin is yuku budur. */
  bekleyen: number;
  /** Cevaplanmis evrak; havuzda gorunur ama is olarak sayilmaz. */
  tamamlanan: number;
}

/**
 * Havuz sayaclari.
 *
 * Servis adlari HARDCODE EDILMEZ — yonlendirilmis dokumanlardan gelir;
 * katalog icin regulationServices() kullanilir.
 *
 * Bekleyen ve tamamlanan AYRI sayilir: cevabi yazilmis evrak havuzda gorunmeye
 * devam eder ama is yuku degildir. Ikisi tek sayida toplandiginda kart
 * "bekleyen" diyip cevaplanmislari da sayiyordu — calisan neye oncelik
 * verecegini sayidan okuyamiyordu.
 */
export async function serviceQueueCounts(): Promise<ServiceQueueRow[]> {
  const res = await pool.query<{
    servis: string | null;
    birim: string | null;
    bekleyen: string;
    tamamlanan: string;
  }>(
    `SELECT routed_service AS servis, routed_birim AS birim,
            COUNT(*) FILTER (WHERE lifecycle_status <> 'completed') AS bekleyen,
            COUNT(*) FILTER (WHERE lifecycle_status =  'completed') AS tamamlanan
     FROM documents
     WHERE corpus = 'documents' AND routing_status <> 'pending'
       AND ${OTURUM_EKI_DEGIL}
     GROUP BY routed_service, routed_birim`,
  );
  return res.rows.map((r) => ({
    servis: r.servis,
    birim: r.birim,
    bekleyen: Number(r.bekleyen),
    tamamlanan: Number(r.tamamlanan),
  }));
}

/** Servis havuzu listesi. servis=null verilirse henuz yonlendirilememisler doner. */
export async function listDocumentsByService(
  servis: string | null,
  limit = 100,
): Promise<DocumentDetail[]> {
  const res = await pool.query<DocumentDetail>(
    // Cevaplanmislar listenin SONUNA: calisanin gozu once is bekleyene gitsin.
    `SELECT * FROM documents
     WHERE corpus = 'documents'
       AND ${servis === null ? "routing_status = 'belirlenemedi'" : "routed_service = $2"}
       AND ${OTURUM_EKI_DEGIL}
     ORDER BY (lifecycle_status = 'completed'), created_at DESC
     LIMIT $1`,
    servis === null ? [limit] : [limit, servis],
  );
  return res.rows;
}
