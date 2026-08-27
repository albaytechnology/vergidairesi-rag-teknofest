import {
  IslemTuruSchema,
  type DocumentAnalysis,
  type DocumentKunye,
  type DocumentOzet,
} from "@albay/shared";
import { pool } from "../db/pool.ts";
import type { DocumentDetail } from "./types.ts";

/**
 * Kunye adiminin sonucu.
 *
 * Analiz iki adima bolundugu icin kayit da iki parcaya bolundu: her adim
 * BITER BITMEZ kendi izini birakiyor, yoksa arayuzdeki ilerleme cubugu iki
 * bolmeyi de ancak ikinci cagri dondugunde doldurur ve bolme ayrimi
 * gostermelik kalirdi (bkz. api/helpers/pipeline-steps.ts).
 *
 * needs_review burada hesaplaniyor: guven skoru kunye cagrisindan geliyor.
 */
export async function saveDocumentKunye(
  docId: string,
  k: DocumentKunye,
  reviewThreshold = 0.6,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       extracted_entities = $2, doc_type = $3, contains_pii = $4,
       classification_confidence = $5, needs_review = $6,
       islem_turu = $7, alacak_turu = $8,
       kunye_at = now(), classified_at = now(), updated_at = now()
     WHERE id = $1`,
    [
      docId,
      JSON.stringify(k.entities),
      k.docType,
      k.containsPII,
      k.confidence,
      k.confidence < reviewThreshold,
      k.islemTuru,
      k.alacakTuru,
    ],
  );
}

/**
 * Ozet adiminin sonucu — analizi TAMAMLAYAN yazim.
 *
 * analyzed_at burada set ediliyor: hattin geri kalani ve cevap yazisi
 * "analiz bitti mi" diye ona bakiyor, ozet ise analizin son parcasi.
 */
export async function saveDocumentSummary(docId: string, o: DocumentOzet): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       doc_subject = $2, doc_summary_long = $3, summary = $4, doc_title_suggestion = $5,
       analyzed_at = now(), updated_at = now()
     WHERE id = $1`,
    [docId, o.konu, o.ozet, o.ozet.slice(0, 500), o.baslikOnerisi],
  );
}

/**
 * Kayitli analizi DocumentAnalysis'e geri cevirir.
 *
 * Analizi YENIDEN CALISTIRMIYORUZ: cevap yazisi ve yeniden yonlendirme,
 * evrakin havuza duserken uretilmis analiziyle ayni verilere dayanmali.
 * Yeniden calistirmak, yazinin yonlendirme kararindan baska bir okumaya
 * dayanmasina yol acabilirdi.
 */
export function documentAnalysisFromRow(d: DocumentDetail): DocumentAnalysis {
  const islemTuru = IslemTuruSchema.safeParse(d.islem_turu);
  return {
    konu: d.doc_subject ?? d.filename,
    baslikOnerisi: d.doc_title_suggestion ?? d.doc_subject ?? d.filename,
    ozet: d.doc_summary_long ?? "",
    docType: (d.doc_type as DocumentAnalysis["docType"]) ?? "diger",
    islemTuru: islemTuru.success ? islemTuru.data : "diger",
    alacakTuru: d.alacak_turu ?? "",
    entities: d.extracted_entities ?? {
      vkn: null,
      tckn: null,
      tarihler: [],
      tutarlar: [],
      plakalar: [],
      donemler: [],
      kisiKurumlar: [],
    },
    containsPII: d.contains_pii ?? false,
    confidence: d.classification_confidence ?? 0,
  };
}
