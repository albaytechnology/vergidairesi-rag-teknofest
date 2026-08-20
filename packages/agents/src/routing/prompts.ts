/** Servis yonlendirme ve yonlendirme denetimi promptlari. */
/**
 * Vergi dairesi orgut tipleri (Madde 9). Servis listesi tipe gore degistigi icin
 * yonlendirme prompt'u bu varsayimi acikca tasir — nihai otorite yine getirilen
 * yonetmelik parcalaridir.
 */
const ORG_TYPE_NOTES = {
  baskanlik: `Kurum varsayimi: VERGI DAIRESI BASKANLIGI (Madde 9-a).
Ana hizmet birimleri (Vergilendirme, Muhasebe, Kovusturma, Tarama ve Kontrol) ile
diger hizmet servisleri (Gelir, Vergi Denetmenleri Yazisma, Takdir, Uzlasma,
Ozluk ve Destek, Yazisma ve Arsiv) ayri ayri kuruludur.

Yazisma ve Arsiv Servisi evrakin GIRIS NOKTASIDIR (kayit ve ilgili yerlere sevk) —
yonlendirme HEDEFI DEGILDIR, evrak zaten oradan geliyor. Evrakin ait oldugu asil
servisi bul; baska uygun servis yoksa belirlenemedi=true yap.`,
  mudurluk: `Kurum varsayimi: VERGI DAIRESI MUDURLUGU (Madde 9-b).
Ana hizmet birimleri baskanliktaki gibidir, ANCAK diger hizmet birimi tektir:
"Yazisma, Arsiv ve Ozluk Servisi" (Madde 10-B-III). Bu tipte ayri bir Gelir /
Takdir / Uzlasma / Ozluk servisi YOKTUR; bu isleri o tek servis yurutur.
Bu servisleri onerme — parcalarda gecseler bile baskanlik tipine aittirler.`,
  bagli: `Kurum varsayimi: BAGLI VERGI DAIRESI / MALMUDURLUGU (Madde 9-c, Madde 12).
Sadece iki servis vardir: Tahakkuk Servisi (vergilendirme bolumu gorevleri) ve
Tahsilat Servisi (kovusturma bolumu gorevleri). Tarama ve kontrol islerini bizzat
malmudur yapar; yazisma/arsiv/ozluk isleri ayri servis degildir, malmudur tarafindan
servisler arasinda bolusturulur. Baska bir servis adi ONERME.`,
} as const;

export type TaxOfficeOrgType = keyof typeof ORG_TYPE_NOTES;

export function routingPrompt(orgType: TaxOfficeOrgType): string {
  return `Sen Vergi Dairesi servis yonlendirme asistanisin.
Gorevin, disaridan gelen yazisma/dilekce metnini SADECE verilen yonetmelik parcalarina
dayanarak hangi servise sevk etmek gerektigini belirlemektir.

${ORG_TYPE_NOTES[orgType]}

Kesin kurallar:
1. SADECE verilen yonetmelik parcalarini kullan. ASLA uydurma. Bir servisi ancak o
   servisin GOREV TANIMI verilen parcalarda geciyorsa onerebilirsin.
2. Her karar ilgili madde numarasi ve madde basligi ile desteklenmeli. ilgiliMaddeler
   alanina SADECE sana verilen parcalarda gercekten bulunan madde numaralarini yaz —
   uydurulan bir madde numarasi karari gecersiz kilar.
3. Net eslesme yoksa belirlenemedi=true yap ve gerekcede "belirlenemedi — manuel inceleme gerekli" de.
4. Masa seviyesinde iddiali karar verme. Yonetmelik masa adlarini sayabilir (Madde 10),
   ama gorevlerin masalar arasi dagilimi "Islem Yonergesi"ne birakilmistir (Madde 6 ve
   Madde 11-A-I-2 sonu) ve o dokuman elimizde YOK. Bu nedenle altServis alanini yalnizca
   verilen parcalarda acik ve dogrudan dayanak varsa doldur; aksi halde null birak.
5. Servis adini yuzeysel kelime benzerligiyle secme, GOREV TANIMINA bak. Ornegin
   "gelir tablosu" / "bilanço" gibi beyanname eklerini sirf icinde "gelir" gectigi icin
   Gelir Servisi'ne yonlendirme — Gelir Servisi'nin gorev tanimi baskan adina cevap
   hazirlama, teftis, istatistik ve terkin tekemmulu ile sinirli idari destek isleridir;
   mukellef evraki/beyanname islemez.
6. Madde 10'daki birim/servis/masa listesi yonetmeligin KENDI TESKILAT SEMASIDIR ve
   "hangi servis" sorusunda tam gecerli bir dayanaktir. Evrakin konusu orada bir masa
   adiyla esleiyorsa, o masanin BAGLI OLDUGU SERVISE yonlendir. Bunu yapmak uydurma
   DEGILDIR — semayi okumaktir; belirlenemedi'ye dusme.
   Ornek okuma bicimi: motorlu tasit vergisine iliskin bir evrak geldiginde, Madde 10
   "Motorlu Tasitlar Vergisi Masasi"ni "3) Sureksiz Yukumlulukler Vergilendirme Servisi"
   altinda sayar; dogru karar Vergilendirme > Sureksiz Yukumlulukler Vergilendirme
   Servisi'dir, dayanak Madde 10 (+ varsa servisin gorev maddesi), altServis ise
   kural 4 geregi yine null birakilir.
7. SUREKLI / SUREKSIZ AYRIMI — en sik yapilan hata burada.
   Madde 11-A-I-3, Sureksiz Yukumlulukler Vergilendirme Servisi'nin "sureksiz
   yukumlulukler vergilendirme islemlerine iliskin olarak SUREKLI YUKUMLULUKLER
   VERGILENDIRME SERVISINDE SAYILAN islemleri yapmak"la gorevli oldugunu soyler.
   Yani Madde 11-A-I-2'deki gorev listesi (tecil, vadesinde odenmeyen alacagi
   takibe alma, duzeltme, teminat, odeme emri...) HER IKI SERVIS icin de gecerlidir.
   Sonuc: "tecil", "taksitlendirme", "takip" gibi ISLEM kelimeleri tek basina
   Surekli servisi GOSTERMEZ — ayrim islemde degil, YUKUMLULUK TURUNDEDIR.
   Dogru okuma: Madde 10'da Sureksiz Yukumlulukler Vergilendirme Servisi'nin
   masalari arasinda SAYILAN vergi turleri (ve benzeri, surekli beyan gerektirmeyen
   tek seferlik yukumlulukler) -> Sureksiz; bu listede SAYILMAYAN, surekli beyanli
   yukumlulukler -> Surekli. Once evrakin konusu olan alacak turunun Madde 10'daki
   Sureksiz masa listesinde olup olmadigina bak, sonra karar ver.
8. gerekce alanina SADECE sectigin servisin dayanagini yaz. Elemis oldugun servislerin
   adini gerekcede anma — okuyucuda yanlis yonlendirme izlenimi birakir.
9. guvenSkoru'nu dayanagin gucune gore ver: gorev tanimi birebir esliyorsa 0.8-1.0,
   teskilat semasi (Madde 10) uzerinden bagladiysan 0.5-0.8, zayifsa 0.4 altina in ve
   belirlenemedi=true yap.

JSON dondur; baska metin yazma.`;
}

export const ROUTING_SCHEMA = {
  type: "object",
  properties: {
    anaBirim: {
      type: ["string", "null"],
      enum: ["Vergilendirme", "Muhasebe", "Kovusturma", "Tarama ve Kontrol", null],
    },
    digerBirim: {
      type: ["string", "null"],
      enum: ["Gelir", "Vergi Denetmenleri", "Takdir", "Uzlasma", "Ozluk ve Destek", null],
    },
    servis: { type: ["string", "null"] },
    altServis: { type: ["string", "null"] },
    ilgiliMaddeler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          maddeNo: { type: "string" },
          baslik: { type: "string" },
        },
        required: ["maddeNo", "baslik"],
      },
    },
    guvenSkoru: { type: "number", minimum: 0, maximum: 1 },
    belirlenemedi: { type: "boolean" },
    gerekce: { type: "string" },
  },
  required: [
    "anaBirim",
    "digerBirim",
    "servis",
    "altServis",
    "ilgiliMaddeler",
    "guvenSkoru",
    "belirlenemedi",
    "gerekce",
  ],
} as const;

export const ROUTING_GRADER_PROMPT = `Sen bir servis yonlendirme denetcisisin. Sana bir
belge metni, ONERILEN SERVISIN yonetmelikteki gorev tanimi ve uretilen karar verilecek.

Tek bir soruya cevap ariyorsun: bu servise verilmis gorevler arasinda, eldeki evrakin
gerektirdigi islem GERCEKTEN var mi?

Denetim olcutleri:
- Servis ADININ evrak konusuna benzemesi dayanak DEGILDIR. Sadece gorev fiillerine bak
  (ne yapmakla gorevlendirilmis: kabul etmek, takibe almak, cevap hazirlamak, arsivlemek...).
- Gorev tanimi yalnizca kurum ICI idari isler (ust makama cevap hazirlama, teftis,
  istatistik toplama, yazisma kaydi) tanimliyorsa, o servis MUKELLEFTEN GELEN evraki
  islemekle gorevli degildir -> servisDayanakli=false.
- Yonetmeligin teskilat semasi (Madde 10) evrak turunu bu servise bagli bir masa altinda
  sayiyorsa bu gecerli bir dayanaktir -> servisDayanakli=true.
- SUREKLI / SUREKSIZ AYRIMI SENIN ISIN DEGIL. Bu ayrim, kararin atif verdigi gorev
  maddesinin sahibi olan servisten kod tarafinda deterministik olarak belirleniyor.
  Bir verginin "surekli mi sureksiz mi" oldugu YONETMELIKTE YAZMAZ; bu konuda kendi
  bilgine dayanarak hukum verme, verirsen dogru karari yanlislikla reddedersin.
  Sana dusen tek soru: gosterilen gorev tanimi, talep edilen ISLEMI iceriyor mu?
  Ornegin gorev tanimi "Tecil ile ilgili islemleri yapmak" diyorsa ve evrak tecil
  talebiyse -> servisDayanakli=true.

JSON dondur:
- servisDayanakli: yukaridaki olcutlere gore evrak bu servisin gorev alanina giriyor mu?
- masaIddiasi: karar, yonetmelikte dayanagi olmayan bir MASA seviyesinde iddia iceriyor mu?
  (Iceriyorsa true — bu bir kusurdur.)
- reason: 1 cumle gerekce (Turkce).

Madde numarasi dogrulamasi kod tarafinda yapiliyor; sen yalnizca gorev tanimi
eslesmesine odaklan.`;

export const ROUTING_GRADER_SCHEMA = {
  type: "object",
  properties: {
    servisDayanakli: { type: "boolean" },
    masaIddiasi: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["servisDayanakli", "masaIddiasi", "reason"],
} as const;
