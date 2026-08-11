import { DocumentAnalysisSchema, type DocumentAnalysis } from "@albay/shared";
import { OllamaClient } from "./ollama.ts";
import { extractIdentifierCandidates, validateTckn, validateVkn } from "./identifiers.ts";

/**
 * Vergi dairesine gelen evrakin analizi (Faz 5b).
 *
 * classifier.ts'ten farki: bu, kurum korpusu icin genel bir siniflandirma degil,
 * yazisma/dilekce evraginin islenebilmesi icin gereken alanlari cikarir —
 * konu, uzun ozet ve yapisal entity'ler. Cikti servis yonlendirmesinin girdisidir.
 */

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    konu: { type: "string" },
    baslikOnerisi: { type: "string" },
    ozet: { type: "string" },
    docType: {
      type: "string",
      enum: [
        "dilekce",
        "resmi_yazi",
        "bildirim",
        "beyanname_eki",
        "tebligat",
        "mahkeme_karari",
        "diger",
      ],
    },
    islemTuru: {
      type: "string",
      enum: [
        "tecil_taksitlendirme",
        "beyanname_verme",
        "uzlasma_talebi",
        "dava_itiraz",
        "odeme_iade_duzeltme",
        "sicil_mukellefiyet",
        "haciz_satis",
        "bilgi_belge_talebi",
        "diger",
      ],
    },
    alacakTuru: { type: "string" },
    entities: {
      type: "object",
      properties: {
        vkn: { type: ["string", "null"] },
        tckn: { type: ["string", "null"] },
        tarihler: { type: "array", items: { type: "string" } },
        tutarlar: { type: "array", items: { type: "string" } },
        plakalar: { type: "array", items: { type: "string" } },
        donemler: { type: "array", items: { type: "string" } },
        kisiKurumlar: { type: "array", items: { type: "string" } },
      },
      required: ["vkn", "tckn", "tarihler", "tutarlar", "plakalar", "donemler", "kisiKurumlar"],
    },
    containsPII: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: [
    "konu",
    "baslikOnerisi",
    "ozet",
    "docType",
    "islemTuru",
    "alacakTuru",
    "entities",
    "containsPII",
    "confidence",
  ],
} as const;

const SYSTEM_PROMPT = `Sen bir Vergi Dairesi Yazisma ve Arsiv Servisi calisanisin. Sana
disaridan gelen bir evrakin metni verilecek. Gorevin evraki anlamlandirmak:

1. konu: evrakin ne hakkinda oldugu — tek cumle, mumkun oldugunca somut
   (kotu: "vergi islemi" / iyi: "2025/3 donemi KDV borcunun tecil ve taksitlendirilmesi talebi")
2. baslikOnerisi: evrak kaydi icin kisa baslik (en fazla 8 kelime)
3. ozet: 3-5 cumlelik Turkce ozet — talep ne, gerekcesi ne, ekleri neler
4. docType: dilekce | resmi_yazi | bildirim | beyanname_eki | tebligat | mahkeme_karari | diger
5. islemTuru: evrakla TALEP EDILEN islem. Bu alan evrakin hangi servise gidecegini
   belirleyen ana sinyaldir; konu cumlesinin ayrintisina degil, TALEBIN OZUNE bak:
   - tecil_taksitlendirme : borcun ertelenmesi/taksite baglanmasi (tecil, taksit,
     yapilandirma, borclandirma). Borcun turu ne olursa olsun bu secilir.
   - beyanname_verme      : beyanname verme/duzeltme, pismanlik ve islah (VUK 371)
   - uzlasma_talebi       : uzlasma (tarhiyat oncesi/sonrasi). Pismanlik uzlasma DEGILDIR.
   - dava_itiraz          : dava acma, itiraz, temyiz, mahkeme yazismasi
   - odeme_iade_duzeltme  : odeme bildirimi, iade, mahsup, vergi hatasi duzeltme
   - sicil_mukellefiyet   : ise baslama/birakma, adres/unvan degisikligi, yoklama
   - haciz_satis          : haciz, e-haciz kaldirma, satis, aciz
   - bilgi_belge_talebi   : borcu yoktur yazisi, kayit sureti, bilgi talebi
   - diger                : yukaridakilere girmiyorsa
6. alacakTuru: islemin konusu olan vergi/alacak turunu belgede GECTIGI GIBI yaz
   (orn. "motorlu tasitlar vergisi", "katma deger vergisi", "trafik idari para cezasi").
   Belirtilmemisse bos string.
7. entities: evrakta GECTIGI GIBI cikar, bicimini degistirme:
   - vkn: 10 haneli vergi kimlik numarasi (yoksa null)
   - tckn: 11 haneli T.C. kimlik numarasi (yoksa null)
   - tarihler, tutarlar, plakalar, donemler (orn. "2025/3", "2024 takvim yili"), kisiKurumlar
8. containsPII: kisisel veri var mi (TCKN, adres, telefon, IBAN, saglik/ozluk bilgisi)
9. confidence: analizden ne kadar eminsin (0.0 - 1.0)

KESIN KURALLAR:
- SADECE evrak metnindeki bilgiyi kullan. Bir alan metinde yoksa bos dizi ya da null birak.
- Numaralari ASLA tamamlama veya tahmin etme. Kismen okunan bir numarayi yazma, null birak.
- Metinde olmayan bir tarih/tutar UYDURMA.

SADECE JSON dondur.`;

export interface AnalyzeInput {
  filename: string;
  /** Belgenin tam metni (ya da yeterince genis bir on parcasi). */
  text: string;
}

/**
 * Evraki analiz eder ve kimlik numaralarini checksum ile dogrular.
 *
 * LLM'in verdigi VKN/TCKN dogrudan kabul edilmez: once checksum'dan gecirilir,
 * gecemezse ham metinden checksum'i tutan bir aday aranir, o da yoksa null yazilir.
 * Boylece resmi cevap yazisina uydurma bir vergi numarasi girmesi engellenir.
 */
export async function analyzeDocument(
  ollama: OllamaClient,
  input: AnalyzeInput,
): Promise<DocumentAnalysis> {
  const userPrompt = `Dosya adi: ${input.filename}\n\nEvrak metni:\n${input.text.slice(0, 12000)}`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        // temperature 0: analiz ciktisi yonlendirmenin GIRDISI. 0.1'de bile konu/ozet
        // ifadesi turden ture degisiyor, bu da retrieval sorgusunu ve dolayisiyla
        // servis kararini kaydiriyordu — ayni evrak iki calistirmada iki servise
        // dusebiliyor. Hat yeniden calistirildiginda ayni sonucu vermeli.
        { format: ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
      );
      const parsed = DocumentAnalysisSchema.parse(JSON.parse(raw));
      return {
        ...parsed,
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        alacakTuru: groundAlacakTuru(parsed.alacakTuru, input.text),
        entities: reconcileIdentifiers(parsed.entities, input.text),
      };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(`Evrak analizi basarisiz: ${lastError?.message}`);
}

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

/** Turkce'ye duyarli kucuk harf + aksan katlama (metin karsilastirmasi icin). */
const trFold = (s: string): string =>
  s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("î", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replaceAll("â", "a")
    .replace(/\s+/g, " ");

/** LLM'in okudugu kimlik numaralarini checksum ve ham metinle capraz kontrol eder. */
function reconcileIdentifiers(
  entities: DocumentAnalysis["entities"],
  text: string,
): DocumentAnalysis["entities"] {
  const adaylar = extractIdentifierCandidates(text);

  // Once LLM'in okudugunu dogrula; gecmezse metinde tek bir gecerli aday varsa onu kullan.
  const vkn =
    validateVkn(entities.vkn) ??
    (adaylar.vkn.length === 1 ? adaylar.vkn[0]! : null) ??
    (adaylar.tckn.length === 1 ? adaylar.tckn[0]! : null);
  const tckn =
    validateTckn(entities.tckn) ?? (adaylar.tckn.length === 1 ? adaylar.tckn[0]! : null);

  return {
    ...entities,
    vkn,
    tckn,
    tarihler: benzersiz(entities.tarihler),
    tutarlar: benzersiz(entities.tutarlar),
    plakalar: benzersiz(entities.plakalar),
    donemler: benzersiz(entities.donemler),
    kisiKurumlar: benzersiz(entities.kisiKurumlar).slice(0, 10),
  };
}

const benzersiz = (xs: string[]): string[] =>
  [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
