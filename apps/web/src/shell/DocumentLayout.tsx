import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { ErrorBox, Loading, StatusChip } from "../components/ui.tsx";
import { DetailPanel } from "./DetailPanel.tsx";
import { HeaderNav } from "./HeaderNav.tsx";
import type { ChatMessage, DocumentSummary } from "../api/types.ts";

/** Detay panelinin kendiliginden kapandigi genislik. */
const NARROW_BREAKPOINT = 1150;
/** Cevap yazisi ekrani iki kolonlu; bunun altinda detay paneline yer kalmiyor. */
const REPLY_BREAKPOINT = 1400;

export interface DocumentContext {
  doc: DocumentSummary & { path: string };
  chat: ChatMessage[];
  /** Sohbete aticlanan ek belgeler bu kimlige baglanir. */
  sessionId: string;
}

export const useDocumentContext = () => useOutletContext<DocumentContext>();

/**
 * Evrak ekranlarinin cercevesi: ust bar, detay paneli ve calisma alani.
 *
 * Sohbet ile cevap yazisi AYRI ROTALARDIR ama ayni cerceveyi paylasir; dogrudan
 * .../reply ile acilan bir baglanti da dogru ekrani gosterir.
 *
 * Evrakin kimligi (baslik, dosya adi, durum) ve iki gorunum arasindaki gecis
 * UST BARDA DEGIL, calisma alaninin kendi baslik blogunda durur: ust bar
 * sistemin bolumlerini gosterir, bu blok "hangi evrakla calisiyorum"u. Gecis de
 * bir dugme degil sekme — cevap yazisi, sohbetten cikilan bir yer degil ayni
 * evrakin ikinci gorunumu.
 */
export function DocumentLayout() {
  const { docId = "" } = useParams<{ docId: string }>();
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
      </header>

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {/* Panel SOLDA: sol serit → dayanaklar → konusma. */}
        <DetailPanel
          doc={doc}
          open={panelOpen}
          onOpen={() => setPanelOpen(true)}
          onClose={() => setPanelOpen(false)}
        />
        <div className="flex min-w-[440px] flex-1 flex-col">
          {/* Calisma alani basligi: sohbette de cevap yazisinda da sabit kalir,
              yalnizca altindaki icerik degisir. Beyaz zemin ve alt cizgi, bu
              blogu gri sohbet akisindan ayirir. */}
          <div className="flex-[0_0_auto] border-b border-cizgi bg-white px-7 pt-[18px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[16px] leading-tight font-semibold tracking-[-.01em]">
                  {doc.konu ?? doc.filename}
                </div>
                <div className="mt-1 truncate text-[11.5px] text-silik">{doc.filename}</div>
              </div>
              <StatusChip doc={doc} />
            </div>
            {/* -mb-px: sekmenin 2px'lik alt cizgisi blogun kendi cizgisinin
                uzerine otursun, altinda ikinci bir cizgi olusmasin. */}
            <div className="-mb-px flex gap-5 pt-3.5">
              <WorkspaceTab to={`/documents/${docId}`} active={!onReply}>
                Asistan
              </WorkspaceTab>
              <WorkspaceTab to={`/documents/${docId}/reply`} active={onReply}>
                Cevap yazısı
              </WorkspaceTab>
            </div>
          </div>

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
      </div>
    </>
  );
}

/** Calisma alani sekmesi — ust bardaki nav baglantilariyla ayni dil. */
function WorkspaceTab({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={to}
      className={`border-b-2 pb-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
        active ? "border-gib text-metin" : "border-transparent text-ikincil hover:text-metin"
      }`}
    >
      {children}
    </Link>
  );
}
