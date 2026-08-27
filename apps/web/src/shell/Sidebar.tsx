import { Link, useMatch } from "react-router-dom";
import { documentTitle, useDocuments } from "../hooks/useDocuments.ts";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Oturum acan calisan.
 *
 * YER TUTUCU: projede henuz kimlik dogrulama yok. Buraya bakan tek yer burasi
 * oldugu icin, oturum eklendiginde yalnizca bu sabit degistirilecek.
 */
const USER = { name: "Mehmet Erdem", initials: "ME", office: "Afyonkarahisar Vergi Dairesi" };

/**
 * Sol serit — her ekranda sabit.
 *
 * Yalnizca CEVAP BEKLEYEN ve uzerinde calisilmis evrak listelenir (bkz.
 * useDocuments): burasi bir evrak havuzu degil, elde duran isin listesidir.
 * Cevaplanan evrak buradan dusuyor — kapanmis islerin listesi Arsiv'de, kendi
 * arama ve filtreleriyle duruyor; ikisini yan yana tutmak seridi surekli
 * buyuyen ve hicbir zaman kisalmayan bir yigina cevirmisti.
 */
export function Sidebar() {
  // Serit rotalarin DISINDA duruyor (her ekranda sabit), bu yuzden aktif evrak
  // useParams ile degil yolun kendisiyle bulunur.
  const docId = useMatch("/documents/:docId/*")?.params.docId;
  const { inProgress } = useDocuments();

  return (
    <aside className="flex w-[272px] flex-[0_0_272px] flex-col border-r border-cizgi bg-panel">
      {/* Marka blogu ana header ile ayni hizada (60px): kurum onde, urun adi
          altta "Powered by" satirinda. Ekranda gorunen kurum kimligi olmali. */}
      <div className="flex h-[60px] flex-[0_0_60px] items-center gap-2.5 border-b border-cizgi px-[18px]">
        <img
          src="/vdi-logo.png"
          alt="Vergi Dairesi Başkanlığı"
          className="h-8 w-8 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] leading-tight font-bold tracking-[-.01em]">
            Gelir İdaresi Başkanlığı
          </div>
          {/* 272px seritte bu ad 10px'te tek satira sigmiyor; kirpmak yerine iki
              satira sariliyor — sistemin adi yarim gorunmemeli. */}
          <div className="mt-px text-[10px] leading-[1.25] font-medium text-balance text-ikincil">
            Dijital Vergi Dairesi - Yapay Zeka Destekli Evrak ve Yazışma Sistemi
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pt-1.5 pb-4">
        <GroupHeader label="Cevap bekleyen" count={inProgress.length} />
        <DocumentList
          documents={inProgress}
          activeId={docId}
          emptyText="Açtığınız evrak burada birikir; servis havuzlarından bir evrak seçin."
        />
      </div>

      <div className="flex items-center gap-[9px] border-t border-cizgi px-4 py-3">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-avatar text-[11px] font-semibold text-ikincil">
          {USER.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{USER.name}</div>
          <div className="text-[10.5px] text-silik">{USER.office}</div>
        </div>
      </div>

      {/* Kendi ust cizgisiyle ayri duruyor: bu satir kullanicinin unvani degil,
          sistemi saglayan urunun adi — ikisi bitisik gorunmemeli. */}
      <div className="border-t border-cizgi px-4 pt-[9px] pb-3 text-center text-[9.5px] font-semibold tracking-[.06em] text-soluk uppercase">
        Powered by ALB-AI
      </div>
    </aside>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-[7px] px-2 pt-3 pb-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-gib" />
      <span className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
        {label}
      </span>
      <span className="ml-auto text-[11px] font-semibold text-silik">{count}</span>
    </div>
  );
}

function DocumentList({
  documents,
  activeId,
  emptyText,
}: {
  documents: DocumentSummary[];
  activeId?: string;
  emptyText: string;
}) {
  if (!documents.length) {
    return <p className="px-2.5 py-1 text-[11px] leading-relaxed text-soluk">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {documents.map((d) => {
        const active = d.id === activeId;
        return (
          <Link
            key={d.id}
            to={`/documents/${d.id}`}
            className={`block rounded-[9px] px-2.5 py-[9px] transition-colors ${
              active ? "bg-yuzey-2 shadow-[inset_2px_0_0_var(--color-gib)]" : "hover:bg-yuzey-2"
            }`}
          >
            <span className="block truncate text-[13px] leading-[1.35] font-medium">
              {documentTitle(d)}
            </span>
            <span className="mt-[3px] block truncate text-[11px] text-silik">
              {d.routing.servis ?? "yönlendirilemedi"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
