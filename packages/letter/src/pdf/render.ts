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
import { getBrowser } from "./browser.ts";

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
