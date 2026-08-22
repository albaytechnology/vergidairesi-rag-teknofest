/** Ollama structured output icin JSON Schema (DocumentAnalysisSchema ile ayni sekil). */
export const ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    konu: { type: "string" },
    baslikOnerisi: { type: "string" },
    ozet: { type: "string" },
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
  required: [
    "konu",
    "baslikOnerisi",
    "ozet",
    "docType",
    "islemTuru",
    "alacakTuru",
    "entities",
    "containsPII",
    "confidence",
  ],
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
