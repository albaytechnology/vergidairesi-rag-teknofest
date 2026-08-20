import type { SearchFilters } from "./types.ts";

/**
 * Arama filtrelerini Qdrant sozdizimine cevirir.
 *
 * PII varsayilani BILEREK kisitlayicidir: includePII verilmezse kisisel veri
 * iceren parcalar disarida kalir. Yetkili baglamlar (evrak sohbeti gibi) bunu
 * acikca acar; boylece "unutuldu" hatasi veri sizdirma yonune degil, sonuc
 * bulamama yonune duser.
 */
export function buildFilter(f?: SearchFilters): Record<string, unknown> | undefined {
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  if (f?.docType) must.push({ key: "doc_type", match: { value: f.docType } });
  if (f?.entity) must.push({ key: "entities", match: { value: f.entity } });
  if (f?.docId) must.push({ key: "doc_id", match: { value: f.docId } });
  if (!f?.includePII) mustNot.push({ key: "contains_pii", match: { value: true } });
  if (!must.length && !mustNot.length) return undefined;
  return {
    ...(must.length ? { must } : {}),
    ...(mustNot.length ? { must_not: mustNot } : {}),
  };
}
