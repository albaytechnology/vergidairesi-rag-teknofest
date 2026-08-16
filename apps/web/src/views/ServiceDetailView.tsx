import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.ts";
import { ArticleChip, ErrorBox, StatusChip } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { documentTitle } from "../hooks/useDocuments.ts";

/**
 * Tek servisin havuzu.
 *
 * Karta tiklanınca evrakin sohbeti acilir; DocumentLayout orada evraki "acildi"
 * olarak isaretler, yani havuzdan secilen evrak sol seritteki gecmise girer.
 * Havuz listesi cevaplanmis evraki da tasir (soluk gosterilir): "bu is nerede
 * kaldi" sorusu ancak ikisi bir aradayken cevaplaniyor.
 */
export function ServiceDetailView() {
  const { serviceName } = useParams<{ serviceName: string }>();
  const navigate = useNavigate();
  // Yonlendirilemeyen havuzun sunucudaki karsiligi servis = NULL.
  const service = !serviceName || serviceName === "belirlenemedi" ? null : serviceName;

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", service],
    queryFn: () => api.documents(service),
  });

  const documents = data?.documents ?? [];
  const answeredCount = documents.filter((d) => d.yasamDongusu === "completed").length;

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
        <span className="truncate text-[13px] text-silik">
          {service ?? "Yönlendirilemeyen evraklar"}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-7 pt-7 pb-14">
        <div className="mx-auto w-full max-w-[820px] animate-yukse">
          <Link
            to="/services"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cizgi-2 bg-white py-1.5 pr-[11px] pl-[9px] text-[12.5px] font-semibold transition-colors hover:border-cizgi-5"
          >
            ← Tüm servisler
          </Link>

          <h1 className="mt-4 mb-1 text-[21px] font-bold tracking-[-.01em]">
            {service ?? "Yönlendirilemeyen Evraklar"}
          </h1>
          <p className="mb-5 text-[12.5px] text-silik">
            {documents.length - answeredCount} evrak cevap bekliyor
            {answeredCount > 0 && ` · ${answeredCount} cevaplandı`}
          </p>

          {error ? (
            <ErrorBox error={error} />
          ) : isLoading ? (
            <Skeleton />
          ) : !documents.length ? (
            <div className="rounded-xl border-[1.5px] border-dashed border-cizgi-4 px-6 py-9 text-center text-[12.5px] text-silik">
              Bu serviste bekleyen ya da cevaplanmış evrak yok.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {documents.map((d) => {
                // Cevaplanmis evrak havuzda kalir ama soluklastirilir: goz once
                // is bekleyen belgelere gitmeli.
                const isAnswered = d.yasamDongusu === "completed";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate(`/documents/${d.id}`)}
                    className={`block w-full rounded-xl border border-cizgi px-4 py-3.5 text-left transition-[border-color,box-shadow,opacity] hover:border-cizgi-4 hover:shadow-kart ${
                      isAnswered ? "bg-panel opacity-70 hover:opacity-100" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] leading-[1.4] font-semibold">
                          {documentTitle(d)}
                        </div>
                        <div className="mt-[3px] truncate text-[11.5px] text-soluk">
                          {d.filename}
                        </div>
                        {d.routing.gerekce && !isAnswered && (
                          <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-ikincil">
                            {d.routing.gerekce}
                          </p>
                        )}
                        {d.routing.maddeler.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {d.routing.maddeler.map((m) => (
                              <ArticleChip key={m.maddeNo}>
                                <span title={m.baslik}>M.{m.maddeNo}</span>
                              </ArticleChip>
                            ))}
                          </div>
                        )}
                      </div>
                      <StatusChip doc={d} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl border border-cizgi bg-white" />
      ))}
    </div>
  );
}
