import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { ArticleChip, WarningBox } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { documentTitle, useDocuments } from "../hooks/useDocuments.ts";
import type { UploadStage } from "../api/types.ts";

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.pptx,.txt,.md,.html";

const STAGE_LABEL: Record<UploadStage, string> = {
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
  const { suggestions, isLoading } = useDocuments();

  const [paths, setPaths] = useState<string[]>([]);
  /** Diskte ad carpismasin diye UUID onekli yaziliyor; listede kullanicinin sectigi ad gorunur. */
  const [names, setNames] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<{ filename: string; sebep: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["upload-status", paths],
    queryFn: () => api.uploadStatus(paths),
    enabled: paths.length > 0,
    // Hat calisirken sik yokla, hepsi bitince dur.
    refetchInterval: (q) => {
      const rows = q.state.data?.durumlar ?? [];
      const running = rows.some((d) => d.asama === "kuyrukta" || d.asama === "isleniyor");
      return rows.length === 0 || running ? 2000 : false;
    },
  });

  const statuses = data?.durumlar ?? [];
  const readyId = statuses.find((d) => d.asama === "hazir" && d.id)?.id ?? null;

  /**
   * Ilk belge aranabilir olunca dogrudan sohbetine gec.
   *
   * Olcut "parse edildi" degil "embed edildi" (bkz. /api/documents/status):
   * erken gecis, kullanicinin heniz indekslenmemis belgeye soru sorup
   * "bu bilgi belgede bulunamadi" cevabi almasina yol aciyordu.
   */
  useEffect(() => {
    if (!readyId) return;
    void qc.invalidateQueries({ queryKey: ["archive"] });
    void qc.invalidateQueries({ queryKey: ["services"] });
    navigate(`/documents/${readyId}`);
  }, [readyId, navigate, qc]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.upload(files);
      setPaths((prev) => [...prev, ...result.dosyalar.map((d) => d.path)]);
      setNames((prev) => ({
        ...prev,
        ...Object.fromEntries(result.dosyalar.map((d) => [d.path, d.filename])),
      }));
      setRejected(result.reddedilen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="flex h-[60px] flex-[0_0_60px] items-center gap-3 border-b border-cizgi bg-white px-5">
        <HeaderNav />
        <span className="truncate text-[13px] text-silik">
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
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void upload([...e.dataTransfer.files]);
            }}
            className={`flex w-full flex-col items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed px-6 py-[30px] transition-colors ${
              dragOver ? "border-gib bg-gib-duman" : "border-cizgi-4 bg-white hover:border-gib hover:bg-gib-duman"
            }`}
          >
            <span className="text-[15px] font-semibold">
              {submitting ? "Yükleniyor…" : "+ Yeni evrak ekle"}
            </span>
            <span className="text-xs text-silik">
              Dosyaları sürükleyin · pdf · docx · xlsx · txt · md
            </span>
          </button>

          {error && (
            <div className="mt-4">
              <WarningBox>{error}</WarningBox>
            </div>
          )}

          {rejected.length > 0 && (
            <div className="mt-4">
              <WarningBox>
                <div className="font-semibold">Reddedilen dosyalar</div>
                {rejected.map((r) => (
                  <div key={r.filename}>
                    {r.filename} — {r.sebep}
                  </div>
                ))}
              </WarningBox>
            </div>
          )}

          {statuses.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {statuses.map((d) => (
                <div
                  key={d.path}
                  className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">
                      {names[d.path] ?? d.path.split("/").pop()}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-silik">
                      {STAGE_LABEL[d.asama]}
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

          {isLoading ? (
            <Skeleton />
          ) : !suggestions.length ? (
            <p className="py-6 text-center text-[12.5px] leading-relaxed text-silik">
              Açılmayı bekleyen evrak yok. Yeni bir dilekçe ekleyin ya da sol şeritten önceki
              sohbetlerinize dönün.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((d) => (
                <Link
                  key={d.id}
                  to={`/documents/${d.id}`}
                  className="block rounded-xl border border-cizgi bg-white px-4 py-3.5 transition-[border-color,box-shadow] hover:border-cizgi-4 hover:shadow-kart"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-[1.4] font-semibold">
                        {documentTitle(d)}
                      </div>
                      <div className="mt-[3px] truncate text-[11.5px] text-soluk">
                        {d.filename}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] text-ikincil">
                          {d.routing.servis ?? "yönlendirilemedi — manuel inceleme"}
                        </span>
                        {d.routing.maddeler.map((m) => (
                          <ArticleChip key={m.maddeNo}>
                            <span title={m.baslik}>M.{m.maddeNo}</span>
                          </ArticleChip>
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

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl border border-cizgi bg-white" />
      ))}
    </div>
  );
}
