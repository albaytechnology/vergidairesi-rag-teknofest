import { test } from "node:test";
import assert from "node:assert/strict";
import type { LetterBody } from "@albay/shared";
import { verifyLetterNumbers } from "../src/letter/verify-numbers.ts";

const KAYNAK = [
  "2025/3 dönemi KDV borcunun tecili",
  "15/07/2026",
  "18.247,00 TL",
  "2025/3",
  "1234567891",
].join("\n");

const yazi = (over: Partial<LetterBody> = {}): LetterBody => ({
  ilgiSatirlari: [],
  paragraflar: [],
  gerekce: "",
  ...over,
});

test("kaynakta gecen tutar ve tarih temiz gecer", () => {
  const suphe = verifyLetterNumbers(
    yazi({
      ilgiSatirlari: ["a) 15/07/2026 tarihli dilekçeniz."],
      paragraflar: ["2025/3 dönemine ait 18.247,00 TL tutarındaki borcunuz."],
    }),
    KAYNAK,
  );
  assert.deepEqual(suphe, []);
});

test("bicim farki yanlis alarm uretmez (18.247,00 ↔ 18.247)", () => {
  // Model kurusu duşurup yazabiliyor; deger ayni oldugu surece kusur degil.
  assert.deepEqual(verifyLetterNumbers(yazi({ paragraflar: ["18.247 TL"] }), KAYNAK), []);
});

test("evrakta olmayan taksit sayisi ve faiz orani yakalanir", () => {
  // En tehlikeli hata bicimi: mukellefe teblig edilen, kaynagi olmayan sayilar.
  const suphe = verifyLetterNumbers(
    yazi({ paragraflar: ["Borcunuz 36 ay vadeli olarak, aylık 2,5 oranında taksitlendirilmiştir."] }),
    KAYNAK,
  );
  assert.deepEqual(suphe.sort(), ["2,5", "36"]);
});

test("tek haneli sayilar denetlenmez — siralama/madde imi gurultusu", () => {
  assert.deepEqual(verifyLetterNumbers(yazi({ paragraflar: ["1 adet ek sunulmuştur."] }), KAYNAK), []);
});

test("gerekce alani da denetlenir", () => {
  const suphe = verifyLetterNumbers(
    yazi({ gerekce: "6183 sayılı Kanun uyarınca reddedilmiştir." }),
    KAYNAK,
  );
  assert.deepEqual(suphe, ["6183"], "verilmemis mevzuat atfi da isaretlenmeli");
});

test("atif yapilmasina izin verilen mevzuat kaynaga eklendiginde temiz gecer", () => {
  const suphe = verifyLetterNumbers(
    yazi({ gerekce: "6183 sayılı Kanun uyarınca reddedilmiştir." }),
    `${KAYNAK}\n6183 sayılı Amme Alacaklarının Tahsil Usulü Hakkında Kanun`,
  );
  assert.deepEqual(suphe, []);
});
