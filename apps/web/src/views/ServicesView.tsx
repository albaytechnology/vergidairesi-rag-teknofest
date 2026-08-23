import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.ts";
import { ErrorBox } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import type { ServiceRow } from "../api/types.ts";

/** Videonun acik/kapali tercihi — oturumu asar, tarayicida kalir. */
const VIDEO_KEY = "alb:usage-video";

/**
 * Servis dagilimi.
 *
 * Liste kodda tanimli DEGILDIR: /api/services yonetmelik chunk'larinin
 * metadata'sindan turetilir, sayaclar evrak verisinden hesaplanir. Yonetmelik
 * degisirse ekran da degisir; burada guncellenecek bir sabit yok.
 */
export function ServicesView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    refetchInterval: 15_000,
  });

  const services = data?.services ?? [];

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
      </header>

      <div className="flex-1 overflow-y-auto px-7 pt-8 pb-14">
        <div className="mx-auto w-full max-w-[1080px] animate-yukse">
          <UsageVideo />

          <h1 className="m-0 text-[22px] font-bold tracking-[-.01em]">Vergi Dairesi Servisleri</h1>
          <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-[1.6] text-pretty text-silik">
            Gelen evrak, Vergi Daireleri Kuruluş ve Görev Yönetmeliği’ndeki görev tanımlarına
            (madde 11) göre ilgili servise yönlendirilir; her kartta o servisin bekleyen evrak
            sayısı görünür.
          </p>

          {/* Yonlendirilemeyen evrak bir hata degil, elle bakilacak bir is: havuzlarin
              arasina karismasin diye ustte ayri duruyor. */}
          {data && data.belirlenemedi > 0 && (
            <Link
              to="/services/belirlenemedi"
              className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-uyari-cizgi bg-uyari-zemin-2 px-4 py-3 text-[12.5px] font-semibold text-uyari transition-colors hover:bg-uyari-zemin"
            >
              <span>{data.belirlenemedi} evrak yönlendirilemedi — manuel inceleme bekliyor</span>
              <span aria-hidden>→</span>
            </Link>
          )}

          {error ? (
            <ErrorBox error={error} />
          ) : isLoading ? (
            <Skeleton />
          ) : (
            groupByUnit(services).map(([unit, group], i) => (
              <section key={unit} className={i === 0 ? "mt-7" : "mt-8"}>
                {/* Baslik ve aciklamasi TEK SATIRDA: 14 servisin tamami tek
                    ekranda gorunsun diye bolum basliklari mumkun oldugunca az
                    dikey yer kaplamali. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
                  <h2 className="m-0 text-[13px] font-bold">{UNIT_LABEL[unit] ?? unit}</h2>
                  {UNIT_DESCRIPTION[unit] && (
                    <p className="m-0 text-[12px] text-silik">{UNIT_DESCRIPTION[unit]}</p>
                  )}
                </div>
                <div className="mt-2 overflow-hidden rounded-xl border border-cizgi bg-white">
                  {group.map((s) => (
                    <PoolRow key={s.servis} service={s} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Havuz satiri.
 *
 * Kart izgarasi yerine LISTE: kartlarin cogu bos ve hepsi ayni buyuklukteydi,
 * ekranin tamamini kaplayip "hangi havuzda is var" sorusunu okunmaz hale
 * getiriyorlardi. Satirda goz tek bir dikey hat boyunca iniyor; is bekleyen
 * servis noktasi ve sayisiyla kendini gosteriyor, bos havuz tire ile geri
 * cekiliyor.
 */
function PoolRow({ service }: { service: ServiceRow }) {
  const hasPending = service.bekleyen > 0;
  return (
    <Link
      to={`/services/${encodeURIComponent(service.servis)}`}
      className="flex items-center gap-2.5 border-b border-cizgi px-4 py-2.5 transition-colors last:border-b-0 hover:bg-panel"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasPending ? "bg-gib" : "bg-cizgi-4"}`}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] leading-[1.35] ${
          hasPending ? "font-semibold" : "font-medium text-govde"
        }`}
      >
        {service.servis}
      </span>
      {/* Bos havuzda sifir DEGIL tire: sifirlar sayfa boyunca birbirine benzeyip
          gercek sayilari golgeliyordu; tire "burada is yok" demenin sessiz yolu. */}
      <span
        className={`w-5 shrink-0 text-right text-[12px] font-bold tabular-nums ${
          hasPending ? "text-gib" : "text-soluk"
        }`}
      >
        {hasPending ? service.bekleyen : "—"}
      </span>
    </Link>
  );
}

/**
 * Tanitim videosu — giris ekraninin en ustu.
 *
 * Sistemi ilk kez acan calisan once "bu ekranda ne yapacagim" sorusuyla
 * karsilasiyor; servis havuzlari o soruyu cevaplamiyor. Video baslangicta ACIK
 * durur ama KATLANABILIR: gunluk kullanan biri icin her aciliste ekranin
 * ustunu kaplamamali, tercihi tarayicida saklaniyor.
 *
 * autoplay YOK: ses ve hareket, calisanin istemedigi anda baslamamali.
 */
function UsageVideo() {
  const [open, setOpen] = useState(() => localStorage.getItem(VIDEO_KEY) !== "kapali");

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(VIDEO_KEY, v ? "kapali" : "acik");
      } catch {
        /* Gizli sekmede yazilamayabilir; tercih yalnizca bu oturum surer. */
      }
      return !v;
    });
  };

  return (
    <section className="mb-8 overflow-hidden rounded-[14px] border border-cizgi bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="m-0 text-[14px] font-bold tracking-[-.01em]">Nasıl kullanılır?</h2>
          <p className="mt-0.5 text-[12px] text-silik">
            Evrak ekleme, belgeyle sohbet ve cevap yazısı üretimi — kısa tanıtım.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded-lg border border-cizgi-2 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-govde transition-colors hover:border-cizgi-5"
        >
          {open ? "Gizle" : "Göster"}
        </button>
      </div>

      {open && (
        // Sabit yukseklikte siyah sahne: alanin tamami dolar, kutu orani
        // videonunkinden farkli oldugunda kenarlarda siyah bant kalir.
        // Yukseklik onceden ayrildigi icin video yuklenirken sayfa zipramaz.
        <div className="h-[420px] border-t border-cizgi-3 bg-black">
          {/*
           * object-contain: goruntu ASLA gerilmez, kutuya sigar. autoPlay icin
           * muted zorunlu (tarayicilar sesli otomatik oynatmayi engelliyor);
           * controls yine duruyor ki calisan sesi acabilsin ve durdurabilsin.
           */}
          <video
            autoPlay
            loop
            muted
            playsInline
            controls
            preload="metadata"
            className="h-full w-full object-contain"
          >
            <source src="/usage-vid.mp4" type="video/mp4" />
            Tarayıcınız video oynatmayı desteklemiyor.
          </video>
        </div>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="mt-7 overflow-hidden rounded-xl border border-cizgi bg-white">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="h-[41px] border-b border-cizgi last:border-b-0">
          <div className="mt-3 ml-4 h-3.5 w-52 animate-pulse rounded bg-yuzey" />
        </div>
      ))}
    </div>
  );
}

/** Yonetmeligin kendi adlandirmasi; ekranda ne oldugunu tek satirda anlatir. */
const UNIT_DESCRIPTION: Record<string, string> = {
  "Ana Hizmet Birimleri": "Vergilendirme, Muhasebe, Kovuşturma, Tarama ve Kontrol bölümleri",
  "Diğer Hizmet Birimleri": "Başkanlığa bağlı destek ve ihtisas servisleri",
};

/**
 * Grup basligi ekranda okunur adiyla gecer.
 *
 * Yonetmelikteki "Ana Hizmet Birimleri" ibaresi bir ic siniflandirma; ekranda
 * bunlarin ne oldugunu soylemiyor. Yalnizca ETIKET degisiyor — gruplama yine
 * /api/services'ten, yani yonetmelik metadata'sindan turuyor.
 */
const UNIT_LABEL: Record<string, string> = {
  "Ana Hizmet Birimleri": "Vergi Dairesi Servisleri",
};

/** Ana hizmet birimleri once; geri kalanlar alfabetik. */
function groupByUnit(services: ServiceRow[]): [string, ServiceRow[]][] {
  const groups = new Map<string, ServiceRow[]>();
  for (const s of services) {
    // Yonetmelikteki "A) Ana Hizmet Birimleri" gibi harf onekleri baslikta gorunmesin.
    const key = (s.hizmetBirimi ?? "Diğer").replace(/^[A-Z]\)\s*/, "");
    const existing = groups.get(key);
    if (existing) existing.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a.startsWith("Ana")) return -1;
    if (b.startsWith("Ana")) return 1;
    return a.localeCompare(b, "tr");
  });
}
