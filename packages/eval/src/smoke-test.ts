/**
 * Faz 0 smoke test — tum altyapi servislerinin ayakta oldugunu dogrular.
 * Calistir: pnpm smoke
 */
import { config } from "@albay/shared";
import { OllamaClient } from "@albay/llm";
import { QdrantClient } from "@qdrant/js-client-rest";
import { Redis } from "ioredis";
import pg from "pg";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`zaman asimi (${ms}ms)`)), ms),
    ),
  ]);
}

async function check(
  name: string,
  fn: () => Promise<string>,
): Promise<CheckResult> {
  try {
    const detail = await withTimeout(fn());
    return { name, ok: true, detail };
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message };
  }
}

const results: CheckResult[] = [];

function hasModel(models: string[], requested: string): boolean {
  return models.some((model) => model === requested || model === `${requested}:latest`);
}

// 1. Qdrant
results.push(
  await check("Qdrant", async () => {
    const client = new QdrantClient({ url: config.QDRANT_URL });
    const cols = await client.getCollections();
    return `ayakta — ${cols.collections.length} collection`;
  }),
);

// 2. Redis
results.push(
  await check("Redis", async () => {
    const redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on("error", () => {}); // gurultulu log'u sustur; hata zaten yakalanacak
    await redis.connect();
    const pong = await redis.ping();
    redis.disconnect();
    return `ayakta — ${pong}`;
  }),
);

// 3. Postgres
results.push(
  await check("Postgres", async () => {
    const client = new pg.Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    const r = await client.query("SELECT version()");
    await client.end();
    return `ayakta — ${String(r.rows[0]?.version).split(" on ")[0]}`;
  }),
);

// 4. Docling
results.push(
  await check("Docling", async () => {
    const res = await fetch(`${config.DOCLING_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return "ayakta";
  }),
);

// 5. Ollama — model listesi
const ollama = new OllamaClient();
results.push(
  await check("Ollama (uzak)", async () => {
    const models = await ollama.listModels();
    const hasChat = hasModel(models, config.OLLAMA_CHAT_MODEL);
    const hasEmbed = hasModel(models, config.OLLAMA_EMBED_MODEL);
    const missing = [
      !hasChat ? `chat modeli '${config.OLLAMA_CHAT_MODEL}' yok` : null,
      !hasEmbed ? `embed modeli '${config.OLLAMA_EMBED_MODEL}' yok` : null,
    ].filter(Boolean);
    const modelList = models.length ? models.join(", ") : "model yok";
    if (missing.length) {
      throw new Error(
        `${missing.join("; ")} — ${config.OLLAMA_BASE_URL} uzerindeki modeller: ${modelList}`,
      );
    }
    return `ayakta — ${config.OLLAMA_BASE_URL} — ${models.length} model: ${modelList}`;
  }),
);

// 6. Embedding — Turkce ornek
results.push(
  await check(`Embedding (${config.OLLAMA_EMBED_MODEL})`, async () => {
    const [vec] = await ollama.embed(["Merhaba dunya, bu bir deneme."]);
    if (!vec || vec.length === 0) throw new Error("bos vektor dondu");
    return `calisiyor — boyut: ${vec.length}`;
  }),
);

// 7. Chat — Qwen Turkce
results.push(
  await check(`Chat (${config.OLLAMA_CHAT_MODEL})`, async () => {
    const answer = await withTimeout(
      ollama.chat([
        { role: "user", content: "Tek kelimeyle cevapla: Turkiye'nin baskenti neresi?" },
      ]),
      30000,
    );
    return `calisiyor — cevap: ${answer.slice(0, 60).replace(/\n/g, " ")}`;
  }),
);

// 8. API (Faz 5b) — calismiyorsa uyari, hata degil: CLI akislari API'siz de calisir
results.push(
  await check("API", async () => {
    const res = await fetch(`http://${config.API_HOST}:${config.API_PORT}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `ayakta — :${config.API_PORT}`;
  }),
);

// 9. Chromium (Faz 5c) — cevap yazisinin PDF'i bununla uretiliyor
results.push(
  await check("Chromium (PDF)", async () => {
    const { isChromiumReady, closeBrowser } = await import("@albay/letter");
    const durum = await isChromiumReady();
    await closeBrowser();
    if (!durum.ok) throw new Error(durum.detail);
    return `kurulu — ${durum.detail}`;
  }),
);

// Rapor
console.log("\n─── Albay RAG — Smoke Test ───────────────────────────");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(20)} ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log("──────────────────────────────────────────────────────");
if (failed.length) {
  console.log(`${failed.length} servis basarisiz. Ipuclari:`);
  console.log("  - Docker servisleri icin: docker compose up -d");
  console.log("  - Ollama icin: .env var mi ve OLLAMA_BASE_URL dogru mu? (cp .env.example .env)");
  console.log(`  - Chat modeli icin: ollama pull ${config.OLLAMA_CHAT_MODEL} (Ollama sunucusunda)`);
  console.log(`  - Embed modeli icin: ollama pull ${config.OLLAMA_EMBED_MODEL} (Ollama sunucusunda)`);
  console.log("  - API icin: pnpm api");
  console.log("  - Chromium icin: pnpm --filter @albay/letter exec playwright install chromium");
  process.exit(1);
}
console.log("Tum servisler hazir. Faz 0 altyapisi tamam! 🎉");
