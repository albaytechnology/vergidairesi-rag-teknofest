import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { Kart, Rozet } from "../components/ui.tsx";
import type { UploadStage } from "../api/types.ts";

const ASAMA_ETIKET: Record<UploadStage, string> = {
  kuyrukta: "kuyrukta — parse bekliyor",
  isleniyor: "işleniyor — chunk · analiz · yönlendirme",
  hazir: "hazır",
  hata: "parse başarısız",
};

/**
 * Evrak yukleme ve hat takibi.
 *
 * Yukleme istegi LLM'i BEKLEMEZ: dosya diske yazilip kuyruga birakilir ve
 * hemen doner. Ilerleme bu yuzden yoklamayla gosterilir — yuklenen yollar
 * /api/documents/status ile hazir olana kadar sorgulanir.
 */
export function Upload() {
  const [yollar, setYollar] = useState<string[]>([]);
  const [reddedilen, setReddedilen] = useState<{ filename: string; sebep: string }[]>([]);
  const [uzerinde, setUzerinde] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["upload-status", yollar],
    queryFn: () => api.uploadStatus(yollar),
    enabled: yollar.length > 0,
    // Hat calisirken sik, hepsi bitince yoklamayi durdur.
    refetchInterval: (q) => {
      const durumlar = q.state.data?.durumlar ?? [];
      const suruyor = durumlar.some((d) => d.asama === "kuyrukta" || d.asama === "isleniyor");
      return durumlar.length === 0 || suruyor ? 2000 : false;
    },
  });

  async function yukle(files: File[]) {
    if (!files.length) return;
    setGonderiliyor(true);
    setHata(null);
    try {
      const sonuc = await api.upload(files);
      setYollar((onceki) => [...onceki, ...sonuc.dosyalar.map((d) => d.path)]);
      setReddedilen(sonuc.reddedilen);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <Link to="/" className="text-sm text-ikincil hover:text-metin">
        ← Servisler
      </Link>
      <h1 className="mt-2 mb-1 border-l-4 border-gib pl-3 text-lg font-bold">Evrak Yükle</h1>
      <p className="mb-4 pl-3 text-sm text-ikincil">
        Toplu ingest ekranı. Yüklenen evrak parse → chunk → analiz → servis yönlendirme
        adımlarından geçer ve ilgili servisin havuzuna resmî evrak olarak düşer.
        <br />
        Sohbete <em>referans</em> belge eklemek için belge ekranındaki ataç düğmesini
        kullanın — o belgeler havuza girmez.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setUzerinde(true);
        }}
        onDragLeave={() => setUzerinde(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUzerinde(false);
          void yukle([...e.dataTransfer.files]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition ${
          uzerinde ? "border-gib bg-gib-acik" : "border-cizgi bg-white hover:border-slate-400"
        }`}
      >
        <input
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.html"
          onChange={(e) => {
            void yukle([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <span className="text-sm font-medium">
          {gonderiliyor ? "Yükleniyor…" : "Dosyaları buraya sürükleyin veya seçmek için tıklayın"}
        </span>
        <span className="mt-1 text-xs text-ikincil">pdf · docx · xlsx · pptx · txt · md · html</span>
      </label>

      {hata && (
        <div className="mt-4 rounded border border-uyari/30 bg-uyari/5 p-3 text-sm text-uyari">
          {hata}
        </div>
      )}

      {reddedilen.length > 0 && (
        <Kart className="mt-4 p-3 text-sm">
          <div className="mb-1 font-medium text-uyari">Reddedilen dosyalar</div>
          {reddedilen.map((r) => (
            <div key={r.filename} className="text-xs text-ikincil">
              {r.filename} — {r.sebep}
            </div>
          ))}
        </Kart>
      )}

      {yollar.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ikincil">
            Hat durumu
          </h2>
          <div className="space-y-2">
            {(data?.durumlar ?? yollar.map((path) => ({ path, asama: "kuyrukta" as const, id: null, servis: null }))).map(
              (d) => (
                <Kart key={d.path} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {"filename" in d && d.filename ? d.filename : dosyaAdi(d.path)}
                    </div>
                    <div className="text-xs text-ikincil">
                      {ASAMA_ETIKET[d.asama]}
                      {d.servis ? ` → ${d.servis}` : ""}
                    </div>
                  </div>
                  {d.asama === "hazir" && d.id ? (
                    <Link
                      to={`/document/${d.id}`}
                      className="shrink-0 rounded bg-gib px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Aç
                    </Link>
                  ) : (
                    <Rozet ton={d.asama === "hata" ? "uyari" : "notr"}>{d.asama}</Rozet>
                  )}
                </Kart>
              ),
            )}
          </div>
          <TamamlanmaNotu bitti={(data?.durumlar ?? []).every((d) => d.asama === "hazir")} />
        </section>
      )}
    </div>
  );
}

function TamamlanmaNotu({ bitti }: { bitti: boolean }) {
  const [gecti, setGecti] = useState(false);
  useEffect(() => {
    if (bitti) setGecti(true);
  }, [bitti]);
  if (!gecti) return null;
  return (
    <p className="mt-3 text-sm text-ikincil">
      Tüm evraklar işlendi.{" "}
      <Link to="/" className="text-gib underline">
        Havuzlara git
      </Link>
    </p>
  );
}

const dosyaAdi = (yol: string) => yol.split("/").pop() ?? yol;
