import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.ts";
import {
  Bos,
  CevaplandiRozeti,
  Dayanak,
  DurumRozeti,
  DusukGuvenUyarisi,
  Hata,
  SatirIskeleti,
  Sayfa,
} from "../components/ui.tsx";

export function Queue() {
  const { servis: servisParam } = useParams<{ servis: string }>();
  const servis = servisParam === "belirlenemedi" ? null : (servisParam ?? null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", servis],
    queryFn: () => api.documents(servis),
  });

  if (error) return <Hata hata={error} />;

  const belgeler = data?.documents ?? [];
  const cevaplananSayisi = belgeler.filter((d) => d.yasamDongusu === "completed").length;
  const bekleyenSayisi = belgeler.length - cevaplananSayisi;

  return (
    <Sayfa dar>
      <Link to="/" className="text-sm text-ikincil hover:text-metin">
        ← Servisler
      </Link>
      <h1 className="mt-2 mb-1 border-l-4 border-gib pl-3 text-lg font-bold">
        {servis ?? "Yönlendirilemeyen Evraklar"}
      </h1>
      <p className="mb-4 pl-3 text-sm text-ikincil">
        {bekleyenSayisi} evrak cevap bekliyor
        {cevaplananSayisi > 0 && ` · ${cevaplananSayisi} cevaplandı`}
      </p>

      {isLoading ? (
        <SatirIskeleti />
      ) : !belgeler.length ? (
        <Bos>Bu havuzda bekleyen evrak yok.</Bos>
      ) : (
        <div className="space-y-2">
          {belgeler.map((d) => {
            // Cevaplanmis evrak soluklastirilir: havuzda kalir ama gozu
            // once is bekleyen belgelere cekmesi gerekiyor.
            const cevaplandi = d.yasamDongusu === "completed";
            return (
              <Link key={d.id} to={`/document/${d.id}`} className="block cursor-pointer">
                <div
                  className={`rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    cevaplandi
                      ? "border-cizgi/60 bg-slate-50 opacity-65 hover:opacity-100"
                      : "border-cizgi bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-medium ${
                          cevaplandi ? "text-ikincil" : "text-metin"
                        }`}
                      >
                        {d.konu ?? d.filename}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-400">{d.filename}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {cevaplandi ? (
                        <CevaplandiRozeti />
                      ) : (
                        <>
                          <DusukGuvenUyarisi skor={d.routing.guvenSkoru} />
                          <Dayanak maddeler={d.routing.maddeler} />
                          <DurumRozeti durum={d.routing.durum} />
                        </>
                      )}
                    </div>
                  </div>
                  {d.routing.gerekce && !cevaplandi && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ikincil">
                      {d.routing.gerekce}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Sayfa>
  );
}
