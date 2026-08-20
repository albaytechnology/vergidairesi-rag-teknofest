import { config } from "@albay/shared";
import { OllamaClient } from "@albay/llm";
import type { Check } from "../types.ts";

/** Uc kontrol de ayni istemciyi paylasir; her biri yeni baglanti acmasin. */
const ollama = new OllamaClient();

/** Ollama etiketleri "ad" ya da "ad:latest" olarak donebilir; ikisi de gecerli. */
function hasModel(models: string[], requested: string): boolean {
  return models.some((model) => model === requested || model === `${requested}:latest`);
}

/** Sunucu ayakta mi ve gereken iki model yuklu mu? */
export const ollamaModelsCheck: Check = {
  name: "Ollama (uzak)",
  async run() {
    const models = await ollama.listModels();
    const missing = [
      !hasModel(models, config.OLLAMA_CHAT_MODEL)
        ? `chat modeli '${config.OLLAMA_CHAT_MODEL}' yok`
        : null,
      !hasModel(models, config.OLLAMA_EMBED_MODEL)
        ? `embed modeli '${config.OLLAMA_EMBED_MODEL}' yok`
        : null,
    ].filter(Boolean);
    const modelList = models.length ? models.join(", ") : "model yok";
    if (missing.length) {
      throw new Error(
        `${missing.join("; ")} — ${config.OLLAMA_BASE_URL} uzerindeki modeller: ${modelList}`,
      );
    }
    return `ayakta — ${config.OLLAMA_BASE_URL} — ${models.length} model: ${modelList}`;
  },
};

/** Turkce ornekle gercek bir embedding uretilebiliyor mu? */
export const embeddingCheck: Check = {
  name: `Embedding (${config.OLLAMA_EMBED_MODEL})`,
  async run() {
    const [vec] = await ollama.embed(["Merhaba dunya, bu bir deneme."]);
    if (!vec || vec.length === 0) throw new Error("bos vektor dondu");
    return `calisiyor — boyut: ${vec.length}`;
  },
};

/** Chat modeli Turkce cevap uretebiliyor mu? */
export const chatCheck: Check = {
  name: `Chat (${config.OLLAMA_CHAT_MODEL})`,
  // Model soguksa ilk cevap uzun surer; varsayilan 8sn burada yetmiyor.
  timeoutMs: 30000,
  async run() {
    const answer = await ollama.chat([
      { role: "user", content: "Tek kelimeyle cevapla: Turkiye'nin baskenti neresi?" },
    ]);
    return `calisiyor — cevap: ${answer.slice(0, 60).replace(/\n/g, " ")}`;
  },
};
