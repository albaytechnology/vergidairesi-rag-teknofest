import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, termId, encodeSparse } from "../src/sparse.ts";

test("Türkçe küçük harf ve deaccent doğru çalışır", () => {
  // "SÖZLEŞME" -> "sozlesme", "İPTAL" -> "iptal", "ILIK" -> "ilik" (I -> ı -> i)
  assert.deepEqual(tokenize("SÖZLEŞME İPTAL"), ["sozlesme", "iptal"]);
});

test("aksanlı ve aksansız yazım aynı terime eşlenir", () => {
  assert.equal(termId(tokenize("sözleşme")[0]!), termId(tokenize("sozlesme")[0]!));
});

test("stopword'ler ve kısa tokenlar elenir", () => {
  const tokens = tokenize("bu bir sözleşme ve o çok önemli");
  assert.ok(!tokens.includes("bu"));
  assert.ok(!tokens.includes("ve"));
  assert.ok(tokens.includes("sozlesme"));
  assert.ok(tokens.includes("onemli"));
});

test("noktalama ve sayılar ayrıştırılır", () => {
  const tokens = tokenize("Madde 4.2: fesih bildirimi, 30 gün önce yapılır.");
  assert.ok(tokens.includes("fesih"));
  assert.ok(tokens.includes("30"));
  assert.ok(tokens.includes("gun"));
});

test("sparse vektör tutarlı üretilir", () => {
  const v = encodeSparse("kiralama sözleşmesi kiralama bedeli");
  assert.equal(v.indices.length, v.values.length);
  assert.ok(v.indices.length >= 3);
  // "kiralama" 2 kez geciyor -> TF degeri tek gecenlerden buyuk olmali
  const kiralamaId = termId("kiralama");
  const kiralamaIdx = v.indices.indexOf(kiralamaId);
  assert.ok(kiralamaIdx >= 0);
  const maxVal = Math.max(...v.values);
  assert.equal(v.values[kiralamaIdx], maxVal);
});

test("aynı metin aynı vektörü üretir (determinizm)", () => {
  const a = encodeSparse("personel özlük dosyası");
  const b = encodeSparse("personel özlük dosyası");
  assert.deepEqual(a, b);
});

test("boş/anlamsız metin boş vektör döner", () => {
  assert.deepEqual(encodeSparse("!!! ... ---"), { indices: [], values: [] });
});
