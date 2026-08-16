import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, indir } from "../api/client.ts";
import { EtiketBasligi, UyariKutusu } from "../components/ui.tsx";
import { useEvrak } from "../shell/EvrakLayout.tsx";
import type { LetterDecision, LetterModel } from "../api/types.ts";

const KARARLAR: { deger: LetterDecision; etiket: string; olumsuz: boolean }[] = [
  { deger: "onay", etiket: "Onay", olumsuz: false },
  { deger: "kismi_onay", etiket: "Kısmi onay", olumsuz: true },
  { deger: "red", etiket: "Red", olumsuz: true },
  { deger: "eksik_belge", etiket: "Eksik belge", olumsuz: true },
  { deger: "bilgilendirme", etiket: "Bilgilendirme", olumsuz: false },
];

/** Sablonda serbest duzenlemeye acilan bloklar — antet/imza/sayi korunur. */
const DUZENLENEBILIR = [".konu", ".ilgi-liste", ".metin"];

/**
 * Cevap yazisi ekrani.
 *
 * Onizleme bir IFRAME'dir cunku yazi gercek resmi sablonla (antet, sayi, imza
 * blogu) uretiliyor ve ciktinin birebir aynisi gorunmeli — duz metin bir
 * onizleme, calisana imzalayacagi belgeyi gostermezdi. Tasarimin "kagit karti"
 * bu cercevenin disini olusturur.
 */
export function ReplyView() {
  const { doc } = useEvrak();
  const docId = doc.id;
  const [karar, setKarar] = useState<LetterDecision>("onay");
  const [gerekce, setGerekce] = useState("");
  const [muhatapAd, setMuhatapAd] = useState(doc.entities?.kisiKurumlar[0] ?? "");
  const [muhatapTur, setMuhatapTur] = useState<"kisi" | "kurum">("kisi");
  const [model, setModel] = useState<LetterModel | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [uyarilar, setUyarilar] = useState<string[]>([]);
  const [indirmeHatasi, setIndirmeHatasi] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const cerceveRef = useRef<HTMLIFrameElement>(null);
  const qc = useQueryClient();

  const olumsuz = KARARLAR.find((k) => k.deger === karar)?.olumsuz ?? false;
  const gerekceEksik = olumsuz && !gerekce.trim();

  const { data: gecmis } = useQuery({
    queryKey: ["letters", docId],
    queryFn: () => api.letters(docId),
  });

  const uret = useMutation({
    mutationFn: (kaydet: boolean) =>
      api.draftLetter({
        docId,
        karar,
        gerekce: gerekce.trim() || undefined,
        muhatap: { ad: muhatapAd.trim() || undefined, tur: muhatapTur },
        kaydet,
      }),
    onSuccess: (sonuc, kaydet) => {
      setModel(sonuc.model);
      setHtml(sonuc.html);
      setUyarilar([
        ...sonuc.dayanaksizSayilar.map(
          (s) => `Evrakta karşılığı bulunamayan sayı: "${s}" — göndermeden önce doğrulayın.`,
        ),
        ...sonuc.eksikAlanlar.map((a) => `Yapılandırılmamış alan: ${a}`),
      ]);
      if (kaydet) void qc.invalidateQueries({ queryKey: ["letters", docId] });
    },
  });

  /**
   * Onizlemeyi duzenlemeye ac ve yuksekligini iceriğe gore ayarla.
   *
   * onLoad'a guvenilemiyor: srcDoc'lu bir iframe once about:blank icin bir load
   * olayi yayinliyor, handler o bos belgede calisip hicbir sey bulamiyor ve
   * gercek icerik yuklendiginde bir daha denenmiyordu — sonuc olarak onizleme
   * sessizce SALT OKUNUR kaliyordu. Bu yuzden icerik gorunene kadar yokluyoruz.
   */
  useEffect(() => {
    if (!html) return;
    let iptal = false;
    const bitis = Date.now() + 5000;
    const dene = () => {
      if (iptal) return;
      const belge = cerceveRef.current?.contentDocument;
      if (belge?.querySelector(DUZENLENEBILIR[0]!)) {
        duzenlemeyiAc(cerceveRef.current);
        yuksekligiAyarla(cerceveRef.current);
        belge.addEventListener("input", () => yuksekligiAyarla(cerceveRef.current));
      } else if (Date.now() < bitis) requestAnimationFrame(dene);
    };
    dene();
    return () => {
      iptal = true;
    };
  }, [html]);

  /** Onizlemedeki son hali oku — calisanin elle duzeltmesi ciktilara yansisin. */
  function guncelHtml(): string {
    return cerceveRef.current?.contentDocument?.documentElement.outerHTML ?? html ?? "";
  }

  async function indirDosya(bicim: "pdf" | "docx") {
    setIndirmeHatasi(null);
    try {
      const ad = `cevap-yazisi-${docId.slice(0, 8)}.${bicim}`;
      const govde =
        bicim === "pdf"
          ? // docId gonderiliyor: PDF disari alinmasi evraki arsivde
            // "cevap yazildi" tarafina gecirir (is akisinin bitis isareti).
            { html: guncelHtml(), docId, karar }
          : { model: duzenlemeyiModeleYaz(model!, cerceveRef.current?.contentDocument ?? null) };
      indir(await api.letterFile(bicim, govde, ad), ad);
      if (bicim === "pdf") {
        void qc.invalidateQueries({ queryKey: ["archive"] });
        void qc.invalidateQueries({ queryKey: ["document", docId] });
      }
    } catch (err) {
      setIndirmeHatasi(err instanceof Error ? err.message : "İndirme başarısız");
    }
  }

  async function kopyala() {
    const metin = cerceveRef.current?.contentDocument?.body.innerText ?? "";
    await navigator.clipboard.writeText(metin).catch(() => undefined);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-x-auto">
      <div className="w-[340px] flex-[0_1_340px] overflow-y-auto border-r border-cizgi bg-white p-6 min-w-[288px]">
        <EtiketBasligi>Karar</EtiketBasligi>
        <div className="mt-3 mb-[22px] flex flex-col gap-1.5">
          {KARARLAR.map((k) => {
            const secili = karar === k.deger;
            return (
              <button
                key={k.deger}
                type="button"
                onClick={() => setKarar(k.deger)}
                className={`flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  secili ? "border-gib bg-gib-sis" : "border-cizgi-2 bg-white hover:border-cizgi-5"
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 flex-[0_0_14px] rounded-full bg-white ${
                    secili ? "border-4 border-gib" : "border-[1.5px] border-cizgi-5"
                  }`}
                />
                <span className="text-[13px] font-medium">{k.etiket}</span>
              </button>
            );
          })}
        </div>

        <EtiketBasligi>
          Gerekçe {olumsuz && <span className="text-uyari normal-case">(zorunlu)</span>}
        </EtiketBasligi>
        <textarea
          rows={4}
          value={gerekce}
          onChange={(e) => setGerekce(e.target.value)}
          placeholder={
            olumsuz ? "Talebin neden karşılanmadığı" : "İsteğe bağlı — boş bırakılabilir"
          }
          className={`mt-2.5 mb-[22px] w-full resize-y rounded-[10px] border px-3 py-2.5 text-[13px] leading-[1.5] outline-none ${
            gerekceEksik ? "border-uyari" : "border-cizgi-2"
          }`}
        />

        <EtiketBasligi>Muhatap</EtiketBasligi>
        <input
          value={muhatapAd}
          onChange={(e) => setMuhatapAd(e.target.value)}
          placeholder="Ad Soyad / Kurum"
          className="mt-2.5 mb-2.5 w-full rounded-[10px] border border-cizgi-2 px-3 py-2.5 text-[13px] outline-none"
        />
        <div className="mb-6 flex gap-2">
          {(["kisi", "kurum"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMuhatapTur(t)}
              className={`flex-1 rounded-[9px] border p-2 text-[12.5px] font-semibold transition-colors ${
                muhatapTur === t
                  ? "border-metin bg-metin text-white"
                  : "border-cizgi-2 bg-white text-govde"
              }`}
            >
              {t === "kisi" ? "Kişi" : "Kurum"}
            </button>
          ))}
        </div>
        {(doc.entities?.vkn || doc.entities?.tckn) && (
          <p className="-mt-4 mb-6 text-[11.5px] text-silik">
            Doğrulanmış numara yazıya eklenecek: {doc.entities.vkn ?? doc.entities.tckn}
          </p>
        )}

        <button
          type="button"
          disabled={uret.isPending || gerekceEksik}
          onClick={() => uret.mutate(false)}
          className="w-full rounded-[11px] bg-gib p-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-gib-koyu disabled:opacity-40"
        >
          {uret.isPending ? "Taslak üretiliyor…" : "Taslak üret"}
        </button>
        {uret.isPending && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-silik">
            Dil modeli çalışıyor; uydurma sayı bulunursa yazı otomatik yeniden yazdırılır.
          </p>
        )}
        {uret.error && (
          <p className="mt-2 text-[11.5px] text-uyari">{(uret.error as Error).message}</p>
        )}

        {gecmis && gecmis.letters.length > 0 && (
          <div className="mt-6">
            <EtiketBasligi>Kaydedilmiş yazılar</EtiketBasligi>
            <div className="mt-2 flex flex-col gap-1">
              {gecmis.letters.map((l) => (
                <div key={l.id} className="text-[11.5px] text-silik">
                  <span className="font-medium text-govde">
                    {KARARLAR.find((k) => k.deger === l.karar)?.etiket ?? l.karar}
                  </span>{" "}
                  {l.sayi}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-[380px] flex-1 overflow-y-auto p-7">
        {html ? (
          <div className="mx-auto max-w-[720px] animate-yukse overflow-hidden rounded-[14px] border border-cizgi bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cizgi-3 px-6 py-4">
              <div className="text-[11px] font-semibold tracking-[.09em] text-silik uppercase">
                Cevap yazısı taslağı
              </div>
              <div className="flex flex-wrap gap-2">
                <IkincilDugme onClick={() => void kopyala()}>
                  {kopyalandi ? "Kopyalandı" : "Kopyala"}
                </IkincilDugme>
                <IkincilDugme
                  disabled={uret.isPending}
                  onClick={() => uret.mutate(true)}
                  baslik="Giden evrak sıra numarası alır ve yazıyı kaydeder"
                >
                  Kaydet (sayı ver)
                </IkincilDugme>
                <IkincilDugme onClick={() => void indirDosya("docx")}>DOCX indir</IkincilDugme>
                <button
                  type="button"
                  title="PDF olarak dışarı alır ve evrakı arşivde cevaplananlara taşır"
                  onClick={() => void indirDosya("pdf")}
                  className="rounded-lg bg-metin px-3 py-[7px] text-xs font-semibold text-white transition-colors hover:bg-black"
                >
                  Onayla ve arşivle
                </button>
              </div>
            </div>

            {uyarilar.length > 0 && (
              <div className="border-b border-uyari-cizgi bg-uyari-zemin px-6 py-2.5">
                {uyarilar.map((u) => (
                  <div key={u} className="text-[11px] leading-relaxed text-uyari">
                    ⚠ {u}
                  </div>
                ))}
              </div>
            )}

            <iframe
              ref={cerceveRef}
              title="Cevap yazısı önizleme"
              srcDoc={html}
              className="block h-[900px] w-full border-0"
            />

            <div className="flex flex-wrap items-center gap-2 border-t border-cizgi-3 px-6 py-3 text-[11px] text-silik">
              Konu, ilgi ve gövde blokları doğrudan düzenlenebilir; düzeltmeler PDF ve DOCX
              çıktılarına yansır.
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-[340px]">
              <div className="text-[13.5px] font-semibold text-govde">
                Kararı seçip “Taslak üret” deyin
              </div>
              <div className="mt-1.5 text-[12.5px] leading-[1.6] text-silik">
                Önizleme burada açılır; metin bloklarını doğrudan düzenleyebilirsiniz.
              </div>
            </div>
          </div>
        )}

        {indirmeHatasi && (
          <div className="mx-auto mt-3 max-w-[720px]">
            <UyariKutusu>{indirmeHatasi}</UyariKutusu>
          </div>
        )}
      </div>
    </div>
  );
}

function IkincilDugme({
  onClick,
  disabled = false,
  baslik,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  baslik?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={baslik}
      className="rounded-lg border border-cizgi-2 bg-white px-3 py-[7px] text-xs font-semibold text-govde transition-colors hover:border-cizgi-5 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Onizleme cercevesini iceriğinin boyuna uydurur — ic scroll olmasin. */
function yuksekligiAyarla(cerceve: HTMLIFrameElement | null): void {
  const govde = cerceve?.contentDocument?.body;
  if (cerceve && govde) cerceve.style.height = `${govde.scrollHeight + 24}px`;
}

/**
 * Onizlemede yalnizca metin bloklarini duzenlemeye acar.
 *
 * Tum govde contentEditable yapilsaydi calisan yanlislikla anteti, sayiyi ya da
 * imza blogunu silebilirdi; bunlar sablondan/veritabanindan geliyor ve elle
 * degistirilmemeli.
 */
function duzenlemeyiAc(cerceve: HTMLIFrameElement | null): void {
  const belge = cerceve?.contentDocument;
  if (!belge) return;
  for (const secici of DUZENLENEBILIR) {
    // DIKKAT: burada `el instanceof HTMLElement` KULLANILMAZ. Iframe kendi
    // JS realm'inde calisir; icindeki dugumler o pencerenin HTMLElement'inden
    // turer ve ana pencerenin HTMLElement'ine gore instanceof HER ZAMAN false
    // doner. Once bu kontrol vardi ve onizleme sessizce salt okunur kaliyordu.
    const el = belge.querySelector<HTMLElement>(secici);
    if (!el) continue;
    el.contentEditable = "true";
    el.style.outline = "none";
    el.addEventListener("focus", () => (el.style.background = "#fffbeb"));
    el.addEventListener("blur", () => (el.style.background = ""));
  }
}

/**
 * Onizlemedeki duzeltmeleri modele geri yazar.
 *
 * DOCX yapisal modelden uretiliyor; bu adim olmasaydi calisanin onizlemede
 * yaptigi duzeltme PDF'e yansiyip DOCX'e yansimazdi. Sablonun sinif adlari
 * sabit oldugu icin geri okuma guvenli.
 */
export function duzenlemeyiModeleYaz(model: LetterModel, belge: Document | null): LetterModel {
  if (!belge) return model;

  const metin = [...belge.querySelectorAll(".metin p")];
  const paragraflar = metin
    .filter((p) => !p.classList.contains("kapanis"))
    .map((p) => (p.textContent ?? "").trim())
    .filter(Boolean);
  const kapanis = (belge.querySelector(".metin .kapanis")?.textContent ?? "").trim();
  const ilgiSatirlari = [...belge.querySelectorAll(".ilgi-satir")]
    .map((s) => (s.textContent ?? "").trim())
    .filter(Boolean);
  const konu = (belge.querySelector(".konu")?.textContent ?? "")
    .replace(/^\s*Konu\s*:?\s*/u, "")
    .trim();

  return {
    ...model,
    konu: konu || model.konu,
    paragraflar: paragraflar.length ? paragraflar : model.paragraflar,
    kapanis: kapanis || model.kapanis,
    ilgiSatirlari,
  };
}
