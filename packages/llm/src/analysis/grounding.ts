/**
 * LLM'in dondurdugu serbest metin alanlarini belge metnine dayandirma.
 */
import { trFold } from "../text/normalize.ts";

/**
 * alacakTuru'nu belge metnine dayandirir.
 *
 * GOZLENEN HATA: belgede yalnizca "KDV" kisaltmasi gectigi halde model
 * kisaltmayi uydurarak aciyordu — ayni iki belgeden biri "karaye nakliyat
 * vergisi (KDV)", digeri "kar yol vergisi (KDV)" dondu. Bu iki yerden birden
 * zarar veriyor:
 *   1. alacakTuru cevap yazisinin girdisi; mukellefe yanlis vergi adi yazilabilir.
 *   2. routing_key bu degerden turedigi icin, ayni tur iki evrak FARKLI anahtara
 *      dusuyor ve tutarlilik denetimi (pnpm routing:audit) onlari hic
 *      karsilastirmiyor — sessizce kor nokta olusuyor.
 *
 * Cozum, kimlik numaralarindakiyle ayni: metinde karsiligi olmayan ifade
 * kabul edilmez. Sirasiyla tam ifade, parantezli kisaltma ve metinde gecen en
 * uzun cok kelimeli alt ifade denenir; hicbiri tutmazsa bos string birakilir
 * (yonlendirme o zaman yalnizca islem turune dayanir — eksik ama dogru).
 */
export function groundAlacakTuru(deger: string, text: string): string {
  const ham = deger.trim().replace(/\s+/g, " ");
  if (!ham) return "";
  const kaynak = trFold(text);
  if (kaynak.includes(trFold(ham))) return ham;

  const kisaltma = ham.match(/\(([^)]{2,12})\)/)?.[1]?.trim();
  if (kisaltma && kaynak.includes(trFold(kisaltma))) return kisaltma;

  // Tek kelimelik pencere kabul edilmiyor: "vergisi" gibi jenerik bir kelime
  // her metinde geciyor ve hicbir sey soylemiyor.
  const kelimeler = ham.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  for (let uzunluk = kelimeler.length; uzunluk >= 2; uzunluk--) {
    for (let i = 0; i + uzunluk <= kelimeler.length; i++) {
      const aday = kelimeler.slice(i, i + uzunluk).join(" ");
      if (kaynak.includes(trFold(aday))) return aday;
    }
  }
  return "";
}
