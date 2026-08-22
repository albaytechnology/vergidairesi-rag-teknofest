import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBox, StatusChip } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { documentTitle, useDocuments } from "../hooks/useDocuments.ts";
import type { DocumentSummary } from "../api/types.ts";

type StatusFilter = "hepsi" | "bekleyen" | "cevaplanan";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "hepsi", label: "Tümü" },
  { value: "bekleyen", label: "Cevap bekliyor" },
  { value: "cevaplanan", label: "Cevaplandı" },
];

/**
 * Yazisma ve Arsiv Servisi gorunumu (M.11-B-I-6).
 *
 * Servis havuzlari "hangi is kimde" sorusunu cevapliyor; burasi "o evrak
 * nerede" sorusunu cevaplar: kuruma giren TUM evrak, servisinden ve durumundan
 * bagimsiz tek tabloda. Sol seritteki liste bir sohbet gecmisidir ve bu isi
 * yapamaz — orada yalnizca uzerinde calisilmis evrak durur.
 *
 * Arama ve filtreler istemcide calisiyor: liste zaten bellekte (sol seridin ve
 * ana ekranin besledigi ayni iki sorgu) ve her tus vurusunda sunucuya gitmek,
 * elde olan veriyi yeniden istemek olurdu. Kayit sayisi buyudugunde sunucu
 * tarafina tasinmasi gereken ilk yer burasi.
 */
export function ArchiveView() {
  const navigate = useNavigate();
  const { inProgress, answered, suggestions, isLoading, error } = useDocuments();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("hepsi");
  const [status, setStatus] = useState<StatusFilter>("hepsi");

  // Bekleyen = acilmis + hic acilmamis; ikisi de "cevap bekliyor" durumundadir.
  const documents = useMemo(
    () => [...inProgress, ...suggestions, ...answered],
    [inProgress, suggestions, answered],
  );

  const services = useMemo(
    () =>
      [...new Set(documents.map((d) => d.routing.servis).filter((s): s is string => Boolean(s)))]
        .sort((a, b) => a.localeCompare(b, "tr")),
    [documents],
  );

  const rows = useMemo(() => {
    const aranan = fold(query);
    return documents.filter((d) => {
      if (status === "bekleyen" && d.yasamDongusu === "completed") return false;
      if (status === "cevaplanan" && d.yasamDongusu !== "completed") return false;
      if (service !== "hepsi" && (d.routing.servis ?? "") !== service) return false;
      return !aranan || fold(searchable(d)).includes(aranan);
    });
  }, [documents, query, service, status]);

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
      </header>

      <div className="flex-1 overflow-y-auto px-7 pt-8 pb-14">
        <div className="mx-auto w-full max-w-[1080px] animate-yukse">
          <h1 className="m-0 text-[22px] font-bold tracking-[-.01em]">Arşiv</h1>
          <p className="mt-1 text-[12.5px] text-pretty text-silik">
            Kuruma giren her evrak, yönlendirildiği servisten bağımsız olarak burada kayıtlıdır.
            {rows.length !== documents.length && ` ${rows.length} / ${documents.length} kayıt.`}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Evrak, dosya adı, mükellef ya da servis ara…"
              className="min-w-[240px] flex-1 rounded-[10px] border border-cizgi-2 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-cizgi-5"
            />
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="rounded-[10px] border border-cizgi-2 bg-white px-3 py-2.5 text-[12.5px] text-govde outline-none"
            >
              <option value="hepsi">Tüm servisler</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  className={`rounded-[9px] border px-3 py-2.5 text-[12.5px] font-semibold transition-colors ${
                    status === f.value
                      ? "border-metin bg-metin text-white"
                      : "border-cizgi-2 bg-white text-govde hover:border-cizgi-5"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <ErrorBox error={error} />
          ) : isLoading ? (
            <Skeleton />
          ) : !rows.length ? (
            <div className="mt-6 rounded-xl border-[1.5px] border-dashed border-cizgi-4 px-6 py-10 text-center text-[12.5px] text-silik">
              {documents.length
                ? "Bu ölçütlere uyan evrak yok."
                : "Arşivde henüz evrak yok — “Evrak ekle” sekmesinden başlayın."}
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-cizgi bg-white">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-cizgi bg-panel">
                    <Th>Evrak</Th>
                    <Th>Servis</Th>
                    <Th>Tarih</Th>
                    <Th>Durum</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="cursor-pointer border-b border-cizgi-3 transition-colors last:border-b-0 hover:bg-panel"
                    >
                      <td className="max-w-[420px] px-4 py-3">
                        <div className="truncate text-[13px] font-semibold">
                          {documentTitle(d)}
                        </div>
                        <div className="mt-px truncate text-[11.5px] text-soluk">{d.filename}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-ikincil">
                        {d.routing.servis ?? "yönlendirilemedi"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11.5px] whitespace-nowrap text-silik">
                        {trTarih(d.tamamlanmaTarihi ?? d.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip doc={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Th({ children }: { children: string }) {
  return (
    <th className="px-4 py-2.5 text-[10.5px] font-semibold tracking-[.09em] text-silik uppercase">
      {children}
    </th>
  );
}

function Skeleton() {
  return (
    <div className="mt-5 flex flex-col gap-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[58px] animate-pulse rounded-xl border border-cizgi bg-white" />
      ))}
    </div>
  );
}

/** Aramanin tarayacagi alanlar — baslik, dosya adi, mukellef ve servis. */
const searchable = (d: DocumentSummary): string =>
  [
    documentTitle(d),
    d.filename,
    d.routing.servis ?? "",
    ...(d.entities?.kisiKurumlar ?? []),
    d.entities?.vkn ?? "",
    d.entities?.tckn ?? "",
  ].join(" ");

/**
 * Turkce duyarli katlama.
 *
 * toLowerCase() varsayilan yerelde "İzmir" -> "i̇zmir" uretiyor ve kullanicinin
 * yazdigi "izmir" ile eslesmiyor; tr-TR yereli bu ciftleri dogru esler.
 */
const fold = (s: string): string => s.toLocaleLowerCase("tr-TR").trim();

/** ISO tarih -> gg.aa.yyyy. Saat gosterilmiyor: tabloda gun yeterli. */
function trTarih(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
