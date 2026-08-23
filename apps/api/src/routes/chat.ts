import type { FastifyInstance, FastifyReply } from "fastify";
import {
  askStream,
  classifyChatIntent,
  composeLetterReason,
  type ChatEvent,
  type DocumentRecord,
} from "@albay/agents";
import {
  appendChatExchange,
  getChatHistory,
  getDocumentDetail,
  sessionDocumentIds,
} from "@albay/ingestion";
import type { DocumentDetail } from "@albay/ingestion";
import type { LetterDecision } from "@albay/shared";

interface ChatBody {
  question: string;
  /** Verilirse sohbet o belgeye kilitlenir; yoksa korpus geneli aranir. */
  documentId?: string;
  /** Oturuma ozel yuklenen ek belgeleri de kapsama almak icin. */
  sessionId?: string;
  /** true ise niyet siniflandirmasi atlanir, mesaj duz soru gibi islenir. */
  niyetAtla?: boolean;
}

/**
 * Telde giden olaylar.
 *
 * "intent" askStream'in urettigi bir sey degil, ROTANIN kararidir; bu yuzden
 * @albay/agents'in ChatEvent sozlesmesine karistirilmiyor.
 */
type SseEvent =
  | ChatEvent
  | { type: "intent"; karar: LetterDecision | null; gerekce: string | null };

/**
 * SSE chat.
 *
 * Olay tipleri: trace | token | sources | done | error | intent
 * "intent" olayi cevap yazisi talebinde yayinlanir ve akis orada biter — arayuz
 * duz metin bir cevap yerine yazi olusturma alanini acar.
 * Akis yalnizca BELGE KAPSAMLI sohbette token token gelir; korpus genelinde
 * multi-agent graph calistigi icin ara adimlar trace olarak bildirilir ve
 * cevap tek parca yayinlanir (graph icinde token akisi yok).
 */
export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatBody }>("/api/chat", async (req, reply) => {
    const { question, documentId, sessionId, niyetAtla } = req.body ?? {};
    if (!question?.trim()) return reply.code(400).send({ error: "question zorunlu" });

    // Detay bir kez okunur: hem varlik kontrolu hem de sohbete verilecek
    // sistem kaydi (ozet, cikarilan bilgiler, yonlendirme karari) ayni satirdan gelir.
    const doc = documentId ? await getDocumentDetail(documentId) : null;
    if (documentId && !doc) {
      return reply.code(404).send({ error: "Belge bulunamadi" });
    }

    startSse(reply);

    /*
     * Niyet once bakilir: calisan resmi bir yazi istiyorsa RAG cevabi uretmenin
     * anlami yok — arayuz yazi olusturma alanini acacak. Siniflandirici hataya
     * acik (basarisizlikta "soru" doner), bu yuzden try/catch gerekmiyor.
     */
    if (!niyetAtla) {
      const niyet = await classifyChatIntent(question);
      if (niyet.tur === "cevap_yazisi") {
        sendSse(reply, { type: "trace", message: "niyet: cevap yazisi" });

        /*
         * Gerekce ayri bir adimda ve KAYDI GOREREK yaziliyor. Siniflandirici
         * yalnizca mesaji goruyor; "eksik bilgiler isiginda reddet" gibi bir
         * talepte elde "eksik bilgi sunulmus olmasi" gibi dogru ama bos bir
         * ibare kaliyordu. Hangi bilgilerin eksik oldugu sistem kaydinda yazili.
         */
        const gerekce = doc
          ? await composeLetterReason({
              question,
              karar: niyet.karar,
              record: toRecord(doc),
              fallback: niyet.gerekce,
            })
          : niyet.gerekce;

        sendSse(reply, { type: "intent", karar: niyet.karar, gerekce });
        /*
         * Gecmise YAZILIR. Onceden yazilmiyordu ("kart bir eylem alani, kayda
         * deger bir cevap degil") ama bu, calisanin SORUSUNU da siliyordu:
         * sayfa yenilendiginde "reddedecek bir cevap yazisi yaz" mesaji hic
         * sorulmamis gibi oluyordu. Asistan mesaji metin yerine kart oldugu
         * icin icerik kisa bir kayit cumlesi, kartin kendisi letter_intent'te.
         */
        if (documentId) {
          await appendChatExchange({
            documentId,
            question,
            answer: "Cevap yazısı oluşturma alanı açıldı.",
            letterIntent: { karar: niyet.karar ?? null, gerekce: gerekce ?? null },
          });
        }
        reply.raw.end();
        return reply;
      }
    }

    // Cok turlu hafiza: gecmis yalnizca belge bazli sohbette tutulur —
    // korpus genelinde kalici bir "oturum" kavrami yok.
    const history = documentId
      ? (await getChatHistory(documentId)).map((m) => ({ role: m.role, content: m.content }))
      : [];
    const extraDocIds =
      sessionId && documentId
        ? (await sessionDocumentIds(sessionId)).filter((id) => id !== documentId)
        : [];

    let cevap = "";
    let kaynaklar: string[] = [];
    try {
      for await (const ev of askStream(question, {
        docId: documentId,
        extraDocIds,
        history,
        record: doc ? toRecord(doc) : undefined,
      })) {
        if (ev.type === "done") cevap = ev.answer;
        if (ev.type === "sources") kaynaklar = ev.sources;
        sendSse(reply, ev);
        // Istemci baglantiyi kaparsa uretimi surdurmenin anlami yok
        if (reply.raw.destroyed) break;
      }
    } catch (err) {
      sendSse(reply, { type: "error", message: (err as Error).message });
    }

    // Soru ve cevap birlikte yazilir; akis yarida kesilirse hicbiri yazilmaz,
    // boylece gecmiste cevapsiz kullanici mesaji birikmez.
    if (documentId && cevap) {
      await appendChatExchange({ documentId, question, answer: cevap, sources: kaynaklar });
    }
    reply.raw.end();
    return reply;
  });

  /** Belgenin sohbet gecmisi (sayfa yenilendiginde geri yuklemek icin). */
  app.get<{ Params: { id: string } }>("/api/documents/:id/chat", async (req) => {
    return { messages: await getChatHistory(req.params.id, 100) };
  });
}

/**
 * Belge satirini sohbetin gorecegi sistem kaydina cevirir.
 *
 * Arayuzdeki detay panelinin bastigi alanlarin AYNISI: calisan panelde bir sey
 * okuyup sohbete sordugunda iki tarafin ayni bilgiye bakmasi gerekiyor.
 */
function toRecord(doc: DocumentDetail): DocumentRecord {
  return {
    filename: doc.filename,
    konu: doc.doc_subject,
    ozet: doc.doc_summary_long,
    docType: doc.doc_type,
    entities: doc.extracted_entities,
    yasamDongusu: doc.lifecycle_status,
    eksikler: doc.gap_findings,
    routing: {
      birim: doc.routed_birim,
      servis: doc.routed_service,
      guvenSkoru: doc.routing_confidence,
      gerekce: doc.routing_reasoning,
      maddeler: doc.routing_regulation_refs ?? [],
    },
  };
}

function startSse(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Ters vekil arkasinda tamponlama akisi oldurur
    "X-Accel-Buffering": "no",
  });
  reply.raw.flushHeaders?.();
}

function sendSse(reply: FastifyReply, event: SseEvent): void {
  reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
