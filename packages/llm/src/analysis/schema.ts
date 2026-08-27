/**
 * Ollama structured output icin JSON Schema'lar (shared'daki zod sekilleriyle ayni).
 *
 * Analiz IKI cagriya bolundu (bkz. analysis/prompt.ts): kunye alanlari ile
 * ozet metni ayri sema, ayri cagri. Sema da bolunmek zorunda — modelin
 * dolduracagi alan kumesi, o adimda gercekten istenen alanlardan ibaret olmali.
 */
export const KUNYE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    docType: {
      type: "string",
      enum: [
        "dilekce",
        "resmi_yazi",
        "bildirim",
        "beyanname_eki",
        "tebligat",
        "mahkeme_karari",
        "diger",
      ],
    },
    islemTuru: {
      type: "string",
      enum: [
        "tecil_taksitlendirme",
        "beyanname_verme",
        "uzlasma_talebi",
        "dava_itiraz",
        "odeme_iade_duzeltme",
        "sicil_mukellefiyet",
        "haciz_satis",
        "bilgi_belge_talebi",
        "diger",
      ],
    },
    alacakTuru: { type: "string" },
    entities: {
      type: "object",
      properties: {
        vkn: { type: ["string", "null"] },
        tckn: { type: ["string", "null"] },
        tarihler: { type: "array", items: { type: "string" } },
        tutarlar: { type: "array", items: { type: "string" } },
        plakalar: { type: "array", items: { type: "string" } },
        donemler: { type: "array", items: { type: "string" } },
        kisiKurumlar: { type: "array", items: { type: "string" } },
      },
      required: ["vkn", "tckn", "tarihler", "tutarlar", "plakalar", "donemler", "kisiKurumlar"],
    },
    containsPII: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: ["docType", "islemTuru", "alacakTuru", "entities", "containsPII", "confidence"],
};

export const OZET_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    konu: { type: "string" },
    baslikOnerisi: { type: "string" },
    ozet: { type: "string" },
  },
  required: ["konu", "baslikOnerisi", "ozet"],
};

/** Eksik bilgi / tutarsizlik taramasi (DocumentGapReportSchema ile ayni sekil). */
export const GAPS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    bulgular: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tur: { type: "string", enum: ["eksik", "tutarsizlik"] },
          baslik: { type: "string" },
          aciklama: { type: "string" },
          onem: { type: "string", enum: ["kritik", "orta", "dusuk"] },
          kanit: { type: "string" },
        },
        required: ["tur", "baslik", "aciklama", "onem", "kanit"],
      },
    },
  },
  required: ["bulgular"],
};
