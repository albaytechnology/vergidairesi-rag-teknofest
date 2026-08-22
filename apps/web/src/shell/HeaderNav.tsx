import { Link, useLocation } from "react-router-dom";

/**
 * Header'in sol ucundaki ana navigasyon.
 *
 * Duz metin baglantilar (aktif olanin altinda kirmizi cizgi) — segmented pill
 * yerine: sekme sayisi ikiden dorde cikinca pill'ler header'in yarisini
 * kapliyordu ve evrak basligina yer kalmiyordu. Nav bir ust cerceveye degil her
 * ekranin header'ina konur; boylece servis/arsiv gorunumleri de ayni kabugun
 * icinde kalir.
 *
 * Acik evraga donen bir sekme YOK: evrakin kendi calisma alani kendi basligini
 * ve sekmelerini tasiyor (bkz. DocumentLayout). Ust bar yalnizca sistemin ana
 * bolumlerini gosterir.
 */

export function HeaderNav() {
  const path = useLocation().pathname;

  return (
    <nav className="flex shrink-0 items-center gap-5">
      <NavLink to="/services" active={path.startsWith("/services")}>
        Servisler
      </NavLink>
      <NavLink to="/upload" active={path.startsWith("/upload")}>
        Evrak ekle
      </NavLink>
      <NavLink to="/archive" active={path.startsWith("/archive")}>
        Arşiv
      </NavLink>
    </nav>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <Link
      to={to}
      // Alt cizgi her durumda yer kaplar (saydam), aktiflik yalnizca rengini
      // degistirir: aksi halde sekmeler aktiflige gore 2px zipliyordu.
      className={`border-b-2 pb-0.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
        active ? "border-gib text-metin" : "border-transparent text-ikincil hover:text-metin"
      }`}
    >
      {children}
    </Link>
  );
}
