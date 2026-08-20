import type { Check } from "../types.ts";

/** Faz 5c — cevap yazisinin PDF'i Chromium ile uretiliyor. */
export const chromiumCheck: Check = {
  name: "Chromium (PDF)",
  async run() {
    // Dinamik import: playwright yalnizca bu kontrol calisirken yuklensin,
    // kurulu degilse smoke testin geri kalani yine de kossun.
    const { isChromiumReady, closeBrowser } = await import("@albay/letter");
    const durum = await isChromiumReady();
    await closeBrowser();
    if (!durum.ok) throw new Error(durum.detail);
    return `kurulu — ${durum.detail}`;
  },
};
