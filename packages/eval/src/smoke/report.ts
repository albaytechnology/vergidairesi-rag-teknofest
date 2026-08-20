import { config } from "@albay/shared";
import type { CheckResult } from "./types.ts";

const LINE = "──────────────────────────────────────────────────────";

/** Basarisiz servisleri duzeltmenin en kisa yolu — rapor sonunda gosterilir. */
function hints(): string[] {
  return [
    "  - Docker servisleri icin: docker compose up -d",
    "  - Ollama icin: .env var mi ve OLLAMA_BASE_URL dogru mu? (cp .env.example .env)",
    `  - Chat modeli icin: ollama pull ${config.OLLAMA_CHAT_MODEL} (Ollama sunucusunda)`,
    `  - Embed modeli icin: ollama pull ${config.OLLAMA_EMBED_MODEL} (Ollama sunucusunda)`,
    "  - API icin: pnpm api",
    "  - Chromium icin: pnpm --filter @albay/letter exec playwright install chromium",
  ];
}

export function printSmokeReport(results: CheckResult[]): void {
  console.log("\n─── Albay RAG — Smoke Test ───────────────────────────");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(20)} ${r.detail}`);
  }
  console.log(LINE);

  const failed = results.filter((r) => !r.ok);
  if (!failed.length) {
    console.log("Tum servisler hazir. Faz 0 altyapisi tamam! 🎉");
    return;
  }
  console.log(`${failed.length} servis basarisiz. Ipuclari:`);
  for (const hint of hints()) console.log(hint);
}
