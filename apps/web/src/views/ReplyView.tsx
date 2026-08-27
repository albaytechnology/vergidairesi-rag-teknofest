import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, download } from "../api/client.ts";
import { SectionLabel, WarningBox } from "../components/ui.tsx";
import { useDocumentContext } from "../shell/DocumentLayout.tsx";
import { defaultRecipient } from "./recipient.ts";
import {
  DECISIONS,
  decisionLabel,
  isNegativeDecision,
  type ReplyHandoff,
} from "./letterDecisions.ts";
import type { LetterDecision, LetterModel } from "../api/types.ts";

/** Sablonda serbest duzenlemeye acilan bloklar — antet/imza/sayi korunur. */
const EDITABLE_BLOCKS = [".konu", ".ilgi-liste", ".metin"];

/**
 * Cevap yazisi ekrani.
 *
 * Onizleme bir IFRAME'dir cunku yazi gercek resmi sablonla (antet, sayi, imza
 * blogu) uretiliyor ve ciktinin birebir aynisi gorunmeli — duz metin bir
 * onizleme, calisana imzalayacagi belgeyi gostermezdi. Tasarimin "kagit karti"
 * bu cercevenin disini olusturur.
 *
 * Ekrana sohbetteki karttan da gelinebilir; o durumda karar/gerekce/muhatap
 * location.state ile tasinir ve taslak kendiliginden uretilmeye baslar.
 */
export function ReplyView() {
  const { doc } = useDocumentContext();
  const docId = doc.id;
  const handoff = (useLocation().state ?? null) as ReplyHandoff | null;
  const [decision, setDecision] = useState<LetterDecision>(handoff?.karar ?? "onay");
  const [reason, setReason] = useState(handoff?.gerekce ?? "");
  /*
   * Ihtilafli Isler Servisi'nde muhatap SECILMEZ: evrak bir dava dilekcesidir,
   * cevap Vergi Mahkemesi Baskanligi'na gider. Alan yine de gorunur ve
   * duzenlenebilir kalir — mahkemenin adi evraktan okunamamis olabilir — ama
   * kisi/kurum secimi kapalidir ve bos birakilirsa sunucu evraktaki mahkemeyi
   * kendisi yazar.
   */
  const courtLetter = doc.routing.mahkemeYazismasi;
  const [recipientName, setRecipientName] = useState(
    handoff?.muhatapAd || defaultRecipient(doc, courtLetter),
  );
  const [recipientType, setRecipientType] = useState<"kisi" | "kurum">(
    courtLetter ? "kurum" : (handoff?.muhatapTur ?? "kisi"),
  );
  const [model, setModel] = useState<LetterModel | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const autoStarted = useRef(false);
  const qc = useQueryClient();

  const isNegative = isNegativeDecision(decision);
  const reasonMissing = isNegative && !reason.trim();

  const { data: history } = useQuery({
    queryKey: ["letters", docId],
    queryFn: () => api.letters(docId),
  });

  const generate = useMutation({
    mutationFn: (persist: boolean) =>
      api.draftLetter({
        docId,
        karar: decision,
        gerekce: reason.trim() || undefined,
        muhatap: {
          ad: recipientName.trim() || undefined,
          tur: courtLetter ? "kurum" : recipientType,
        },
        kaydet: persist,
      }),
    onSuccess: (result, persist) => {
      setModel(result.model);
      setHtml(result.html);
      setWarnings([
        ...result.dayanaksizSayilar.map(
          (s) => `Evrakta karşılığı bulunamayan sayı: "${s}" — göndermeden önce doğrulayın.`,
        ),
        ...result.eksikAlanlar.map((a) => `Yapılandırılmamış alan: ${a}`),
      ]);
      if (persist) void qc.invalidateQueries({ queryKey: ["letters", docId] });
    },
  });

  /**
   * Sohbetteki karttan gelindiyse taslagi kendiliginden uret — calisan karari
   * zaten orada verdi, ayni dugmeye bir daha bastirmanin anlami yok.
   *
   * DIKKAT — uretim DOGRUDAN bu effect'in govdesinde baslatilamaz. StrictMode
   * ilk mount'ta effect'leri kur → yik → yeniden kur seklinde calistiriyor;
   * react-query'nin useMutation'i useSyncExternalStore ile abone oldugu icin o
   * "yik" adiminda MutationObserver.onUnsubscribe tetikleniyor ve gozlemciyi
   * SUREN mutasyondan cikariyor. Kutuphanede bir onSubscribe karsiligi yok,
   * dolayisiyla ikinci kurulumda gozlemci mutasyona geri EKLENMIYOR. Sonuc:
   * istek tamamlaniyor, mutasyon duzeyindeki onSuccess calisip taslagi
   * ekrana basiyor, ama gozlemci "success" bildirimini hic almadigi icin
   * isPending sonsuza kadar true kaliyor — dugme "Taslak üretiliyor…"da
   * takiliyor ve "Kaydet (sayı ver)" devre disi kaliyordu.
   *
   * Bu yuzden uretim bir sonraki makrogoreve ertelenip effect yikildiginda
   * IPTAL EDILIYOR: istegi yalnizca ayakta kalan kurulum baslatir, gozlemci de
   * mutasyona bagli kalir. useRef bayragi ayrica gercek bir yeniden calismada
   * (pahali LLM cagrisinin) ikinci kez tetiklenmesini engeller.
   */
  useEffect(() => {
    if (!handoff?.autoGenerate || autoStarted.current) return;
    if (isNegative && !reason.trim()) return; // gerekce eksik: calisan doldursun
    const timer = setTimeout(() => {
      autoStarted.current = true;
      generate.mutate(false);
    }, 0);
    return () => clearTimeout(timer);
    // Bos bagimlilik listesi bilerek: yalnizca ilk mount'ta calismali.
  }, []);

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
    let cancelled = false;
    const deadline = Date.now() + 5000;
    const attempt = () => {
      if (cancelled) return;
      const frameDoc = frameRef.current?.contentDocument;
      if (frameDoc?.querySelector(EDITABLE_BLOCKS[0]!)) {
        enableEditing(frameRef.current);
        fitHeight(frameRef.current);
        frameDoc.addEventListener("input", () => fitHeight(frameRef.current));
      } else if (Date.now() < deadline) requestAnimationFrame(attempt);
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [html]);

  /** Onizlemedeki son hali oku — calisanin elle duzeltmesi ciktilara yansisin. */
  function currentHtml(): string {
    return frameRef.current?.contentDocument?.documentElement.outerHTML ?? html ?? "";
  }

  async function downloadFile(format: "pdf" | "docx") {
    setDownloadError(null);
    try {
      const filename = `cevap-yazisi-${docId.slice(0, 8)}.${format}`;
      const payload =
        format === "pdf"
          ? // docId gonderiliyor: PDF disari alinmasi evraki arsivde
            // "cevap yazildi" tarafina gecirir (is akisinin bitis isareti).
            { html: currentHtml(), docId, karar: decision }
          : { model: applyEditsToModel(model!, frameRef.current?.contentDocument ?? null) };
      download(await api.letterFile(format, payload, filename), filename);
      if (format === "pdf") {
        void qc.invalidateQueries({ queryKey: ["archive"] });
        void qc.invalidateQueries({ queryKey: ["document", docId] });
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "İndirme başarısız");
    }
  }

  async function copy() {
    const text = frameRef.current?.contentDocument?.body.innerText ?? "";
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-x-auto">
      <div className="w-[340px] flex-[0_1_340px] overflow-y-auto border-r border-cizgi bg-white p-6 min-w-[288px]">
        <SectionLabel>Karar</SectionLabel>
        <div className="mt-3 mb-[22px] flex flex-col gap-1.5">
          {DECISIONS.map((d) => {
            const selected = decision === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setDecision(d.value)}
                className={`flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  selected ? "border-gib bg-gib-sis" : "border-cizgi-2 bg-white hover:border-cizgi-5"
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 flex-[0_0_14px] rounded-full bg-white ${
                    selected ? "border-4 border-gib" : "border-[1.5px] border-cizgi-5"
                  }`}
                />
                <span className="text-[13px] font-medium">{d.label}</span>
              </button>
            );
          })}
        </div>

        <SectionLabel>
          Gerekçe {isNegative && <span className="text-uyari normal-case">(zorunlu)</span>}
        </SectionLabel>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isNegative ? "Talebin neden karşılanmadığı" : "İsteğe bağlı — boş bırakılabilir"
          }
          className={`mt-2.5 mb-[22px] w-full resize-y rounded-[10px] border px-3 py-2.5 text-[13px] leading-[1.5] outline-none ${
            reasonMissing ? "border-uyari" : "border-cizgi-2"
          }`}
        />

        <SectionLabel>Muhatap</SectionLabel>
        <input
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder={courtLetter ? "… Vergi Mahkemesi Başkanlığı" : "Ad Soyad / Kurum"}
          className="mt-2.5 mb-2.5 w-full rounded-[10px] border border-cizgi-2 px-3 py-2.5 text-[13px] outline-none"
        />
        {courtLetter ? (
          <div className="mb-6 rounded-[10px] border border-gib-cizgi bg-gib-sis px-3 py-2.5 text-[11.5px] leading-[1.55] text-govde">
            Evrak <strong>İhtilaflı İşler Servisi</strong>’ne yönlendirildi: yazı Vergi
            Mahkemesi Başkanlığı’na hitaben, kurumsal üslupla hazırlanır. Mükellef metinde
            “davacı” olarak anılır.
          </div>
        ) : (
          <>
            <div className="mb-6 flex gap-2">
              {(["kisi", "kurum"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRecipientType(t)}
                  className={`flex-1 rounded-[9px] border p-2 text-[12.5px] font-semibold transition-colors ${
                    recipientType === t
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
          </>
        )}

        <button
          type="button"
          disabled={generate.isPending || reasonMissing}
          onClick={() => generate.mutate(false)}
          className="w-full rounded-[11px] bg-gib p-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-gib-koyu disabled:opacity-40"
        >
          {generate.isPending ? "Taslak üretiliyor…" : "Taslak üret"}
        </button>
        {generate.isPending && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-silik">
            Dil modeli çalışıyor; uydurma sayı bulunursa yazı otomatik yeniden yazdırılır.
          </p>
        )}
        {generate.error && (
          <p className="mt-2 text-[11.5px] text-uyari">{(generate.error as Error).message}</p>
        )}

        {history && history.letters.length > 0 && (
          <div className="mt-6">
            <SectionLabel>Kaydedilmiş yazılar</SectionLabel>
            <div className="mt-2 flex flex-col gap-1">
              {history.letters.map((l) => (
                <div key={l.id} className="text-[11.5px] text-silik">
                  <span className="font-medium text-govde">{decisionLabel(l.karar)}</span>{" "}
                  {l.sayi}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-[380px] flex-1 overflow-y-auto p-7">
        {/* A4 (21cm ≈ 794px) + onizlemenin iki yanindaki 24px bosluk: yer varken
            sayfa gercek genisliginde gorunsun, dar ekranda kendisi daralsin. */}
        {html ? (
          <div className="mx-auto max-w-[848px] animate-yukse overflow-hidden rounded-[14px] border border-cizgi bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cizgi-3 px-6 py-4">
              <div className="text-[11px] font-semibold tracking-[.09em] text-silik uppercase">
                Cevap yazısı taslağı
              </div>
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={() => void copy()}>
                  {copied ? "Kopyalandı" : "Kopyala"}
                </SecondaryButton>
                <SecondaryButton
                  disabled={generate.isPending}
                  onClick={() => generate.mutate(true)}
                  title="Giden evrak sıra numarası alır ve yazıyı kaydeder"
                >
                  Kaydet (sayı ver)
                </SecondaryButton>
                <SecondaryButton onClick={() => void downloadFile("docx")}>
                  DOCX indir
                </SecondaryButton>
                <button
                  type="button"
                  title="PDF olarak dışarı alır ve evrakı arşivde cevaplananlara taşır"
                  onClick={() => void downloadFile("pdf")}
                  className="rounded-lg bg-metin px-3 py-[7px] text-xs font-semibold text-white transition-colors hover:bg-black"
                >
                  Onayla ve arşivle
                </button>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="border-b border-uyari-cizgi bg-uyari-zemin px-6 py-2.5">
                {warnings.map((w) => (
                  <div key={w} className="text-[11px] leading-relaxed text-uyari">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}

            <iframe
              ref={frameRef}
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

        {downloadError && (
          <div className="mx-auto mt-3 max-w-[720px]">
            <WarningBox>{downloadError}</WarningBox>
          </div>
        )}
      </div>
    </div>
  );
}

function SecondaryButton({
  onClick,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-cizgi-2 bg-white px-3 py-[7px] text-xs font-semibold text-govde transition-colors hover:border-cizgi-5 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Onizleme cercevesini iceriğinin boyuna uydurur — ic scroll olmasin. */
function fitHeight(frame: HTMLIFrameElement | null): void {
  const body = frame?.contentDocument?.body;
  if (frame && body) frame.style.height = `${body.scrollHeight + 24}px`;
}

/**
 * Onizlemede yalnizca metin bloklarini duzenlemeye acar.
 *
 * Tum govde contentEditable yapilsaydi calisan yanlislikla anteti, sayiyi ya da
 * imza blogunu silebilirdi; bunlar sablondan/veritabanindan geliyor ve elle
 * degistirilmemeli.
 */
function enableEditing(frame: HTMLIFrameElement | null): void {
  const frameDoc = frame?.contentDocument;
  if (!frameDoc) return;
  for (const selector of EDITABLE_BLOCKS) {
    // DIKKAT: burada `el instanceof HTMLElement` KULLANILMAZ. Iframe kendi
    // JS realm'inde calisir; icindeki dugumler o pencerenin HTMLElement'inden
    // turer ve ana pencerenin HTMLElement'ine gore instanceof HER ZAMAN false
    // doner. Once bu kontrol vardi ve onizleme sessizce salt okunur kaliyordu.
    const el = frameDoc.querySelector<HTMLElement>(selector);
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
export function applyEditsToModel(model: LetterModel, frameDoc: Document | null): LetterModel {
  if (!frameDoc) return model;

  const nodes = [...frameDoc.querySelectorAll(".metin p")];
  const paragraphs = nodes
    .filter((p) => !p.classList.contains("kapanis"))
    .map((p) => (p.textContent ?? "").trim())
    .filter(Boolean);
  const closing = (frameDoc.querySelector(".metin .kapanis")?.textContent ?? "").trim();
  const references = [...frameDoc.querySelectorAll(".ilgi-satir")]
    .map((s) => (s.textContent ?? "").trim())
    .filter(Boolean);
  const subject = (frameDoc.querySelector(".konu")?.textContent ?? "")
    .replace(/^\s*Konu\s*:?\s*/u, "")
    .trim();

  return {
    ...model,
    konu: subject || model.konu,
    paragraflar: paragraphs.length ? paragraphs : model.paragraflar,
    kapanis: closing || model.kapanis,
    ilgiSatirlari: references,
  };
}
