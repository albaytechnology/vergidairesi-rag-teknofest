import type { LetterDecision } from "../api/types.ts";

/**
 * Cevap yazisi kararlari — hem tam ekran cevap yazisi formu hem de sohbetin
 * icindeki kisa "cevap yazisi olustur" karti ayni listeyi kullanir.
 *
 * negative: olumsuz kararlarda gerekce ZORUNLUDUR; muhataba sebep bildirmeden
 * olumsuz yazi cikmasin.
 */
export interface DecisionOption {
  value: LetterDecision;
  label: string;
  negative: boolean;
}

export const DECISIONS: DecisionOption[] = [
  { value: "onay", label: "Onay", negative: false },
  { value: "kismi_onay", label: "Kısmi onay", negative: true },
  { value: "red", label: "Red", negative: true },
  { value: "eksik_belge", label: "Eksik belge", negative: true },
  { value: "bilgilendirme", label: "Bilgilendirme", negative: false },
];

export const isNegativeDecision = (decision: LetterDecision): boolean =>
  DECISIONS.find((d) => d.value === decision)?.negative ?? false;

export const decisionLabel = (decision: string): string =>
  DECISIONS.find((d) => d.value === decision)?.label ?? decision;

/**
 * Sohbetteki karttan tam ekran cevap yazisi ekranina gecerken tasinan durum.
 *
 * react-router `location.state` ile gider: kart yalnizca kararı toplar, yaziyi
 * uretme ve onizleme isi tek yerde — ReplyView'de — kalir.
 */
export interface ReplyHandoff {
  karar: LetterDecision;
  gerekce: string;
  muhatapAd: string;
  muhatapTur: "kisi" | "kurum";
  /** true ise ekran acilir acilmaz taslak uretimi baslar. */
  autoGenerate: boolean;
}
