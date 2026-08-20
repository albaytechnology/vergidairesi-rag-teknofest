/**
 * Chromium yasam dongusu.
 *
 * Tarayici acmak pahali; surec boyunca tek ornek acilip yeniden kullanilir.
 * Ayri dosyada durmasi, PDF uretimini bu tekil durumdan ayirir — sunucunun
 * kapanis kancasi (closeBrowser) da yalnizca burayi bilir.
 */
import type { Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
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
