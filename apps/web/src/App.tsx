import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Sidebar } from "./shell/Sidebar.tsx";
import { EvrakLayout } from "./shell/EvrakLayout.tsx";
import { HomeView } from "./views/HomeView.tsx";
import { ChatView } from "./views/ChatView.tsx";
import { ReplyView } from "./views/ReplyView.tsx";

/**
 * Tek ekranli evrak asistani.
 *
 * Onceki cok sayfali yapi (Servisler / Yazisma ve Arsiv / Evrak Ekle / Belge
 * Sohbeti / Cevap Yazisi) tek bir sohbet merkezli arayuzde birlestirildi:
 * sol seritte gecmis, ortada is, sagda dayanaklar. Calisan evrakla ugrasirken
 * sekme degistirmiyor.
 *
 * Cevap yazisi AYRI bir rotadir; boylece dogrudan paylasilan bir baglanti da
 * dogru ekrani acar ve "← Sohbete dön" gercek bir geri gidistir.
 */
export function App() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-zemin">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-zemin">
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/evrak/:docId" element={<EvrakLayout />}>
            <Route index element={<ChatView />} />
            <Route path="cevap-yazisi" element={<ReplyView />} />
          </Route>

          {/* Eski yollar: disariya verilmis baglantilar kirilmasin. */}
          <Route path="/document/:docId" element={<EskiBelgeYolu />} />
          <Route path="/arsiv" element={<Navigate to="/" replace />} />
          <Route path="/evrak-ekle" element={<Navigate to="/" replace />} />
          <Route path="/upload" element={<Navigate to="/" replace />} />
          <Route path="/queue/*" element={<Navigate to="/" replace />} />

          <Route
            path="*"
            element={<div className="p-8 text-[13px] text-silik">Sayfa bulunamadı.</div>}
          />
        </Routes>
      </main>
    </div>
  );
}

function EskiBelgeYolu() {
  const { docId } = useParams<{ docId: string }>();
  return <Navigate to={`/evrak/${docId}`} replace />;
}
