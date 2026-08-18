/**
 * POST tabanli SSE istemcisi.
 *
 * Tarayicinin EventSource'u yalnizca GET yapabiliyor; /api/chat ise govdesinde
 * soru tasiyan bir POST. Bu yuzden akis fetch + ReadableStream ile okunup SSE
 * cerceveleri ("event: X\ndata: {...}\n\n") elle ayristiriliyor.
 */

import type { LetterDecision } from "./types.ts";

export type ChatEvent =
  | { type: "trace"; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[]; hits: { filename: string; page: number | null }[] }
  | { type: "done"; answer: string }
  /** Sunucu mesaji "cevap yazisi talebi" olarak sinifladi; akis burada biter. */
  | { type: "intent"; karar: LetterDecision | null; gerekce: string | null }
  | { type: "error"; message: string };

export interface ChatStreamInput {
  question: string;
  documentId?: string;
  sessionId?: string;
  /** Niyet siniflandirmasini atla — "normal cevap ver" kacis yolu. */
  skipIntent?: boolean;
  signal?: AbortSignal;
}

export async function* streamChat(input: ChatStreamInput): AsyncGenerator<ChatEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: input.question,
      documentId: input.documentId,
      sessionId: input.sessionId,
      niyetAtla: input.skipIntent,
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    // Hata yolunda sunucu SSE degil JSON dondurur.
    let message = `Sohbet başlatılamadı (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* govde okunamadi — genel mesaj kalir */
    }
    yield { type: "error", message };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Cerceveler bos satirla ayrilir; son parca yarim kalmis olabilir.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }
  } finally {
    // Kullanici sayfadan ayrilirsa okuyucu birakilmali, aksi halde baglanti asili kalir.
    reader.cancel().catch(() => undefined);
  }
}

function parseFrame(frame: string): ChatEvent | null {
  const dataLine = frame
    .split("\n")
    .find((s) => s.startsWith("data:"))
    ?.slice(5)
    .trim();
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine) as ChatEvent;
  } catch {
    return null;
  }
}
