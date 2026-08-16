import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import { streamChat } from "../api/sse.ts";
import { useEvrak } from "../shell/EvrakLayout.tsx";

interface Mesaj {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

/** Sohbete aticlanmis ek belge. */
interface Ek {
  ad: string;
  path: string;
  durum: "yukleniyor" | "isleniyor" | "hazir" | "hata";
  mesaj?: string;
}

const KABUL_EDILEN = ".pdf,.docx,.xlsx,.pptx,.txt,.md,.html";
const YOKLAMA_MS = 2000;
const YOKLAMA_SINIRI = 90; // ~3 dk: parse + chunk + analiz + embed

const HIZLI_SORULAR = [
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
 */
export function ChatView() {
  const { doc, chat, sessionId } = useEvrak();
  const [mesajlar, setMesajlar] = useState<Mesaj[]>(() =>
    chat.map((m) => ({ role: m.role, content: m.content, sources: m.sources })),
  );
  const [girdi, setGirdi] = useState("");
  const [akan, setAkan] = useState<string | null>(null);
  const [izler, setIzler] = useState<string[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [ekler, setEkler] = useState<Ek[]>([]);
  const iptalRef = useRef<AbortController | null>(null);
  const sonRef = useRef<HTMLDivElement>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);
  const yaziRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mesajlar, akan, izler]);

  // Ekrandan ayrilirken akisi kes — sunucu istemci koptugunda uretimi durduruyor.
  useEffect(() => () => iptalRef.current?.abort(), []);

  // Composer tek satirda baslar, iceriğe gore 120px'e kadar buyur.
  useEffect(() => {
    const el = yaziRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [girdi]);

  const ekDurumuGuncelle = (path: string, yama: Partial<Ek>) =>
    setEkler((mevcut) => mevcut.map((e) => (e.path === path ? { ...e, ...yama } : e)));

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
  async function ekle(file: File) {
    setHata(null);
    const gecici: Ek = { ad: file.name, path: `bekliyor:${file.name}`, durum: "yukleniyor" };
    setEkler((m) => [...m, gecici]);
    try {
      const sonuc = await api.sessionUpload(sessionId, file);
      setEkler((m) =>
        m.map((e) => (e.path === gecici.path ? { ...e, path: sonuc.path, durum: "isleniyor" } : e)),
      );
      for (let i = 0; i < YOKLAMA_SINIRI; i++) {
        await bekle(YOKLAMA_MS);
        const durum = await api.uploadStatus([sonuc.path]).catch(() => null);
        const asama = durum?.durumlar[0]?.asama;
        if (asama === "hazir") {
          ekDurumuGuncelle(sonuc.path, { durum: "hazir" });
          return;
        }
        if (asama === "hata") {
          ekDurumuGuncelle(sonuc.path, { durum: "hata", mesaj: "belge işlenemedi" });
          return;
        }
      }
      ekDurumuGuncelle(sonuc.path, { durum: "hata", mesaj: "işlenmesi çok uzun sürdü" });
    } catch (err) {
      setEkler((m) =>
        m.map((e) =>
          e.path === gecici.path
            ? { ...e, durum: "hata", mesaj: err instanceof Error ? err.message : "yüklenemedi" }
            : e,
        ),
      );
    }
  }

  async function gonder(metin?: string) {
    const soru = (metin ?? girdi).trim();
    if (!soru || akan !== null) return;

    setGirdi("");
    setHata(null);
    setIzler([]);
    setMesajlar((m) => [...m, { role: "user", content: soru }]);
    setAkan("");

    const kontrol = new AbortController();
    iptalRef.current = kontrol;
    let biriken = "";
    let kaynaklar: string[] = [];

    try {
      for await (const ev of streamChat({
        question: soru,
        documentId: doc.id,
        // Yalnizca hazir ek varsa gonder; aksi halde sunucu bos bir kapsam arar.
        sessionId: ekler.some((e) => e.durum === "hazir") ? sessionId : undefined,
        signal: kontrol.signal,
      })) {
        if (ev.type === "trace") setIzler((i) => [...i, ev.message]);
        else if (ev.type === "sources") kaynaklar = ev.sources;
        else if (ev.type === "token") {
          biriken += ev.text;
          setAkan(biriken);
        } else if (ev.type === "done") biriken = ev.answer;
        else if (ev.type === "error") setHata(ev.message);
      }
      if (biriken) {
        setMesajlar((m) => [...m, { role: "assistant", content: biriken, sources: kaynaklar }]);
      }
    } catch (err) {
      if (!kontrol.signal.aborted) {
        setHata(err instanceof Error ? err.message : "Akış kesildi");
      }
    } finally {
      setAkan(null);
      iptalRef.current = null;
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-7 pt-[26px] pb-2">
        <div className="mx-auto flex max-w-[760px] flex-col gap-[18px]">
          <div className="flex flex-wrap justify-center gap-2 pb-1.5">
            {HIZLI_SORULAR.map((s) => (
              <button
                key={s}
                type="button"
                disabled={akan !== null}
                onClick={() => void gonder(s)}
                className="rounded-full border border-cizgi-2 bg-white px-3 py-[7px] text-xs font-medium text-govde transition-colors hover:border-gib hover:text-gib disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {mesajlar.length === 0 && akan === null && (
            <p className="pt-2 text-center text-[12.5px] leading-relaxed text-silik">
              Bu evrak hakkında soru sorun — cevaplar yalnızca belgenin içeriğine dayanır.
              <br />
              Ek bir mevzuat veya belge için ataç düğmesini kullanabilirsiniz.
            </p>
          )}

          {mesajlar.map((m, i) => (
            <Balon key={i} mesaj={m} />
          ))}

          {izler.length > 0 && akan !== null && (
            <div className="space-y-0.5 text-[11px] text-soluk">
              {izler.map((iz, i) => (
                <div key={i}>· {iz}</div>
              ))}
            </div>
          )}

          {akan !== null && (
            <Balon mesaj={{ role: "assistant", content: akan || "yazıyor…" }} akiyor />
          )}

          {hata && (
            <div className="rounded-lg border border-uyari-cizgi bg-uyari-zemin px-3 py-2 text-[11.5px] text-uyari">
              {hata}
            </div>
          )}
          <div ref={sonRef} />
        </div>
      </div>

      <div className="px-7 pt-3 pb-[22px]">
        {ekler.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-[760px] flex-wrap gap-1.5">
            {ekler.map((e) => (
              <EkChip
                key={e.path}
                ek={e}
                onKaldir={() => setEkler((m) => m.filter((x) => x.path !== e.path))}
              />
            ))}
          </div>
        )}

        <div className="mx-auto flex max-w-[760px] items-end gap-2.5 rounded-[14px] border border-cizgi-2 bg-white py-2.5 pr-2.5 pl-3 shadow-composer">
          <input
            ref={dosyaRef}
            type="file"
            accept={KABUL_EDILEN}
            className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) void ekle(f);
              ev.target.value = "";
            }}
          />
          <button
            type="button"
            title="Referans belge ekle"
            aria-label="Referans belge ekle"
            onClick={() => dosyaRef.current?.click()}
            className="flex h-[34px] w-[34px] flex-[0_0_34px] items-center justify-center rounded-[9px] border border-cizgi bg-panel text-ikincil transition-colors hover:border-cizgi-5"
          >
            <AtacIkonu />
          </button>
          <textarea
            ref={yaziRef}
            rows={1}
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void gonder();
              }
            }}
            placeholder="Belgeye dair bir şey sorun… (Enter ile gönder)"
            className="max-h-[120px] min-w-0 flex-1 resize-none border-none bg-transparent py-2 text-[13.5px] leading-[1.5] outline-none"
          />
          {akan !== null ? (
            <button
              type="button"
              onClick={() => iptalRef.current?.abort()}
              className="rounded-[9px] border border-cizgi-2 bg-white px-4 py-2 text-[13px] font-semibold text-govde transition-colors hover:border-cizgi-5"
            >
              Durdur
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void gonder()}
              disabled={!girdi.trim()}
              className={`rounded-[9px] px-4 py-[9px] text-[13px] font-semibold text-white transition-colors ${
                girdi.trim() ? "bg-gib hover:bg-gib-koyu" : "bg-gib-solgun"
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

function EkChip({ ek, onKaldir }: { ek: Ek; onKaldir: () => void }) {
  const suruyor = ek.durum === "yukleniyor" || ek.durum === "isleniyor";
  const renk =
    ek.durum === "hazir"
      ? "border-onay/25 bg-onay-zemin text-onay"
      : ek.durum === "hata"
        ? "border-uyari-cizgi bg-uyari-zemin text-uyari"
        : "border-cizgi bg-panel text-ikincil";
  return (
    <span className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${renk}`}>
      {suruyor && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      <span className="max-w-[220px] truncate">{ek.ad}</span>
      <span className="opacity-70">
        {ek.durum === "yukleniyor" && "yükleniyor"}
        {ek.durum === "isleniyor" && "işleniyor"}
        {ek.durum === "hazir" && "hazır"}
        {ek.durum === "hata" && (ek.mesaj ?? "hata")}
      </span>
      <button
        type="button"
        onClick={onKaldir}
        aria-label="Eki kaldır"
        className="ml-0.5 opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  );
}

function AtacIkonu() {
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
function Metin({ ham }: { ham: string }) {
  const parcalar = ham.split(/\*\*(.+?)\*\*/gs);
  return <>{parcalar.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p))}</>;
}

function Balon({ mesaj, akiyor = false }: { mesaj: Mesaj; akiyor?: boolean }) {
  const kullanici = mesaj.role === "user";
  return (
    <div className={kullanici ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          kullanici
            ? "max-w-[76%] rounded-[14px_14px_4px_14px] bg-metin px-4 py-3 text-white"
            : "max-w-[88%] rounded-[14px_14px_14px_4px] border border-cizgi bg-white px-4 py-3.5 text-metin-2 shadow-balon"
        }
      >
        <div
          className={`text-[13.5px] leading-[1.6] whitespace-pre-wrap text-pretty ${
            akiyor ? "animate-pulse" : ""
          }`}
        >
          <Metin ham={mesaj.content} />
        </div>
        {mesaj.sources && mesaj.sources.length > 0 && (
          <div className="mt-3 border-t border-cizgi-3 pt-2.5">
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-[.08em] text-soluk uppercase">
              Kaynaklar
            </div>
            <div className="flex flex-col gap-1.5">
              {mesaj.sources.map((k) => (
                <span
                  key={k}
                  className="rounded-[7px] border border-cizgi-3 bg-zemin px-[9px] py-1.5 text-[11.5px] text-ikincil"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const bekle = (ms: number) => new Promise((c) => setTimeout(c, ms));
