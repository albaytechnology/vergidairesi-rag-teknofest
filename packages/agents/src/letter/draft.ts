/**
 * Cevap yazisi taslagi uretimi (Faz 5c).
 *
 * Bicimlendirme burada YOK: bu modul yalnizca yazinin metnini (ilgi satirlari +
 * govde paragraflari) uretir, resmi yazi duzenini packages/letter kurar. Boylece
 * sablon LLM'siz test edilebilir, uretim de sablondan bagimsiz degistirilebilir.
 *
 * Kritik davranis: modelin yazdigi her sayisal deger, evrak analizindeki
 * degerlerle capraz kontrol edilir (verify-numbers.ts).
 */
import { LetterBodySchema, type LetterBody, type LetterDecision } from "@albay/shared";
import { ollama } from "../common/ollama.ts";
import { normalizeBody } from "./normalize.ts";
import { responseLetterPrompt, RESPONSE_LETTER_SCHEMA } from "./prompt.ts";
import type { LetterDraftInput, LetterDraftResult } from "./types.ts";
import { duzeltmeTalimati, kullaniciPromptu } from "./user-prompt.ts";
import { kaynakMetni, verifyLetterNumbers } from "./verify-numbers.ts";

/** Gerekce zorunlu olan kararlar — olumsuz ya da kosullu sonuclar. */
const GEREKCE_ZORUNLU: ReadonlySet<LetterDecision> = new Set([
  "red",
  "kismi_onay",
  "eksik_belge",
]);

/**
 * Deneme sayisi. Ilk deneme taslagi uretir; kalanlar ya sema hatasini ya da
 * yakalanan uydurma sayilari duzeltmek icindir (corrective-RAG'daki
 * grader → geri bildirimle yeniden dene deseninin aynisi).
 */
const MAX_DENEME = 3;

export async function draftResponseLetter(input: LetterDraftInput): Promise<LetterDraftResult> {
  const trace: string[] = [];
  const temelPrompt = kullaniciPromptu(input);
  const kaynak = kaynakMetni(input);

  let lastError: Error | null = null;
  let sonSonuc: { body: LetterBody; dayanaksizSayilar: string[] } | null = null;

  for (let attempt = 0; attempt < MAX_DENEME; attempt++) {
    const userPrompt =
      sonSonuc?.dayanaksizSayilar.length
        ? `${temelPrompt}\n\n${duzeltmeTalimati(sonSonuc.dayanaksizSayilar)}`
        : temelPrompt;
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: responseLetterPrompt(input.hitap) },
          { role: "user", content: userPrompt },
        ],
        // Sicaklik 0.2: resmi yazi dilinin akiciligi icin biraz alan birakiliyor;
        // sayisal degerler zaten asagida deterministik olarak denetleniyor.
        {
          format: RESPONSE_LETTER_SCHEMA as unknown as Record<string, unknown>,
          temperature: 0.2,
        },
      );
      const body = normalizeBody(LetterBodySchema.parse(JSON.parse(raw)));

      // Insan gerekcesi modelinkini ezer — karari veren o.
      const gerekce = input.kararGerekcesi?.trim() || body.gerekce;
      if (GEREKCE_ZORUNLU.has(input.karar) && !gerekce) {
        throw new Error(`'${input.karar}' karari icin gerekce zorunlu, model bos dondu`);
      }

      const nihai: LetterBody = {
        ...body,
        gerekce: GEREKCE_ZORUNLU.has(input.karar) ? gerekce : "",
      };
      const dayanaksizSayilar = verifyLetterNumbers(nihai, kaynak);
      trace.push(`taslak → ${nihai.paragraflar.length} paragraf (deneme ${attempt + 1})`);
      sonSonuc = { body: nihai, dayanaksizSayilar };

      if (!dayanaksizSayilar.length) return { ...sonSonuc, trace };
      trace.push(`kaynakta bulunmayan sayisal deger → ${dayanaksizSayilar.join(", ")}`);
      // Son denemede de duzelmediyse uyariyla birlikte don: yazi insan
      // onayindan geciyor, tamamen reddetmek calisani bos birakirdi.
    } catch (err) {
      lastError = err as Error;
      trace.push(`deneme ${attempt + 1} basarisiz: ${lastError.message}`);
    }
  }

  if (sonSonuc) {
    trace.push("UYARI: uydurma sayilar duzeltilemedi — arayuzde isaretlenecek");
    return { ...sonSonuc, trace };
  }
  throw new Error(`Cevap yazisi taslagi uretilemedi: ${lastError?.message}`);
}
