import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Archive } from "./pages/Archive.tsx";
import { Upload } from "./pages/Upload.tsx";
import { Queue } from "./pages/Queue.tsx";
import { DocumentPage } from "./pages/Document.tsx";

export function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-5 border-b border-cizgi bg-white px-6 py-2.5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <img
            src="/gib.jpeg"
            alt="Gelir İdaresi Başkanlığı"
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="text-[15px] font-semibold tracking-tight text-metin">
            Vergi Dairesi <span className="font-normal text-ikincil">Evrak ve Yazışma</span>
          </span>
        </NavLink>
        <nav className="flex gap-1 text-sm">
          <Sekme to="/">Servisler</Sekme>
          <Sekme to="/arsiv">Yazışma ve Arşiv</Sekme>
          <Sekme to="/evrak-ekle">Evrak Ekle</Sekme>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/arsiv" element={<Archive />} />
          <Route path="/evrak-ekle" element={<Upload />} />
          {/* Eski yol: disariya verilmis baglantilar kirilmasin. */}
          <Route path="/upload" element={<Navigate to="/evrak-ekle" replace />} />
          <Route path="/queue/:servis" element={<Queue />} />
          <Route path="/document/:docId" element={<DocumentPage />} />
          <Route path="*" element={<div className="p-8 text-ikincil">Sayfa bulunamadı.</div>} />
        </Routes>
      </main>
    </div>
  );
}

function Sekme({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 ${
          isActive
            ? "bg-gib-acik font-medium text-gib"
            : "text-ikincil hover:bg-slate-50 hover:text-metin"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
