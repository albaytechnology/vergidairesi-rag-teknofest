import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import { streamChat } from "../api/sse.ts";
import { useDocumentContext } from "../shell/DocumentLayout.tsx";
import { LetterPromptCard } from "./LetterPromptCard.tsx";
import type { LetterDecision } from "../api/types.ts";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  /**
   * Sunucu bu mesaji "cevap yazisi talebi" olarak sinifladi. Varsa metin balonu
   * yerine yazi olusturma karti basilir; content o zaman kullanilmaz.
   */
  letter?: { karar: LetterDecision | null; gerekce: string | null };
}

/** Sohbete aticlanmis ek belge. */
interface Attachment {
  name: string;
  path: string;
  status: "uploading" | "processing" | "ready" | "error";
  message?: string;
}

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.pptx,.txt,.md,.html";
const POLL_MS = 2000;
const POLL_LIMIT = 90; // ~3 dk: parse + chunk + analiz + embed

const QUICK_PROMPTS = [
  "Özet çıkar",
  "Yönlendirme neden bu servis?",
  "Onaylayacak şekilde cevap yazısı yaz",
];

/**
 * Belge kapsamli sohbet.
 *
 * Akis SSE ile token token gelir. Sunucu soru/cevap ciftini tek islemde
 * yaziyor; akis yarida kesilirse hicbiri kaydedilmez — bu yuzden istemci
 * tarafinda "iptal edildi" mesajini gecmise EKLEMIYORUZ, ekranda gosterip
 * biraktigimiz sey sunucudakiyle ayni kalsin.
 *
 * Ek belge (atac): oturuma ozel yuklenir ve yalnizca bu sohbette kaynak olur —
 * resmi evrak sayilmaz, servis havuzlarina ve arsive dusmez.
 *
 * Cevap yazisi: sunucu mesaji yazi talebi olarak sinifladiginda "intent" olayi
 * gelir ve RAG cevabi hic uretilmez; yerine sohbete LetterPromptCard dusulur.
 * Kart gecmise YAZILMAZ — sayfa yenilendiginde kaybolur; kalici iz, yazi
 * kaydedildiginde cevap yazisi tarafinda olusur.
 */
export function ChatView() {
  const { doc, chat, sessionId } = useDocumentContext();
  const [messages, setMessages] = useState<Message[]>(() =>
    chat.map((m) => ({ role: m.role, content: m.content, sources: m.sources })),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [traces, setTraces] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, traces]);

  // Ekrandan ayrilirken akisi kes — sunucu istemci koptugunda uretimi durduruyor.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Composer tek satirda baslar, iceriğe gore 120px'e kadar buyur.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const updateAttachment = (path: string, patch: Partial<Attachment>) =>
    setAttachments((current) => current.map((a) => (a.path === path ? { ...a, ...patch } : a)));

  /**
   * Dosyayi oturuma yukler ve ARANABILIR olana kadar yoklar.
   *
   * Oturuma baglama isini WORKER yapiyor (parse isiyle birlikte sessionId
   * geliyor), bu yuzden burada yalnizca hattin bitmesini yokluyoruz.
   *
   * Hazirlik olcutu "parse edildi" DEGIL, "embed edildi": parse bayragi hattin
   * ilk adiminda set ediliyor ve erken "hazir" demek, kullanicinin heniz
   * indekslenmemis belgeye soru sorup "bu bilgi belgede bulunamadi" cevabi
   * almasina yol aciyordu.
   */
  async function attach(file: File) {
    setError(null);
    const pending: Attachment = {
      name: file.name,
      path: `bekliyor:${file.name}`,
      status: "uploading",
    };
    setAttachments((a) => [...a, pending]);
    try {
      const result = await api.sessionUpload(sessionId, file);
      setAttachments((current) =>
        current.map((a) =>
          a.path === pending.path ? { ...a, path: result.path, status: "processing" } : a,
        ),
      );
      for (let i = 0; i < POLL_LIMIT; i++) {
        await wait(POLL_MS);
        const status = await api.uploadStatus([result.path]).catch(() => null);
        const stage = status?.durumlar[0]?.asama;
        if (stage === "hazir") {
          updateAttachment(result.path, { status: "ready" });
          return;
        }
        if (stage === "hata") {
          updateAttachment(result.path, { status: "error", message: "belge işlenemedi" });
          return;
        }
      }
      updateAttachment(result.path, { status: "error", message: "işlenmesi çok uzun sürdü" });
    } catch (err) {
      setAttachments((current) =>
        current.map((a) =>
          a.path === pending.path
            ? { ...a, status: "error", message: err instanceof Error ? err.message : "yüklenemedi" }
            : a,
        ),
      );
    }
  }

  async function send(text?: string, opts: { skipIntent?: boolean } = {}) {
    const question = (text ?? input).trim();
    if (!question || streaming !== null) return;

    setInput("");
    setError(null);
    setTraces([]);
    setMessages((m) => [...m, { role: "user", content: question }]);
    setStreaming("");

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    let sources: string[] = [];
    let letter: Message["letter"];

    try {
      for await (const ev of streamChat({
        question,
        documentId: doc.id,
        // Yalnizca hazir ek varsa gonder; aksi halde sunucu bos bir kapsam arar.
        sessionId: attachments.some((a) => a.status === "ready") ? sessionId : undefined,
        skipIntent: opts.skipIntent,
        signal: controller.signal,
      })) {
        if (ev.type === "trace") setTraces((t) => [...t, ev.message]);
        else if (ev.type === "sources") sources = ev.sources;
        else if (ev.type === "token") {
          answer += ev.text;
          setStreaming(answer);
        } else if (ev.type === "done") answer = ev.answer;
        else if (ev.type === "intent") letter = { karar: ev.karar, gerekce: ev.gerekce };
        else if (ev.type === "error") setError(ev.message);
      }
      if (letter) {
        setMessages((m) => [...m, { role: "assistant", content: "", letter }]);
      } else if (answer) {
        setMessages((m) => [...m, { role: "assistant", content: answer, sources }]);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Akış kesildi");
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-7 pt-[26px] pb-2">
        <div className="mx-auto flex max-w-[760px] flex-col gap-[18px]">
          <div className="flex flex-wrap justify-center gap-2 pb-1.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={streaming !== null}
                onClick={() => void send(p)}
                className="rounded-full border border-cizgi-2 bg-white px-3 py-[7px] text-xs font-medium text-govde transition-colors hover:border-gib hover:text-gib disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          {messages.length === 0 && streaming === null && (
            <p className="pt-2 text-center text-[12.5px] leading-relaxed text-silik">
              Bu evrak hakkında soru sorun — cevaplar yalnızca belgenin içeriğine dayanır.
              <br />
              Ek bir mevzuat veya belge için ataç düğmesini kullanabilirsiniz.
            </p>
          )}

          {messages.map((m, i) =>
            m.letter ? (
              <LetterPromptCard
                key={i}
                docId={doc.id}
                suggestedDecision={m.letter.karar}
                suggestedReason={m.letter.gerekce}
                defaultRecipient={doc.entities?.kisiKurumlar[0] ?? ""}
                onDismiss={() => setMessages((list) => list.filter((_, k) => k !== i))}
                onPlainAnswer={() => {
                  // Karti ve onu doguran soruyu geri al, ayni soruyu bu kez
                  // siniflandirmayi atlayarak duz cevap icin yeniden gonder.
                  const question = messages[i - 1]?.content ?? "";
                  setMessages((list) => list.slice(0, Math.max(0, i - 1)));
                  if (question) void send(question, { skipIntent: true });
                }}
              />
            ) : (
              <Bubble key={i} message={m} />
            ),
          )}

          {traces.length > 0 && streaming !== null && (
            <div className="space-y-0.5 text-[11px] text-soluk">
              {traces.map((t, i) => (
                <div key={i}>· {t}</div>
              ))}
            </div>
          )}

          {streaming !== null && (
            <Bubble message={{ role: "assistant", content: streaming || "yazıyor…" }} streaming />
          )}

          {error && (
            <div className="rounded-lg border border-uyari-cizgi bg-uyari-zemin px-3 py-2 text-[11.5px] text-uyari">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="px-7 pt-3 pb-[22px]">
        {attachments.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-[760px] flex-wrap gap-1.5">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.path}
                attachment={a}
                onRemove={() => setAttachments((m) => m.filter((x) => x.path !== a.path))}
              />
            ))}
          </div>
        )}

        <div className="mx-auto flex max-w-[760px] items-end gap-2.5 rounded-[14px] border border-cizgi-2 bg-white py-2.5 pr-2.5 pl-3 shadow-composer">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) void attach(f);
              ev.target.value = "";
            }}
          />
          <button
            type="button"
            title="Referans belge ekle"
            aria-label="Referans belge ekle"
            onClick={() => fileRef.current?.click()}
            className="flex h-[34px] w-[34px] flex-[0_0_34px] items-center justify-center rounded-[9px] border border-cizgi bg-panel text-ikincil transition-colors hover:border-cizgi-5"
          >
            <PaperclipIcon />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Belgeye dair bir şey sorun… (Enter ile gönder)"
            className="max-h-[120px] min-w-0 flex-1 resize-none border-none bg-transparent py-2 text-[13.5px] leading-[1.5] outline-none"
          />
          {streaming !== null ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-[9px] border border-cizgi-2 bg-white px-4 py-2 text-[13px] font-semibold text-govde transition-colors hover:border-cizgi-5"
            >
              Durdur
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim()}
              className={`rounded-[9px] px-4 py-[9px] text-[13px] font-semibold text-white transition-colors ${
                input.trim() ? "bg-gib hover:bg-gib-koyu" : "bg-gib-solgun"
              }`}
            >
              Gönder
            </button>
          )}
        </div>
        <div className="mx-auto mt-2 max-w-[760px] text-center text-[11px] text-soluk">
          Yanıtlar kaynak belgeye dayandırılır — karar öncesi kaynağı kontrol edin.
        </div>
      </div>
    </>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const busy = attachment.status === "uploading" || attachment.status === "processing";
  const tone =
    attachment.status === "ready"
      ? "border-onay/25 bg-onay-zemin text-onay"
      : attachment.status === "error"
        ? "border-uyari-cizgi bg-uyari-zemin text-uyari"
        : "border-cizgi bg-panel text-ikincil";
  return (
    <span className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${tone}`}>
      {busy && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      <span className="max-w-[220px] truncate">{attachment.name}</span>
      <span className="opacity-70">
        {attachment.status === "uploading" && "yükleniyor"}
        {attachment.status === "processing" && "işleniyor"}
        {attachment.status === "ready" && "hazır"}
        {attachment.status === "error" && (attachment.message ?? "hata")}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Eki kaldır"
        className="ml-0.5 opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  );
}

function PaperclipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/**
 * Modelin yazdigi **kalin** isaretlemesini gorunur kilar.
 *
 * Tam bir markdown isleyicisi bilerek yok: cevaplar duz resmi metin ve
 * dangerouslySetInnerHTML'den kacinmak istiyoruz. Yalnizca ** ** ayristirilir,
 * geri kalan her sey React tarafindan metin olarak basilir — enjeksiyon yok.
 */
function RichText({ raw }: { raw: string }) {
  const parts = raw.split(/\*\*(.+?)\*\*/gs);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p))}</>;
}

function Bubble({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[76%] rounded-[14px_14px_4px_14px] bg-metin px-4 py-3 text-white"
            : "max-w-[88%] rounded-[14px_14px_14px_4px] border border-cizgi bg-white px-4 py-3.5 text-metin-2 shadow-balon"
        }
      >
        <div
          className={`text-[13.5px] leading-[1.6] whitespace-pre-wrap text-pretty ${
            streaming ? "animate-pulse" : ""
          }`}
        >
          <RichText raw={message.content} />
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-cizgi-3 pt-2.5">
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-[.08em] text-soluk uppercase">
              Kaynaklar
            </div>
            <div className="flex flex-col gap-1.5">
              {message.sources.map((s) => (
                <span
                  key={s}
                  className="rounded-[7px] border border-cizgi-3 bg-zemin px-[9px] py-1.5 text-[11.5px] text-ikincil"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
