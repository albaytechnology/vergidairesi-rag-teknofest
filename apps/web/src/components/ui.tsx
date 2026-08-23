import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocumentSummary } from "../api/types.ts";

/** Bolum etiketi — sag panel ve cevap yazisi formunda tekrar eden 10.5px baslik. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
      {children}
    </div>
  );
}

/**
 * Madde numarasinin ekranda gorunen hali.
 *
 * Ham deger kaynaktan bazen "11", bazen "Madde 11" olarak geliyor (yonlendirme
 * kararini yazan model iki bicimi de kullanabiliyor); onune "M." eklenince
 * ikincisi "M.Madde 11" diye basiliyordu. Onek burada bir kez temizlenir.
 */
export const maddeLabel = (maddeNo: string): string =>
  `M.${maddeNo.trim().replace(/^madde\s*/i, "")}`;

/**
 * Yonetmelik madde numarasi.
 *
 * Iki zeminde de kullanilir: beyaz kart uzerinde dolgulu, gri kart uzerinde
 * cerceveli — ikisi de ayni bilgiyi tasir, yalnizca kontrasti korur.
 */
export function ArticleChip({
  children,
  tone = "solid",
}: {
  children: ReactNode;
  tone?: "solid" | "outline";
}) {
  return (
    <span
      className={`rounded-[5px] px-1.5 py-[3px] font-mono text-[10px] text-ikincil ${
        tone === "solid" ? "bg-yuzey" : "border border-cizgi bg-white"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Evrakin tek bakista durumu.
 *
 * Yasam dongusu yonlendirme durumundan ONCE gelir: cevabi yazilmis bir evrak,
 * hangi servise yonlendirildiginden bagimsiz olarak "cevaplandi"dir.
 * "belirlenemedi" bir hata degil TASARLANMIS bir sonuc — manuel inceleme
 * istedigini soyler, bu yuzden kirmizi degil kehribar.
 */
export function StatusChip({ doc }: { doc: DocumentSummary }) {
  const [label, className] =
    doc.yasamDongusu === "completed"
      ? ["Cevaplandı", "border-onay-cizgi bg-onay-zemin text-onay"]
      : doc.routing.durum === "belirlenemedi"
        ? ["Manuel inceleme", "border-uyari-cizgi bg-uyari-zemin-2 text-uyari"]
        : doc.routing.durum === "routed"
          ? ["Yönlendirildi", "border-gib-cizgi bg-gib-acik text-gib"]
          : ["Cevap bekliyor", "border-gib-cizgi bg-gib-acik text-gib"];
  return (
    <span
      className={`shrink-0 rounded-md border px-[9px] py-1 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-uyari-cizgi bg-uyari-zemin px-2.5 py-2 text-[11px] leading-[1.5] text-uyari">
      {children}
    </div>
  );
}

export function Loading({ what = "Yükleniyor" }: { what?: string }) {
  return <div className="p-7 text-[13px] text-silik">{what}…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="m-5">
      <WarningBox>
        {error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu."}
      </WarningBox>
    </div>
  );
}


/**
 * Uzun icerigi kirpip "Devamını gör" ile acan kutu.
 *
 * Detay panelinde ozet, cikarilan bilgiler ve tarama bulgulari belgeye gore
 * bes satir da olabiliyor otuz satir da; uzun bir evrakta panel tek bir alanla
 * doluyor ve altindaki bolumler ekranin disina dusuyordu. Kirpma yukseklige
 * gore yapilir, satir sayisina gore degil: bolumlerin ici duz metin degil
 * (izgara, kart listesi), hepsinde ayni olcut ancak piksel.
 *
 * Dugme YALNIZCA icerik gercekten tasiyorsa cikar — kisa bir ozetin altinda
 * hicbir seyi acmayan bir "Devamını gör" bagi durmasin. Olcum ResizeObserver
 * ile: veri sonradan geliyor, yazi tipi sonradan yukleniyor ve panel baska bir
 * evraga gecerken ayni bilesen yeniden kullaniliyor.
 */
export function Expandable({
  children,
  maxHeight = 150,
}: {
  children: ReactNode;
  maxHeight?: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const olc = () => setClipped(el.scrollHeight > maxHeight + 8);
    olc();
    const observer = new ResizeObserver(olc);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight]);

  return (
    <>
      <div
        className="relative overflow-hidden"
        style={{ maxHeight: expanded ? undefined : maxHeight }}
      >
        <div ref={innerRef}>{children}</div>
        {/* Kirpilan yerde metnin ortasindan kesilmis izlenimi kalmasin. */}
        {clipped && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-11 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {clipped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-silik transition-colors hover:text-gib"
        >
          {expanded ? "Daha az göster" : "Devamını gör"}
          <ChevronDown flipped={expanded} />
        </button>
      )}
    </>
  );
}

/** Acilip kapanan bolumlerin yon oku; acikken yukari doner. */
function ChevronDown({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 transition-transform ${flipped ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
