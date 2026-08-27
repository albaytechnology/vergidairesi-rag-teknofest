/**
 * Taslak isaretlerinin ciktidan temizlenmesi.
 *
 * Onizleme her zaman TASLAK filigrani ve imzasizlik uyarisiyla gosterilir —
 * calisan ekranda gordugu seyin henuz resmi bir belge olmadigini bilmeli.
 * "Onayla ve arsivle" ise is akisinin bitisi: calisan yaziyi onaylamis, evrak
 * arsivde cevaplananlara gecmistir. O adimda disari alinan PDF'in uzerinde
 * "bu bir taslaktir" yazmasi ciktiyi kullanilamaz kilardi.
 *
 * Temizlik HTML uzerinde yapiliyor cunku PDF'in girdisi onizlemedeki SON
 * HTML — calisanin elle duzeltmesi korunsun diye model degil iframe icerigi
 * gonderiliyor. Iframe'den gelen isaretleme tarayici tarafindan yeniden
 * serilestirildigi icin oznitelik sirasina guvenilmiyor; sinif adi araniyor.
 */
const TASLAK_BLOKLARI = /<div\b[^>]*\bclass="[^"]*\b(?:filigran|taslak-notu)\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi;

export function stripDraftMarks(html: string): string {
  return html.replace(TASLAK_BLOKLARI, "");
}
