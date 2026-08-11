import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunkDocument,
  chunkRegulationDocument,
  parseMarkdownBlocks,
  estimateTokens,
} from "../src/index.ts";

const uzunParagraf = Array.from(
  { length: 60 },
  (_, i) =>
    `Bu sözleşmenin ${i + 1}. maddesi uyarınca taraflar karşılıklı yükümlülüklerini yerine getirmeyi kabul ve taahhüt eder.`,
).join(" ");

const SAMPLE_MD = `# Araç Kiralama Sözleşmesi

## 1. Taraflar

Bu sözleşme Albay Teknoloji A.Ş. ile Opel Kiralama Ltd. Şti. arasında imzalanmıştır.

## 2. Kiralama Koşulları

Kiralama süresi 12 ay olup aylık bedel aşağıdaki tabloda belirtilmiştir.

| Araç | Model | Aylık Bedel |
|------|-------|-------------|
| Opel Astra | 2025 | 45.000 TL |
| Opel Corsa | 2024 | 38.000 TL |

Ödemeler her ayın 5'ine kadar yapılır. Gecikme halinde %2 faiz uygulanır.

## 3. Fesih Koşulları

${uzunParagraf}
`;

test("başlık hiyerarşisi doğru çıkarılır", () => {
  const blocks = parseMarkdownBlocks(SAMPLE_MD);
  const tarafBlock = blocks.find((b) => b.text.includes("Albay Teknoloji"));
  assert.deepEqual(tarafBlock?.headingPath, [
    "Araç Kiralama Sözleşmesi",
    "1. Taraflar",
  ]);
});

test("tablo tek blok olarak kalır, asla bölünmez", () => {
  const blocks = parseMarkdownBlocks(SAMPLE_MD);
  const tables = blocks.filter((b) => b.type === "table");
  assert.equal(tables.length, 1);
  assert.ok(tables[0]!.text.includes("Opel Astra"));
  assert.ok(tables[0]!.text.includes("Opel Corsa"));

  const chunks = chunkDocument({
    docId: "d1",
    filename: "opel_kiralama.pdf",
    markdown: SAMPLE_MD,
  });
  const tabloChunks = chunks.filter(
    (c) => c.kind === "child" && c.text.includes("Opel Astra"),
  );
  assert.equal(tabloChunks.length, 1, "tablo tek chunk'ta olmalı");
  assert.ok(tabloChunks[0]!.text.includes("Opel Corsa"), "tablonun tamamı aynı chunk'ta");
});

test("her child chunk breadcrumb ile başlar", () => {
  const chunks = chunkDocument({
    docId: "d1",
    filename: "opel_kiralama.pdf",
    markdown: SAMPLE_MD,
  });
  for (const c of chunks.filter((c) => c.kind === "child")) {
    assert.match(c.text, /^\[Dosya: opel_kiralama\.pdf/);
  }
});

test("uzun bölüm birden fazla chunk'a bölünür ve sınırlar aşılmaz", () => {
  const chunks = chunkDocument({
    docId: "d1",
    filename: "opel_kiralama.pdf",
    markdown: SAMPLE_MD,
  });
  const fesih = chunks.filter(
    (c) => c.kind === "child" && c.section?.includes("Fesih"),
  );
  assert.ok(fesih.length >= 2, `uzun bölüm bölünmeli (${fesih.length} chunk çıktı)`);
  for (const c of chunks.filter((c) => c.kind === "child")) {
    assert.ok(c.tokenCount <= 1000, `chunk çok büyük: ${c.tokenCount} token`);
  }
});

test("parent-child ilişkisi kurulur", () => {
  const chunks = chunkDocument({
    docId: "d1",
    filename: "opel_kiralama.pdf",
    markdown: SAMPLE_MD,
  });
  const parents = chunks.filter((c) => c.kind === "parent");
  const children = chunks.filter((c) => c.kind === "child");
  assert.ok(parents.length >= 3, "her H2 bölümü için parent olmalı");
  for (const child of children) {
    assert.ok(child.parentId, "her child bir parent'a bağlı olmalı");
    assert.ok(
      parents.some((p) => p.id === child.parentId),
      "parentId gerçek bir parent'ı göstermeli",
    );
  }
});

test("başlıksız düz metin de chunk'lanabilir", () => {
  const chunks = chunkDocument({
    docId: "d2",
    filename: "not.txt",
    markdown: "Sadece düz bir metin. Başlık yok.",
  });
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.some((c) => c.kind === "child"));
});

test("token tahmini makul aralıkta", () => {
  const t = estimateTokens("Merhaba dünya, bu bir deneme cümlesidir.");
  assert.ok(t > 5 && t < 30);
});

test("yönetmelik chunker madde sınırlarını ve metadata'yı çıkarır", () => {
  const md = `# VERGİ DAİRELERİ KURULUŞ VE GÖREV YÖNETMELİĞİ

## İKİNCİ KISIM Vergi Dairelerinin Örgütlenmesi ve Servislerin Görevleri

## İKİNCİ BÖLÜM Servislerin Görevleri

## Başkanlık ve Müdürlük Şeklinde Kurulan Vergi Dairesindeki Servislerin Görevleri : Madde 11

- 2) Sürekli Yükümlülükler Vergilendirme Servisi
- f) Tecil ile ilgili işlemleri yapmak,

## Bağlı Vergi Dairelerindeki Servislerin Görevleri : Madde 12

Bağlı vergi dairelerindeki servislerin görevleri şunlardır:
`;
  const chunks = chunkRegulationDocument({
    docId: "r1",
    filename: "yonetmelik.pdf",
    markdown: md,
  });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]!.section, "Madde 11 - Başkanlık ve Müdürlük Şeklinde Kurulan Vergi Dairesindeki Servislerin Görevleri");
  assert.equal(chunks[0]!.metadata?.maddeNo, "11");
  assert.equal(chunks[0]!.metadata?.kisim, "İKİNCİ KISIM Vergi Dairelerinin Örgütlenmesi ve Servislerin Görevleri");
  assert.equal(chunks[0]!.metadata?.bolum, "İKİNCİ BÖLÜM Servislerin Görevleri");
  assert.match(chunks[0]!.text, /Tecil/);
});

test("yönetmelik chunker servis seviyesinde child chunk üretir", () => {
  const md = `## İKİNCİ BÖLÜM Servislerin Görevleri

## Başkanlık ve Müdürlük Şeklinde Kurulan Vergi Dairesindeki Servislerin Görevleri : Madde 11

Vergi dairesindeki servislerin görevleri şunlardır:

- A) Ana Hizmet Birimleri

## I- Vergilendirme Bölümündeki Servislerin Görevleri

- 2) Sürekli Yükümlülükler Vergilendirme Servisi
- f) Tecil ile ilgili işlemleri yapmak,
- 4) İhtilaflı İşler Servisi
- a) Vergi dairesi savunmasını hazırlamak,

- B) Diğer Hizmet Birimleri

## I- Vergi Dairesi Başkanlığı Diğer Hizmet Servislerinin Görevleri

- 4) Uzlaşma Servisi
- c) Tarhiyat öncesi uzlaşma işlemlerini de yürütmek,
`;
  const chunks = chunkRegulationDocument({ docId: "r1", filename: "y.pdf", markdown: md });
  const children = chunks.filter((c) => c.kind === "child");

  // Maddenin tamami parent olarak korunur, servisler ayri ayri aranabilir olur
  assert.equal(chunks.filter((c) => c.kind === "parent").length, 1);
  const servisler = children.map((c) => c.metadata?.servis);
  assert.ok(servisler.includes("Sürekli Yükümlülükler Vergilendirme Servisi"));
  assert.ok(servisler.includes("Uzlaşma Servisi"));

  // "Tecil" tek bir servis parcasina dusmeli — 3000 token'lik madde blogu degil
  const tecil = children.filter((c) => c.text.includes("Tecil"));
  assert.equal(tecil.length, 1);
  assert.equal(tecil[0]!.metadata?.servis, "Sürekli Yükümlülükler Vergilendirme Servisi");
  assert.equal(tecil[0]!.metadata?.hizmetBirimi, "A) Ana Hizmet Birimleri");
  assert.equal(tecil[0]!.metadata?.maddeNo, "11");

  const uzlasma = children.find((c) => c.metadata?.servis === "Uzlaşma Servisi")!;
  assert.equal(uzlasma.metadata?.hizmetBirimi, "B) Diğer Hizmet Birimleri");
});

test("yönetmelik chunker OCR'da bozulmuş başlıkları onarır", () => {
  // Gercek Docling ciktisindaki uc patoloji:
  //  1) "Madde 21" ibaresi basliktan tamamen dusmus
  //  2) baslik iki satira bolunmus ("... Görev" + "ve Sorumlulukları : Madde 24")
  //  3) BOLUM basligi madde basligiyla ayni satirda kaynasmis
  const md = `## DÖRDÜNCÜ KISIM Vergi Dairelerinde Görev, Yetki ve Sorumluluk

## BİRİNCİ BÖLÜM Vergi Dairelerinin Yönetimi: - Madde 20

Vergi dairesi müdürü yetkilerini kullanır.

## Vergi Dairesi Müdürünün ve Vergi Müdürünün Sorumlulukları :

Vergi dairesi müdürü sayman sıfatıyla şahsen sorumludur.

## Vergi Dairesi Müdür Yardımcılarının Görev ve Sorumlulukları : Madde 22

Müdür yardımcıları görevlidirler.

## Gelir Uzmanlarının, Gelir Uzman Yardımcılarının ve Memurların Görev

## ve Sorumlulukları : Madde 23

Gelir uzmanları görevlidirler.
`;
  const chunks = chunkRegulationDocument({ docId: "r1", filename: "y.pdf", markdown: md });
  const byMadde = new Map(chunks.map((c) => [c.metadata?.maddeNo, c]));

  // 1) Kaybolan madde numarasi komsulardan turetilir ama "kesin degil" isaretlenir
  const m21 = byMadde.get("21");
  assert.ok(m21, "Madde 21 ayri chunk olmali, Madde 20'ye yapismamali");
  assert.equal(m21!.metadata?.maddeNoKesin, false);
  assert.match(m21!.text, /kaynak metinden okunamadi/);
  assert.match(m21!.text, /sayman sıfatıyla/);
  assert.doesNotMatch(byMadde.get("20")!.text, /sayman sıfatıyla/);

  // 2) Iki satira bolunmus baslik birlestirilir
  assert.equal(
    byMadde.get("23")!.metadata?.baslik,
    "Gelir Uzmanlarının, Gelir Uzman Yardımcılarının ve Memurların Görev ve Sorumlulukları",
  );

  // 3) BOLUM on eki madde basligindan ayiklanir, hiyerarsiye yazilir
  const m20 = byMadde.get("20")!;
  assert.equal(m20.metadata?.baslik, "Vergi Dairelerinin Yönetimi");
  assert.equal(m20.metadata?.bolum, "BİRİNCİ BÖLÜM Vergi Dairelerinin Yönetimi");
  assert.equal(m20.metadata?.kisim, "DÖRDÜNCÜ KISIM Vergi Dairelerinde Görev, Yetki ve Sorumluluk");
  assert.equal(m20.metadata?.maddeNoKesin, true);
});

test("salt sayım maddesinde masa listesi bağlı olduğu servisle birlikte chunk olur", () => {
  // Madde 10 teskilat semasidir: bir masanin hangi servise bagli oldugu YALNIZCA
  // burada yaziyor. Bu esleme buyuk bir madde blogunun icinde gomulu kalirsa
  // "MTV dilekcesi hangi servise gider" sorusu retrieval'da bulunamiyor.
  const md = `## Başkanlık ve Müdürlük Şeklinde Kurulan Vergi Daireleri Birimleri : -Madde 10

Vergi daireleri birimleri şunlardır:

- A) Ana Hizmet Birimleri

## I- Vergilendirme Bölümündeki Servisler

- 1) Sicil-Yoklama Servisi
- 2) Sürekli Yükümlülükler Vergilendirme Servisi
- a) Beyanname Kabul Masası
- b) Hesap ve Takip Masası
- 3) Süreksiz Yükümlülükler Vergilendirme Servisi
- a) Motorlu Taşıtlar Vergisi Masası
- b) Veraset ve İntikal Vergisi Masası
`;
  const chunks = chunkRegulationDocument({ docId: "r1", filename: "y.pdf", markdown: md });
  const children = chunks.filter((c) => c.kind === "child");

  // MTV masasi, bagli oldugu servisin parcasinda ve breadcrumb'inda o servis yazili
  const mtv = children.find((c) => c.text.includes("Motorlu Taşıtlar Vergisi Masası"))!;
  assert.ok(mtv, "MTV masasi bir chunk'ta bulunmali");
  assert.equal(mtv.metadata?.servis, "Süreksiz Yükümlülükler Vergilendirme Servisi");
  assert.doesNotMatch(mtv.text, /Beyanname Kabul Masası/, "diger servisin masalari karismamali");

  // Govdesiz servis adi da kaybolmaz — kendi parcasi olur
  const sicil = children.find((c) => c.metadata?.servis === "Sicil-Yoklama Servisi");
  assert.ok(sicil, "gorev listesi olmayan servis adi da korunmali");
});
