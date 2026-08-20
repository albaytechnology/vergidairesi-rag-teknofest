import { config } from "@albay/shared";
import { ndjsonContentChunks } from "./stream.ts";
import type { ChatMessage, ChatOptions } from "./types.ts";

/** Uzak Ollama sunucusuna ince, bagimliliksiz bir client. */
export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = config.OLLAMA_BASE_URL) {
    // Sondaki "/" karakterlerini temizle — "http://host:11434/" girilse de calissin
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * /api/chat govdesi.
   *
   * NOT: num_ctx bilerek gonderilmiyor — Ollama'nin varsayilani bu kurulumda
   * 12k+ token isliyor; elle 8192 vermek prompt'u BASTAN kirpiyor ve sistem
   * mesajini dusuruyor. Olcum yapilmadan bu deger set edilmemeli.
   */
  private chatBody(messages: ChatMessage[], opts: ChatOptions, stream: boolean): string {
    return JSON.stringify({
      model: opts.model ?? config.OLLAMA_CHAT_MODEL,
      messages,
      stream,
      format: opts.format,
      options: { temperature: opts.temperature ?? 0.2 },
    });
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.chatBody(messages, opts, false),
    });
    if (!res.ok) {
      throw new Error(`Ollama chat hatasi: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message: { content: string } };
    return data.message.content;
  }

  /** Token token yanit akisi (SSE icin). */
  async *chatStream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.chatBody(messages, opts, true),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat hatasi: ${res.status} ${await res.text()}`);
    }
    yield* ndjsonContentChunks(res.body);
  }

  async embed(texts: string[], model?: string): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model ?? config.OLLAMA_EMBED_MODEL,
        input: texts,
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embed hatasi: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`Ollama erisim hatasi: ${res.status}`);
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map((m) => m.name);
  }
}
