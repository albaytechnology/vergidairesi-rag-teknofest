import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Sidebar } from "./shell/Sidebar.tsx";
import { EvrakLayout } from "./shell/EvrakLayout.tsx";
import { HomeView } from "./views/HomeView.tsx";
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
 * dogru ekrani acar ve "← Sohbete dön" gercek bir geri gidistir.
 *
 * Servis dagilimi (/servisler) kabuktan cikmaz, header'daki segmented nav'in
 * ikinci gorunumudur: sol serit ve header yerinde kalir. "Hangi servise ne
 * dustu" sorusu evrak bazli gecmisten turetilemez — havuz gorunumu bu yuzden
 * geri getirildi, ama ayri bir sayfa olarak degil.
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
          <Route path="/servisler" element={<ServicesView />} />
          <Route path="/servisler/:servisAdi" element={<ServiceDetailView />} />

          {/* Eski yollar: disariya verilmis baglantilar kirilmasin. */}
          <Route path="/document/:docId" element={<EskiBelgeYolu />} />
          <Route path="/queue/:servis" element={<EskiHavuzYolu />} />
          <Route path="/arsiv" element={<Navigate to="/" replace />} />
          <Route path="/evrak-ekle" element={<Navigate to="/" replace />} />
          <Route path="/upload" element={<Navigate to="/" replace />} />

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

function EskiHavuzYolu() {
  const { servis } = useParams<{ servis: string }>();
  const hedef = servis ? `/servisler/${encodeURIComponent(servis)}` : "/servisler";
  return <Navigate to={hedef} replace />;
}
