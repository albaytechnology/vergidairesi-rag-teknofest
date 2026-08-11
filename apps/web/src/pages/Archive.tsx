import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import {
  Bos,
  GuvenSkoru,
  Hata,
  SatirIskeleti,
  Sayfa,
  YasamRozeti,
} from "../components/ui.tsx";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Yazisma ve Arsiv Servisi paneli.
 *
 * Yonetmelikte evrakin GIRIS NOKTASI olan servis (M.11-B-I-6) kuruma giren
 * her belgeyi bastan sona takip eder. Bu yuzden liste servise gore degil
 * YASAM DONGUSUNE gore bolunur: yonlendirilmis olmak bir evraki listeden
 * dusurmez, yalnizca cevap yazisinin disari alinmasi dusurur.
 */
export function Archive() {
  const [tamamlanan, setTamamlanan] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["archive", tamamlanan],
    queryFn: () => api.archive(tamamlanan),
    refetchInterval: 20_000,
  });

  if (error) return <Hata hata={error} />;

  const belgeler = data?.documents ?? [];

  return (
    <Sayfa dar>
      <div className="mb-5 border-l-4 border-gib pl-3">
        <h1 className="text-xl font-bold tracking-tight">Yazışma ve Arşiv Servisi</h1>
        <p className="text-sm text-ikincil">Kuruma gelen tüm belgelerin takip merkezi</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SekmeKarti
          aktif={!tamamlanan}
          onClick={() => setTamamlanan(false)}
          baslik="Cevap Yazısı Yazılmayan Dilekçeler"
          adet={data?.sayilar.bekleyen}
        />
        <SekmeKarti
          aktif={tamamlanan}
          onClick={() => setTamamlanan(true)}
          baslik="Cevap Yazısı Yazılan Dilekçeler"
          adet={data?.sayilar.tamamlanan}
        />
      </div>

      {isLoading ? (
        <SatirIskeleti />
      ) : !belgeler.length ? (
        <Bos>
          {tamamlanan
            ? "Henüz cevap yazısı üretilmiş evrak yok. PDF indirildiğinde belge buraya taşınır."
            : "Bekleyen evrak yok."}
        </Bos>
      ) : (
        <div className="space-y-2">
          {belgeler.map((d) => (
            <ArsivKarti key={d.id} doc={d} />
          ))}
        </div>
      )}
    </Sayfa>
  );
}

function SekmeKarti({
  aktif,
  onClick,
  baslik,
  adet,
}: {
  aktif: boolean;
  onClick: () => void;
  baslik: string;
  adet?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start justify-between gap-3 rounded-lg border bg-white p-4 text-left transition-all hover:shadow-md ${
        aktif ? "border-gib border-l-4" : "border-cizgi"
      }`}
    >
      <span className={`text-sm leading-snug ${aktif ? "font-semibold text-metin" : "text-ikincil"}`}>
        {baslik}
      </span>
      <span
        className={`shrink-0 rounded px-2 py-0.5 text-sm tabular-nums ${
          aktif ? "bg-gib font-semibold text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {adet ?? "–"}
      </span>
    </button>
  );
}

const KARAR_ETIKET: Record<string, string> = {
  onay: "Onay",
  kismi_onay: "Kısmi onay",
  red: "Red",
  eksik_belge: "Eksik belge",
  bilgilendirme: "Bilgilendirme",
};

function ArsivKarti({ doc }: { doc: DocumentSummary & { sonKarar?: string | null } }) {
  return (
    <Link to={`/document/${doc.id}`} className="block cursor-pointer">
      <div className="rounded-lg border border-cizgi bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-metin">
              {doc.konu ?? doc.filename}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">{doc.filename}</div>
          </div>
          <YasamRozeti durum={doc.yasamDongusu} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ikincil">
          <span>
            Servis:{" "}
            <span className="text-metin">
              {doc.routing.servis ?? "belirlenemedi — manuel inceleme"}
            </span>
          </span>
          <GuvenSkoru skor={doc.routing.guvenSkoru} />
          {doc.tamamlanmaTarihi && (
            <span>Cevap yazısı: {trTarih(doc.tamamlanmaTarihi)}</span>
          )}
          {doc.sonKarar && (
            <span>
              Karar:{" "}
              <span className="text-metin">{KARAR_ETIKET[doc.sonKarar] ?? doc.sonKarar}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

const trTarih = (iso: string): string =>
  new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
