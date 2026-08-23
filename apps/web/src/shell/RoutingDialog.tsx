import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { maddeLabel } from "../components/ui.tsx";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Yonlendirme kararinin tam gerekcesi ve degistirilmesi.
 *
 * NEDEN AYRI BIR PENCERE: gerekce modelin yazdigi uzun bir metindir (yonetmelik
 * maddesinin gorev tanimiyla karsilastirma) ve 340px'lik panelde ozeti asagi
 * itiyordu. Panelde artik yalnizca KARAR duruyor; "neden" sorusu sorulmadan
 * ekranda yer kaplamiyor.
 *
 * Servis degistirme de burada: karari degistirmek gerekceyi OKUDUKTAN sonra
 * yapilacak bir is. Iki yol var ve ikisi de kaliyor —
 *   Manuel: son sozu insan soyler (POST /reroute {servis})
 *   AI ile: karari modele yeniden hesaplatir (POST /reroute)
 */
export function RoutingDialog({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  const qc = useQueryClient();
  /** null: eylemler henuz acilmadi. "manuel" | "ai": secilen yol. */
  const [mode, setMode] = useState<null | "menu" | "manuel">(null);
  const [service, setService] = useState(doc.routing.servis ?? "");

  const { data: catalog } = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    enabled: mode === "manuel",
  });

  const reroute = useMutation({
    mutationFn: (target?: string) => api.reroute(doc.id, target),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["document", doc.id] });
      void qc.invalidateQueries({ queryKey: ["archive"] });
      void qc.invalidateQueries({ queryKey: ["services"] });
      // Pencere ACIK kalir: calisan yeni karari ve yeni gerekcesini gorsun —
      // kapanan bir pencere "ne oldu?" sorusunu ekranda birakiyordu.
      setMode(null);
    },
  });

  // Esc ile kapanma: pencere klavyeden de terk edilebilmeli.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const r = doc.routing;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Yönlendirme gerekçesi"
      // Zemine tiklamak kapatir; kart icindeki tiklamalar yukari kabarmasin.
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-metin/25 px-6 py-10"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[560px] animate-yukse flex-col overflow-hidden rounded-[14px] border border-cizgi bg-white shadow-kart"
      >
        <div className="flex items-start justify-between gap-3 border-b border-cizgi-3 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
              Yönlendirme
            </div>
            <div className="mt-1 text-[15px] leading-[1.3] font-bold tracking-[-.01em]">
              {r.servis ?? "Belirlenemedi — manuel inceleme gerekli"}
            </div>
            {r.birim && <div className="mt-0.5 text-[11.5px] text-silik">{r.birim}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-cizgi bg-panel text-[13px] leading-none text-ikincil transition-colors hover:border-cizgi-5"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
            Neden bu servis?
          </div>
          <p className="mt-2 text-[12.5px] leading-[1.7] text-pretty text-govde">
            {r.gerekce ?? "Bu karar için gerekçe kaydedilmemiş."}
          </p>

          {r.maddeler.length > 0 && (
            <>
              <div className="mt-5 text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
                Dayanak maddeler
              </div>
              {/* Baslik title'da degil ekranda: pencerede yer var ve madde
                  numarasi tek basina hicbir sey anlatmiyor. Uzun basliklar
                  monospace bir rozete sigmadigi icin rozet degil liste. */}
              <ul className="mt-2 flex flex-col gap-1.5">
                {r.maddeler.map((m) => (
                  <li
                    key={m.maddeNo}
                    className="flex gap-2 rounded-lg border border-cizgi bg-panel px-2.5 py-2"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-ikincil">
                      {maddeLabel(m.maddeNo)}
                    </span>
                    <span className="text-[11.5px] leading-[1.5] text-pretty text-govde">
                      {m.baslik}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {r.guvenSkoru != null && (
            <p className="mt-5 text-[11.5px] text-silik">
              Modelin karara güveni: {r.guvenSkoru.toFixed(2)} · Son sözü servis çalışanı söyler.
            </p>
          )}
        </div>

        <div className="border-t border-cizgi-3 bg-panel px-5 py-4">
          {mode === null && (
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="w-full rounded-[10px] border border-cizgi-2 bg-white py-2.5 text-[12.5px] font-semibold text-govde transition-colors hover:border-gib hover:text-gib"
            >
              Servisi güncelle
            </button>
          )}

          {mode === "menu" && (
            <div className="flex gap-2">
              <ActionButton onClick={() => setMode("manuel")}>Manuel güncelle</ActionButton>
              <ActionButton
                disabled={reroute.isPending}
                onClick={() => reroute.mutate(undefined)}
              >
                {reroute.isPending ? "Hesaplanıyor…" : "AI ile güncelle"}
              </ActionButton>
            </div>
          )}

          {mode === "manuel" && (
            <div className="flex gap-2">
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="min-w-0 flex-1 rounded-[10px] border border-cizgi-2 bg-white px-2.5 py-2 text-[12.5px] outline-none"
              >
                <option value="">Servis seçin…</option>
                {catalog?.services.map((s) => (
                  <option key={s.servis} value={s.servis}>
                    {s.servis}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!service || reroute.isPending}
                onClick={() => reroute.mutate(service)}
                className="rounded-[10px] bg-gib px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-gib-koyu disabled:opacity-50"
              >
                Ata
              </button>
            </div>
          )}

          {mode !== null && (
            <button
              type="button"
              onClick={() => setMode(null)}
              className="mt-2 w-full text-[11px] font-medium text-silik underline-offset-2 transition-colors hover:text-gib hover:underline"
            >
              Vazgeç
            </button>
          )}

          {reroute.isPending && mode === null && (
            <p className="mt-2 text-center text-[11px] text-silik">
              Yönlendirme yeniden hesaplanıyor…
            </p>
          )}
          {reroute.error && (
            <p className="mt-2 text-[11px] text-uyari">{(reroute.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-[10px] border border-cizgi-2 bg-white py-2.5 text-[12.5px] font-semibold text-govde transition-colors hover:border-gib hover:text-gib disabled:opacity-50"
    >
      {children}
    </button>
  );
}
