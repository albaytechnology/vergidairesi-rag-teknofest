import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { MaddeChip, UyariKutusu } from "../components/ui.tsx";
import { evrakBasligi, useEvraklar } from "../hooks/useEvraklar.ts";
import type { UploadStage } from "../api/types.ts";

const KABUL_EDILEN = ".pdf,.docx,.xlsx,.pptx,.txt,.md,.html";

const ASAMA_ETIKET: Record<UploadStage, string> = {
  kuyrukta: "kayda alınıyor — parse bekliyor",
  isleniyor: "işleniyor — chunk · analiz · servis yönlendirme",
  hazir: "kaydedildi",
  hata: "parse başarısız",
};

/**
 * Ana ekran — evrak girisi ve devam edilecek isler.
 *
 * Yonetmelikte kuruma gelen her belge once Yazisma ve Arsiv Servisi'ne girer
 * (M.11-B-I-6); buradaki birakma alani o girisi temsil eder. Yukleme istegi
 * LLM'i BEKLEMEZ: dosya diske yazilip kuyruga birakilir, ilerleme yoklamayla
 * gosterilir ve belge aranabilir hale gelince sohbeti acilir.
 */
export function HomeView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { oneriler, yukleniyor } = useEvraklar();

  const [yollar, setYollar] = useState<string[]>([]);
  /** Diskte ad carpismasin diye UUID onekli yaziliyor; listede kullanicinin sectigi ad gorunur. */
  const [adlar, setAdlar] = useState<Record<string, string>>({});
  const [reddedilen, setReddedilen] = useState<{ filename: string; sebep: string }[]>([]);
  const [uzerinde, setUzerinde] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["upload-status", yollar],
    queryFn: () => api.uploadStatus(yollar),
    enabled: yollar.length > 0,
    // Hat calisirken sik yokla, hepsi bitince dur.
    refetchInterval: (q) => {
      const durumlar = q.state.data?.durumlar ?? [];
      const suruyor = durumlar.some((d) => d.asama === "kuyrukta" || d.asama === "isleniyor");
      return durumlar.length === 0 || suruyor ? 2000 : false;
    },
  });

  const durumlar = data?.durumlar ?? [];
  const hazirId = durumlar.find((d) => d.asama === "hazir" && d.id)?.id ?? null;

  /**
   * Ilk belge aranabilir olunca dogrudan sohbetine gec.
   *
   * Olcut "parse edildi" degil "embed edildi" (bkz. /api/documents/status):
   * erken gecis, kullanicinin heniz indekslenmemis belgeye soru sorup
   * "bu bilgi belgede bulunamadi" cevabi almasina yol aciyordu.
   */
  useEffect(() => {
    if (!hazirId) return;
    void qc.invalidateQueries({ queryKey: ["archive"] });
    void qc.invalidateQueries({ queryKey: ["services"] });
    navigate(`/evrak/${hazirId}`);
  }, [hazirId, navigate, qc]);

  async function yukle(files: File[]) {
    if (!files.length) return;
    setGonderiliyor(true);
    setHata(null);
    try {
      const sonuc = await api.upload(files);
      setYollar((onceki) => [...onceki, ...sonuc.dosyalar.map((d) => d.path)]);
      setAdlar((onceki) => ({
        ...onceki,
        ...Object.fromEntries(sonuc.dosyalar.map((d) => [d.path, d.filename])),
      }));
      setReddedilen(sonuc.reddedilen);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center border-b border-cizgi bg-white px-5">
        <span className="text-[13px] text-silik">
          Evrak asistanı — bir dilekçe seçin ya da yeni evrak ekleyin
        </span>
      </header>

      <div className="flex flex-1 justify-center overflow-y-auto px-7 py-14">
        <div className="w-full max-w-[660px] animate-yukse">
          <h1 className="m-0 text-center text-[26px] font-bold tracking-[-.02em]">
            Sınıflandırılmış dosyalardan birini seçin
          </h1>
          <p className="mt-2 mb-[26px] text-center text-[13.5px] text-pretty text-ikincil">
            Sisteme gelen evrak otomatik okunur, ilgili servise yönlendirilir ve cevap yazısı
            üretilene kadar takipte kalır.
          </p>

          <input
            ref={dosyaRef}
            type="file"
            multiple
            accept={KABUL_EDILEN}
            className="hidden"
            onChange={(e) => {
              void yukle([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => dosyaRef.current?.click()}
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
            className={`flex w-full flex-col items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed px-6 py-[30px] transition-colors ${
              uzerinde ? "border-gib bg-gib-duman" : "border-cizgi-4 bg-white hover:border-gib hover:bg-gib-duman"
            }`}
          >
            <span className="text-[15px] font-semibold">
              {gonderiliyor ? "Yükleniyor…" : "+ Yeni evrak ekle"}
            </span>
            <span className="text-xs text-silik">
              Dosyaları sürükleyin · pdf · docx · xlsx · txt · md
            </span>
          </button>

          {hata && (
            <div className="mt-4">
              <UyariKutusu>{hata}</UyariKutusu>
            </div>
          )}

          {reddedilen.length > 0 && (
            <div className="mt-4">
              <UyariKutusu>
                <div className="font-semibold">Reddedilen dosyalar</div>
                {reddedilen.map((r) => (
                  <div key={r.filename}>
                    {r.filename} — {r.sebep}
                  </div>
                ))}
              </UyariKutusu>
            </div>
          )}

          {durumlar.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {durumlar.map((d) => (
                <div
                  key={d.path}
                  className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">
                      {adlar[d.path] ?? d.path.split("/").pop()}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-silik">
                      {ASAMA_ETIKET[d.asama]}
                      {d.servis ? ` → ${d.servis}` : ""}
                    </div>
                  </div>
                  {d.asama !== "hata" && d.asama !== "hazir" && (
                    <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-cizgi-4 border-t-gib" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-cizgi" />
            <span className="text-[11.5px] font-medium text-silik">
              ya da cevap bekleyen evraklardan devam edin
            </span>
            <span className="h-px flex-1 bg-cizgi" />
          </div>

          {yukleniyor ? (
            <Iskelet />
          ) : !oneriler.length ? (
            <p className="py-6 text-center text-[12.5px] leading-relaxed text-silik">
              Açılmayı bekleyen evrak yok. Yeni bir dilekçe ekleyin ya da sol şeritten önceki
              sohbetlerinize dönün.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {oneriler.map((d) => (
                <Link
                  key={d.id}
                  to={`/evrak/${d.id}`}
                  className="block rounded-xl border border-cizgi bg-white px-4 py-3.5 transition-[border-color,box-shadow] hover:border-cizgi-4 hover:shadow-kart"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-[1.4] font-semibold">
                        {evrakBasligi(d)}
                      </div>
                      <div className="mt-[3px] truncate text-[11.5px] text-soluk">
                        {d.filename}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] text-ikincil">
                          {d.routing.servis ?? "yönlendirilemedi — manuel inceleme"}
                        </span>
                        {d.routing.maddeler.map((m) => (
                          <MaddeChip key={m.maddeNo}>
                            <span title={m.baslik}>M.{m.maddeNo}</span>
                          </MaddeChip>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-gib-acik px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-gib">
                      cevap bekliyor
                    </span>
                  </div>
                </Link>
              ))}
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
