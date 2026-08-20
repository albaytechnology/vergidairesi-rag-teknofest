import { test } from "node:test";
import assert from "node:assert/strict";
import type { SearchHit } from "@albay/retrieval";
import type { ServiceRoutingDecision } from "@albay/shared";
import { verifyCitations } from "../src/routing/verify-citations.ts";
import { reconcileBirim } from "../src/routing/reconcile.ts";
import { sameService, sameServiceStrict, isEntryPointService } from "../src/routing/services.ts";
import { normalizeMaddeNo, uncertainMaddeNumbers } from "../src/routing/madde.ts";

function hit(metadata: Record<string, unknown>): SearchHit {
  return {
    chunkId: "c1",
    score: 1,
    filename: "yonetmelik.md",
    path: "/y.md",
    docId: "d1",
    docType: null,
    section: null,
    page: null,
    parentId: null,
    metadata,
    text: "…",
  };
}

const karar = (over: Partial<ServiceRoutingDecision> = {}): ServiceRoutingDecision => ({
  anaBirim: "Vergilendirme",
  digerBirim: null,
  servis: "Sürekli Yükümlülükler Vergilendirme Servisi",
  altServis: null,
  ilgiliMaddeler: [{ maddeNo: "11", baslik: "Servislerin Görevleri" }],
  guvenSkoru: 0.9,
  belirlenemedi: false,
  gerekce: "…",
  ...over,
});

test("madde numarasi her bicimden ayni sekilde normalize edilir", () => {
  assert.equal(normalizeMaddeNo("M.11-A-I-2-f"), "11");
  assert.equal(normalizeMaddeNo("Madde 11"), "11");
  assert.equal(normalizeMaddeNo("11"), "11");
});

test("getirilmeyen maddeye yapilan atif dusurulur", () => {
  const hits = [hit({ maddeNo: "11", servis: "Uzlaşma Servisi" })];
  const { decision, uydurulan } = verifyCitations(
    karar({
      ilgiliMaddeler: [
        { maddeNo: "11-A-I-2-f", baslik: "gerçek" },
        { maddeNo: "99", baslik: "uydurma" },
      ],
    }),
    hits,
  );
  assert.deepEqual(uydurulan, ["99"]);
  assert.equal(decision.ilgiliMaddeler.length, 1);
  assert.equal(decision.belirlenemedi, false, "gecerli atif kaldigi icin karar ayakta");
});

test("hicbir atif dogrulanamazsa karar belirlenemedi'ye duser", () => {
  const hits = [hit({ maddeNo: "11" })];
  const { decision } = verifyCitations(
    karar({ ilgiliMaddeler: [{ maddeNo: "99", baslik: "uydurma" }] }),
    hits,
  );
  assert.equal(decision.belirlenemedi, true);
  assert.equal(decision.servis, null, "dayanaksiz servis atamasi silinmeli");
  assert.equal(decision.guvenSkoru, 0);
  assert.match(decision.gerekce, /99/);
});

test("atifsiz karar da belirlenemedi sayilir", () => {
  const { decision } = verifyCitations(karar({ ilgiliMaddeler: [] }), [hit({ maddeNo: "11" })]);
  assert.equal(decision.belirlenemedi, true);
});

test("birim atamasi yonetmelik hiyerarsisinden duzeltilir", () => {
  // Model dogru servisi bulup yanlis birime bagliyor — metadata dogruyu biliyor
  const hits = [
    hit({
      maddeNo: "11",
      servis: "Uzlaşma Servisi",
      hizmetBirimi: "B) Diğer Hizmet Birimleri",
      altBolum: "I- Vergi Dairesi Başkanlığı Diğer Hizmet Servislerinin Görevleri",
    }),
  ];
  const { decision, duzeltildi } = reconcileBirim(
    karar({ anaBirim: "Vergilendirme", digerBirim: null, servis: "Uzlaşma Servisi" }),
    hits,
  );
  assert.equal(duzeltildi, true);
  assert.equal(decision.anaBirim, null);
  assert.equal(decision.digerBirim, "Uzlasma");
});

test("servis adindaki yazim hatasi kanonik ada duzeltilir", () => {
  const hits = [
    hit({
      maddeNo: "11",
      servis: "Sürekli Yükümlülükler Vergilendirme Servisi",
      hizmetBirimi: "A) Ana Hizmet Birimleri",
      altBolum: "I- Vergilendirme Bölümündeki Servislerin Görevleri",
    }),
  ];
  const { decision } = reconcileBirim(
    // model "Yükümlükler" yaziyor (eksik harf)
    karar({ servis: "Sürekli Yükümlükler Vergilendirme Servisi" }),
    hits,
  );
  assert.equal(decision.servis, "Sürekli Yükümlülükler Vergilendirme Servisi");
  assert.equal(decision.anaBirim, "Vergilendirme");
});

test("giris noktasi servisine yonlendirme reddedilir", () => {
  assert.equal(isEntryPointService("Yazışma ve Arşiv Servisi"), true);
  assert.equal(isEntryPointService("Vergi Müdürlüğü Yazışma ve Arşiv Servisi"), true);
  assert.equal(
    isEntryPointService("Vergi Denetmenleri Yazışma Servisi"),
    false,
    "arsiv gecmiyor — bu gercek bir yonlendirme hedefi",
  );

  const { decision } = reconcileBirim(karar({ servis: "Yazışma ve Arşiv Servisi" }), [
    hit({ maddeNo: "11", servis: "Yazışma ve Arşiv Servisi" }),
  ]);
  assert.equal(decision.belirlenemedi, true);
  assert.match(decision.gerekce, /giris noktasidir/);
});

test("sameService yazim farklarina dayanikli, farkli servisleri ayirir", () => {
  assert.equal(sameService("Uzlaşma Servisi", "uzlasma servisi"), true);
  assert.equal(
    sameService("Sürekli Yükümlükler Vergilendirme Servisi", "Sürekli Yükümlülükler Vergilendirme Servisi"),
    true,
  );
  assert.equal(sameService("Gelir Servisi", "İcra Servisi"), false);
  assert.equal(
    sameService("Sürekli Yükümlülükler Vergilendirme Servisi", "Süreksiz Yükümlülükler Vergilendirme Servisi"),
    true,
    "bu ikisi cok benziyor — sameService ayiramaz, ayrim metadata esitligiyle yapilmali",
  );
});

// ─── Atif ile servis adi celiskisi ────────────────────────────────────

const surekliHit = hit({
  maddeNo: "11",
  servis: "Sürekli Yükümlülükler Vergilendirme Servisi",
  servisNo: "2",
  hizmetBirimi: "A) Ana Hizmet Birimleri",
  altBolum: "I- Vergilendirme Bölümündeki Servislerin Görevleri",
});
const sureksizHit = hit({
  maddeNo: "10",
  servis: "Süreksiz Yükümlülükler Vergilendirme Servisi",
  servisNo: "3",
  hizmetBirimi: "A) Ana Hizmet Birimleri",
  altBolum: "I- Vergilendirme Bölümündeki Servisler",
});

test("karar, atif verdigi maddenin sahibi olmayan servisi adlandirmissa duzeltilir", () => {
  // Gozlenen hata: model "Sureksiz" diyor ama tek dayanagi olarak Surekli'nin
  // tecil gorev maddesini (11-A-I-2-f) gosteriyor. Atif daha guvenilir sinyal.
  const { decision, duzeltildi } = reconcileBirim(
    karar({
      servis: "Süreksiz Yükümlülükler Vergilendirme Servisi",
      ilgiliMaddeler: [{ maddeNo: "11-A-I-2-f", baslik: "Tecil ile ilgili işlemleri yapmak" }],
    }),
    [surekliHit, sureksizHit],
  );
  assert.equal(duzeltildi, true);
  assert.equal(decision.servis, "Sürekli Yükümlülükler Vergilendirme Servisi");
  assert.equal(decision.anaBirim, "Vergilendirme");
});

test("adlandirilan servis atiflar arasindaysa karara DOKUNULMAZ", () => {
  // MTV tecili hakli olarak iki maddeye birden dayanir: Madde 10-A-I-3 (MTV masasi
  // Sureksiz'in altinda) ve Madde 11-A-I-2-f (tecil gorevi). Her atifa korukorune
  // hizalamak dogru karari bozuyordu.
  const { decision } = reconcileBirim(
    karar({
      servis: "Süreksiz Yükümlülükler Vergilendirme Servisi",
      ilgiliMaddeler: [
        { maddeNo: "10-A-I-3", baslik: "Süreksiz Yükümlülükler Vergilendirme Servisi" },
        { maddeNo: "11-A-I-2-f", baslik: "Tecil ile ilgili işlemleri yapmak" },
      ],
    }),
    [surekliHit, sureksizHit],
  );
  assert.equal(decision.servis, "Süreksiz Yükümlülükler Vergilendirme Servisi");
});

test("atif bir servise cozulemiyorsa servis adi degistirilmez", () => {
  const { decision } = reconcileBirim(
    karar({
      servis: "Sürekli Yükümlülükler Vergilendirme Servisi",
      // Madde 5'in servisi yok — cozulemez
      ilgiliMaddeler: [{ maddeNo: "5", baslik: "İştigal Konuları" }],
    }),
    [surekliHit, hit({ maddeNo: "5", servis: null })],
  );
  assert.equal(decision.servis, "Sürekli Yükümlülükler Vergilendirme Servisi");
});

test("kesin ad karsilastirmasi Surekli ile Sureksiz'i ayirir", () => {
  const a = "Sürekli Yükümlülükler Vergilendirme Servisi";
  const b = "Süreksiz Yükümlülükler Vergilendirme Servisi";
  assert.equal(sameService(a, b), true, "toleransli karsilastirma ayiramaz — bilinen sinir");
  assert.equal(sameServiceStrict(a, b), false, "kesin karsilastirma ayirmali");
  assert.equal(sameServiceStrict(a, "sürekli yükümlülükler vergilendirme servisi"), true);
});

test("OCR'dan turetilmis madde numaralari isaretlenir", () => {
  const belirsiz = uncertainMaddeNumbers([
    hit({ maddeNo: "21", maddeNoKesin: false }),
    hit({ maddeNo: "22", maddeNoKesin: true }),
  ]);
  assert.deepEqual([...belirsiz], ["21"]);
});
