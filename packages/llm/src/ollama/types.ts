/** Ollama sohbet API'sine gonderilen mesaj ve cagri secenekleri. */

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
