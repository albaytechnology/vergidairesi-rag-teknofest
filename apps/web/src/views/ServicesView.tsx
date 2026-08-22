import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.ts";
import { ErrorBox } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import type { ServiceRow } from "../api/types.ts";

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
  // Ust satirdaki sayi KARTLARIN TOPLAMI DEGIL, bekleyen tum evraktir:
  // yonlendirilemeyenlerin bir karti yok ve disarida birakildiklarinda ekran,
  // sol seritte duran bir evraki hic saymamis oluyordu. Kartlar + belirlenemedi
  // = bekleyen evrak; iki tarafin ayrisabilecegi bir aralik kalmasin.
  const pending =
    services.reduce((t, s) => t + s.bekleyen, 0) + (data?.belirlenemedi ?? 0);

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
      </header>

      <div className="flex-1 overflow-y-auto px-7 pt-8 pb-14">
        <div className="mx-auto w-full max-w-[1080px] animate-yukse">
          <h1 className="m-0 text-[22px] font-bold tracking-[-.01em]">Vergi Dairesi Servisleri</h1>
          <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-[1.6] text-pretty text-silik">
            Gelen evrak, Vergi Daireleri Kuruluş ve Görev Yönetmeliği’ndeki görev tanımlarına
            (madde 11) göre ilgili servise yönlendirilir; her kartta o servisin madde numarası ve
            bekleyen evrak sayısı görünür.
          </p>

          {/*
           * Tek sayac: BEKLEYEN EVRAK. "Cevaplanan", "aktif servis", "son evrak"
           * kartlari kaldirildi — hicbiri bir sonraki adimi degistirmiyordu ve
           * ekranin ust yarisini, is bekleyen havuzlardan once dolduruyorlardi.
           * Cevaplanan evrakin yeri Arsiv.
           */}
          <div className="mt-5 inline-flex min-w-[220px] flex-col rounded-xl border border-cizgi bg-white px-5 py-4">
            <span className="text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
              Bekleyen evrak
            </span>
            <span className="mt-1.5 text-[28px] leading-none font-bold tabular-nums">
              {isLoading ? "—" : pending}
            </span>
            <span className="mt-1.5 text-[11.5px] text-silik">
              cevap yazısı üretilmemiş evrak · {services.length} servis
            </span>
          </div>

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
              <section key={unit} className={i === 0 ? "mt-7" : "mt-9"}>
                <div className="border-l-[3px] border-gib pl-3">
                  <h2 className="m-0 text-[15px] font-bold">{UNIT_LABEL[unit] ?? unit}</h2>
                  {UNIT_DESCRIPTION[unit] && (
                    <p className="mt-0.5 text-xs text-silik">{UNIT_DESCRIPTION[unit]}</p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">
                  {group.map((s) => (
                    <ServiceCard key={s.servis} service={s} />
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

function ServiceCard({ service }: { service: ServiceRow }) {
  const hasPending = service.bekleyen > 0;
  return (
    <Link
      to={`/services/${encodeURIComponent(service.servis)}`}
      className={`block rounded-xl border border-cizgi bg-white px-4 py-3.5 transition-[border-color,box-shadow] hover:border-cizgi-5 hover:shadow-kart ${
        hasPending ? "border-l-[3px] border-l-gib" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13.5px] leading-[1.35] font-semibold">{service.servis}</span>
        <span
          className={`min-w-[22px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11.5px] font-bold tabular-nums ${
            hasPending ? "bg-gib text-white" : "bg-yuzey text-silik"
          }`}
        >
          {service.bekleyen}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] text-soluk">Madde {service.maddeNo}</span>
        {/* Durum metni yalnizca bekleyen ise bakar; "N cevaplandi" bilgisi
            Arsiv'in isi — kart, elde is olup olmadigini soylemeli. */}
        <span className="text-[11px] text-silik">
          {hasPending ? "cevap bekliyor" : "Bekleyen evrak yok"}
        </span>
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-[76px] animate-pulse rounded-xl border border-cizgi bg-white" />
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
