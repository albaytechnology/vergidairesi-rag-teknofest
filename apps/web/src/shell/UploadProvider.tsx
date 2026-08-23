import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { UploadStage } from "../api/types.ts";

/**
 * Yuklenen evrakin hat boyunca takibi — ROTALARIN USTUNDE.
 *
 * Yukleme istegi LLM'i beklemez: dosya diske yazilip kuyruga birakilir ve
 * parse → chunk → analiz → yonlendirme → embed adimlari arkada surer. Bu
 * yuzden takip, yukleme ekranina bagli olamaz; calisan evragi birakip
 * servislere ya da arsive gectiginde de surmeli ve is bitince NEREDE olursa
 * olsun haber verilmeli. Durum bu yuzden App'in altinda, tek bir yerde tutulur.
 *
 * Oturum boyunca kalicidir (sessionStorage): sekme yenilense de yarim kalan bir
 * yukleme kaybolmaz. Yalnizca BITMEMIS kayitlar saklanir — tamamlanmis bir
 * yukleme, yenilemeden sonra yeniden "eklendi" diye bildirilmemeli.
 */
export interface TrackedUpload {
  path: string;
  filename: string;
  stage: UploadStage;
  /** Belge kaydi olustugunda dolar; sohbete gitmek icin gerekir. */
  docId: string | null;
  servis: string | null;
}

export interface ToastMessage {
  id: string;
  tone: "basari" | "hata";
  title: string;
  detail?: string;
  /** Verilirse bildirime tiklamak evragin sohbetini acar. */
  docId?: string | null;
  /** Kapaniyor: once soner, sonra listeden dusulur. */
  leaving?: boolean;
}

interface UploadContextValue {
  uploads: TrackedUpload[];
  /** Sunucuya yuklenmis dosyalari takibe alir (POST /api/upload sonrasi). */
  track: (files: { path: string; filename: string }[]) => void;
  toast: (message: Omit<ToastMessage, "id">) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads yalnizca UploadProvider icinde kullanilabilir");
  return ctx;
}

const STORAGE_KEY = "alb:uploads";
const POLL_MS = 2000;
/** Bildirim ekranda ne kadar kalir. Uzun: calisan baska bir ekranda olabilir. */
const TOAST_MS = 15_000;
/** Sonme suresi — CSS gecisiyle ayni olmali. */
const TOAST_FADE_MS = 300;

const aktif = (u: TrackedUpload): boolean => u.stage === "kuyrukta" || u.stage === "isleniyor";

export function UploadProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<TrackedUpload[]>(restore);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  /** Hangi dosya icin bildirim verildi — ayni yukleme iki kez duyurulmasin. */
  const duyurulan = useRef(new Set<string>());
  const sayac = useRef(0);

  /** Bildirimi once soldurur, sonra listeden duser — anlik kaybolma olmasin. */
  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_FADE_MS);
  }, []);

  const toast = useCallback(
    (message: Omit<ToastMessage, "id">) => {
      const id = `t${++sayac.current}`;
      setToasts((list) => [...list, { ...message, id }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const track = useCallback((files: { path: string; filename: string }[]) => {
    setUploads((list) => [
      ...list.filter((u) => !files.some((f) => f.path === u.path)),
      ...files.map((f) => ({ ...f, stage: "kuyrukta" as const, docId: null, servis: null })),
    ]);
  }, []);

  const bekleyenler = uploads.filter(aktif).map((u) => u.path);

  const { data } = useQuery({
    queryKey: ["upload-status", bekleyenler],
    queryFn: () => api.uploadStatus(bekleyenler),
    enabled: bekleyenler.length > 0,
    refetchInterval: POLL_MS,
  });

  // Sunucudan gelen asamayi listeye isle; biten her dosya icin bildirim uret.
  useEffect(() => {
    const durumlar = data?.durumlar;
    if (!durumlar?.length) return;

    setUploads((list) =>
      list.map((u) => {
        const d = durumlar.find((x) => x.path === u.path);
        return d ? { ...u, stage: d.asama, docId: d.id ?? u.docId, servis: d.servis } : u;
      }),
    );

    let bitenVar = false;
    for (const d of durumlar) {
      if (d.asama !== "hazir" && d.asama !== "hata") continue;
      if (duyurulan.current.has(d.path)) continue;
      duyurulan.current.add(d.path);
      bitenVar = true;

      const ad = d.filename ?? d.path.split("/").pop() ?? "Evrak";
      if (d.asama === "hazir") {
        toast({
          tone: "basari",
          title: "Evrak eklendi",
          detail: d.servis ? `${ad} → ${d.servis}` : ad,
          docId: d.id,
        });
      } else {
        toast({ tone: "hata", title: "Evrak işlenemedi", detail: ad });
      }
    }

    // Havuzlar ve arsiv yeni belgeyi ancak tazelenince gosterir.
    if (bitenVar) {
      void qc.invalidateQueries({ queryKey: ["archive"] });
      void qc.invalidateQueries({ queryKey: ["services"] });
    }
  }, [data, qc, toast]);

  // Yalnizca bitmemis kayitlar saklanir; bitenler yenilemeden sonra dirilmesin.
  useEffect(() => {
    try {
      const kalanlar = uploads.filter(aktif).map((u) => ({ path: u.path, filename: u.filename }));
      if (kalanlar.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kalanlar));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Gizli sekmede yazilamayabilir; takip yalnizca bu sayfa omru boyunca surer. */
    }
  }, [uploads]);

  const value = useMemo(() => ({ uploads, track, toast }), [uploads, track, toast]);

  return (
    <UploadContext.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </UploadContext.Provider>
  );
}

/** Sekme yenilendiginde yarim kalan yuklemeleri geri getirir. */
function restore(): TrackedUpload[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const kayitlar = JSON.parse(raw) as { path: string; filename: string }[];
    return kayitlar.map((k) => ({ ...k, stage: "kuyrukta", docId: null, servis: null }));
  } catch {
    return [];
  }
}

/**
 * Bildirimler — sag altta, ekranin isin akisini kesmeyen kosesinde.
 *
 * Basarili bildirim TIKLANABILIR: "eklendi" demek yetmiyor, calisan cogu zaman
 * dogrudan o evrakla calismaya baslamak istiyor. Otomatik yonlendirme bilerek
 * yok — yukleme arkada surerken calisan baska bir ekranda olabilir ve
 * bulundugu yerden koparilmamali.
 */
function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[320px] flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Tek bildirim.
 *
 * Girerken ve cikarken AYNI gecisi kullanir: ilk kare saydam basar, bir sonraki
 * karede gorunur olur, kapanirken yeniden saydama doner. Girise CSS animasyonu
 * konulmustu ama animasyonun "both" dolgusu ayni ozellikteki gecisi bastiriyor
 * ve bildirim solmadan aniden kayboluyordu.
 */
function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGorunur(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hata = t.tone === "hata";

  return (
    <div
      role="status"
      onClick={() => {
        if (!t.docId) return;
        navigate(`/documents/${t.docId}`);
        onDismiss(t.id);
      }}
      className={`pointer-events-auto rounded-xl border px-3.5 py-3 shadow-kart transition-opacity duration-300 ease-out ${
        gorunur && !t.leaving ? "opacity-100" : "opacity-0"
      } ${t.docId ? "cursor-pointer" : ""} ${
        hata ? "border-uyari-cizgi bg-uyari-zemin" : "border-onay-cizgi bg-onay-zemin"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-[3px] h-2 w-2 shrink-0 rounded-full ${hata ? "bg-uyari" : "bg-onay"}`}
        />
        <div className="min-w-0 flex-1">
          <div className={`text-[12.5px] font-semibold ${hata ? "text-uyari" : "text-onay"}`}>
            {t.title}
          </div>
          {t.detail && <div className="mt-0.5 truncate text-[11.5px] text-govde">{t.detail}</div>}
          {t.docId && (
            <div className={`mt-1 text-[11px] font-semibold ${hata ? "text-uyari" : "text-onay"}`}>
              Sohbeti aç →
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Bildirimi kapat"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(t.id);
          }}
          className="shrink-0 text-[12px] leading-none opacity-50 transition-opacity hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
