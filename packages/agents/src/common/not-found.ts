/**
 * "Bu bilgi bulunamadi" anlamindaki cevaplarin tespiti.
 *
 * Hem graph grader'i (gereksiz denetimi atlamak icin) hem de eval puanlamasi
 * ayni tanimi kullanmali; bu yuzden tek yerde durur.
 */
export const NOT_FOUND_ANSWER = "Bu bilgi dokumanlarda bulunamadi.";

/**
 * Bir cevabin "bilgi yok" anlamina gelip gelmedigini tespit eder.
 * Model ayni seyi farkli kelimelerle soyleyebilir — genis kalip listesiyle,
 * Turkce normalize edilmis (kucuk harf + aksansiz) metinde ariyoruz.
 *
 * NOT: Bu, GRADER_PROMPT'un "sufficient" alaniyla AYNI kararı farkli bir yontemle
 * (regex) veriyor. Iki mekanizma celiskili sonuc uretebilir (orn. cevap hem gercek
 * bilgi icerip hem de icinde "net olarak belirtilmemis" gibi bir alt-cumle gecebilir,
 * bu da yanlis pozitife yol acar). Mumkunse bu fonksiyonu sadece grader'in calismadigi
 * / calisamadigi yollarda (orn. hizli on-kontrol, log/metrik amacli) kullanin; nihai
 * "bulunamadi" karari icin grader'in "sufficient" alanini otorite olarak kabul edin.
 */
const NOT_FOUND_PATTERNS = [
  "bulunamadi",
  "bulunmamaktadir",
  "yer almamaktadir",
  "yer almiyor",
  "belirtilmemis",
  "belirtilmemektedir",
  "bilgi yok",
  "bilgi bulunmuyor",
  "bilgi icermemektedir",
  "mevcut degil",
  "rastlanmamistir",
  "bahsedilmemektedir",
  "deginilmemistir",
  "herhangi bir bilgiye rastlanmadi",
  "kayitlara rastlanmadi",
  "elimde bu konuda bilgi yok",
  "dokumanlarda bu bilgiye ulasilamadi",
  "belirlenemedi",
  "manuel inceleme gerekli",
];

/**
 * Buradaki katlama BILEREK common/tr-text.ts icindeki trNormalize'dan ayri:
 * orada noktalama da atilir, burada yalnizca kucuk harf + aksan katlanir —
 * kaliplar cumle icinde noktalamayla birlikte geciyor.
 */
const sadelestir = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u");

export function isNotFoundAnswer(text: string): boolean {
  const normalized = sadelestir(text);
  return NOT_FOUND_PATTERNS.some((p) => normalized.includes(p));
}
