/**
 * Vergi dairesine gelen evrakin analizi (Faz 5b).
 *
 * classification/ klasorunden farki: bu, kurum korpusu icin genel bir
 * siniflandirma degil, yazisma/dilekce evraginin islenebilmesi icin gereken
 * alanlari cikarir — konu, uzun ozet ve yapisal entity'ler. Cikti servis
 * yonlendirmesinin girdisidir.
 */
import { DocumentAnalysisSchema, type DocumentAnalysis } from "@albay/shared";
import { OllamaClient } from "../ollama/client.ts";
import { structuredJsonCall } from "../ollama/structured.ts";
import { groundAlacakTuru } from "./grounding.ts";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt.ts";
import { reconcileIdentifiers } from "./reconcile.ts";
import { ANALYSIS_JSON_SCHEMA } from "./schema.ts";

export interface AnalyzeInput {
  filename: string;
  /** Belgenin tam metni (ya da yeterince genis bir on parcasi). */
  text: string;
}

/**
 * Evraki analiz eder ve kimlik numaralarini checksum ile dogrular.
 *
 * LLM'in verdigi VKN/TCKN dogrudan kabul edilmez: once checksum'dan gecirilir,
 * gecemezse ham metinden checksum'i tutan bir aday aranir, o da yoksa null yazilir.
 * Boylece resmi cevap yazisina uydurma bir vergi numarasi girmesi engellenir.
 */
export async function analyzeDocument(
  ollama: OllamaClient,
  input: AnalyzeInput,
): Promise<DocumentAnalysis> {
  const parsed = await structuredJsonCall(ollama, {
    system: ANALYSIS_SYSTEM_PROMPT,
    user: `Dosya adi: ${input.filename}\n\nEvrak metni:\n${input.text.slice(0, 12000)}`,
    schema: ANALYSIS_JSON_SCHEMA,
    // temperature 0: analiz ciktisi yonlendirmenin GIRDISI. 0.1'de bile konu/ozet
    // ifadesi turden ture degisiyor, bu da retrieval sorgusunu ve dolayisiyla
    // servis kararini kaydiriyordu — ayni evrak iki calistirmada iki servise
    // dusebiliyor. Hat yeniden calistirildiginda ayni sonucu vermeli.
    temperature: 0,
    parse: (value) => DocumentAnalysisSchema.parse(value),
    islemAdi: "Evrak analizi",
  });

  return {
    ...parsed,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    alacakTuru: groundAlacakTuru(parsed.alacakTuru, input.text),
    entities: reconcileIdentifiers(parsed.entities, input.text),
  };
}
