import { test } from "node:test";
import assert from "node:assert/strict";
import type { LetterBody, LetterModel } from "@albay/shared";
import { buildLetterModel } from "../src/model/build.ts";
import type { KurumBilgileri } from "../src/model/institution.ts";
import { renderLetterHtml } from "../src/html/render.ts";
import { letterToDocx } from "../src/docx/render.ts";

const KURUM: KurumBilgileri = {
  kurumAdi: "Gelir İdaresi Başkanlığı",
  birimAdi: "Albay Vergi Dairesi Müdürlüğü",
  detsisNo: "12345678",
  dosyaPlani: "045.01",
  imzaAd: "Ayşe DEMİR",
  imzaUnvan: "Vergi Dairesi Müdürü",
  adres: "Merkez Mah. 1. Cad. No:1 Albay",
  telefon: "0000 000 00 00",
  eposta: "albay@example.gov.tr",
  web: "www.example.gov.tr",
  kep: "albay@hs01.kep.tr",
};

const BOS_KURUM: KurumBilgileri = {
  kurumAdi: "",
  birimAdi: "",
  detsisNo: "",
  dosyaPlani: "",
  imzaAd: "",
  imzaUnvan: "",
  adres: "",
  telefon: "",
  eposta: "",
  web: "",
  kep: "",
};

const analiz = {
  konu: "2025/3 dönemi KDV borcunun tecil ve taksitlendirilmesi talebi",
  baslikOnerisi: "KDV borcu tecil ve taksitlendirme talebi",
  entities: {
    vkn: "1234567891",
    tckn: null,
    tarihler: ["15/07/2026"],
    tutarlar: ["18.247,00 TL"],
    plakalar: [],
    donemler: ["2025/3"],
    kisiKurumlar: ["Mehmet YILMAZ"],
  },
};

const body: LetterBody = {
  ilgiSatirlari: ["15/07/2026 tarihli dilekçeniz."],
  paragraflar: [
    "Dilekçenizde 2025/3 dönemine ait 18.247,00 TL tutarındaki katma değer vergisi borcunuzun tecili talep edilmektedir.",
    "Talebiniz uygun görülmüştür.",
  ],
  gerekce: "",
};

const kur = (over: Partial<Parameters<typeof buildLetterModel>[0]> = {}): LetterModel =>
  buildLetterModel({ analiz, body, karar: "onay", kurum: KURUM, ...over });

test("bloklar yonetmelikteki sirayla dizilir", () => {
  const html = renderLetterHtml(kur({ sayiNo: 42, ekler: ["Ödeme planı"], dagitim: ["Gereği"] }));
  const sira = [
    "T.C.",
    "GELİR İDARESİ BAŞKANLIĞI",
    "Sayı",
    "Konu",
    "Sayın",
    "İlgi",
    "Bilgi edinilmesini rica ederim.",
    "Ayşe DEMİR",
    "Vergi Dairesi Müdürü",
    "Ek:",
    "Dağıtım:",
    "Adres:",
  ];
  let onceki = -1;
  for (const parca of sira) {
    const idx = html.indexOf(parca);
    assert.notEqual(idx, -1, `blok bulunamadi: ${parca}`);
    assert.ok(idx > onceki, `blok sirasi bozuk: ${parca}`);
    onceki = idx;
  }
});

test("sayi e-Yazisma bicimindedir ve sira numarasini tasir", () => {
  assert.equal(kur({ sayiNo: 42 }).sayi, "E-12345678-045.01-42");
});

test("sira numarasi verilmezse yer tutucu basilir — numara uydurulmaz", () => {
  const model = kur();
  assert.equal(model.sayi, "E-12345678-045.01-[SIRA NO]");
  // Yer tutucu HTML'de gorunur olmali, sessizce gecmemeli.
  assert.match(renderLetterHtml(model), /<span class="eksik">\[SIRA NO\]<\/span>/);
});

test("yapilandirilmamis kurum alanlari uydurulmaz, eksikAlanlar'da raporlanir", () => {
  const model = buildLetterModel({ analiz, body, karar: "onay", kurum: BOS_KURUM });
  assert.deepEqual(model.eksikAlanlar, [
    "Kurum adı (LETTER_KURUM_ADI)",
    "Birim adı (LETTER_BIRIM_ADI)",
    "İmza sahibi (LETTER_IMZA_AD)",
    "İmza unvanı (LETTER_IMZA_UNVAN)",
    "DETSİS no (LETTER_DETSIS_NO)",
    "Dosya planı kodu (LETTER_DOSYA_PLANI)",
  ]);
  assert.equal(model.imzaAd, "[İMZA SAHİBİ]");
  // Bos iletisim bilgisi footer'i hic olusturmamali (bos "Adres:" satiri cikmasin)
  assert.equal(renderLetterHtml(model).includes("Adres:"), false);
});

test("muhatap adi hicbir kaynaktan gelmezse yer tutucu kalir", () => {
  const model = buildLetterModel({
    analiz: { ...analiz, entities: { ...analiz.entities, kisiKurumlar: [] } },
    body,
    karar: "onay",
    kurum: KURUM,
  });
  assert.equal(model.muhatap.ad, "[MUHATAP]");
  assert.ok(model.eksikAlanlar.includes("Muhatap adı (form)"));
});

test("formdan gelen muhatap analizden gelene ustundur", () => {
  const model = kur({ muhatap: { ad: "Fatma KAYA", tur: "kisi" } });
  assert.equal(model.muhatap.ad, "Fatma KAYA");
});

test("kapanis cumlesi karardan ve muhatap turunden turetilir", () => {
  assert.match(kur().kapanis, /Bilgi edinilmesini rica ederim\./);
  assert.match(kur({ muhatap: { tur: "kurum", ad: "X" } }).kapanis, /gereğini rica ederim\./);
  assert.match(kur({ karar: "eksik_belge" }).kapanis, /Eksik belge/);
});

/*
 * Ihtilafli Isler Servisi yazismasi: muhatap mukellef degil MAHKEMEDIR.
 * Buradaki testler yazinin ust bloklarini korur — govdenin uslubu modele ait
 * ve prompt tarafinda kurallanir, ama muhatap/kapanis deterministik olmali.
 */
test("mahkeme hitabinda muhatap evraktaki mahkemedir, davaci degil", () => {
  const model = buildLetterModel({
    analiz: {
      ...analiz,
      entities: {
        ...analiz.entities,
        kisiKurumlar: ["Reyhan MÜNYAS", "İzmir Vergi Mahkemesi"],
      },
    },
    body,
    karar: "bilgilendirme",
    kurum: KURUM,
    hitap: "mahkeme",
  });
  assert.equal(model.muhatap.ad, "İzmir Vergi Mahkemesi Başkanlığı");
  assert.equal(model.muhatap.tur, "kurum");
  // Mukellefin vergi numarasi muhatap blogunda yer almaz: o numara davaciya ait.
  assert.equal(model.muhatap.vknTckn, null);
  assert.match(model.kapanis, /arz ederim\.$/);
});

test("mahkeme evrakta gecmiyorsa muhatap uydurulmaz", () => {
  const model = buildLetterModel({
    analiz: { ...analiz, entities: { ...analiz.entities, kisiKurumlar: ["Reyhan MÜNYAS"] } },
    body,
    karar: "bilgilendirme",
    kurum: KURUM,
    hitap: "mahkeme",
  });
  assert.equal(model.muhatap.ad, "[VERGİ MAHKEMESİ BAŞKANLIĞI]");
  assert.ok(model.eksikAlanlar.includes("Vergi mahkemesi adı (evrakta bulunamadı)"));
});

test("mahkeme adi zaten baskanlik iceriyorsa tekrarlanmaz", () => {
  const model = buildLetterModel({
    analiz,
    body,
    karar: "red",
    kurum: KURUM,
    hitap: "mahkeme",
    muhatap: { ad: "İstanbul 2. Vergi Mahkemesi Başkanlığı" },
  });
  assert.equal(model.muhatap.ad, "İstanbul 2. Vergi Mahkemesi Başkanlığı");
});

test("taslak damgasi ve imzasizlik uyarisi varsayilan olarak basilir", () => {
  const html = renderLetterHtml(kur());
  assert.match(html, /class="filigran"/);
  assert.match(html, /elektronik imza ile imzalanmamıştır/i);
  // Damga kaldirilinca bile "e-imzalidir" iddiasi HICBIR zaman basilmaz.
  const imzali = renderLetterHtml(kur({ taslak: false }));
  assert.equal(imzali.includes('class="filigran"'), false);
  assert.equal(/elektronik imza ile imzalanmıştır/i.test(imzali), false);
});

test("model icerigi HTML'e enjeksiyon yapamaz", () => {
  // Paragraflar LLM'den, muhatap adi ise arayuz formundan geliyor — ikisi de
  // sablona gore disaridan gelen veri; kacislanmadan basilirsa onizleme
  // (ve PDF ureten Chromium) uzerinde kod calistirilabilir.
  const html = renderLetterHtml(
    kur({
      muhatap: { ad: "<script>alert(1)</script>", tur: "kisi" },
      body: { ...body, paragraflar: ['<img src=x onerror="alert(1)">'] },
    }),
  );
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&lt;script&gt;/);
});

test("ilgi satirlari harflendirilir, modelin yazdigi harf tekrarlanmaz", () => {
  const html = renderLetterHtml(
    kur({ body: { ...body, ilgiSatirlari: ["a) İlk dilekçeniz.", "İkinci dilekçeniz."] } }),
  );
  assert.match(html, /a\) İlk dilekçeniz\./);
  assert.match(html, /b\) İkinci dilekçeniz\./);
  assert.equal(html.includes("a) a)"), false);
});

test("konu satiri uzunsa kisaltilir (yonetmelik: sayfa ortasini gecmez)", () => {
  const uzun = "x".repeat(200);
  const model = buildLetterModel({
    analiz: { ...analiz, baslikOnerisi: uzun },
    body,
    karar: "onay",
    kurum: KURUM,
  });
  assert.ok(model.konu.length <= 90);
  assert.match(model.konu, /\.\.\.$/);
});

test("DOCX gecerli bir Office paketi uretir", async () => {
  const buf = await letterToDocx(kur({ sayiNo: 7 }));
  // OOXML bir ZIP arsividir; ilk iki bayt "PK".
  assert.equal(buf.subarray(0, 2).toString("latin1"), "PK");
  assert.ok(buf.length > 2000, "beklenenden kucuk paket");
});
