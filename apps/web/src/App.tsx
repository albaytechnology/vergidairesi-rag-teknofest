import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Archive } from "./pages/Archive.tsx";
import { Upload } from "./pages/Upload.tsx";
import { Queue } from "./pages/Queue.tsx";
import { DocumentPage } from "./pages/Document.tsx";

export function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center border-b border-cizgi bg-white px-6 py-3">
        <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
          <img
            src="/gib.jpeg"
            alt="Gelir İdaresi Başkanlığı"
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="text-base font-bold tracking-tight text-metin">
            Vergi Dairesi{" "}
            {/* Alt basligi dar ekranda gizle: navigasyonu sikistirip tasirmasin. */}
            <span className="hidden font-semibold text-ikincil lg:inline">
              Yapay Zeka Destekli Evrak ve Yazışma Sistemi
            </span>
          </span>
        </NavLink>
        {/* Marka blogundan belirgin bir bosluk: sekmeler kurum adina yapisik durmasin. */}
        <nav className="ml-10 flex gap-4 text-sm xl:ml-20 xl:gap-8">
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
        `whitespace-nowrap rounded px-3 py-1.5 font-medium ${
          isActive ? "bg-gib-acik text-gib" : "text-metin/80 hover:bg-slate-50 hover:text-metin"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
