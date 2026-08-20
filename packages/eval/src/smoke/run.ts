import type { Check, CheckResult } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Askida kalan baglantilari kesin sureyle sonlandirir.
 * Zaman asimi olmadan dusmus bir servis butun smoke testi kilitler.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`zaman asimi (${ms}ms)`)), ms),
    ),
  ]);
}

async function runCheck(check: Check): Promise<CheckResult> {
  try {
    const detail = await withTimeout(check.run(), check.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return { name: check.name, ok: true, detail };
  } catch (err) {
    return { name: check.name, ok: false, detail: (err as Error).message };
  }
}

/**
 * Kontrolleri sirayla calistirir.
 *
 * Sirali kosum bilerek: paralel gidilse hangi servisin yavasladigi
 * anlasilmaz, ustelik ayni Ollama sunucusuna es zamanli istek atilir.
 * Hicbir hata kosumu durdurmaz — rapor her zaman butun servisleri gosterir.
 */
export async function runChecks(checks: Check[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(check));
  }
  return results;
}
