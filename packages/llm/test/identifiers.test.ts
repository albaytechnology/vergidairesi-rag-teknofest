import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTckn,
  isValidVkn,
  validateVkn,
  validateTckn,
  extractIdentifierCandidates,
} from "../src/identifiers.ts";

// NVI/GIB'in kamuya acik test numaralari
const GECERLI_TCKN = "10000000146";
const GECERLI_VKN = "4840847211";

test("gecerli TCKN kabul edilir", () => {
  assert.equal(isValidTckn(GECERLI_TCKN), true);
});

test("bozuk TCKN reddedilir", () => {
  assert.equal(isValidTckn("10000000145"), false, "son hane yanlis");
  assert.equal(isValidTckn("10000000246"), false, "10. hane yanlis");
  assert.equal(isValidTckn("00000000146"), false, "ilk hane 0 olamaz");
  assert.equal(isValidTckn("1000000014"), false, "10 hane");
  assert.equal(isValidTckn("11111111111"), false, "tekrarli haneler checksum tutmaz");
});

test("gecerli VKN kabul edilir", () => {
  assert.equal(isValidVkn(GECERLI_VKN), true);
});

test("bozuk VKN reddedilir", () => {
  assert.equal(isValidVkn("4840847212"), false, "kontrol hanesi yanlis");
  assert.equal(isValidVkn("1111111111"), false);
  assert.equal(isValidVkn("484084721"), false, "9 hane");
});

test("her 9 haneli on ek icin tam olarak bir gecerli kontrol hanesi vardir", () => {
  // Algoritmanin yapisal saglamasi — bir hane hatasi daima yakalanir
  for (const onEk of ["484084721", "390038366", "123456789", "900000000"]) {
    const gecerliler = [...Array(10).keys()].filter((c) => isValidVkn(onEk + c));
    assert.equal(gecerliler.length, 1, `${onEk} icin tek gecerli hane bekleniyordu`);
  }
});

test("gercek kisi mukellefte 11 haneli TCKN, VKN olarak kabul edilir", () => {
  assert.equal(validateVkn(GECERLI_TCKN), GECERLI_TCKN);
  assert.equal(validateVkn(GECERLI_VKN), GECERLI_VKN);
  assert.equal(validateVkn("4840847212"), null, "uydurma numara null donmeli");
  assert.equal(validateVkn(null), null);
});

test("bicimlendirme temizlenir ama checksum yine uygulanir", () => {
  assert.equal(validateVkn(" 484 084 7211 "), GECERLI_VKN);
  assert.equal(validateTckn("100.000.001.46"), GECERLI_TCKN);
  assert.equal(validateVkn("484 084 7212"), null);
});

test("metinden yalnizca checksum'i tutan numaralar cikarilir", () => {
  const metin =
    `Sayin ilgili, ${GECERLI_VKN} vergi numarali mukellefimizin ` +
    `${GECERLI_TCKN} T.C. kimlik numarali ortagi hakkinda. ` +
    `Dosya no 1234567891, tutar 15000 TL, tarih 2026-01-15.`;
  const { tckn, vkn } = extractIdentifierCandidates(metin);
  assert.deepEqual(tckn, [GECERLI_TCKN]);
  assert.deepEqual(vkn, [GECERLI_VKN], "1234567891 checksum tutmadigi icin elenmeli");
});

test("checksum gecerliligi 'numara gercek' demek DEGILDIR", () => {
  // 1234567890 tum ara degerleri 0'a dusurdugu icin checksum'i saglar.
  // Dogrulama transkripsiyon/uydurma hatalarinin buyuk kismini eler ama
  // numaranin gercekten kayitli oldugunu KANITLAMAZ — bu ancak GIB
  // sorgusuyla dogrulanabilir. Bu testin amaci sinirin belgelenmesi.
  assert.equal(isValidVkn("1234567890"), true);
  assert.equal(isValidVkn("1234567891"), false, "bir hane degisince checksum tutmaz");
});
