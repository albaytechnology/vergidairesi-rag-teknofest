/**
 * Onizleme sozlesmesinin tarayici testi.
 *
 * NEDEN VAR: cevap yazisi onizlemesi bir iframe icinde calisiyor ve iframe
 * KENDI JS realm'ine sahip. Ilk surumde duzenlemeyi acan kod `el instanceof
 * HTMLElement` kontrolu yapiyordu; iframe icindeki dugumler ana pencerenin
 * HTMLElement'inden turemedigi icin bu kontrol her zaman false donuyor ve
 * onizleme SESSIZCE salt okunur kaliyordu. Tip denetimi ve birim testleri bunu
 * yakalayamaz — yalnizca gercek bir tarayici yakalar.
 *
 * Calistir (API + web + Ollama ayakta olmali):  pnpm run web:e2e
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const ISARET = "[E2E-DUZELTME]";

const tarayici = await chromium.launch();
const sayfa = await tarayici.newPage({ viewport: { width: 1440, height: 900 } });
const sayfaHatalari: string[] = [];
sayfa.on("pageerror", (e) => sayfaHatalari.push(e.message));

/** Indirme isteklerinin govdesini yakala — duzeltme gercekten gidiyor mu? */
const govdeler: Record<string, string> = {};
sayfa.on("request", (r) => {
  if (r.url().includes("/api/response-letter/")) {
    govdeler[r.url().split("/").pop() ?? ""] = r.postData() ?? "";
  }
});

try {
  // Cevabi yazilmamis bir evrak sec — bos sistemde test edilecek belge olmaz.
  const arsiv = (await (await sayfa.request.get(`${WEB}/api/archive?durum=pending`)).json()) as {
    documents: { id: string }[];
  };
  const belge = arsiv.documents[0];
  assert.ok(belge, "Cevap bekleyen evrak yok — önce: pnpm pipeline");

  // Cevap yazisi AYRI bir rota: dogrudan acilabilmesi de sozlesmenin parcasi.
  await sayfa.goto(`${WEB}/evrak/${belge.id}/cevap-yazisi`, { waitUntil: "networkidle" });

  await sayfa.getByRole("button", { name: "Taslak üret" }).click();
  await sayfa.waitForSelector("iframe[title='Cevap yazısı önizleme']", { timeout: 600_000 });
  await sayfa.waitForTimeout(1500);

  const editable = await sayfa.evaluate(() => {
    const cerceve = document.querySelector<HTMLIFrameElement>(
      "iframe[title='Cevap yazısı önizleme']",
    );
    const belge = cerceve?.contentDocument;
    return {
      metin: belge?.querySelector<HTMLElement>(".metin")?.contentEditable ?? null,
      konu: belge?.querySelector<HTMLElement>(".konu")?.contentEditable ?? null,
    };
  });
  assert.equal(editable.metin, "true", "gövde bloğu düzenlenebilir olmalı (realm hatası?)");
  assert.equal(editable.konu, "true", "konu satırı düzenlenebilir olmalı");

  // Elle duzeltme yap ve iki ciktiya da yansidigini dogrula
  const paragraf = sayfa.frameLocator("iframe[title='Cevap yazısı önizleme']").locator(".metin p").first();
  await paragraf.click();
  await sayfa.keyboard.type(`${ISARET} `);

  // "Onayla ve arşivle" PDF'i disari alan ve evraki arsivde tamamlananlara
  // tasiyan aksiyondur; DOCX ayri bir cikti olarak yaninda durur.
  for (const dugme of ["DOCX indir", "Onayla ve arşivle"]) {
    const indirme = sayfa.waitForEvent("download", { timeout: 120_000 });
    await sayfa.getByRole("button", { name: dugme }).click();
    await indirme;
  }
  await sayfa.waitForTimeout(400);

  assert.ok(govdeler["pdf"]?.includes(ISARET), "düzeltme PDF isteğine yansımadı");
  assert.ok(govdeler["docx"]?.includes(ISARET), "düzeltme DOCX isteğine yansımadı");
  assert.deepEqual(sayfaHatalari, [], "sayfada JS hatası oluştu");

  console.log("✓ önizleme düzenlenebilir ve düzeltme PDF + DOCX çıktılarına yansıyor");
} finally {
  await tarayici.close();
}
