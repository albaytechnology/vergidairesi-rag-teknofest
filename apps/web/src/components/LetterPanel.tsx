import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, indir } from "../api/client.ts";
import type { DocumentSummary, LetterDecision, LetterModel } from "../api/types.ts";
import { Baslik, Rozet } from "./ui.tsx";

const KARARLAR: { deger: LetterDecision; etiket: string; olumsuz: boolean }[] = [
  { deger: "onay", etiket: "Onay", olumsuz: false },
  { deger: "kismi_onay", etiket: "Kısmi onay", olumsuz: true },
  { deger: "red", etiket: "Red", olumsuz: true },
  { deger: "eksik_belge", etiket: "Eksik belge", olumsuz: true },
  { deger: "bilgilendirme", etiket: "Bilgilendirme", olumsuz: false },
];

/** Sablonda serbest duzenlemeye acilan bloklar — antet/imza/sayi korunur. */
const DUZENLENEBILIR = [".konu", ".ilgi-liste", ".metin"];

export function LetterPanel({
  docId,
  doc,
}: {
  docId: string;
  doc: DocumentSummary;
}) {
  const [karar, setKarar] = useState<LetterDecision>("onay");
  const [gerekce, setGerekce] = useState("");
  const [muhatapAd, setMuhatapAd] = useState(doc.entities?.kisiKurumlar[0] ?? "");
  const [muhatapTur, setMuhatapTur] = useState<"kisi" | "kurum">("kisi");
  const [model, setModel] = useState<LetterModel | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [uyarilar, setUyarilar] = useState<string[]>([]);
  const [indirmeHatasi, setIndirmeHatasi] = useState<string | null>(null);
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
    onSuccess: (sonuc) => {
      setModel(sonuc.model);
      setHtml(sonuc.html);
      setUyarilar([
        ...sonuc.dayanaksizSayilar.map(
          (s) => `Evrakta karşılığı bulunamayan sayı: "${s}" — göndermeden önce doğrulayın.`,
        ),
        ...sonuc.eksikAlanlar.map((a) => `Yapılandırılmamış alan: ${a}`),
      ]);
    },
  });

  /**
   * Onizlemeyi duzenlemeye ac.
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
      if (belge?.querySelector(DUZENLENEBILIR[0]!)) duzenlemeyiAc(cerceveRef.current);
      else if (Date.now() < bitis) requestAnimationFrame(dene);
    };
    dene();
    return () => {
      iptal = true;
    };
  }, [html]);

  /** Onizlemedeki son hali oku — calisanin elle duzeltmesi ciktilara yansisin. */
  function guncelHtml(): string {
    const belge = cerceveRef.current?.contentDocument;
    return belge?.documentElement.outerHTML ?? html ?? "";
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
      if (bicim === "pdf") void qc.invalidateQueries({ queryKey: ["archive"] });
    } catch (err) {
      setIndirmeHatasi(err instanceof Error ? err.message : "İndirme başarısız");
    }
  }

  return (
    <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="min-h-0 space-y-4 overflow-auto border-r border-cizgi bg-white p-4">
        <div>
          <Baslik>Karar</Baslik>
          <div className="mt-1 space-y-1">
            {KARARLAR.map((k) => (
              <label key={k.deger} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="karar"
                  checked={karar === k.deger}
                  onChange={() => setKarar(k.deger)}
                />
                {k.etiket}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Baslik>Gerekçe {olumsuz && <span className="text-uyari">(zorunlu)</span>}</Baslik>
          <textarea
            rows={3}
            value={gerekce}
            onChange={(e) => setGerekce(e.target.value)}
            placeholder={
              olumsuz ? "Talebin neden karşılanmadığı" : "İsteğe bağlı — boş bırakılabilir"
            }
            className={`mt-1 w-full resize-none rounded border px-2 py-1.5 text-sm outline-none focus:border-slate-400 ${
              gerekceEksik ? "border-uyari" : "border-cizgi"
            }`}
          />
        </div>

        <div>
          <Baslik>Muhatap</Baslik>
          <input
            value={muhatapAd}
            onChange={(e) => setMuhatapAd(e.target.value)}
            placeholder="Ad Soyad / Kurum"
            className="mt-1 w-full rounded border border-cizgi px-2 py-1.5 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-1.5 flex gap-3 text-sm">
            {(["kisi", "kurum"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="muhatapTur"
                  checked={muhatapTur === t}
                  onChange={() => setMuhatapTur(t)}
                />
                {t === "kisi" ? "Kişi" : "Kurum"}
              </label>
            ))}
          </div>
          {doc.entities?.vkn || doc.entities?.tckn ? (
            <p className="mt-1 text-xs text-ikincil">
              Doğrulanmış numara yazıya eklenecek: {doc.entities.vkn ?? doc.entities.tckn}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={uret.isPending || gerekceEksik}
          onClick={() => uret.mutate(false)}
          className="w-full rounded bg-gib px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {uret.isPending ? "Taslak üretiliyor…" : "Taslak üret"}
        </button>
        {uret.isPending && (
          <p className="text-xs text-ikincil">
            Dil modeli çalışıyor; uydurma sayı bulunursa yazı otomatik yeniden yazdırılır.
          </p>
        )}
        {uret.error && (
          <p className="text-xs text-uyari">{(uret.error as Error).message}</p>
        )}

        {gecmis && gecmis.letters.length > 0 && (
          <div>
            <Baslik>Kaydedilmiş yazılar</Baslik>
            <div className="mt-1 space-y-1">
              {gecmis.letters.map((l) => (
                <div key={l.id} className="text-xs text-ikincil">
                  <Rozet>{l.karar}</Rozet> {l.sayi}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        {uyarilar.length > 0 && (
          <div className="border-b border-uyari/30 bg-uyari/5 px-4 py-2">
            {uyarilar.map((u) => (
              <div key={u} className="text-xs text-uyari">
                ⚠ {u}
              </div>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 bg-slate-300">
          {html ? (
            <iframe
              ref={cerceveRef}
              title="Cevap yazısı önizleme"
              srcDoc={html}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ikincil">
              Kararı seçip “Taslak üret” deyin. Önizleme burada açılır ve metin bloklarını
              doğrudan düzenleyebilirsiniz.
            </div>
          )}
        </div>

        {html && (
          <div className="flex flex-wrap items-center gap-2 border-t border-cizgi bg-white px-4 py-2.5">
            <span className="text-xs text-ikincil">
              Konu, ilgi ve gövde blokları doğrudan düzenlenebilir.
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => void indirDosya("pdf")}
                className="rounded bg-gib px-3 py-1.5 text-sm font-medium text-white"
              >
                PDF indir
              </button>
              <button
                type="button"
                onClick={() => void indirDosya("docx")}
                className="rounded border border-cizgi px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                DOCX indir
              </button>
              <button
                type="button"
                disabled={uret.isPending}
                onClick={() => uret.mutate(true)}
                className="rounded border border-cizgi px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Kaydet (sayı ver)
              </button>
            </div>
          </div>
        )}
        {indirmeHatasi && (
          <div className="border-t border-uyari/30 bg-uyari/5 px-4 py-2 text-xs text-uyari">
            {indirmeHatasi}
          </div>
        )}
      </div>
    </div>
  );
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
