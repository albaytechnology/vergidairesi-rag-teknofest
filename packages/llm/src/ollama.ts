import { config } from "@albay/shared";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  /** JSON cikti zorlamak icin "json" veya bir JSON Schema nesnesi. */
  format?: "json" | Record<string, unknown>;
}

/** Uzak Ollama sunucusuna ince, bagimliliksiz bir client. */
export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = config.OLLAMA_BASE_URL) {
    // Sondaki "/" karakterlerini temizle — "http://host:11434/" girilse de calissin
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? config.OLLAMA_CHAT_MODEL,
        messages,
        stream: false,
        format: opts.format,
        options: { temperature: opts.temperature ?? 0.2 },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama chat hatasi: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message: { content: string } };
    return data.message.content;
  }

  /**
   * Token token yanit akisi (SSE icin).
   *
   * NOT: num_ctx bilerek gonderilmiyor — Ollama'nin varsayilani bu kurulumda
   * 12k+ token isliyor; elle 8192 vermek prompt'u BASTAN kirpiyor ve sistem
   * mesajini dusuruyor. Olcum yapilmadan bu deger set edilmemeli.
   */
  async *chatStream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? config.OLLAMA_CHAT_MODEL,
        messages,
        stream: true,
        format: opts.format,
        options: { temperature: opts.temperature ?? 0.2 },
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat hatasi: ${res.status} ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Ollama NDJSON dondurur; son satir yarim kalmis olabilir, tamponda tut.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parcali = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
          };
          if (parcali.error) throw new Error(`Ollama: ${parcali.error}`);
          const parca = parcali.message?.content;
          if (parca) yield parca;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
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
