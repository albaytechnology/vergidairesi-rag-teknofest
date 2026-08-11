import type { ReactNode } from "react";

export function Sayfa({ children, dar = false }: { children: ReactNode; dar?: boolean }) {
  return <div className={`mx-auto ${dar ? "max-w-5xl" : "max-w-7xl"} px-6 py-6`}>{children}</div>;
}

export function Kart({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-cizgi bg-white ${className}`}>{children}</div>;
}

export function Baslik({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-ikincil">
      {children}
    </h2>
  );
}

/**
 * Bolum basligi — sol kenarda GIB kirmizisi dikey cizgi.
 * Yonetmelik hiyerarsisindeki "Ana Hizmet Birimleri / Diger Hizmet Birimleri"
 * ayrimi ekranda da net gorunmeli; kucuk gri bir etiket bunu tasimiyordu.
 */
export function BolumBasligi({ baslik, aciklama }: { baslik: string; aciklama?: string }) {
  return (
    <div className="mb-4 border-l-4 border-gib pl-3">
      <h2 className="text-lg font-bold text-metin">{baslik}</h2>
      {aciklama && <p className="text-sm text-ikincil">{aciklama}</p>}
    </div>
  );
}

export function Yukleniyor({ ne = "Yükleniyor" }: { ne?: string }) {
  return <div className="p-6 text-sm text-ikincil">{ne}…</div>;
}

/** Kart izgarasi icin iskelet — bos ekran yerine yerlesim onizlemesi. */
export function KartIskeleti({ adet = 6 }: { adet?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: adet }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-cizgi bg-white">
          <div className="p-4">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-16 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SatirIskeleti({ adet = 4 }: { adet?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: adet }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg border border-cizgi bg-white" />
      ))}
    </div>
  );
}

export function Hata({ hata }: { hata: unknown }) {
  return (
    <div className="m-4 rounded border border-uyari/30 bg-gib-acik p-4 text-sm text-uyari">
      {hata instanceof Error ? hata.message : "Beklenmeyen bir hata oluştu."}
    </div>
  );
}

export function Bos({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-ikincil">{children}</div>;
}

type RozetTonu = "notr" | "onay" | "uyari" | "gib";

const TONLAR: Record<RozetTonu, string> = {
  notr: "bg-slate-100 text-ikincil",
  onay: "bg-emerald-50 text-onay",
  uyari: "bg-amber-50 text-uyari",
  gib: "bg-gib-acik text-gib",
};

export function Rozet({ ton = "notr", children }: { ton?: RozetTonu; children: ReactNode }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONLAR[ton]}`}>
      {children}
    </span>
  );
}

/**
 * Yonlendirme durumunu tek bakista okunur hale getirir.
 * "belirlenemedi" bir hata degil, TASARLANMIS bir sonuc — manuel inceleme
 * gerektigini soyler; bu yuzden kirmizi degil kehribar tonda.
 */
export function DurumRozeti({ durum }: { durum: string }) {
  if (durum === "routed") return <Rozet ton="onay">yönlendirildi</Rozet>;
  if (durum === "belirlenemedi") return <Rozet ton="uyari">manuel inceleme</Rozet>;
  return <Rozet>işleniyor</Rozet>;
}

/**
 * Evrakin is akisi durumu. Yonlendirme durumundan (DurumRozeti) ayridir:
 * o "hangi servise" sorusunu, bu "is nerede kaldi" sorusunu cevaplar.
 */
export function YasamRozeti({ durum }: { durum: string }) {
  const tanim: Record<string, { etiket: string; sinif: string }> = {
    new: { etiket: "Yeni", sinif: "bg-slate-100 text-ikincil" },
    routed: { etiket: "Yönlendirildi", sinif: "bg-sky-50 text-sky-800" },
    in_progress: { etiket: "Serviste işleniyor", sinif: "bg-amber-50 text-uyari" },
    completed: { etiket: "Cevap yazıldı", sinif: "bg-emerald-50 text-onay" },
  };
  const t = tanim[durum] ?? tanim["new"]!;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${t.sinif}`}>{t.etiket}</span>
  );
}

export function GuvenSkoru({ skor }: { skor: number | null }) {
  if (skor === null) return null;
  const ton: RozetTonu = skor >= 0.8 ? "onay" : skor >= 0.5 ? "notr" : "uyari";
  return <Rozet ton={ton}>güven {skor.toFixed(2)}</Rozet>;
}
