/** Cevap denetimi ve corrective-RAG sorgu yeniden yazimi promptlari. */
export const GRADER_PROMPT = `Sen bir cevap denetcisisin. Sana bir soru, dokuman parcalari ve uretilen cevap verilecek. JSON dondur:

- grounded: cevap parcalardaki bilgiye dayaniyor mu?
  * Parcalardaki bilginin OZETI, YENIDEN IFADESI veya CEVIRISI -> grounded=true.
  * Cevap "bilgi yok/bulunamadi" diyorsa ve gercekten parcalarda o bilgi yoksa -> grounded=true (dogru davranis).
  * SADECE parcalarda hic gecmeyen SOMUT bir iddia (isim, sayi, tarih, olay) uydurulmussa -> grounded=false.
- citationsValid: cevap icindeki [n] atiflari, gercekten verilen parca sirasiyla eslesiyor mu?
  Yanlis parcaya atif yapiliyorsa veya olmayan bir [n] numarasi kullanilmissa -> false.
- sufficient: parcalar soruyu cevaplamak icin yeterli miydi?
- reason: 1 cumle gerekce (Turkce)

Amac uydurmayi yakalamak; dogru ozetleri cezalandirmak DEGIL.`;

export const GRADER_SCHEMA = {
  type: "object",
  properties: {
    grounded: { type: "boolean" },
    citationsValid: { type: "boolean" },
    sufficient: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["grounded", "citationsValid", "sufficient", "reason"],
} as const;

export const REWRITE_PROMPT = `Ilk arama yeterli sonuc getirmedi. Sorguyu farkli kelimelerle,
es anlamlilar ve iliskili kavramlar kullanarak YENIDEN yaz.

ONEMLI: Sorgudaki ozel isimleri (kisi, kurum, proje adi) ve sayisal/tarihsel ifadeleri
OLDUGU GIBI KORU — sadece genel/tanimlayici kelimeleri es anlamlilariyla degistir.
Ornek: "TOFAS AI Committee onay sureci nasil isliyor" -> "TOFAS AI Committee onaylama
akisi ve degerlendirme adimlari" (TOFAS ve "AI Committee" ozel isimleri korunur).

Sadece yeni arama sorgusunu dondur, baska hicbir sey yazma.`;
