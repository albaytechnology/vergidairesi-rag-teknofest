import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { ErrorBox, Loading, StatusChip } from "../components/ui.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { HeaderNav, rememberLastDocument } from "./HeaderNav.tsx";
import type { ChatMessage, DocumentSummary } from "../api/types.ts";

/** Sag panelin kendiliginden kapandigi genislik. */
const NARROW_BREAKPOINT = 1150;
/** Cevap yazisi ekrani iki kolonlu; bunun altinda sag panele yer kalmiyor. */
const REPLY_BREAKPOINT = 1400;

export interface DocumentContext {
  doc: DocumentSummary & { path: string };
  chat: ChatMessage[];
  /** Sohbete aticlanan ek belgeler bu kimlige baglanir. */
  sessionId: string;
}

export const useDocumentContext = () => useOutletContext<DocumentContext>();

/**
 * Evrak ekranlarinin cercevesi: baslik serisi, sag detay paneli ve icerik.
 *
 * Sohbet ile cevap yazisi AYRI ROTALARDIR ama ayni cerceveyi paylasir; boylece
 * "← Sohbete dön" gercek bir geri gidistir ve dogrudan .../reply ile acilan bir
 * baglanti da dogru ekrani gosterir.
 */
export function DocumentLayout() {
  const { docId = "" } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onReply = useLocation().pathname.endsWith("/reply");
  const sessionId = useMemo(() => crypto.randomUUID(), [docId]);

  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= NARROW_BREAKPOINT);

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
    // Servis ekranindan "Asistan"a donuldugunde bu evraga geri gelinsin.
    rememberLastDocument(docId);
    void api
      .markOpened(docId)
      .then(() => qc.invalidateQueries({ queryKey: ["archive"] }))
      .catch(() => undefined);
  }, [docId, qc]);

  // Pencere daraldiginda paneli kapat; kullanici ⚙ ile yeniden acabilir.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < NARROW_BREAKPOINT) setPanelOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (onReply && window.innerWidth < REPLY_BREAKPOINT) setPanelOpen(false);
  }, [onReply]);

  if (isLoading) return <Loading what="Belge yükleniyor" />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const doc = data.document;

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onReply && (
            <button
              type="button"
              onClick={() => navigate(`/documents/${docId}`)}
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
          <StatusChip doc={doc} />
          {!onReply && (
            <button
              type="button"
              onClick={() => navigate(`/documents/${docId}/reply`)}
              className="rounded-[9px] bg-gib px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-gib-koyu"
            >
              Cevap yazısı
            </button>
          )}
          <button
            type="button"
            title="Belge detayları"
            onClick={() => setPanelOpen((open) => !open)}
            className={`flex items-center gap-1.5 rounded-[9px] border border-cizgi-2 px-3 py-2 text-govde transition-colors hover:border-cizgi-5 ${
              panelOpen ? "bg-yuzey" : "bg-white"
            }`}
          >
            <span className="text-sm leading-none">⚙</span>
            <span className="text-[12.5px] font-semibold">Detay</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <div className="flex min-w-[440px] flex-1 flex-col">
          {/*
           * key={docId}: baska bir evraga gecildiginde ROTA AYNI kaldigi icin
           * (/documents/:docId) React alttaki ekrani yeniden kullanirdi ve
           * ChatView'in mesajlari — bir kez calisan useState baslaticisiyla
           * kuruldugu icin — onceki evrakta kalirdi. Anahtar degisince ekran
           * bastan kurulur: mesajlar, ataclar, yazilan metin ve suren akis
           * (unmount'ta abort edilir) hep birlikte sifirlanir.
           */}
          <Outlet
            key={docId}
            context={{ doc, chat: data.chat, sessionId } satisfies DocumentContext}
          />
        </div>
        {panelOpen && <RightPanel doc={doc} onClose={() => setPanelOpen(false)} />}
      </div>
    </>
  );
}
