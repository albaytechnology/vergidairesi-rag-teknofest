/**
 * Resmi cevap yazisi uretimi.
 *
 * Akis: analiz + LLM govdesi → LetterModel → (HTML | DOCX) → PDF
 *
 *   model/    yazinin butun bicimsel alanlarinin kurulmasi (tek dogruluk kaynagi)
 *   blocks.ts iki ciktinin paylastigi blok metni kurallari
 *   html/     onizleme ve PDF'in kaynagi olan sablon
 *   docx/     Word ciktisi — HTML'den degil dogrudan modelden uretilir
 *   pdf/      HTML → PDF (headless Chromium)
 */
export {
  buildLetterModel,
  type BuildLetterInput,
} from "./model/build.ts";
export {
  kurumBilgileriFromConfig,
  type KurumBilgileri,
} from "./model/institution.ts";
export { YER_TUTUCU, type LetterAddressee } from "./model/fields.ts";

export { renderLetterHtml, type RenderOptions } from "./html/render.ts";
export { letterToDocx } from "./docx/render.ts";
export { htmlToPdf, type PdfOptions } from "./pdf/render.ts";
export { isChromiumReady, closeBrowser } from "./pdf/browser.ts";
