import { pool } from "../db/pool.ts";

/**
 * Yonetmelik korpusundan turetilen servis katalogu.
 * Taksonomi kodda tanimli degil — yonetmelik chunk metadata'sindan okunur.
 */
export async function regulationServices(): Promise<
  { servis: string; hizmetBirimi: string | null; altBolum: string | null; maddeNo: string }[]
> {
  const res = await pool.query<{
    servis: string;
    hizmet_birimi: string | null;
    alt_bolum: string | null;
    madde_no: string;
  }>(
    `SELECT DISTINCT ON (c.metadata->>'servis')
            c.metadata->>'servis'       AS servis,
            c.metadata->>'hizmetBirimi' AS hizmet_birimi,
            c.metadata->>'altBolum'     AS alt_bolum,
            c.metadata->>'maddeNo'      AS madde_no
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE d.corpus = 'regulations'
       AND c.kind = 'child'
       AND c.metadata->>'servis' IS NOT NULL
     ORDER BY c.metadata->>'servis', c.metadata->>'maddeNo'`,
  );
  return res.rows.map((r) => ({
    servis: r.servis,
    hizmetBirimi: r.hizmet_birimi,
    altBolum: r.alt_bolum,
    maddeNo: r.madde_no,
  }));
}

/**
 * Bu ad yonetmelik katalogunda GERCEKTEN bir servis mi?
 *
 * Kaynak regulationServices() ile ayni: yonetmelik chunk'larinin metadata'si.
 * Ayri bir liste tutulmuyor — katalogla kontrolun birbirinden sapmasi, arayuzun
 * hicbir zaman gostermeyecegi bir servise evrak yonlendirilmesi demekti.
 *
 * Karsilastirma bilerek BIREBIR: gecerli bir kararda servis adi zaten chunk
 * metadata'sindan kopyalanir (bkz. reconcileBirim), dolayisiyla tutmayan bir ad
 * "yazim farki" degil, kararin katalogla baglantisinin kopmus olmasidir.
 */
export async function isRegulationService(servis: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1
       FROM chunks c
       JOIN documents d ON d.id = c.doc_id
      WHERE d.corpus = 'regulations'
        AND c.kind = 'child'
        AND c.metadata->>'servis' = $1
      LIMIT 1`,
    [servis],
  );
  return (res.rowCount ?? 0) > 0;
}
