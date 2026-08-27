import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { WarningBox } from "../components/ui.tsx";
import { HeaderNav } from "../shell/HeaderNav.tsx";
import { useUploads, type TrackedUpload } from "../shell/UploadProvider.tsx";
import { api } from "../api/client.ts";
import type { UploadStep, UploadStepStatus } from "../api/types.ts";

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.txt,.md";

/**
 * Hat adimlarinin ekrandaki karsiligi.
 *
 * `pay` cubuktaki genisliktir: adimlar esit surmuyor — kunye, ozet, yonlendirme
 * ve eksik bilgi taramasinin her biri ayri bir LLM cagrisi ve hattaki surenin
 * neredeyse tamami orada geciyor; chunk'lama ile indeksleme saniyeler suruyor.
 * Esit bolunmus bir cubuk, adimlarin yarisi bittiginde surenin de yarisi gecmis
 * izlenimi verirdi.
 *
 * `is` simdiki, `bitti` gecmis zamanda: satir hem su an ne yapildigini hem
 * neyin tamamlandigini ayni sozcuklerle soyluyor.
 */
const ADIMLAR: Record<UploadStep, { ad: string; is: string; bitti: string; pay: number }> = {
  parse: { ad: "Okuma", is: "belge okunuyor", bitti: "belge okundu", pay: 16 },
  chunk: { ad: "Parçalama", is: "metin parçalanıyor", bitti: "metin parçalandı", pay: 4 },
  kunye: { ad: "Künye", is: "künye çıkarılıyor", bitti: "künye çıkarıldı", pay: 16 },
  ozet: { ad: "Özet", is: "özet yazılıyor", bitti: "özet çıkarıldı", pay: 15 },
  yonlendirme: { ad: "Yönlendirme", is: "servis aranıyor", bitti: "servise yönlendirildi", pay: 25 },
  eksik: { ad: "Eksik bilgi", is: "eksik bilgi taranıyor", bitti: "eksik bilgi tarandı", pay: 18 },
  indeks: { ad: "İndeksleme", is: "aramaya indeksleniyor", bitti: "aramaya eklendi", pay: 6 },
};

/** Adim listesi sunucudan gelene kadarki ilk kare — cubuk bos baslamasin. */
const ILK_ADIMLAR: UploadStepStatus[] = (Object.keys(ADIMLAR) as UploadStep[]).map((ad) => ({
  ad,
  durum: ad === "parse" ? "calisiyor" : "bekliyor",
}));

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
  const { uploads, track, kaldir, toast } = useUploads();

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
                <UploadRow key={u.path} upload={u} onKaldir={() => kaldir(u.path)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Tek dosyanin hattaki durumu: ad, calisan adim ve adim adim dolan cubuk. */
function UploadRow({ upload, onKaldir }: { upload: TrackedUpload; onKaldir: () => void }) {
  const hata = upload.stage === "hata";
  const bitti = upload.stage === "hazir";
  /*
   * "kayip": sunucuda ne belge kaydi ne kuyrukta isi var. Eskiden bu durum
   * "kuyrukta" ile ayni gorunuyor ve satir sonsuza kadar "belge okunuyor"
   * diye donuyordu — sekmede duran eski bir takip kaydi (orn. veri tabani
   * sifirlandiktan sonra) hicbir zaman kapanmiyordu.
   */
  const kayip = upload.stage === "kayip";

  /*
   * Atlanan adim hic cizilmez.
   *
   * Sohbete eklenen dosya kunye/ozet/yonlendirme/eksik bilgi adimlarindan gecmez
   * (bkz. pipeline.ts); bu adimlari soluk da olsa gostermek, hicbir zaman
   * dolmayacak bolmeler birakip yukleme yarim kalmis izlenimi verirdi.
   */
  const adimlar = upload.adimlar.length
    ? upload.adimlar.filter((a) => a.durum !== "atlandi")
    : ILK_ADIMLAR;
  const calisan = adimlar.find((a) => a.durum === "calisiyor" || a.durum === "hata");
  const biten = adimlar.filter((a) => a.durum === "bitti").length;

  const durum = kayip
    ? "kaydı bulunamadı — kuyrukta işi yok, yeniden yükleyin"
    : hata
      ? `${calisan ? ADIMLAR[calisan.ad].ad.toLocaleLowerCase("tr-TR") : "okuma"} adımı başarısız`
      : bitti
        ? "tamamlandı — kaydedildi ve arandığında bulunur"
        : calisan
          ? `${biten + 1}/${adimlar.length} · ${ADIMLAR[calisan.ad].is}`
          : "kayda alındı — sıraya girdi";

  return (
    <div className="rounded-xl border border-cizgi bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{upload.filename}</div>
          <div className={`mt-0.5 text-[11.5px] ${hata || kayip ? "text-uyari" : "text-silik"}`}>
            {durum}
            {upload.servis ? ` → ${upload.servis}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {bitti && upload.docId ? (
            <Link
              to={`/documents/${upload.docId}`}
              className="rounded-lg border border-cizgi-2 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-govde transition-colors hover:border-gib hover:text-gib"
            >
              Sohbeti aç
            </Link>
          ) : (
            !hata &&
            !kayip && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cizgi-4 border-t-gib" />
            )
          )}
          {/* Satiri listeden dusurur; dosyaya ya da belgeye DOKUNMAZ — bu bir
              silme degil, "bunu artik takip etme" demek. */}
          <button
            type="button"
            aria-label="Satırı kaldır"
            title="Satırı kaldır"
            onClick={onKaldir}
            className="px-1 text-[13px] leading-none text-soluk transition-colors hover:text-govde"
          >
            ✕
          </button>
        </div>
      </div>

      {/*
       * Cubuk adim adim doluyor: her adimin kendi bolmesi var ve bolme ancak
       * o adim BITINCE doluyor. Tek parca bir cubuk yuzde bildirmek zorundaydi,
       * sunucu ara ilerleme uretmedigi icin de o yuzde uydurmaydi; bolmeli
       * cubuk yalnizca gercekten olan biteni gosterir.
       *
       * Ad, bolmenin ALTINDA duruyor: etiketler ayri bir satirda akarken hangi
       * adin hangi bolmeye ait oldugu okunmuyordu — bolmeler farkli genislikte
       * oldugu icin siralari da ortusmuyordu.
       */}
      {!kayip && (
        <div className="mt-2.5 flex gap-[3px]">
          {adimlar.map((a) => (
            <Step key={a.ad} adim={a} hata={hata} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Tek adim: ustte bolme, altinda adi. Calisan bolmede isik gezer — isin
 * surdugunu gosterir.
 *
 * Bolme genisligi paya gore, ama bir ALT SINIRI var: yalnizca paya birakilsa
 * kisa suren adimlarin (parcalama, indeksleme) alti birkac piksel kalir ve
 * altindaki ad okunmaz olurdu. Alt sinir ADIN KENDI genisligi (max-content):
 * hicbir adim adi kisalmaz, pay yalnizca artan genisligi paylastirir.
 */
function Step({ adim, hata }: { adim: UploadStepStatus; hata: boolean }) {
  const meta = ADIMLAR[adim.ad];
  const calisiyor = adim.durum === "calisiyor";
  const yanlis = adim.durum === "hata" || (hata && calisiyor);

  return (
    <div
      className="flex min-w-0 flex-col gap-[7px]"
      style={{ flex: `${meta.pay} 1 0%`, minWidth: "max-content" }}
      title={`${meta.ad} — ${adim.durum === "bitti" ? meta.bitti : meta.is}`}
    >
      <div className="h-1 overflow-hidden rounded-full bg-yuzey">
        {adim.durum === "bitti" ? (
          <div className="h-full w-full rounded-full bg-onay" />
        ) : yanlis ? (
          <div className="h-full w-full rounded-full bg-uyari" />
        ) : calisiyor ? (
          <div className="h-full w-2/5 animate-hat rounded-full bg-gib" />
        ) : null}
      </div>
      <StepLabel adim={adim} />
    </div>
  );
}

/** Bolmenin altindaki ad — hangi adimin nerede oldugu yaziyla da okunsun. */
function StepLabel({ adim }: { adim: UploadStepStatus }) {
  const { ad } = ADIMLAR[adim.ad];
  const ortak = "truncate text-center text-[10.5px]";
  if (adim.durum === "bitti") return <span className={`${ortak} text-ikincil`}>✓ {ad}</span>;
  if (adim.durum === "hata")
    return <span className={`${ortak} font-semibold text-uyari`}>✕ {ad}</span>;
  if (adim.durum === "calisiyor")
    return <span className={`${ortak} font-semibold text-gib`}>{ad}</span>;
  return <span className={`${ortak} text-soluk`}>{ad}</span>;
}
