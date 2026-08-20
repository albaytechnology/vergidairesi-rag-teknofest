/**
 * Ollama'nin akis (stream) yaniti NDJSON gelir: her satir bir JSON nesnesi,
 * ama bir ag paketi satirin ortasinda bitebilir. Bu dosya o tampon isini
 * yalniz basina yapar; client.ts yalnizca metin parcalarini gorur.
 */

interface StreamChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

/** NDJSON govdesini cozup yalnizca uretilen metin parcalarini yayinlar. */
export async function* ndjsonContentChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Son satir yarim kalmis olabilir, tamponda tut.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parcali = JSON.parse(trimmed) as StreamChunk;
        if (parcali.error) throw new Error(`Ollama: ${parcali.error}`);
        const parca = parcali.message?.content;
        if (parca) yield parca;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
