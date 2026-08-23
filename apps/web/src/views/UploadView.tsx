import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { WarningBox } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { useUploads, type TrackedUpload } from "../shell/UploadProvider.tsx";
import { api } from "../api/client.ts";
import type { UploadStage } from "../api/types.ts";

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.txt,.md";

/** Asamanin adi ve hattaki ilerleme payi — cubuk buradan doluyor. */
const STAGES: Record<UploadStage, { label: string; percent: number }> = {
  kuyrukta: { label: "kayda alındı — parse bekliyor", percent: 15 },
  isleniyor: { label: "işleniyor — chunk · analiz · servis yönlendirme · indeksleme", percent: 65 },
  hazir: { label: "kaydedildi ve arandığında bulunur", percent: 100 },
  hata: { label: "parse başarısız — dosya okunamadı", percent: 100 },
};

/**
 * Evrak ekle — sistemin tek giris noktasi.
 *
 * Yonetmelikte kuruma gelen her belge once Yazisma ve Arsiv Servisi'ne girer
 * (M.11-B-I-6); buradaki birakma alani o girisi temsil eder. Yukleme istegi
 * LLM'i BEKLEMEZ: dosya diske yazilip kuyruga birakilir ve hat arkada calisir.
 *
 * Ilerleme burada TUTULMAZ, yalnizca gosterilir (bkz. UploadProvider): takip
 * rotalarin ustunde durdugu icin calisan bu ekrandan ayrilip geri geldiginde
 * ayni satirlari bulur, is bittiginde de nerede olursa olsun bildirim alir.
 */
export function UploadView() {
  const { uploads, track, toast } = useUploads();

  const [rejected, setRejected] = useState<{ filename: string; sebep: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    if (!files.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.upload(files);
      track(result.dosyalar);
      setRejected(result.reddedilen);
      for (const r of result.reddedilen) {
        toast({ tone: "hata", title: "Dosya kabul edilmedi", detail: `${r.filename} — ${r.sebep}` });
      }
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
      </header>

      <div className="flex flex-1 justify-center overflow-y-auto px-7 py-14">
        <div className="w-full max-w-[660px] animate-yukse">
          <h1 className="m-0 text-center text-[26px] font-bold tracking-[-.02em]">Evrak ekle</h1>
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
              dragOver
                ? "border-gib bg-gib-duman"
                : "border-cizgi-4 bg-white hover:border-gib hover:bg-gib-duman"
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

          {uploads.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {uploads.map((u) => (
                <UploadRow key={u.path} upload={u} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Tek dosyanin hattaki durumu: ad, asama metni ve dolan cubuk. */
function UploadRow({ upload }: { upload: TrackedUpload }) {
  const stage = STAGES[upload.stage];
  const hata = upload.stage === "hata";
  const bitti = upload.stage === "hazir";

  return (
    <div className="rounded-xl border border-cizgi bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{upload.filename}</div>
          <div className={`mt-0.5 text-[11.5px] ${hata ? "text-uyari" : "text-silik"}`}>
            {stage.label}
            {upload.servis ? ` → ${upload.servis}` : ""}
          </div>
        </div>
        {bitti && upload.docId ? (
          <Link
            to={`/documents/${upload.docId}`}
            className="shrink-0 rounded-lg border border-cizgi-2 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-govde transition-colors hover:border-gib hover:text-gib"
          >
            Sohbeti aç
          </Link>
        ) : (
          !hata && (
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-cizgi-4 border-t-gib" />
          )
        )}
      </div>

      {/*
       * Ilerleme cubugu asamadan turuyor, gercek bir yuzde degil: hat adim
       * adim ilerliyor ve sunucu ara ilerleme bildirmiyor. Yaniltmamak icin
       * adimlar ayni araliklarla degil, surelerine yakin paylarla bolundu —
       * en uzun bekleme "isleniyor" adimindadir.
       */}
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-yuzey">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            hata ? "bg-uyari" : bitti ? "bg-onay" : "bg-gib"
          }`}
          style={{ width: `${stage.percent}%` }}
        />
      </div>
    </div>
  );
}
