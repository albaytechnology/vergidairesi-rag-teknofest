import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { DurumChip, Hata, Yukleniyor } from "../components/ui.tsx";
import { RightPanel } from "./RightPanel.tsx";
import type { ChatMessage, DocumentSummary } from "../api/types.ts";

/** Sag panelin kendiliginden kapandigi genislik. */
const DAR_ESIK = 1150;
/** Cevap yazisi ekrani iki kolonlu; bunun altinda sag panele yer kalmiyor. */
const CEVAP_ESIK = 1400;

export interface EvrakBaglam {
  doc: DocumentSummary & { path: string };
  chat: ChatMessage[];
  /** Sohbete aticlanan ek belgeler bu kimlige baglanir. */
  sessionId: string;
}

export const useEvrak = () => useOutletContext<EvrakBaglam>();

/**
 * Evrak ekranlarinin cercevesi: baslik serisi, sag detay paneli ve icerik.
 *
 * Sohbet ile cevap yazisi AYRI ROTALARDIR ama ayni cerceveyi paylasir; boylece
 * "← Sohbete dön" gercek bir geri gidistir ve dogrudan .../cevap-yazisi ile
 * acilan bir baglanti da dogru ekrani gosterir.
 */
export function EvrakLayout() {
  const { docId = "" } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cevapEkrani = useLocation().pathname.endsWith("/cevap-yazisi");
  const sessionId = useMemo(() => crypto.randomUUID(), [docId]);

  const [panelAcik, setPanelAcik] = useState(() => window.innerWidth >= DAR_ESIK);

  const { data, isLoading, error } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api.document(docId),
    enabled: Boolean(docId),
  });

  /**
   * Evraki "serviste isleniyor" olarak isaretle — sol seritteki gecmis bundan
   * dogar. Ayri bir POST kullaniliyor cunku GET /api/documents/:id yan etkisiz
   * kalmali; bir yoklama istegi evraki calisilmis gibi gostermemeli.
   */
  useEffect(() => {
    if (!docId) return;
    void api
      .markOpened(docId)
      .then(() => qc.invalidateQueries({ queryKey: ["archive"] }))
      .catch(() => undefined);
  }, [docId, qc]);

  // Pencere daraldiginda paneli kapat; kullanici ⚙ ile yeniden acabilir.
  useEffect(() => {
    const olcu = () => {
      if (window.innerWidth < DAR_ESIK) setPanelAcik(false);
    };
    window.addEventListener("resize", olcu);
    return () => window.removeEventListener("resize", olcu);
  }, []);

  useEffect(() => {
    if (cevapEkrani && window.innerWidth < CEVAP_ESIK) setPanelAcik(false);
  }, [cevapEkrani]);

  if (isLoading) return <Yukleniyor ne="Belge yükleniyor" />;
  if (error) return <Hata hata={error} />;
  if (!data) return null;

  const doc = data.document;

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {cevapEkrani && (
            <button
              type="button"
              onClick={() => navigate(`/evrak/${docId}`)}
              className="flex items-center gap-1.5 rounded-lg border border-cizgi-2 bg-white py-1.5 pr-[11px] pl-[9px] text-[12.5px] font-semibold whitespace-nowrap transition-colors hover:border-cizgi-5"
            >
              ← Sohbete dön
            </button>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[-.01em]">
              {doc.konu ?? doc.filename}
            </div>
            <div className="mt-px truncate text-[11.5px] text-silik">{doc.filename}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {doc.containsPII && (
            <span className="rounded-md border border-uyari-cizgi bg-uyari-zemin-2 px-2 py-1 font-mono text-[10.5px] text-uyari">
              KVKK
            </span>
          )}
          <DurumChip doc={doc} />
          {!cevapEkrani && (
            <button
              type="button"
              onClick={() => navigate(`/evrak/${docId}/cevap-yazisi`)}
              className="rounded-[9px] bg-gib px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-gib-koyu"
            >
              Cevap yazısı
            </button>
          )}
          <button
            type="button"
            title="Belge detayları"
            onClick={() => setPanelAcik((a) => !a)}
            className={`flex items-center gap-1.5 rounded-[9px] border border-cizgi-2 px-3 py-2 text-govde transition-colors hover:border-cizgi-5 ${
              panelAcik ? "bg-yuzey" : "bg-white"
            }`}
          >
            <span className="text-sm leading-none">⚙</span>
            <span className="text-[12.5px] font-semibold">Detay</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <div className="flex min-w-[440px] flex-1 flex-col">
          <Outlet context={{ doc, chat: data.chat, sessionId } satisfies EvrakBaglam} />
        </div>
        {panelAcik && <RightPanel doc={doc} kapat={() => setPanelAcik(false)} />}
      </div>
    </>
  );
}
