import { test } from "node:test";
import assert from "node:assert/strict";
import { groundAlacakTuru } from "../src/analyzer.ts";

const KDV_BELGESI = `Konu: KDV borcumun tecil ve taksitlendirilmesi talebi hk.
Dairenizin 314871279537 vergi kimlik numaralı mükellefiyim. 2026/01 dönemine ait KDV
Vergi Türü: KDV`;

const MTV_BELGESI = "2026 yılı Motorlu Taşıtlar Vergisi borcumun taksitlendirilmesi";

test("belgede birebir gecen ifade oldugu gibi kalir", () => {
  assert.equal(
    groundAlacakTuru("motorlu tasitlar vergisi", MTV_BELGESI),
    "motorlu tasitlar vergisi",
    "aksan ve buyuk/kucuk harf farki eslesmeyi bozmamali",
  );
});

test("uydurulmus kisaltma acilimi atilir, kisaltmanin kendisi kalir", () => {
  // Gercek gozlem: belgede sadece "KDV" geciyor, model "karaye nakliyat
  // vergisi (KDV)" uretti. Uydurulan acilim mukellefe giden yaziya girmemeli.
  assert.equal(groundAlacakTuru("karaye nakliyat vergisi (KDV)", KDV_BELGESI), "KDV");
  assert.equal(groundAlacakTuru("kar yol vergisi (KDV)", KDV_BELGESI), "KDV");
});

test("ayni belgeden iki farkli uydurma AYNI degere indirgenir", () => {
  // routing_key bu alandan turedigi icin kritik: farkli kalsalardi ayni tur iki
  // evrak farkli anahtara duser ve tutarlilik denetimi onlari hic karsilastirmazdi.
  assert.equal(
    groundAlacakTuru("karaye nakliyat vergisi (KDV)", KDV_BELGESI),
    groundAlacakTuru("kar yol vergisi (KDV)", KDV_BELGESI),
  );
});

test("kismen dogru ifadeden metinde gecen en uzun parca alinir", () => {
  assert.equal(
    groundAlacakTuru("2026 yılı motorlu taşıtlar vergisi gecikme zammı", MTV_BELGESI),
    "2026 yılı motorlu taşıtlar vergisi",
  );
});

test("hicbir dayanagi olmayan deger bos birakilir", () => {
  assert.equal(groundAlacakTuru("emlak vergisi", MTV_BELGESI), "");
});

test("tek kelimelik jenerik eslesme kabul edilmez", () => {
  // "vergisi" metinde geciyor ama hicbir sey soylemiyor; bos donmeli.
  assert.equal(groundAlacakTuru("damga vergisi", "Motorlu Taşıtlar Vergisi borcu"), "");
});

test("bos deger bos kalir", () => {
  assert.equal(groundAlacakTuru("", KDV_BELGESI), "");
  assert.equal(groundAlacakTuru("   ", KDV_BELGESI), "");
});
