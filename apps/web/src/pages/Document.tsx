import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { Baslik, DurumRozeti, GuvenSkoru, Hata, Rozet, Yukleniyor } from "../components/ui.tsx";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { LetterPanel } from "../components/LetterPanel.tsx";
import type { DocumentSummary } from "../api/types.ts";

type Sekme = "chat" | "yazi";

export function DocumentPage() {
  const { docId = "" } = useParams<{ docId: string }>();
  const [sekme, setSekme] = useState<Sekme>("chat");
  // Sohbete aticlanan ek belgeler bu kimlige baglanir; belge sayfasi acik
  // kaldigi surece ayni kalmali, her renderda yenilenmemeli.
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api.document(docId),
    enabled: Boolean(docId),
  });

  // Evraki "serviste isleniyor" olarak isaretle. Ayri bir POST kullaniliyor
  // cunku GET /api/documents/:id yan etkisiz kalmali — liste onizlemesi ya da
  // bir yoklama istegi evraki calisilmis gibi gostermemeli.
  useEffect(() => {
    if (docId) void api.markOpened(docId).catch(() => undefined);
  }, [docId]);

  if (isLoading) return <Yukleniyor ne="Belge yükleniyor" />;
  if (error) return <Hata hata={error} />;
  if (!data) return null;

  const d = data.document;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-cizgi bg-white px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={d.routing.servis ? `/queue/${encodeURIComponent(d.routing.servis)}` : "/queue/belirlenemedi"}
            className="shrink-0 text-sm text-ikincil hover:text-gib"
          >
            ←
          </Link>
          <span className="truncate text-sm font-medium">{d.konu ?? d.filename}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {d.containsPII && <Rozet ton="uyari">KVKK</Rozet>}
          <GuvenSkoru skor={d.routing.guvenSkoru} />
          <DurumRozeti durum={d.routing.durum} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-r border-cizgi bg-white p-4">
          <SolPanel doc={d} />
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex gap-1 border-b border-cizgi bg-white px-3 pt-2">
            <SekmeDugmesi aktif={sekme === "chat"} onClick={() => setSekme("chat")}>
              Belge Sohbeti
            </SekmeDugmesi>
            <SekmeDugmesi aktif={sekme === "yazi"} onClick={() => setSekme("yazi")}>
              Cevap Yazısı
            </SekmeDugmesi>
          </div>
          {/*
            Iki panel de DAIMA render edilir, pasif olan gizlenir.
            Kosullu render'da sekme degistirmek component'i unmount ediyor ve
            yalnizca sohbet gecmisi degil, uretilmis cevap yazisi taslagi ile
            onizlemede yapilmis elle duzeltmeler de siliniyordu.
          */}
          <div className={`min-h-0 flex-1 ${sekme === "chat" ? "" : "hidden"}`}>
            <ChatPanel docId={docId} sessionId={sessionId} baslangic={data.chat} />
          </div>
          <div className={`min-h-0 flex-1 ${sekme === "yazi" ? "" : "hidden"}`}>
            <LetterPanel docId={docId} doc={d} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SekmeDugmesi({
  aktif,
  onClick,
  children,
}: {
  aktif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px rounded-t border-b-2 px-3 py-2 text-sm ${
        aktif
          ? "border-gib font-medium text-gib"
          : "border-transparent text-ikincil hover:text-metin"
      }`}
    >
      {children}
    </button>
  );
}

function SolPanel({ doc }: { doc: DocumentSummary & { path: string } }) {
  return (
    <div className="space-y-5">
      <div>
        <Baslik>Özet</Baslik>
        <p className="text-sm leading-relaxed text-metin">{doc.ozet ?? "—"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {doc.docType && <Rozet ton="gib">{doc.docType}</Rozet>}
          <Rozet>{doc.filename}</Rozet>
        </div>
      </div>

      {doc.entities && <Entities entities={doc.entities} />}

      <YonlendirmeKutusu doc={doc} />

      <div>
        <Baslik>Kaynak belge</Baslik>
        <iframe
          title="Evrak"
          src={`/api/documents/${doc.id}/file`}
          className="mt-1 h-[420px] w-full rounded border border-cizgi bg-slate-50"
        />
      </div>
    </div>
  );
}

function Entities({ entities }: { entities: NonNullable<DocumentSummary["entities"]> }) {
  const satirlar: [string, string[]][] = [
    ["Kişi / Kurum", entities.kisiKurumlar],
    ["Tutar", entities.tutarlar],
    ["Tarih", entities.tarihler],
    ["Dönem", entities.donemler],
    ["Plaka", entities.plakalar],
  ];
  const kimlik = [
    entities.vkn ? `VKN ${entities.vkn}` : null,
    entities.tckn ? `TCKN ${entities.tckn}` : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <Baslik>Çıkarılan bilgiler</Baslik>
      <dl className="mt-1 space-y-1.5 text-sm">
        {kimlik.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-xs text-ikincil">Kimlik</dt>
            <dd className="text-metin">{kimlik.join(" · ")}</dd>
          </div>
        )}
        {satirlar
          .filter(([, v]) => v.length > 0)
          .map(([ad, degerler]) => (
            <div key={ad} className="flex gap-2">
              <dt className="w-24 shrink-0 text-xs text-ikincil">{ad}</dt>
              <dd className="text-metin">{degerler.join(" · ")}</dd>
            </div>
          ))}
      </dl>
      {!entities.vkn && !entities.tckn && (
        // Bos birakilmasi bilinctli: checksum'dan gecmeyen numara yazilmiyor.
        <p className="mt-1.5 text-xs text-slate-400">
          Doğrulanmış VKN/TCKN bulunamadı — checksum’dan geçmeyen numara yazılmaz.
        </p>
      )}
    </div>
  );
}

function YonlendirmeKutusu({ doc }: { doc: DocumentSummary }) {
  const qc = useQueryClient();
  const [acik, setAcik] = useState(false);
  const [servis, setServis] = useState(doc.routing.servis ?? "");

  const { data: servisler } = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    enabled: acik,
  });

  const yenidenYonlendir = useMutation({
    mutationFn: (hedef?: string) => api.reroute(doc.id, hedef),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["document", doc.id] });
      void qc.invalidateQueries({ queryKey: ["services"] });
      setAcik(false);
    },
  });

  return (
    <div>
      <Baslik>Yönlendirme</Baslik>
      <div className="mt-1 rounded border border-cizgi bg-slate-50 p-3">
        <div className="text-sm font-medium">
          {doc.routing.servis ?? "Belirlenemedi — manuel inceleme gerekli"}
        </div>
        {doc.routing.birim && (
          <div className="text-xs text-ikincil">{doc.routing.birim} birimi</div>
        )}
        {doc.routing.gerekce && (
          <p className="mt-2 text-xs leading-relaxed text-metin">{doc.routing.gerekce}</p>
        )}
        {doc.routing.maddeler.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {doc.routing.maddeler.map((m) => (
              <span
                key={m.maddeNo}
                title={m.baslik}
                className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ikincil ring-1 ring-cizgi"
              >
                M.{m.maddeNo}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAcik((a) => !a)}
            className="rounded border border-cizgi bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
          >
            Elle ata
          </button>
          <button
            type="button"
            disabled={yenidenYonlendir.isPending}
            onClick={() => yenidenYonlendir.mutate(undefined)}
            className="rounded border border-cizgi bg-white px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {yenidenYonlendir.isPending ? "Hesaplanıyor…" : "Yeniden hesapla"}
          </button>
        </div>

        {acik && (
          <div className="mt-2 flex gap-2">
            <select
              value={servis}
              onChange={(e) => setServis(e.target.value)}
              className="min-w-0 flex-1 rounded border border-cizgi bg-white px-2 py-1 text-xs"
            >
              <option value="">Servis seçin…</option>
              {servisler?.services.map((s) => (
                <option key={s.servis} value={s.servis}>
                  {s.servis}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!servis || yenidenYonlendir.isPending}
              onClick={() => yenidenYonlendir.mutate(servis)}
              className="rounded bg-gib px-2.5 py-1 text-xs text-white disabled:opacity-50"
            >
              Ata
            </button>
          </div>
        )}
        {yenidenYonlendir.error && (
          <p className="mt-2 text-xs text-uyari">
            {(yenidenYonlendir.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
