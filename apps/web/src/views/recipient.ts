import type { DocumentSummary } from "../api/types.ts";

/**
 * Muhatap alaninin baslangic degeri.
 *
 * Mahkeme yazismasinda evraktaki ilk KISI degil, evrakta gecen MAHKEME onerilir:
 * bir dava dilekcesinde ilk kisi/kurum davacinin kendisidir ve muhatap olarak
 * onerilmesi yaziyi yanlis yere cikartirdi.
 *
 * Mahkeme evraktan okunamadiysa alan BOS birakilir — sunucu o zaman gorunur bir
 * yer tutucu basip eksik alan olarak raporlar; buradan bir mahkeme adi uydurmak
 * en kotu secenek olurdu.
 */
export function defaultRecipient(doc: DocumentSummary, courtLetter: boolean): string {
  const kurumlar = doc.entities?.kisiKurumlar ?? [];
  if (!courtLetter) return kurumlar[0] ?? "";
  return kurumlar.find((k) => /mahkeme/i.test(k)) ?? "";
}
