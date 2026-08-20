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
