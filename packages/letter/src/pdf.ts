/**
 * HTML → PDF (headless Chromium).
 *
 * Girdi bilerek "model" degil HTML: arayuzde calisan onizleme uzerinde elle
 * duzeltme yapabiliyor ve indirdigi PDF'in ekranda gordugunun aynisi olmasi
 * gerekiyor. Metin secilebilir kalir (goruntu degil gercek PDF metni).
 *
 * GUVENLIK: buraya gelen HTML kullanicinin duzenledigi metindir. Sunucuda
 * tarayici acan bir uc noktada bu, disari istek yaptirmaya (SSRF) veya yerel
 * dosya okumaya calisan bir icerik olabilir. Bu yuzden JavaScript kapali ve
 * belge disindaki TUM ag/dosya istekleri engelli calisir.
 */
import type { Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/** Tarayici pahali; surec boyunca tek ornek acilip yeniden kullanilir. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      try {
        return await chromium.launch({ args: ["--no-sandbox"] });
      } catch (err) {
        browserPromise = null;
        throw new Error(
          "Chromium baslatilamadi. Kurulum: npx playwright install chromium " +
            `(orijinal hata: ${(err as Error).message})`,
        );
      }
    })();
  }
  return browserPromise;
}

export interface PdfOptions {
  /** Baski kenar boslugu — yonetmelik geregi varsayilan her yandan 2,5 cm. */
  margin?: string;
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const kenar = opts.margin ?? "2.5cm";
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    // setContent disindaki her istegi kes: uzak font/gorsel/fetch yok.
    await context.route("**/*", (route) => {
      const url = route.request().url();
      const guvenli = url.startsWith("data:") || url.startsWith("about:");
      return guvenli ? route.continue() : route.abort();
    });

    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: kenar, right: kenar, bottom: kenar, left: kenar },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Smoke testi icin: chromium kurulu mu, aciliyor mu? */
export async function isChromiumReady(): Promise<{ ok: boolean; detail: string }> {
  try {
    const browser = await getBrowser();
    return { ok: true, detail: browser.version() };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close();
}
