import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { ArticleChip, SectionLabel, WarningBox } from "../components/ui.tsx";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Sag detay paneli — sohbet ve cevap yazisi ekranlarinda ⚙ ile acilip kapanir.
 *
 * Kararin dayanaklari (ozet, cikarilan bilgiler, yonlendirme gerekcesi, kaynak
 * belge) sohbetin YANINDA durur: calisan cevabi okurken belgeye donmek zorunda
 * kalmasin, iki bilgi ayni ekranda karsilastirilabilsin.
 */
export function RightPanel({
  doc,
  onClose,
}: {
  doc: DocumentSummary & { path: string };
  onClose: () => void;
}) {
  return (
    <aside className="w-[340px] flex-[0_0_340px] overflow-y-auto border-l border-cizgi bg-white px-5 pt-[22px] pb-10">
      <div className="mb-[18px] flex items-center justify-between">
        <div className="text-[12.5px] font-bold tracking-[-.01em]">Belge detayı</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Paneli kapat"
          className="h-[26px] w-[26px] rounded-[7px] border border-cizgi bg-panel text-[13px] leading-none text-ikincil transition-colors hover:border-cizgi-5"
        >
          ✕
        </button>
      </div>

      <SectionLabel>Özet</SectionLabel>
      <p className="mt-2 mb-3 text-[12.5px] leading-[1.65] text-pretty text-govde">
        {doc.ozet ?? "Bu evrak için özet üretilmemiş."}
      </p>
      <div className="mb-6 flex items-center gap-2">
        {doc.docType && (
          <span className="rounded-[5px] bg-gib-acik px-[7px] py-[3px] text-[10.5px] font-semibold text-gib">
            {doc.docType}
          </span>
        )}
        <span className="truncate text-[11px] text-silik">{doc.filename}</span>
      </div>

      <ExtractedInfo entities={doc.entities} />
      <RoutingCard doc={doc} />

      <SectionLabel>Kaynak belge</SectionLabel>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-cizgi bg-yuzey">
        <iframe
          title="Kaynak belge önizleme"
          src={`/api/documents/${doc.id}/file`}
          className="block h-[190px] w-full border-0 bg-white"
        />
        <div className="flex items-center justify-between gap-2 border-t border-cizgi bg-white px-3 py-2.5">
          <span className="truncate text-[11px] text-ikincil">{doc.filename}</span>
          <a
            href={`/api/documents/${doc.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-[7px] border border-cizgi-2 bg-panel px-[9px] py-[5px] text-[11px] font-semibold text-govde transition-colors hover:border-cizgi-5"
          >
            Aç
          </a>
        </div>
      </div>
    </aside>
  );
}

function ExtractedInfo({ entities }: { entities: DocumentSummary["entities"] }) {
  const rows: [string, string][] = [
    ["Kişi", joinValues(entities?.kisiKurumlar)],
    ["Tutar", joinValues(entities?.tutarlar)],
    ["Tarih", joinValues(entities?.tarihler)],
    ["Dönem", joinValues(entities?.donemler)],
  ];
  const taxId = entities?.vkn ?? entities?.tckn ?? null;

  return (
    <>
      <SectionLabel>Çıkarılan bilgiler</SectionLabel>
      <div className="mt-2.5 mb-2 grid grid-cols-[82px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
        {taxId && (
          <>
            <span className="text-silik">{entities?.vkn ? "VKN" : "TCKN"}</span>
            <span className="font-mono text-[11.5px] text-metin-2">{taxId}</span>
          </>
        )}
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-silik">{label}</span>
            <span
              className={`text-metin-2 ${label === "Tutar" ? "font-mono text-[11.5px]" : ""}`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      <div className="mb-6">
        {/* Bos birakilmasi bilincli: checksum'dan gecmeyen numara yazilmiyor. */}
        {!taxId && (
          <WarningBox>
            Doğrulanmış VKN/TCKN bulunamadı — checksum’dan geçmeyen numara yazılmaz.
          </WarningBox>
        )}
      </div>
    </>
  );
}

const joinValues = (v: string[] | undefined): string => (v?.length ? v.join(" · ") : "—");

/**
 * Yonlendirme karti.
 *
 * "Elle ata" ve "Yeniden hesapla" bilerek yan yana: son sozu insan soyler ama
 * modelin kararini tazelemek de tek tikla mumkun olmali (bkz. /reroute).
 */
function RoutingCard({ doc }: { doc: DocumentSummary }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState(doc.routing.servis ?? "");

  const { data: catalog } = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    enabled: open,
  });

  const reroute = useMutation({
    mutationFn: (target?: string) => api.reroute(doc.id, target),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["document", doc.id] });
      void qc.invalidateQueries({ queryKey: ["archive"] });
      setOpen(false);
    },
  });

  return (
    <>
      <SectionLabel>Yönlendirme</SectionLabel>
      <div className="mt-2.5 mb-6 rounded-xl border border-cizgi bg-panel p-3.5">
        <div className="text-[13px] leading-[1.4] font-semibold">
          {doc.routing.servis ?? "Belirlenemedi — manuel inceleme gerekli"}
        </div>
        {doc.routing.birim && (
          <div className="mt-0.5 text-[11.5px] text-silik">{doc.routing.birim}</div>
        )}
        {doc.routing.gerekce && (
          <p className="mt-2.5 mb-3 text-xs leading-[1.6] text-pretty text-govde">
            {doc.routing.gerekce}
          </p>
        )}
        {doc.routing.maddeler.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {doc.routing.maddeler.map((m) => (
              <ArticleChip key={m.maddeNo} tone="outline">
                <span title={m.baslik}>M.{m.maddeNo}</span>
              </ArticleChip>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <SmallButton onClick={() => setOpen((o) => !o)}>Elle ata</SmallButton>
          <SmallButton disabled={reroute.isPending} onClick={() => reroute.mutate(undefined)}>
            {reroute.isPending ? "Hesaplanıyor…" : "Yeniden hesapla"}
          </SmallButton>
        </div>

        {open && (
          <div className="mt-2 flex gap-2">
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-cizgi-2 bg-white px-2 py-1.5 text-[11.5px] outline-none"
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
              className="rounded-lg bg-gib px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
            >
              Ata
            </button>
          </div>
        )}
        {reroute.error && (
          <p className="mt-2 text-[11px] text-uyari">{(reroute.error as Error).message}</p>
        )}
      </div>
    </>
  );
}

function SmallButton({
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
      className="flex-1 rounded-lg border border-cizgi-2 bg-white py-[7px] text-xs font-medium text-govde transition-colors hover:border-cizgi-5 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
