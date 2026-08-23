import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Sidebar } from "./shell/Sidebar.tsx";
import { UploadProvider } from "./shell/UploadProvider.tsx";
import { DocumentLayout } from "./shell/DocumentLayout.tsx";
import { UploadView } from "./views/UploadView.tsx";
import { ArchiveView } from "./views/ArchiveView.tsx";
import { ChatView } from "./views/ChatView.tsx";
import { ReplyView } from "./views/ReplyView.tsx";
import { ServicesView } from "./views/ServicesView.tsx";
import { ServiceDetailView } from "./views/ServiceDetailView.tsx";

/**
 * Tek ekranli evrak asistani.
 *
 * Onceki cok sayfali yapi (Servisler / Yazisma ve Arsiv / Evrak Ekle / Belge
 * Sohbeti / Cevap Yazisi) tek bir sohbet merkezli arayuzde birlestirildi:
 * sol seritte gecmis, ortada is, sagda dayanaklar. Calisan evrakla ugrasirken
 * sekme degistirmiyor.
 *
 * Cevap yazisi AYRI bir rotadir; boylece dogrudan paylasilan bir baglanti da
 * dogru ekrani acar ve iki gorunum arasindaki sekme gecisi tarayicinin geri
 * tusuyla da calisir.
 *
 * Gorunumlerin hicbiri kabuktan cikmaz: sol serit ve header her ekranda
 * yerinde kalir, yalnizca orta alan degisir.
 *
 * Acilis SERVISLER ekranidir. Isin baslangici "hangi servise ne dustu"
 * sorusudur; bos bir sohbet ekrani ya da yukleme formu, calisani her aciliste
 * bir sonraki adimi kendi bulmaya birakiyordu.
 *
 * Yol adlari Ingilizce; Turkce adli eski yollar yonlendirmeyle korunur.
 */
export function App() {
  return (
    // Yukleme takibi rotalarin USTUNDE: hat arkada surerken calisan baska bir
    // ekrana gecebilir, ilerleme ve "eklendi" bildirimi onunla birlikte gelir.
    <UploadProvider>
      <div className="flex h-full w-full overflow-hidden bg-zemin">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-zemin">
        <Routes>
          <Route path="/" element={<Navigate to="/services" replace />} />
          <Route path="/upload" element={<UploadView />} />
          <Route path="/archive" element={<ArchiveView />} />
          <Route path="/documents/:docId" element={<DocumentLayout />}>
            <Route index element={<ChatView />} />
            <Route path="reply" element={<ReplyView />} />
          </Route>
          <Route path="/services" element={<ServicesView />} />
          <Route path="/services/:serviceName" element={<ServiceDetailView />} />

          {/* Eski yollar: disariya verilmis baglantilar kirilmasin. */}
          <Route path="/evrak/:docId" element={<LegacyDocumentPath />} />
          <Route path="/evrak/:docId/cevap-yazisi" element={<LegacyDocumentPath reply />} />
          <Route path="/document/:docId" element={<LegacyDocumentPath />} />
          <Route path="/servisler" element={<Navigate to="/services" replace />} />
          <Route path="/servisler/:serviceName" element={<LegacyServicePath />} />
          <Route path="/queue/:serviceName" element={<LegacyServicePath />} />
          <Route path="/arsiv" element={<Navigate to="/archive" replace />} />
          <Route path="/evrak-ekle" element={<Navigate to="/upload" replace />} />

          <Route
            path="*"
            element={<div className="p-8 text-[13px] text-silik">Sayfa bulunamadı.</div>}
          />
        </Routes>
        </main>
      </div>
    </UploadProvider>
  );
}

function LegacyDocumentPath({ reply = false }: { reply?: boolean }) {
  const { docId } = useParams<{ docId: string }>();
  return <Navigate to={`/documents/${docId}${reply ? "/reply" : ""}`} replace />;
}

function LegacyServicePath() {
  const { serviceName } = useParams<{ serviceName: string }>();
  const target = serviceName ? `/services/${encodeURIComponent(serviceName)}` : "/services";
  return <Navigate to={target} replace />;
}
