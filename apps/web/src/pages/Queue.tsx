import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.ts";
import {
  Bos,
  DurumRozeti,
  GuvenSkoru,
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

  return (
    <Sayfa dar>
      <Link to="/" className="text-sm text-ikincil hover:text-metin">
        ← Servisler
      </Link>
      <h1 className="mt-2 mb-1 border-l-4 border-gib pl-3 text-lg font-bold">
        {servis ?? "Yönlendirilemeyen Evraklar"}
      </h1>
      <p className="mb-4 pl-3 text-sm text-ikincil">{belgeler.length} evrak</p>

      {isLoading ? (
        <SatirIskeleti />
      ) : !belgeler.length ? (
        <Bos>Bu havuzda bekleyen evrak yok.</Bos>
      ) : (
        <div className="space-y-2">
          {belgeler.map((d) => (
            <Link key={d.id} to={`/document/${d.id}`} className="block cursor-pointer">
              <div className="rounded-lg border border-cizgi bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-metin">
                      {d.konu ?? d.filename}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-400">{d.filename}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <GuvenSkoru skor={d.routing.guvenSkoru} />
                    <DurumRozeti durum={d.routing.durum} />
                  </div>
                </div>
                {d.routing.gerekce && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ikincil">
                    {d.routing.gerekce}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Sayfa>
  );
}
