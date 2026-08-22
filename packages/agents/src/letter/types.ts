/** Cevap yazisi taslaginin girdi/cikti sozlesmeleri. */
import type { DocumentAnalysis, LetterBody, LetterDecision } from "@albay/shared";
import type { LetterAddressee } from "./prompt.ts";

export interface LetterDraftInput {
  analiz: DocumentAnalysis;
  karar: LetterDecision;
  /** Servis calisaninin kendi gerekcesi. Verilirse modelinkinin yerine gecer. */
  kararGerekcesi?: string;
  /** Yonlendirme kararindan gelen mevzuat maddeleri — atif yapilabilecek tek kaynak. */
  maddeler?: { maddeNo: string; baslik: string }[];
  /** Evrakin ham metni. Sayi dogrulamasinda ek kaynak olarak kullanilir. */
  belgeMetni?: string;
  /**
   * Yazi kime hitaben yazilacak. Varsayilan "mukellef"; Ihtilafli Isler
   * Servisi'ne yonlendirilmis evrakta "mahkeme" (bkz. isDisputeService).
   */
  hitap?: LetterAddressee;
}

export interface LetterDraftResult {
  body: LetterBody;
  /** Kaynakta karsiligi bulunamayan sayisal degerler — arayuzde isaretlenir. */
  dayanaksizSayilar: string[];
  trace: string[];
}
