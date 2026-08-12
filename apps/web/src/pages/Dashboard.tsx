import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.ts";
import { BolumBasligi, Hata, KartIskeleti, Sayfa } from "../components/ui.tsx";
import type { ServiceRow } from "../api/types.ts";

/**
 * Servis havuzlari.
 *
 * Liste kodda tanimli DEGILDIR: /api/services yonetmelik chunk'larinin
 * metadata'sindan turetilir. Yonetmelik degisirse ekran da degisir.
 */
export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    refetchInterval: 15_000,
  });

  if (error) return <Hata hata={error} />;

  const gruplar = data ? grupla(data.services) : [];
  const toplam = data?.services.reduce((t, s) => t + s.bekleyen, 0) ?? 0;
  const toplamTamamlanan = data?.services.reduce((t, s) => t + s.tamamlanan, 0) ?? 0;

  return (
    <Sayfa>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Vergi Dairesi Servisleri</h1>
          <p className="text-sm text-ikincil">
            {toplam} evrak cevap bekliyor
            {toplamTamamlanan > 0 && ` · ${toplamTamamlanan} cevaplandı`} ·{" "}
            {data?.services.length ?? 0} servis
          </p>
        </div>
        {data && data.belirlenemedi > 0 && (
          <Link
            to="/queue/belirlenemedi"
            className="shrink-0 rounded border border-uyari/30 bg-amber-50 px-3 py-2 text-sm text-uyari hover:bg-amber-100"
          >
            {data.belirlenemedi} evrak manuel inceleme bekliyor →
          </Link>
        )}
      </div>

      {isLoading && <KartIskeleti />}

      {gruplar.map(([birim, servisler], i) => (
        <section key={birim} className={i === 0 ? "" : "mt-10 border-t border-cizgi pt-8"}>
          <BolumBasligi baslik={birim} aciklama={BIRIM_ACIKLAMA[birim]} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {servisler.map((s) => (
              <ServisKarti key={s.servis} servis={s} />
            ))}
          </div>
        </section>
      ))}
    </Sayfa>
  );
}

function ServisKarti({ servis }: { servis: ServiceRow }) {
  const dolu = servis.bekleyen > 0;
  return (
    <Link to={`/queue/${encodeURIComponent(servis.servis)}`} className="block cursor-pointer">
      <div
        className={`h-full rounded-lg border border-cizgi bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
          dolu ? "border-l-4 border-l-gib" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium leading-snug text-metin">{servis.servis}</span>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-sm tabular-nums ${
              dolu ? "bg-gib font-semibold text-white" : "bg-slate-200 text-slate-500"
            }`}
          >
            {servis.bekleyen}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] italic text-slate-400">Madde {servis.maddeNo}</span>
          {!dolu ? (
            <span className="text-[11px] text-slate-400">
              {servis.tamamlanan > 0 ? "Tümü cevaplandı" : "Bekleyen evrak yok"}
            </span>
          ) : (
            servis.tamamlanan > 0 && (
              <span className="text-[11px] text-slate-400">
                {servis.tamamlanan} cevaplandı
              </span>
            )
          )}
        </div>
      </div>
    </Link>
  );
}

/** Yonetmeligin kendi adlandirmasi; ekranda ne oldugunu tek satirda anlatir. */
const BIRIM_ACIKLAMA: Record<string, string> = {
  "Ana Hizmet Birimleri": "Vergilendirme, Muhasebe, Kovuşturma, Tarama ve Kontrol bölümleri",
  "Diğer Hizmet Birimleri": "Başkanlığa bağlı destek ve ihtisas servisleri",
};

/** Ana hizmet birimleri once; geri kalanlar alfabetik. */
function grupla(servisler: ServiceRow[]): [string, ServiceRow[]][] {
  const harita = new Map<string, ServiceRow[]>();
  for (const s of servisler) {
    const anahtar = (s.hizmetBirimi ?? "Diğer").replace(/^[A-Z]\)\s*/, "");
    const mevcut = harita.get(anahtar);
    if (mevcut) mevcut.push(s);
    else harita.set(anahtar, [s]);
  }
  return [...harita.entries()].sort(([a], [b]) => {
    if (a.startsWith("Ana")) return -1;
    if (b.startsWith("Ana")) return 1;
    return a.localeCompare(b, "tr");
  });
}
