import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import { streamChat } from "../api/sse.ts";
import type { ChatMessage } from "../api/types.ts";
import { Rozet } from "./ui.tsx";

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

/**
 * Belge kapsamli sohbet.
 *
 * Akis SSE ile token token gelir. Sunucu soru/cevap ciftini tek islemde
 * yaziyor; akis yarida kesilirse hicbiri kaydedilmez — bu yuzden istemci
 * tarafinda "iptal edildi" mesajini gecmise EKLEMIYORUZ, ekranda gosterip
 * biraktigimiz sey sunucudakiyle ayni kalsin.
 *
 * Ek belge (atac): oturuma ozel yuklenir ve yalnizca bu sohbette kaynak olur.
 */
export function ChatPanel({
  docId,
  sessionId,
  baslangic,
}: {
  docId: string;
  sessionId: string;
  baslangic: ChatMessage[];
}) {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>(() =>
    baslangic.map((m) => ({ role: m.role, content: m.content, sources: m.sources })),
  );
  const [girdi, setGirdi] = useState("");
  const [akan, setAkan] = useState<string | null>(null);
  const [izler, setIzler] = useState<string[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [ekler, setEkler] = useState<Ek[]>([]);
  const iptalRef = useRef<AbortController | null>(null);
  const sonRef = useRef<HTMLDivElement>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mesajlar, akan, izler]);

  // Sayfadan ayrilirken akisi kes — sunucu istemci koptugunda uretimi durduruyor.
  useEffect(() => () => iptalRef.current?.abort(), []);

  const ekDurumuGuncelle = (path: string, yama: Partial<Ek>) =>
    setEkler((mevcut) => mevcut.map((e) => (e.path === path ? { ...e, ...yama } : e)));

  /**
   * Dosyayi oturuma yukler ve ARANABILIR olana kadar yoklar.
   *
   * Iki ayri sey yapiliyor:
   *  - bind: belge kaydi olusunca oturuma baglar (idempotent, her turda cagrilir)
   *  - status: hattin embed adimi bitti mi
   *
   * Hazirlik olcutu bilerek bind'in dondurdugu `hazir` DEGIL: o yalnizca parse
   * edildigini soyluyor ve hat daha chunk/analiz/embed asamasindayken true
   * donuyor. Erken "hazir" demek, kullanicinin heniz indekslenmemis belgeye
   * soru sormasina ve "bu bilgi belgede bulunamadi" cevabi almasina yol aciyordu.
   */
  async function ekle(file: File) {
    setHata(null);
    const gecici: Ek = { ad: file.name, path: `bekliyor:${file.name}`, durum: "yukleniyor" };
    setEkler((m) => [...m, gecici]);
    try {
      const sonuc = await api.sessionUpload(sessionId, file);
      setEkler((m) =>
        m.map((e) =>
          e.path === gecici.path ? { ...e, path: sonuc.path, durum: "isleniyor" } : e,
        ),
      );
      for (let i = 0; i < YOKLAMA_SINIRI; i++) {
        await bekle(YOKLAMA_MS);
        await api.sessionUploadBind(sessionId, sonuc.path).catch(() => null);
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

  async function gonder() {
    const soru = girdi.trim();
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
        documentId: docId,
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
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {mesajlar.length === 0 && akan === null && (
          <p className="pt-8 text-center text-sm text-ikincil">
            Bu evrak hakkında soru sorun — cevaplar yalnızca belgenin içeriğine dayanır.
            <br />
            Ek bir mevzuat veya belge için ataç düğmesini kullanabilirsiniz.
          </p>
        )}

        {mesajlar.map((m, i) => (
          <Balon key={i} mesaj={m} />
        ))}

        {izler.length > 0 && akan !== null && (
          <div className="space-y-0.5 text-[11px] text-slate-400">
            {izler.map((iz, i) => (
              <div key={i}>· {iz}</div>
            ))}
          </div>
        )}

        {akan !== null && <Balon mesaj={{ role: "assistant", content: akan || "…" }} akiyor />}

        {hata && (
          <div className="rounded border border-uyari/30 bg-amber-50 p-2 text-xs text-uyari">
            {hata}
          </div>
        )}
        <div ref={sonRef} />
      </div>

      <div className="border-t border-cizgi bg-white p-3">
        {ekler.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ekler.map((e) => (
              <EkChip
                key={e.path}
                ek={e}
                onKaldir={() => setEkler((m) => m.filter((x) => x.path !== e.path))}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2">
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
            title="Sohbete belge ekle"
            aria-label="Sohbete belge ekle"
            onClick={() => dosyaRef.current?.click()}
            className="shrink-0 self-end rounded border border-cizgi px-2.5 py-2 text-ikincil hover:bg-slate-50 hover:text-metin"
          >
            <AtacIkonu />
          </button>
          <textarea
            rows={2}
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void gonder();
              }
            }}
            placeholder="Mesajınızı yazın… (Enter ile gönder)"
            className="min-w-0 flex-1 resize-none rounded border border-cizgi px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          {akan !== null ? (
            <button
              type="button"
              onClick={() => iptalRef.current?.abort()}
              className="shrink-0 self-end rounded border border-cizgi px-3 py-2 text-sm hover:bg-slate-50"
            >
              Durdur
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void gonder()}
              disabled={!girdi.trim()}
              className="shrink-0 self-end rounded bg-gib px-4 py-2 text-sm font-medium text-white hover:bg-gib-koyu disabled:opacity-40"
            >
              Gönder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EkChip({ ek, onKaldir }: { ek: Ek; onKaldir: () => void }) {
  const suruyor = ek.durum === "yukleniyor" || ek.durum === "isleniyor";
  const renk =
    ek.durum === "hazir"
      ? "border-emerald-200 bg-emerald-50 text-onay"
      : ek.durum === "hata"
        ? "border-uyari/30 bg-amber-50 text-uyari"
        : "border-cizgi bg-slate-50 text-ikincil";
  return (
    <span className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${renk}`}>
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
      <button type="button" onClick={onKaldir} aria-label="Eki kaldır" className="ml-0.5 opacity-60 hover:opacity-100">
        ✕
      </button>
    </span>
  );
}

function AtacIkonu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
    <div className={kullanici ? "flex justify-end" : ""}>
      <div
        // Kullanici balonu bilerek kirmizi DEGIL: kirmizi aksan rengi, sohbet
        // boyunca tekrarlanan bir blok degil. Vurgu birincil aksiyonda kalsin.
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          kullanici ? "bg-metin text-white" : "border border-cizgi bg-white"
        } ${akiyor ? "animate-pulse" : ""}`}
      >
        <Metin ham={mesaj.content} />
        {mesaj.sources && mesaj.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-cizgi pt-1.5">
            {mesaj.sources.map((k) => (
              <Rozet key={k}>{k}</Rozet>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const bekle = (ms: number) => new Promise((c) => setTimeout(c, ms));
