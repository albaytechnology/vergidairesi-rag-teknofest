import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { Kart, Rozet } from "../components/ui.tsx";
import type { UploadStage } from "../api/types.ts";

const ASAMA_ETIKET: Record<UploadStage, string> = {
  kuyrukta: "kayda alınıyor — parse bekliyor",
  isleniyor: "işleniyor — chunk · analiz · servis yönlendirme",
  hazir: "kaydedildi",
  hata: "parse başarısız",
};

/**
 * Evrak Ekle — kurumun evrak GIRIS NOKTASI.
 *
 * Gercek isleyiste vergi dairesine gelen her belge once Yazisma ve Arsiv
 * Servisi'ne girer, kaydi yapilir, sonra ilgili servise sevk edilir
 * (Yonetmelik M.11-B-I-6). Bu ekran o girisi temsil eder: burada eklenen
 * evrak dogrudan "Cevap Yazisi Yazilmayan Dilekceler" listesine duser.
 *
 * Yukleme istegi LLM'i BEKLEMEZ: dosya diske yazilip kuyruga birakilir ve
 * hemen doner. Ilerleme bu yuzden yoklamayla gosterilir.
 */
export function Upload() {
  const [yollar, setYollar] = useState<string[]>([]);
  /**
   * Diskteki ad carpismasin diye UUID onekli yaziliyor ("0a2c32a4-dilekce.pdf").
   * Listede kullanicinin SECTIGI adi gostermek icin esleme burada tutulur.
   */
  const [adlar, setAdlar] = useState<Record<string, string>>({});
  const [reddedilen, setReddedilen] = useState<{ filename: string; sebep: string }[]>([]);
  const [uzerinde, setUzerinde] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const qc = useQueryClient();

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

  const hepsiBitti = (data?.durumlar.length ?? 0) > 0 && data!.durumlar.every((d) => d.asama !== "kuyrukta" && d.asama !== "isleniyor");

  // Hat bitince arsiv ve havuz sayaclari bayat kalmasin.
  useEffect(() => {
    if (!hepsiBitti) return;
    void qc.invalidateQueries({ queryKey: ["archive"] });
    void qc.invalidateQueries({ queryKey: ["services"] });
  }, [hepsiBitti, qc]);

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
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 border-l-4 border-gib pl-3">
        <h1 className="text-xl font-bold tracking-tight">Evrak Ekle</h1>
        <p className="text-sm text-ikincil">
          Kuruma gelen evrakın giriş noktası — Yazışma ve Arşiv Servisi kaydı
        </p>
      </div>

      <Kart className="mb-4 p-3 text-xs leading-relaxed text-ikincil">
        Eklenen belgeler önce <strong className="text-metin">Yazışma ve Arşiv Servisi</strong>
        &apos;ne kaydedilir ve{" "}
        <Link to="/arsiv" className="text-gib underline">
          Cevap Yazısı Yazılmayan Dilekçeler
        </Link>{" "}
        listesine düşer. Sistem her belgeyi okuyup yönetmeliğe göre ilgili servise sevk eder;
        evrak, cevap yazısı üretilene kadar arşiv takibinde kalır.
        <br />
        Sohbete <em>referans</em> belge (ek mevzuat vb.) eklemek için belge ekranındaki ataç
        düğmesini kullanın — o belgeler evrak sayılmaz, arşive girmez.
      </Kart>

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
          {gonderiliyor
            ? "Yükleniyor…"
            : "Dosyaları buraya sürükleyin veya seçmek için tıklayın"}
        </span>
        <span className="mt-1 text-xs text-ikincil">
          Birden fazla dosya seçebilirsiniz · pdf · docx · xlsx · pptx · txt · md · html
        </span>
      </label>

      {hata && (
        <div className="mt-4 rounded border border-uyari/30 bg-amber-50 p-3 text-sm text-uyari">
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
            Evrak kaydı
          </h2>
          <div className="space-y-2">
            {(
              data?.durumlar ??
              yollar.map((path) => ({
                path,
                asama: "kuyrukta" as const,
                id: null,
                servis: null,
              }))
            ).map((d) => (
              <Kart key={d.path} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {adlar[d.path] ?? dosyaAdi(d.path)}
                  </div>
                  <div className="text-xs text-ikincil">
                    {ASAMA_ETIKET[d.asama]}
                    {d.servis ? ` → ${d.servis}` : ""}
                  </div>
                </div>
                {d.asama === "hazir" && d.id ? (
                  <Link
                    to={`/document/${d.id}`}
                    className="shrink-0 rounded bg-gib px-3 py-1.5 text-xs font-medium text-white hover:bg-gib-koyu"
                  >
                    Aç
                  </Link>
                ) : (
                  <Rozet ton={d.asama === "hata" ? "uyari" : "notr"}>{d.asama}</Rozet>
                )}
              </Kart>
            ))}
          </div>
          <TamamlanmaNotu bitti={hepsiBitti} />
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
    <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-onay">
      Evrak kaydı tamamlandı.{" "}
      <Link to="/arsiv" className="underline">
        Yazışma ve Arşiv listesinde gör
      </Link>
    </div>
  );
}

const dosyaAdi = (yol: string) => yol.split("/").pop() ?? yol;
