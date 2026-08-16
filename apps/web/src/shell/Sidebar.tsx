import { Link, useMatch, useNavigate } from "react-router-dom";
import { evrakBasligi, useEvraklar } from "../hooks/useEvraklar.ts";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Oturum acan calisan.
 *
 * YER TUTUCU: projede henuz kimlik dogrulama yok. Buraya bakan tek yer burasi
 * oldugu icin, oturum eklendiginde yalnizca bu sabit degistirilecek.
 */
const KULLANICI = { ad: "M. Kaya", bas: "MK", daire: "İzmir Vergi Dairesi" };

/**
 * Sol serit — her ekranda sabit.
 *
 * Yalnizca ETKILESIME GIRILMIS evrak listelenir (bkz. useEvraklar): burasi bir
 * evrak havuzu degil sohbet gecmisidir; tum evraki dokmek gecmisi kullanilamaz
 * hale getirirdi. Acilmamis evrak ana ekranda oneri karti olarak durur.
 */
export function Sidebar() {
  // Serit rotalarin DISINDA duruyor (her ekranda sabit), bu yuzden aktif evrak
  // useParams ile degil yolun kendisiyle bulunur.
  const docId = useMatch("/evrak/:docId/*")?.params.docId;
  const navigate = useNavigate();
  const { acikIsler, cevaplananlar } = useEvraklar();

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
            Vergi Dairesi Başkanlığı
          </div>
          {/* 272px seritte bu ad 10px'te tek satira sigmiyor; kirpmak yerine iki
              satira sariliyor — sistemin adi yarim gorunmemeli. */}
          <div className="mt-px text-[10px] leading-[1.25] font-medium text-balance text-ikincil">
            Yapay Zeka Destekli Evrak ve Yazışma Sistemi
          </div>
        </div>
      </div>

      <div className="px-3.5 pt-3.5 pb-2">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex w-full items-center gap-[9px] rounded-[10px] border border-cizgi-2 bg-white px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors hover:border-gib hover:bg-gib-sis"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-gib-acik text-[13px] font-bold text-gib">
            +
          </span>
          Yeni sohbet
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pt-1.5 pb-4">
        <GrupBasligi renk="bg-gib" etiket="Cevap bekleyen" adet={acikIsler.length} ilk />
        <Liste belgeler={acikIsler} aktifId={docId} bosluk="Açtığınız evrak burada birikir." />

        <GrupBasligi renk="bg-cizgi-5" etiket="Cevaplanan" adet={cevaplananlar.length} />
        <Liste belgeler={cevaplananlar} aktifId={docId} bosluk="Henüz cevap yazısı üretilmedi." />
      </div>

      <div className="flex items-center gap-[9px] border-t border-cizgi px-4 py-3">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-avatar text-[11px] font-semibold text-ikincil">
          {KULLANICI.bas}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{KULLANICI.ad}</div>
          <div className="text-[10.5px] text-silik">{KULLANICI.daire}</div>
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

function GrupBasligi({
  renk,
  etiket,
  adet,
  ilk = false,
}: {
  renk: string;
  etiket: string;
  adet: number;
  ilk?: boolean;
}) {
  return (
    <div className={`flex items-center gap-[7px] px-2 pb-1.5 ${ilk ? "pt-3" : "pt-[18px]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${renk}`} />
      <span className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
        {etiket}
      </span>
      <span className="ml-auto text-[11px] font-semibold text-silik">{adet}</span>
    </div>
  );
}

function Liste({
  belgeler,
  aktifId,
  bosluk,
}: {
  belgeler: DocumentSummary[];
  aktifId?: string;
  bosluk: string;
}) {
  if (!belgeler.length) {
    return <p className="px-2.5 py-1 text-[11px] leading-relaxed text-soluk">{bosluk}</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {belgeler.map((d) => {
        const aktif = d.id === aktifId;
        return (
          <Link
            key={d.id}
            to={`/evrak/${d.id}`}
            className={`block rounded-[9px] px-2.5 py-[9px] transition-colors ${
              aktif ? "bg-yuzey-2 shadow-[inset_2px_0_0_var(--color-gib)]" : "hover:bg-yuzey-2"
            }`}
          >
            <span className="block truncate text-[13px] leading-[1.35] font-medium">
              {evrakBasligi(d)}
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
