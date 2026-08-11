/**
 * POST tabanli SSE istemcisi.
 *
 * Tarayicinin EventSource'u yalnizca GET yapabiliyor; /api/chat ise govdesinde
 * soru tasiyan bir POST. Bu yuzden akis fetch + ReadableStream ile okunup SSE
 * cerceveleri ("event: X\ndata: {...}\n\n") elle ayristiriliyor.
 */

export type ChatEvent =
  | { type: "trace"; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[]; hits: { filename: string; page: number | null }[] }
  | { type: "done"; answer: string }
  | { type: "error"; message: string };

export interface ChatStreamInput {
  question: string;
  documentId?: string;
  sessionId?: string;
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
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    // Hata yolunda sunucu SSE degil JSON dondurur.
    let mesaj = `Sohbet başlatılamadı (HTTP ${res.status})`;
    try {
      const govde = (await res.json()) as { error?: string };
      if (govde.error) mesaj = govde.error;
    } catch {
      /* govde okunamadi — genel mesaj kalir */
    }
    yield { type: "error", message: mesaj };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let tampon = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tampon += decoder.decode(value, { stream: true });

      // Cerceveler bos satirla ayrilir; son parca yarim kalmis olabilir.
      const cerceveler = tampon.split("\n\n");
      tampon = cerceveler.pop() ?? "";
      for (const cerceve of cerceveler) {
        const olay = cerceveyiCoz(cerceve);
        if (olay) yield olay;
      }
    }
  } finally {
    // Kullanici sayfadan ayrilirsa okuyucu birakilmali, aksi halde baglanti asili kalir.
    reader.cancel().catch(() => undefined);
  }
}

function cerceveyiCoz(cerceve: string): ChatEvent | null {
  const dataSatiri = cerceve
    .split("\n")
    .find((s) => s.startsWith("data:"))
    ?.slice(5)
    .trim();
  if (!dataSatiri) return null;
  try {
    return JSON.parse(dataSatiri) as ChatEvent;
  } catch {
    return null;
  }
}
