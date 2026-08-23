/**
 * Cevap yazisi kartinin GEREKCE alanini yazar.
 *
 * Niyet siniflandiricisi yalnizca mesaji gorur ve gerekceyi mesajdan aynen
 * cikarir; "eksik bilgiler isiginda bu dilekceyi reddet" gibi bir talepte elde
 * kalan sey "eksik bilgi sunulmus olmasi" oluyordu — dogru ama bos. Oysa hangi
 * bilgilerin eksik oldugu SISTEM KAYDINDA yazili (tarama bulgulari) ve resmi
 * yazinin gerekcesi bunu somut olarak soylemeli: mukellefe "eksik belge var"
 * degil, "sunlar eksik" denmeli.
 *
 * Bu yuzden gerekce ayri bir adimda, kaydi gorerek yazilir. Cikti calisanin
 * DUZENLEYEBILECEGI bir taslaktir — son sozu o soyler, alan kilitli degil.
 */
import { ollama } from "../common/ollama.ts";
import type { LetterDecision } from "@albay/shared";
import type { DocumentRecord } from "./types.ts";
import { formatDocumentRecord } from "./record.ts";

const REASON_PROMPT = `Sen bir Vergi Dairesi servis calisaninin yazi kalemi asistanisin.
Calisan bir evrak icin cevap yazisi istedi ve kararini verdi. Senin tek isin, o
kararin GEREKCESINI yazmak — yazinin kendisini degil.

Girdi olarak calisanin mesajini, verilen karari ve dairenin evrak icin urettigi
sistem kaydini (ozet, cikarilan bilgiler, eksik bilgi taramasinin bulgulari,
yonlendirme karari) alacaksin.

KURALLAR:
1. Gerekce 1-2 CUMLE olsun. Resmi, sade Turkce; mukellefe hitap etme, olayi
   anlat ("... belirtilmedigi icin", "... celiskili oldugundan").
2. SOMUT ol. "Eksik bilgi sunulmus olmasi" gibi bos bir ibare YAZMA; hangi
   bilginin eksik ya da celiskili oldugunu SAY. Birden fazlaysa en kritik
   olanlari birlestir ("vergi turu ve vergi dairesi belirtilmemis, talep turu
   ile metin celiskilidir").
3. YALNIZCA sana verilen kayittaki bilgileri kullan. Kayitta olmayan bir eksigi,
   tutari, tarihi ya da mevzuat maddesini EKLEME. Tutar/tarih yazacaksan kayitta
   gectigi gibi yaz.
4. Calisanin mesajinda acik bir sebep varsa ONU esas al ve kayittaki karsiligiyla
   somutlastir. Mesaj yalnizca karari soyluyorsa gerekceyi kayittan kur.
5. Kararla celisme: red/eksik belge icin talebin neden karsilanmadigini, kismi
   onayda hangi kismin karsilanmadigini yaz. Onay ve bilgilendirmede gerekce
   kisa bir dayanak cumlesidir.
6. Dayanak bulamiyorsan BOS string dondur — uydurma.
7. Karari, evrak turunu ya da servis adini tekrarlamakla yetinme; sebebi yaz.

SADECE JSON dondur: {"gerekce": "..."}`;

const REASON_SCHEMA = {
  type: "object",
  properties: { gerekce: { type: "string" } },
  required: ["gerekce"],
} as const;

const KARAR_METNI: Record<LetterDecision, string> = {
  onay: "Talep kabul edildi.",
  kismi_onay: "Talep kismen kabul edildi.",
  red: "Talep kabul edilmedi.",
  eksik_belge: "Talep degerlendirilemiyor; eksik belge/bilgi tamamlanmali.",
  bilgilendirme: "Karar niteliginde degil; mukellefe bilgi veriliyor.",
};

export interface LetterReasonInput {
  /** Calisanin sohbete yazdigi mesaj. */
  question: string;
  karar: LetterDecision | null;
  record?: DocumentRecord;
  /** Siniflandiricinin mesajdan cikardigi ham gerekce — somutlastirilamazsa bu kalir. */
  fallback: string | null;
}

/**
 * Gerekceyi yazar; basarisiz olursa siniflandiricinin ciktisina duser.
 *
 * HATAYA ACIK: bu bir kolaylik katmani. Model erisilemezse ya da bos donerse
 * kart yine acilir, gerekce alani calisanin doldurmasi icin bekler.
 */
export async function composeLetterReason(input: LetterReasonInput): Promise<string | null> {
  if (!input.record) return input.fallback;

  const kullanici = [
    `Calisanin mesaji: ${input.question.slice(0, 1000)}`,
    input.karar ? `Verilen karar: ${KARAR_METNI[input.karar]}` : "Karar belirtilmedi.",
    input.fallback ? `Mesajdan cikarilan sebep: ${input.fallback}` : "",
    "",
    `SISTEM KAYDI:\n${formatDocumentRecord(input.record)}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await ollama.chat(
      [
        { role: "system", content: REASON_PROMPT },
        { role: "user", content: kullanici },
      ],
      // Sicaklik dusuk ama sifir degil: gerekce bir cumle kurma isi, ayni
      // evrakta iki calistirmanin birebir ayni olmasi gerekmiyor.
      { format: REASON_SCHEMA as unknown as Record<string, unknown>, temperature: 0.2 },
    );
    const gerekce = (JSON.parse(raw) as { gerekce?: unknown }).gerekce;
    if (typeof gerekce !== "string") return input.fallback;
    const temiz = gerekce.replace(/\s+/g, " ").trim();
    return temiz || input.fallback;
  } catch {
    return input.fallback;
  }
}
