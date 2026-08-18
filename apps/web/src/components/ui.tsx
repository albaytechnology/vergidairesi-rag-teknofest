import type { ReactNode } from "react";
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
