/**
 * Vergi Dairesi servis yonlendirmesi.
 *
 * Bu modul hem sorgu zamaninda (graph.ts icindeki routingNode) hem de ingest
 * zamaninda (evrak havuza dusurulurken) kullanilir. Karar mantigi tek yerde
 * durur — iki cagirici da ayni fonksiyonlari cagirir.
 *
 * Guvence katmanlari, hepsi LLM'den bagimsiz:
 *   1. verifyCitations  — getirilmeyen maddeye yapilan atif dusurulur
 *   2. reconcileBirim   — birim/servis adi chunk metadata'sindan turetilir
 *   3. gradeRouting     — yalnizca secilen servisin gorev tanimi gosterilerek denetim
 */
import { OllamaClient } from "@albay/llm";
import { config, ServiceRoutingDecisionSchema, type ServiceRoutingDecision } from "@albay/shared";
import { hybridSearch, type SearchHit } from "@albay/retrieval";
import { buildContext } from "./context.ts";
import {
  routingPrompt,
  ROUTING_SCHEMA,
  ROUTING_GRADER_PROMPT,
  ROUTING_GRADER_SCHEMA,
  ROUTING_NOT_DETERMINED,
} from "./prompts.ts";

const ollama = new OllamaClient();

/**
 * Yonetmelik koleksiyonu kucuk (~60 parca) ama servis paleti genis: dogru servisi
 * secebilmek icin adaylari genis tut, aksi halde model yalnizca kelime benzerligi
 * yuksek birkac servisi gorur.
 */
const ROUTING_TOP_K = 14;
const ROUTING_CANDIDATES = 60;
/** Havuzdan cekilen ham aday sayisi — cesitlendirmeden once. */
const ROUTING_RAW_K = 28;
/** Tek bir servisin baglami doldurmasini engelleyen ust sinir. */
const PER_SERVICE_LIMIT = 2;

/**
 * Servis basina ust sinir uygulayarak baglami cesitlendirir.
 *
 * NEDEN: yonlendirme, "hangi servis" sorusunun cevabini bir KATALOG icinden
 * secmek demek; model secenekleri yan yana gormeli. Duz benzerlik siralamasi
 * bunu vermiyor — ornegin yonetmelik Sureksiz Yukumlulukler servisinin altinda
 * vergi turlerini TEK TEK sayarken (MTV, tasit alim, tapu harci, veraset),
 * Surekli servisin altinda vergi adi gecmiyor. Bu yuzden icinde herhangi bir
 * vergi adi gecen her sorgu Sureksiz parcalarini yukari cekiyor ve model
 * "KDV bu listede YOK" cikarimini yapamadan Sureksiz'i seciyordu.
 *
 * Servis basina en fazla 2 parca alinca her iki servisin gorev tanimi da
 * baglamda oluyor ve karsilastirma mumkun hale geliyor.
 */
export function diversifyByService(
  hits: SearchHit[],
  perService = PER_SERVICE_LIMIT,
  limit = ROUTING_TOP_K,
): SearchHit[] {
  const sayac = new Map<string, number>();
  const secilen: SearchHit[] = [];
  const artakalan: SearchHit[] = [];

  for (const h of hits) {
    const servis = h.metadata?.servis;
    // Servise bagli olmayan parcalar (genel maddeler) madde bazinda gruplanir,
    // yoksa tek bir maddenin parcalari baglami doldurabiliyor.
    const anahtar =
      typeof servis === "string" && servis
        ? `servis:${servis}`
        : `madde:${String(h.metadata?.maddeNo ?? "?")}`;
    const adet = sayac.get(anahtar) ?? 0;
    if (adet < perService) {
      sayac.set(anahtar, adet + 1);
      secilen.push(h);
    } else {
      artakalan.push(h);
    }
  }
  // Yer kalirsa elenenlerle doldur — bilgi atmiyoruz, yalnizca sirayi degistiriyoruz.
  return [...secilen, ...artakalan].slice(0, limit);
}

// ─── Saf yardimcilar (test edilebilir, LLM'siz) ───────────────────────

export const trNormalize = (s: string): string =>
  s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "M.11-A-I-2-f", "Madde 11", "11" -> "11" */
export function normalizeMaddeNo(raw: string): string {
  return raw.match(/\d+/)?.[0] ?? raw.trim();
}

export function maddeNumbersOf(hits: SearchHit[]): Set<string> {
  return new Set(
    hits
      .map((h) => String(h.metadata?.maddeNo ?? ""))
      .filter(Boolean)
      .map(normalizeMaddeNo),
  );
}

/** Madde numarasi OCR'dan okunamayip turetilmis parcalar (metadata.maddeNoKesin=false). */
export function uncertainMaddeNumbers(hits: SearchHit[]): Set<string> {
  return new Set(
    hits
      .filter((h) => h.metadata?.maddeNoKesin === false)
      .map((h) => normalizeMaddeNo(String(h.metadata?.maddeNo ?? "")))
      .filter(Boolean),
  );
}

/** Ana hizmet birimi, yonetmelikteki alt bolum basligindan (I-/II-/III-/IV-) okunur. */
const ANA_BIRIMLER: [RegExp, ServiceRoutingDecision["anaBirim"]][] = [
  [/vergilendirme/, "Vergilendirme"],
  [/muhasebe/, "Muhasebe"],
  [/kovusturma/, "Kovusturma"],
  [/tarama ve kontrol/, "Tarama ve Kontrol"],
];

/** Diger hizmet birimi, servis adindan okunur. */
const DIGER_BIRIMLER: [RegExp, ServiceRoutingDecision["digerBirim"]][] = [
  [/vergi denetmenleri/, "Vergi Denetmenleri"],
  [/takdir/, "Takdir"],
  [/uzlasma/, "Uzlasma"],
  [/ozluk/, "Ozluk ve Destek"],
  [/^gelir servisi/, "Gelir"],
];

/**
 * Yazisma ve Arsiv Servisi sistemin GIRIS NOKTASIDIR (M.11-B-I-6: "evrakin ilgili
 * yerlere sevkini saglamak"), yonlendirme hedefi degil — evrak zaten oradan geliyor.
 * Ayirt edici olarak "arsiv" kelimesini kullaniyoruz: "Vergi Denetmenleri Yazisma
 * Servisi" gibi gercek hedefleri yanlislikla elemesin diye "yazisma" yeterli degil.
 */
export function isEntryPointService(servis: string): boolean {
  return /arsiv/.test(trNormalize(servis));
}

/**
 * Kesin servis adi karsilastirmasi.
 *
 * sameService bilerek toleranslidir ve bu yuzden "Surekli Yukumlulukler
 * Vergilendirme Servisi" ile "Sureksiz Yukumlulukler Vergilendirme Servisi"ni
 * AYIRAMAZ (bkz. routing.test.ts). Bu iki servis farkli hedefler oldugu icin
 * dogru parcayi secerken once kesin esitlik denenir.
 */
export function sameServiceStrict(a: string, b: string): boolean {
  return trNormalize(a) === trNormalize(b);
}

/** Iki servis adi ayni servisi mi gosteriyor? (LLM adi eksik/yazim hatali yazabilir) */
export function sameService(a: string, b: string): boolean {
  const [x, y] = [trNormalize(a), trNormalize(b)];
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const xs = new Set(x.split(" ").filter((w) => w.length > 3));
  const ys = new Set(y.split(" ").filter((w) => w.length > 3));
  if (!xs.size || !ys.size) return false;
  const ortak = [...xs].filter((w) => ys.has(w)).length;
  return ortak / Math.min(xs.size, ys.size) >= 0.6;
}

/**
 * "11-A-I-2-f" gibi bir atif yolunu bilesenlerine ayirir.
 * Yol yonetmeligin kendi numaralandirmasidir: Madde 11 > A) hizmet birimi >
 * I- alt bolum > 2) servis > f) gorev bendi.
 */
function parseCitationPath(raw: string): {
  maddeNo: string;
  birim: string | null;
  altBolum: string | null;
  servisNo: string | null;
} {
  const parts = raw.split(/[-.\s]+/).filter(Boolean);
  const maddeNo = normalizeMaddeNo(raw);
  let birim: string | null = null;
  let altBolum: string | null = null;
  let servisNo: string | null = null;

  for (const [i, part] of parts.entries()) {
    if (i === 0 && /^\d+$/.test(part)) continue; // madde numarasi
    if (!birim && /^[A-C]$/.test(part)) birim = part;
    else if (!altBolum && /^(I|II|III|IV|V)$/.test(part)) altBolum = part;
    else if (!servisNo && /^\d+$/.test(part)) servisNo = part;
  }
  return { maddeNo, birim, altBolum, servisNo };
}

/**
 * Atif verilen gorev maddesinin SAHIBI olan servisi bulur.
 *
 * NEDEN: model dogru maddeyi gosterip yanlis servis adi yazabiliyor — gozlenen
 * ornek: karar "Sureksiz Yukumlulukler Vergilendirme Servisi" diyor ama dayanak
 * olarak "Madde 11-A-I-2-f"yi gosteriyor; oysa o madde SUREKLI servisin gorev
 * maddesi. Karar kendi kanitiyla celisiyor. Hangisi daha guvenilir? Atif, cunku
 * yonetmelikteki yeri kesin ve verifyCitations onu zaten dogrulamis durumda.
 *
 * Bu yuzden atif yolu bir parcaya birebir baglanabiliyorsa servis adi o parcadan
 * alinir. Baglanamiyorsa (orn. Madde 10 on soz parcasi) hicbir sey degistirilmez.
 */
function citedServices(decision: ServiceRoutingDecision, hits: SearchHit[]): string[] {
  const bulunan = new Set<string>();
  for (const atif of decision.ilgiliMaddeler) {
    const yol = parseCitationPath(atif.maddeNo);
    if (!yol.servisNo) continue;

    for (const h of hits) {
      const m = h.metadata ?? {};
      if (normalizeMaddeNo(String(m.maddeNo ?? "")) !== yol.maddeNo) continue;
      if (typeof m.servis !== "string" || !m.servis) continue;
      if (String(m.servisNo ?? "") !== yol.servisNo) continue;
      if (yol.birim && !String(m.hizmetBirimi ?? "").trim().startsWith(`${yol.birim})`)) continue;
      if (yol.altBolum && !String(m.altBolum ?? "").trim().startsWith(`${yol.altBolum}-`)) continue;
      bulunan.add(m.servis);
    }
  }
  return [...bulunan];
}

/**
 * Kararin adlandirdigi servis, atif verdigi maddelerin sahibi degilse duzeltir.
 *
 * SINIR: yalnizca CELISKI varsa mudahale eder. Adlandirilan servis atiflar
 * arasindaysa dokunulmaz — cunku bir karar hakli olarak birden fazla maddeye
 * dayanabilir (orn. MTV tecili hem Madde 10-A-I-3'e (MTV masasi Sureksiz'de)
 * hem Madde 11-A-I-2-f'ye (tecil gorevi) dayanir). Her atifa korukorune
 * hizalamak, dogru karari yanlis maddeye dogru cekiyordu.
 */
function resolveCitedService(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): string | null {
  const servisler = citedServices(decision, hits);
  if (!servisler.length) return null;
  if (decision.servis && servisler.some((s) => sameServiceStrict(s, decision.servis!))) return null;
  return servisler.length === 1 ? servisler[0]! : null;
}

/**
 * Orgut tipine gore gecersiz servis parcalarini eler.
 *
 * Madde 12 yalnizca BAGLI VERGI DAIRELERI icindir (Tahakkuk / Tahsilat Servisi);
 * baskanlik veya mudurluk tipinde boyle bir servis YOKTUR. Filtre olmadan model
 * bu parcalari gorup "Tahakkuk Servisi" onerebiliyordu — kurumda karsiligi olmayan
 * bir hedef. Tersi de gecerli: bagli vergi dairesinde Madde 10/11 servisleri yok.
 */
function orgTipineUygun(hit: SearchHit, orgType: string): boolean {
  const servisli = typeof hit.metadata?.servis === "string" && hit.metadata.servis;
  if (!servisli) return true; // genel maddeler her tipte gecerli
  return isServiceForOrgType(String(hit.metadata?.maddeNo ?? ""), orgType);
}

/**
 * Bir servisin bu orgut tipinde var olup olmadigi.
 *
 * Yonlendirme filtresi ile /api/services katalogu AYNI kurali kullanmali:
 * ayrilirlarsa arayuz hicbir zaman evrak alamayacak bir havuz gosterir
 * (baskanlik kurulumunda Tahakkuk/Tahsilat gibi).
 */
export function isServiceForOrgType(maddeNo: string, orgType: string): boolean {
  const no = normalizeMaddeNo(maddeNo);
  return orgType === "bagli" ? no === "12" : no !== "12";
}

/** Karari dayanaksiz ilan eder — servis atamasi silinir, gerekce korunur. */
function belirlenemediYap(
  decision: ServiceRoutingDecision,
  gerekce: string,
): ServiceRoutingDecision {
  return {
    ...decision,
    anaBirim: null,
    digerBirim: null,
    servis: null,
    altServis: null,
    ilgiliMaddeler: [],
    guvenSkoru: 0,
    belirlenemedi: true,
    gerekce,
  };
}

/**
 * Atif denetimi — LLM'e guvenmeden, deterministik.
 * Karar yalnizca GETIRILEN yonetmelik parcalarindaki maddelere atif yapabilir;
 * uydurulan madde numaralari atilir. Geriye dogrulanmis atif kalmiyorsa karar
 * "belirlenemedi"ye dusurulur — dayanaksiz servis atamasi yapilmaz.
 */
export function verifyCitations(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): { decision: ServiceRoutingDecision; uydurulan: string[] } {
  if (decision.belirlenemedi) return { decision, uydurulan: [] };

  const mevcut = maddeNumbersOf(hits);
  const dogrulanan = decision.ilgiliMaddeler.filter((m) => mevcut.has(normalizeMaddeNo(m.maddeNo)));
  const uydurulan = decision.ilgiliMaddeler
    .filter((m) => !mevcut.has(normalizeMaddeNo(m.maddeNo)))
    .map((m) => m.maddeNo);

  if (!dogrulanan.length) {
    return {
      decision: belirlenemediYap(
        decision,
        uydurulan.length
          ? `Kararin dayandirildigi madde(ler) (${uydurulan.join(", ")}) getirilen yonetmelik` +
              " parcalarinda bulunmadi; dogrulanamayan atifla servis atamasi yapilmadi."
          : "Karar hicbir yonetmelik maddesine dayandirilmadi.",
      ),
      uydurulan,
    };
  }

  return { decision: { ...decision, ilgiliMaddeler: dogrulanan }, uydurulan };
}

/**
 * Birim atamasini LLM'in tahminine degil, atif verilen parcanin yonetmelik
 * hiyerarsisine dayandirir. Model dogru servisi bulup yanlis birime baglayabiliyor
 * (orn. Uzlasma Servisi'ni "Ana Hizmet Birimi > Vergilendirme" altina koymak);
 * oysa dogru cevap chunk metadata'sinda zaten duruyor. Servis adi da parcadaki
 * kanonik yazimla degistirilir.
 */
export function reconcileBirim(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): { decision: ServiceRoutingDecision; duzeltildi: boolean } {
  if (decision.belirlenemedi || !decision.servis) return { decision, duzeltildi: false };

  // Karar, atif verdigi gorev maddesinin sahibi olmayan bir servisi adlandirmis
  // olabilir. Atif daha guvenilir sinyaldir; servis adini ona hizala.
  const atifServisi = resolveCitedService(decision, hits);
  const atiftanDuzeltildi = Boolean(
    atifServisi && !sameServiceStrict(atifServisi, decision.servis),
  );
  if (atifServisi && atiftanDuzeltildi) {
    decision = { ...decision, servis: atifServisi };
  }
  const secilenServis = decision.servis ?? "";

  // Giris noktasi servisine yonlendirme yapilamaz — evrak zaten oradan geliyor.
  if (isEntryPointService(secilenServis)) {
    return {
      decision: belirlenemediYap(
        decision,
        `${secilenServis} evrakin giris noktasidir (kayit ve sevk gorevi), yonlendirme` +
          " hedefi degildir; evrakin ait oldugu asil servis yonetmelikte bulunamadi.",
      ),
      duzeltildi: true,
    };
  }

  // Once kesin ad esitligi: fuzzy eslesme Surekli/Sureksiz'i ayiramadigi icin
  // dogru karari yanlis parcanin adiyla ezebiliyordu.
  const strictHit = hits.find(
    (h) => typeof h.metadata?.servis === "string" && sameServiceStrict(h.metadata.servis, secilenServis),
  );
  const hit =
    strictHit ??
    hits.find((h) => typeof h.metadata?.servis === "string" && sameService(h.metadata.servis, secilenServis));
  if (!hit) return { decision, duzeltildi: false };

  const servis = String(hit.metadata!.servis);
  if (isEntryPointService(servis)) {
    return {
      decision: belirlenemediYap(
        decision,
        `${servis} evrakin giris noktasidir, yonlendirme hedefi degildir.`,
      ),
      duzeltildi: true,
    };
  }

  const hizmetBirimi = trNormalize(String(hit.metadata?.hizmetBirimi ?? ""));
  const altBolum = trNormalize(String(hit.metadata?.altBolum ?? ""));

  let anaBirim: ServiceRoutingDecision["anaBirim"] = null;
  let digerBirim: ServiceRoutingDecision["digerBirim"] = null;
  if (hizmetBirimi.includes("diger hizmet")) {
    digerBirim = DIGER_BIRIMLER.find(([re]) => re.test(trNormalize(servis)))?.[1] ?? null;
  } else if (hizmetBirimi.includes("ana hizmet")) {
    anaBirim = ANA_BIRIMLER.find(([re]) => re.test(altBolum))?.[1] ?? null;
  } else {
    return {
      decision: { ...decision, servis },
      duzeltildi: atiftanDuzeltildi || servis !== decision.servis,
    };
  }

  const duzeltildi =
    atiftanDuzeltildi ||
    anaBirim !== decision.anaBirim ||
    digerBirim !== decision.digerBirim ||
    servis !== decision.servis;
  return { decision: { ...decision, anaBirim, digerBirim, servis }, duzeltildi };
}

/** Karari insan okunur, atifli metne cevirir. */
export function formatRoutingDecision(
  decision: ServiceRoutingDecision,
  hits: SearchHit[],
): string {
  if (decision.belirlenemedi) {
    return `${ROUTING_NOT_DETERMINED}\n\nGerekce: ${decision.gerekce}`;
  }

  const birim = decision.anaBirim
    ? `Ana Hizmet Birimi > ${decision.anaBirim}`
    : decision.digerBirim
      ? `Diger Hizmet Birimi > ${decision.digerBirim}`
      : "Birim belirlenemedi";
  const belirsizMaddeler = uncertainMaddeNumbers(hits);
  const maddeler = decision.ilgiliMaddeler
    .map((m, i) => {
      const not = belirsizMaddeler.has(normalizeMaddeNo(m.maddeNo))
        ? " (madde numarasi kaynak metinden okunamadi, sira ile turetildi)"
        : "";
      return `[${i + 1}] Madde ${m.maddeNo} - ${m.baslik}${not}`;
    })
    .join("\n");
  const altServis = decision.altServis
    ? `Alt servis/masa: ${decision.altServis}`
    : "Alt servis/masa: belirtilmedi (yonetmelik yalnizca servis seviyesinde dayanak sagliyor;" +
      " masalar arasi gorev dagilimi Islem Yonergesi'nde)";

  // Model gerekceyi bos birakabiliyor — dayanak maddelerden kisa bir gerekce uret.
  const gerekce =
    decision.gerekce.trim() ||
    `Karar, ${decision.ilgiliMaddeler.map((m) => `Madde ${m.maddeNo}`).join(", ")} kapsamindaki` +
      " gorev tanimina dayanmaktadir.";

  return [
    `Yonlendirme: ${birim}${decision.servis ? ` > ${decision.servis}` : ""}`,
    altServis,
    `Guven skoru: ${decision.guvenSkoru.toFixed(2)}`,
    `Gerekce: ${gerekce}`,
    maddeler ? `\nDayanak maddeler:\n${maddeler}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── LLM adimlari ─────────────────────────────────────────────────────

export interface RouteInput {
  /** Evrak metni ya da kullanicinin sorusu. */
  metin: string;
  /** Retrieval icin optimize sorgu; verilmezse metnin kendisi kullanilir. */
  aramaSorgusu?: string;
  /** Onceki turda dayanaksiz bulunup elenen servisler. */
  elenenServisler?: string[];
  /**
   * Denetcinin onceki turu neden reddettigi. Grader cogu zaman dogru servisi
   * gerekcesinde soyluyor ("tecil islemleri Surekli Yukumlulukler servisinin
   * gorev alanina girer, M.11-A-I-2-f"); bu sinyali ikinci denemeye tasimazsak
   * model ayni hatayi tekrarliyor ve karar bosuna belirlenemedi'ye dusuyor.
   */
  denetimGeriBildirimi?: string;
}

export interface RouteResult {
  decision: ServiceRoutingDecision;
  hits: SearchHit[];
  trace: string[];
}

/** Tek gecis: yonetmelikte ara → LLM karari → atif dogrulama → birim uzlastirma. */
export async function routeOnce(input: RouteInput): Promise<RouteResult> {
  const hamHits = await hybridSearch(input.aramaSorgusu || input.metin, {
    topK: ROUTING_RAW_K,
    candidates: ROUTING_CANDIDATES,
    collection: config.QDRANT_REGULATIONS_COLLECTION,
    filters: { includePII: true },
    skipRerank: true,
  });
  const hits = diversifyByService(
    hamHits.filter((h) => orgTipineUygun(h, config.TAX_OFFICE_ORG_TYPE)),
  );

  if (!hits.length) {
    return {
      hits,
      decision: belirlenemediYap(
        {
          anaBirim: null,
          digerBirim: null,
          servis: null,
          altServis: null,
          ilgiliMaddeler: [],
          guvenSkoru: 0,
          belirlenemedi: true,
          gerekce: "",
        },
        "Yonetmelik koleksiyonunda ilgili madde bulunamadi.",
      ),
      trace: ["routing → yonetmelik parcasi bulunamadi"],
    };
  }

  const raw = await ollama.chat(
    [
      { role: "system", content: routingPrompt(config.TAX_OFFICE_ORG_TYPE) },
      {
        role: "user",
        content:
          `Belge/yazisma metni:\n${input.metin}\n\n` +
          (input.aramaSorgusu ? `Sinif/anahtar sorgu:\n${input.aramaSorgusu}\n\n` : "") +
          (input.elenenServisler?.length
            ? `ONCEKI DENEMEDE REDDEDILEN servisler (gorev tanimlari bu evraki kapsamiyor,` +
              ` TEKRAR ONERME): ${input.elenenServisler.join(", ")}\n\n`
            : "") +
          (input.denetimGeriBildirimi
            ? `DENETCININ ONCEKI KARARI REDDETME GEREKCESI — bu tespiti dikkate al ve\n` +
              `isaret ettigi maddeyi/servisi yeniden degerlendir:\n` +
              `${input.denetimGeriBildirimi}\n\n`
            : "") +
          `Yonetmelik parcalari:\n${buildContext(hits)}`,
      },
    ],
    { format: ROUTING_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );

  const parsed = ServiceRoutingDecisionSchema.parse(JSON.parse(raw));
  const verified = verifyCitations(parsed, hits);
  const { decision, duzeltildi } = reconcileBirim(verified.decision, hits);

  return {
    decision,
    hits,
    trace: [
      verified.uydurulan.length
        ? `routing → dogrulanmayan madde atfi atildi: ${verified.uydurulan.join(", ")}`
        : "",
      duzeltildi ? "routing → birim atamasi yonetmelik hiyerarsisinden duzeltildi" : "",
      decision.belirlenemedi
        ? "routing → belirlenemedi"
        : `routing → ${decision.servis ?? decision.anaBirim ?? decision.digerBirim}` +
          ` (Madde ${decision.ilgiliMaddeler.map((m) => m.maddeNo).join(", ")})`,
    ].filter(Boolean),
  };
}

export interface RoutingVerdict {
  onaylandi: boolean;
  masaIddiasi: boolean;
  reason: string;
}

/**
 * Yonlendirme kararinin grounding denetimi.
 *
 * Denetim bilerek DARALTILIR: tum parcalari birden gosterince model kendi kararini
 * dogrulamaya meyilli oluyor. Yalnizca secilen servisin gorev tanimini verip
 * "bu gorevler evraki kapsiyor mu" diye sormak, "gelir tablosu -> Gelir Servisi"
 * tipi yuzeysel eslesmeyi ayirt etmeye yetiyor.
 */
export async function gradeRouting(input: {
  metin: string;
  decision: ServiceRoutingDecision;
  hits: SearchHit[];
  kararMetni: string;
}): Promise<RoutingVerdict> {
  if (input.decision.belirlenemedi) {
    return {
      onaylandi: true,
      masaIddiasi: false,
      reason: "'belirlenemedi' karari, dogru davranis olarak gecildi",
    };
  }

  const servis = input.decision.servis;
  const servisChunks = servis
    ? input.hits.filter(
        (h) => typeof h.metadata?.servis === "string" && sameService(h.metadata.servis, servis),
      )
    : [];
  const denetimBaglami = servisChunks.length
    ? buildContext(servisChunks)
    : buildContext(input.hits);

  const raw = await ollama.chat(
    [
      { role: "system", content: ROUTING_GRADER_PROMPT },
      {
        role: "user",
        content:
          `Belge metni: ${input.metin}\n\n` +
          `Onerilen servis: ${servis ?? "(servis adi verilmedi)"}\n\n` +
          `Bu servisin yonetmelikteki gorev tanimi:\n${denetimBaglami}\n\n` +
          `Uretilen yonlendirme karari:\n${input.kararMetni}`,
      },
    ],
    { format: ROUTING_GRADER_SCHEMA as unknown as Record<string, unknown>, temperature: 0 },
  );
  const verdict = JSON.parse(raw) as {
    servisDayanakli: boolean;
    masaIddiasi: boolean;
    reason: string;
  };
  return {
    onaylandi: verdict.servisDayanakli && !verdict.masaIddiasi,
    masaIddiasi: verdict.masaIddiasi,
    reason: verdict.reason,
  };
}

/**
 * Ingest hattinin kullandigi tam akis: yonlendir → denet → gerekirse bir kez
 * daha dene (reddedilen servis elenerek) → hala dayanaksizsa belirlenemedi.
 *
 * graph.ts ayni adimlari LangGraph node'lari olarak kurar; ortak cekirdek
 * routeOnce + gradeRouting'dir, mantik iki yerde tekrarlanmaz.
 */
export async function routeDocument(input: RouteInput): Promise<RouteResult> {
  const elenenler = [...(input.elenenServisler ?? [])];
  let sonuc = await routeOnce({ ...input, elenenServisler: elenenler });
  const trace = [...sonuc.trace];

  for (let deneme = 0; deneme < 1; deneme++) {
    const verdict = await gradeRouting({
      metin: input.metin,
      decision: sonuc.decision,
      hits: sonuc.hits,
      kararMetni: formatRoutingDecision(sonuc.decision, sonuc.hits),
    });
    if (verdict.onaylandi) {
      trace.push(`grader → onaylandi (${verdict.reason})`);
      return { ...sonuc, trace };
    }

    trace.push(`grader → ${sonuc.decision.servis ?? "karar"} reddedildi (${verdict.reason})`);
    if (sonuc.decision.servis) elenenler.push(sonuc.decision.servis);
    sonuc = await routeOnce({
      ...input,
      elenenServisler: elenenler,
      denetimGeriBildirimi: verdict.reason,
    });
    trace.push(...sonuc.trace);
  }

  // Ikinci deneme de denetimden gecmeliydi; gecmezse dayanaksiz sayilir.
  const sonVerdict = await gradeRouting({
    metin: input.metin,
    decision: sonuc.decision,
    hits: sonuc.hits,
    kararMetni: formatRoutingDecision(sonuc.decision, sonuc.hits),
  });
  if (sonVerdict.onaylandi) {
    trace.push(`grader → onaylandi (${sonVerdict.reason})`);
    return { ...sonuc, trace };
  }
  trace.push(`grader → ikinci deneme de reddedildi (${sonVerdict.reason}); belirlenemedi`);
  return {
    hits: sonuc.hits,
    decision: belirlenemediYap(sonuc.decision, sonVerdict.reason),
    trace,
  };
}
