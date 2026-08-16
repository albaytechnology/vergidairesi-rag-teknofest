import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.ts";
import { DurumChip, Hata, MaddeChip } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { evrakBasligi } from "../hooks/useEvraklar.ts";

/**
 * Tek servisin havuzu.
 *
 * Karta tiklanınca evrakin sohbeti acilir; EvrakLayout orada evraki "acildi"
 * olarak isaretler, yani havuzdan secilen evrak sol seritteki gecmise girer.
 * Havuz listesi cevaplanmis evraki da tasir (soluk gosterilir): "bu is nerede
 * kaldi" sorusu ancak ikisi bir aradayken cevaplaniyor.
 */
export function ServiceDetailView() {
  const { servisAdi } = useParams<{ servisAdi: string }>();
  const navigate = useNavigate();
  // Yonlendirilemeyen havuzun sunucudaki karsiligi servis = NULL.
  const servis = !servisAdi || servisAdi === "belirlenemedi" ? null : servisAdi;

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", servis],
    queryFn: () => api.documents(servis),
  });

  const belgeler = data?.documents ?? [];
  const cevaplanan = belgeler.filter((d) => d.yasamDongusu === "completed").length;

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
        <span className="truncate text-[13px] text-silik">
          {servis ?? "Yönlendirilemeyen evraklar"}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-7 pt-7 pb-14">
        <div className="mx-auto w-full max-w-[820px] animate-yukse">
          <Link
            to="/servisler"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cizgi-2 bg-white py-1.5 pr-[11px] pl-[9px] text-[12.5px] font-semibold transition-colors hover:border-cizgi-5"
          >
            ← Tüm servisler
          </Link>

          <h1 className="mt-4 mb-1 text-[21px] font-bold tracking-[-.01em]">
            {servis ?? "Yönlendirilemeyen Evraklar"}
          </h1>
          <p className="mb-5 text-[12.5px] text-silik">
            {belgeler.length - cevaplanan} evrak cevap bekliyor
            {cevaplanan > 0 && ` · ${cevaplanan} cevaplandı`}
          </p>

          {error ? (
            <Hata hata={error} />
          ) : isLoading ? (
            <Iskelet />
          ) : !belgeler.length ? (
            <div className="rounded-xl border-[1.5px] border-dashed border-cizgi-4 px-6 py-9 text-center text-[12.5px] text-silik">
              Bu serviste bekleyen ya da cevaplanmış evrak yok.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {belgeler.map((d) => {
                // Cevaplanmis evrak havuzda kalir ama soluklastirilir: goz once
                // is bekleyen belgelere gitmeli.
                const cevaplandi = d.yasamDongusu === "completed";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate(`/evrak/${d.id}`)}
                    className={`block w-full rounded-xl border border-cizgi px-4 py-3.5 text-left transition-[border-color,box-shadow,opacity] hover:border-cizgi-4 hover:shadow-kart ${
                      cevaplandi ? "bg-panel opacity-70 hover:opacity-100" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] leading-[1.4] font-semibold">
                          {evrakBasligi(d)}
                        </div>
                        <div className="mt-[3px] truncate text-[11.5px] text-soluk">
                          {d.filename}
                        </div>
                        {d.routing.gerekce && !cevaplandi && (
                          <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-ikincil">
                            {d.routing.gerekce}
                          </p>
                        )}
                        {d.routing.maddeler.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {d.routing.maddeler.map((m) => (
                              <MaddeChip key={m.maddeNo}>
                                <span title={m.baslik}>M.{m.maddeNo}</span>
                              </MaddeChip>
                            ))}
                          </div>
                        )}
                      </div>
                      <DurumChip doc={d} />
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

function Iskelet() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl border border-cizgi bg-white" />
      ))}
    </div>
  );
}
