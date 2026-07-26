import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkDocument, parseMarkdownBlocks, estimateTokens } from "../src/index.ts";

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
