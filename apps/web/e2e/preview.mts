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
const MARKER = "[E2E-DUZELTME]";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

/** Indirme isteklerinin govdesini yakala — duzeltme gercekten gidiyor mu? */
const requestBodies: Record<string, string> = {};
page.on("request", (r) => {
  if (r.url().includes("/api/response-letter/")) {
    requestBodies[r.url().split("/").pop() ?? ""] = r.postData() ?? "";
  }
});

try {
  // Cevabi yazilmamis bir evrak sec — bos sistemde test edilecek belge olmaz.
  const archive = (await (await page.request.get(`${WEB}/api/archive?durum=pending`)).json()) as {
    documents: { id: string }[];
  };
  const doc = archive.documents[0];
  assert.ok(doc, "Cevap bekleyen evrak yok — önce: pnpm pipeline");

  // Cevap yazisi AYRI bir rota: dogrudan acilabilmesi de sozlesmenin parcasi.
  await page.goto(`${WEB}/documents/${doc.id}/reply`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Taslak üret" }).click();
  await page.waitForSelector("iframe[title='Cevap yazısı önizleme']", { timeout: 600_000 });
  await page.waitForTimeout(1500);

  const editable = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      "iframe[title='Cevap yazısı önizleme']",
    );
    const frameDoc = frame?.contentDocument;
    return {
      metin: frameDoc?.querySelector<HTMLElement>(".metin")?.contentEditable ?? null,
      konu: frameDoc?.querySelector<HTMLElement>(".konu")?.contentEditable ?? null,
    };
  });
  assert.equal(editable.metin, "true", "gövde bloğu düzenlenebilir olmalı (realm hatası?)");
  assert.equal(editable.konu, "true", "konu satırı düzenlenebilir olmalı");

  // Elle duzeltme yap ve iki ciktiya da yansidigini dogrula
  const paragraph = page.frameLocator("iframe[title='Cevap yazısı önizleme']").locator(".metin p").first();
  await paragraph.click();
  await page.keyboard.type(`${MARKER} `);

  // "Onayla ve arşivle" PDF'i disari alan ve evraki arsivde tamamlananlara
  // tasiyan aksiyondur; DOCX ayri bir cikti olarak yaninda durur.
  for (const button of ["DOCX indir", "Onayla ve arşivle"]) {
    const downloaded = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByRole("button", { name: button }).click();
    await downloaded;
  }
  await page.waitForTimeout(400);

  assert.ok(requestBodies["pdf"]?.includes(MARKER), "düzeltme PDF isteğine yansımadı");
  assert.ok(requestBodies["docx"]?.includes(MARKER), "düzeltme DOCX isteğine yansımadı");
  assert.deepEqual(pageErrors, [], "sayfada JS hatası oluştu");

  console.log("✓ önizleme düzenlenebilir ve düzeltme PDF + DOCX çıktılarına yansıyor");
} finally {
  await browser.close();
}
