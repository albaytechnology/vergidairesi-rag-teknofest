import { Link, useMatch } from "react-router-dom";

/**
 * Header'in sol ucundaki "Asistan / Servisler" segmented navigasyonu.
 *
 * Servis dagilimi ayri bir sayfa degil, ayni kabugun ikinci gorunumudur: sol
 * serit ve header yerinde kalir, yalnizca orta alan degisir. Bu yuzden nav bir
 * ust cerceveye degil her ekranin header'ina konur.
 */

/**
 * Son acilan evrak.
 *
 * "Asistan" sekmesi, servis ekranindayken calisilan evraga geri donmeli; ama o
 * evrak URL'de artik yok. Sunucudaki lifecycle_status "hangi evraklar acildi"
 * sorusunu cevapliyor, "en son hangisi" sorusunu cevaplamiyor — bu tamamen
 * sekmeye ozel bir gezinme durumu oldugu icin sessionStorage'da tutuluyor.
 */
const LAST_DOCUMENT_KEY = "alb:last-document";

export function rememberLastDocument(docId: string): void {
  try {
    sessionStorage.setItem(LAST_DOCUMENT_KEY, docId);
  } catch {
    /* Gizli sekmede yazilamayabilir; nav yalnizca ana ekrana doner. */
  }
}

function lastDocument(): string | null {
  try {
    return sessionStorage.getItem(LAST_DOCUMENT_KEY);
  } catch {
    return null;
  }
}

export function HeaderNav() {
  // Acik evrak once yoldan okunur; yol evrak disi bir ekrandaysa hatirlanana duser.
  const activeDocument = useMatch("/documents/:docId/*")?.params.docId ?? lastDocument();
  const onServices = Boolean(useMatch("/services/*"));

  return (
    <>
      <div className="flex shrink-0 gap-0.5 rounded-[9px] bg-yuzey p-[3px]">
        <Tab to={activeDocument ? `/documents/${activeDocument}` : "/"} active={!onServices}>
          Asistan
        </Tab>
        <Tab to="/services" active={onServices}>
          Servisler
        </Tab>
      </div>
      <span className="h-6 w-px shrink-0 bg-cizgi" />
    </>
  );
}

function Tab({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <Link
      to={to}
      className={`rounded-[7px] px-[13px] py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
        active ? "bg-white text-metin shadow-sekme" : "text-ikincil hover:text-metin"
      }`}
    >
      {children}
    </Link>
  );
}
