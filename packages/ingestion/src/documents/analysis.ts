import { IslemTuruSchema, type DocumentAnalysis } from "@albay/shared";
import { pool } from "../db/pool.ts";
import type { DocumentDetail } from "./types.ts";

export async function saveDocumentAnalysis(
  docId: string,
  a: DocumentAnalysis,
  reviewThreshold = 0.6,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       doc_subject = $2, doc_summary_long = $3, extracted_entities = $4,
       doc_type = $5, summary = $6, contains_pii = $7,
       classification_confidence = $8, needs_review = $9,
       islem_turu = $10, alacak_turu = $11, doc_title_suggestion = $12,
       analyzed_at = now(), classified_at = now(), updated_at = now()
     WHERE id = $1`,
    [
      docId,
      a.konu,
      a.ozet,
      JSON.stringify(a.entities),
      a.docType,
      a.ozet.slice(0, 500),
      a.containsPII,
      a.confidence,
      a.confidence < reviewThreshold,
      a.islemTuru,
      a.alacakTuru,
      a.baslikOnerisi,
    ],
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
