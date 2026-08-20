/**
 * Belge bazli, cok turlu, akisli sohbet (Faz 5b).
 *
 * ask() (graph/) korpus genelinde calisan tam multi-agent akis; servis
 * calisaninin bir evrak uzerinde konusmasi ise farkli bir problem:
 *   - retrieval o BELGEYLE sinirli (router/entity/docfinder ayrimina gerek yok)
 *   - onceki mesajlar baglamda olmali
 *   - yanit token token akmali
 *
 * Bu yuzden ayri bir yol; ama ayni yapi taslarini kullanir (hybridSearch,
 * buildContext, COMMON_RULES, isNotFoundAnswer). Belge kapsami verilmediginde
 * tam graph'a (ask) devredilir — paralel bir sistem kurulmaz.
 */
import { buildContext, uniqueSources } from "../common/context.ts";
import { ollama } from "../common/ollama.ts";
import { ask } from "../graph/build.ts";
import { DOCUMENT_CHAT_PROMPT } from "./prompts.ts";
import { searchInDocuments } from "./retrieve.ts";
import type { AskStreamOptions, ChatEvent, ChatTurn } from "./types.ts";

const MAX_HISTORY = 8;

/**
 * Akisli sohbet. Belge kapsami varsa dogrudan o belgeden cevaplar; yoksa
 * tam graph'i calistirip sonucu tek parca halinde yayinlar (graph icinde
 * token akisi yok — ara adimlar trace olarak bildirilir).
 */
export async function* askStream(
  question: string,
  opts: AskStreamOptions = {},
): AsyncGenerator<ChatEvent> {
  try {
    if (!opts.docId) {
      yield { type: "trace", message: "korpus genelinde arama (multi-agent graph)" };
      const sonuc = await ask(question);
      for (const t of sonuc.trace) yield { type: "trace", message: t };
      yield { type: "sources", sources: sonuc.sources, hits: [] };
      yield { type: "token", text: sonuc.answer };
      yield { type: "done", answer: sonuc.answer };
      return;
    }

    const hits = await searchInDocuments(
      question,
      [opts.docId, ...(opts.extraDocIds ?? [])],
      opts.topK ?? 6,
    );

    yield { type: "trace", message: `retrieve → ${hits.length} parca (belge kapsamli)` };

    if (!hits.length) {
      const cevap = "Bu bilgi belgede bulunamadi.";
      yield { type: "token", text: cevap };
      yield { type: "done", answer: cevap };
      return;
    }

    yield {
      type: "sources",
      sources: uniqueSources(hits),
      hits: hits.map((h) => ({ filename: h.filename, page: h.page })),
    };

    const messages = [
      { role: "system" as const, content: DOCUMENT_CHAT_PROMPT },
      ...gecmisiKirp(opts.history ?? []),
      {
        role: "user" as const,
        content: `Soru: ${question}\n\nBelge parcalari:\n${buildContext(hits)}`,
      },
    ];

    let cevap = "";
    for await (const parca of ollama.chatStream(messages, { temperature: 0.2 })) {
      cevap += parca;
      yield { type: "token", text: parca };
    }
    yield { type: "done", answer: cevap };
  } catch (err) {
    yield { type: "error", message: (err as Error).message };
  }
}

/** Akissiz kullanim (REST, eval) — ayni yolu tuketip tek cevap dondurur. */
export async function askDocument(
  question: string,
  opts: AskStreamOptions = {},
): Promise<{ answer: string; sources: string[]; trace: string[] }> {
  let answer = "";
  let sources: string[] = [];
  const trace: string[] = [];
  for await (const ev of askStream(question, opts)) {
    if (ev.type === "trace") trace.push(ev.message);
    else if (ev.type === "sources") sources = ev.sources;
    else if (ev.type === "done") answer = ev.answer;
    else if (ev.type === "error") throw new Error(ev.message);
  }
  return { answer, sources, trace };
}

/** Son N turu al — baglam penceresini gecmisle doldurmamak icin. */
function gecmisiKirp(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY);
}
