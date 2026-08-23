import { useState } from "react";
import { Expandable, SectionLabel, WarningBox } from "../components/ui.tsx";
import { RoutingDialog } from "./RoutingDialog.tsx";
import type { DocumentGap, DocumentSummary } from "../api/types.ts";

/**
 * Belge detay paneli — sohbet ve cevap yazisi ekranlarinda acilip kapanir.
 *
 * Kararin dayanaklari (ozet, cikarilan bilgiler, eksik bilgi bulgulari,
 * yonlendirme gerekcesi, kaynak belge) sohbetin YANINDA durur: calisan cevabi
 * okurken belgeye donmek zorunda kalmasin, iki bilgi ayni ekranda
 * karsilastirilabilsin.
 *
 * Panel SOLDA, sol seritle sohbetin arasinda: okuma sirasi "hangi evrak →
 * neye dayaniyor → konusma" seklinde soldan saga akiyor. Kapanip acilmasi
 * genislik animasyonuyla oluyor (display:none ile aninda kaybolmuyor); kapaliyken
 * geride ok ikonlu ince bir serit kalir, boylece panelin varligi unutulmaz.
 */
/**
 * Evrak tipi rozetinin okunur etiketi.
 *
 * Ham deger sunucudaki enum'dur (resmi_yazi, mahkeme_karari…); alt cizgili
 * snake_case bir rozet ekranda teknik bir artik gibi duruyor. Bilinmeyen bir
 * deger gelirse ham hali gosterilir — rozet bos kalmasin.
 */
const DOC_TYPE_LABELS: Record<string, string> = {
  dilekce: "Dilekçe",
  resmi_yazi: "Resmî yazı",
  bildirim: "Bildirim",
  beyanname_eki: "Beyanname eki",
  tebligat: "Tebligat",
  mahkeme_karari: "Mahkeme kararı",
  diger: "Diğer",
};

const docTypeLabel = (docType: string): string =>
  DOC_TYPE_LABELS[docType] ?? docType.charAt(0).toLocaleUpperCase("tr-TR") + docType.slice(1);

export function DetailPanel({
  doc,
  open,
  onOpen,
  onClose,
}: {
  doc: DocumentSummary & { path: string };
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 shrink-0">
      {/* Kapali serit: panelin nereye gittigini gosteren tutamak. */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          title="Belge detayını aç"
          aria-label="Belge detayını aç"
          className="flex w-11 flex-[0_0_44px] cursor-pointer flex-col items-center gap-2 border-r border-cizgi bg-panel pt-[22px] text-ikincil transition-colors hover:bg-yuzey hover:text-metin"
        >
          <span className="text-[15px] leading-none">›</span>
          {/* Dikey etiket: 44px'e yatay metin sigmaz, ama serit adsiz kalmamali. */}
          <span className="text-[10px] font-semibold tracking-[.12em] text-silik uppercase [writing-mode:vertical-rl]">
            Detay
          </span>
        </button>
      )}

      <aside
        // Genislik animasyonu: 0 ↔ 340px. Icerik SABIT genislikte bir kutuda
        // duruyor, aksi halde panel kapanirken metin her karede yeniden
        // sariliyor ve animasyon titriyordu.
        className={`overflow-hidden border-r border-cizgi bg-white transition-[width,opacity] duration-[280ms] ease-[cubic-bezier(.4,0,.2,1)] ${
          open ? "w-[340px] opacity-100" : "w-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="h-full w-[340px] overflow-y-auto px-5 pt-[22px] pb-10">
          <div className="mb-[18px] flex items-center justify-between gap-2">
            <div className="text-[12.5px] font-bold tracking-[-.01em]">Belge detayı</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Paneli kapat"
              className="h-[26px] w-[26px] rounded-[7px] border border-cizgi bg-panel text-[13px] leading-none text-ikincil transition-colors hover:border-cizgi-5"
            >
              ‹
            </button>
          </div>

          {/* Yonlendirme ozetten ONCE: calisanin ilk sorusu "bu evrak bana mi
              ait?" — ozet ancak bu cevaplandiktan sonra okunuyor. */}
          <RoutingCard doc={doc} />

          <SectionLabel>Özet</SectionLabel>
          <div className="mt-2 mb-6">
            <Expandable maxHeight={132}>
              <p className="text-[12.5px] leading-[1.65] text-pretty text-govde">
                {doc.ozet ?? "Bu evrak için özet üretilmemiş."}
              </p>
            </Expandable>
          </div>

          <ExtractedInfo doc={doc} />
          <GapsCard gaps={doc.eksikler} />

          <SectionLabel>Kaynak belge</SectionLabel>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-cizgi bg-yuzey">
            <iframe
              title="Kaynak belge önizleme"
              src={`/api/documents/${doc.id}/file`}
              className="block h-[190px] w-full border-0 bg-white"
            />
            <div className="flex items-center justify-between gap-2 border-t border-cizgi bg-white px-3 py-2.5">
              <span className="truncate text-[11px] text-ikincil">{doc.filename}</span>
              <a
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-[7px] border border-cizgi-2 bg-panel px-[9px] py-[5px] text-[11px] font-semibold text-govde transition-colors hover:border-cizgi-5"
              >
                Aç
              </a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ExtractedInfo({ doc }: { doc: DocumentSummary }) {
  const entities = doc.entities;
  const rows: [string, string][] = [
    ["Kişi", joinValues(entities?.kisiKurumlar)],
    ["Tutar", joinValues(entities?.tutarlar)],
    ["Tarih", joinValues(entities?.tarihler)],
    ["Dönem", joinValues(entities?.donemler)],
  ];
  const taxId = entities?.vkn ?? entities?.tckn ?? null;

  return (
    <>
      <SectionLabel>Çıkarılan bilgiler</SectionLabel>

      {/* Evrak tipi ve KVKK rozetleri bu bolumun icinde: ikisi de belgeden
          OKUNAN bilgi — biri turu, digeri kisisel veri tasidigi. Panelin en
          ustunde ayri durduklarinda, cikarilan diger alanlardan kopuk iki
          etiket gibi gorunuyorlardi. */}
      {(doc.docType || doc.containsPII) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {doc.docType && (
            <span className="rounded-[5px] border border-gib-cizgi bg-gib-acik px-[7px] py-[3px] text-[10.5px] font-semibold text-gib">
              {docTypeLabel(doc.docType)}
            </span>
          )}
          {doc.containsPII && (
            <span
              title="Belge kişisel veri içeriyor"
              className="rounded-[5px] border border-uyari-cizgi bg-uyari-zemin-2 px-[7px] py-[3px] font-mono text-[10.5px] text-uyari"
            >
              KVKK
            </span>
          )}
        </div>
      )}

      <div className="mt-2.5 mb-6">
        <Expandable maxHeight={150}>
          <div className="grid grid-cols-[82px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            {taxId && (
              <>
                <span className="text-silik">{entities?.vkn ? "VKN" : "TCKN"}</span>
                <span className="font-mono text-[11.5px] text-metin-2">{taxId}</span>
              </>
            )}
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <span className="text-silik">{label}</span>
                <span
                  className={`text-metin-2 ${label === "Tutar" ? "font-mono text-[11.5px]" : ""}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Numara alani bos birakilmasi bilincli: checksum'dan gecmeyen numara
              yazilmiyor. Uyari bolumun sonunda, tam genislikte durur ve
              kirpilabilir govdenin bir parcasidir. */}
          {!taxId && (
            <div className="mt-3">
              <WarningBox>
                Doğrulanmış VKN/TCKN bulunamadı — checksum’dan geçmeyen numara yazılmaz.
              </WarningBox>
            </div>
          )}
        </Expandable>
      </div>
    </>
  );
}

const joinValues = (v: string[] | undefined): string => (v?.length ? v.join(" · ") : "—");

/**
 * Eksik bilgi / tutarsizlik bulgulari.
 *
 * Tarama hatta yapiliyor ve belgeyle birlikte kayitli — panel yalnizca
 * gosterir. Onceden dugmeyle sorulup atiliyordu; her acilista yeniden model
 * cagirmak hem bekletiyor hem de sohbetin goremedigi, yalnizca panele ozel
 * bir liste uretiyordu. Tek kayit, tek liste.
 */
function GapsCard({ gaps }: { gaps: DocumentGap[] | null }) {
  return (
    <>
      <SectionLabel>Eksik bilgiler</SectionLabel>
      <div className="mt-2.5 mb-6 space-y-2">
        {/* null ile bos dizi ayni sey degil: biri taranmadi, digeri temiz cikti. */}
        {gaps === null ? (
          <p className="text-[11.5px] leading-[1.55] text-silik">
            Bu evrak için eksik bilgi taraması yapılmamış.
          </p>
        ) : gaps.length === 0 ? (
          <p className="rounded-xl border border-onay-cizgi bg-onay-zemin px-3 py-2.5 text-[11.5px] leading-[1.55] text-onay">
            Belgede eksik ya da çelişkili bir bilgi bulunamadı.
          </p>
        ) : (
          <Expandable maxHeight={230}>
            <div className="space-y-2">
              {gaps.map((b, i) => (
                <GapRow key={i} gap={b} />
              ))}
            </div>
          </Expandable>
        )}
      </div>
    </>
  );
}

/** Onem rengi: kritik olan cevap yazisini bloklar, digerleri yalnizca not duser. */
const GAP_TONES: Record<DocumentGap["onem"], string> = {
  kritik: "border-uyari-cizgi bg-uyari-zemin text-uyari",
  orta: "border-gib-cizgi bg-gib-acik text-gib",
  dusuk: "border-cizgi bg-yuzey text-ikincil",
};

const GAP_KIND_LABELS: Record<DocumentGap["tur"], string> = {
  eksik: "Eksik",
  tutarsizlik: "Tutarsızlık",
};

function GapRow({ gap }: { gap: DocumentGap }) {
  return (
    <div className="rounded-xl border border-cizgi bg-panel p-3">
      <div className="mb-1.5 flex items-start gap-2">
        <span
          className={`shrink-0 rounded-[5px] border px-[6px] py-[2px] text-[10px] font-semibold ${GAP_TONES[gap.onem]}`}
        >
          {GAP_KIND_LABELS[gap.tur]}
        </span>
        <span className="text-[12.5px] leading-[1.35] font-semibold text-metin-2">
          {gap.baslik}
        </span>
      </div>
      <p className="text-[11.5px] leading-[1.6] text-pretty text-govde">{gap.aciklama}</p>
      {/* Alinti yoksa satir hic basilmaz — bos bir tirnak, dayanak varmis izlenimi verir.
          Kelimeler degistirilmez, yalnizca taramadan gelen fazla bosluk toparlanir. */}
      {gap.kanit && (
        <p className="mt-2 border-l-2 border-cizgi-4 pl-2 text-[11px] leading-[1.5] text-silik italic">
          “{gap.kanit.replace(/\s+/g, " ").trim()}”
        </p>
      )}
    </div>
  );
}

/**
 * Yonlendirme karti — kararin kendisi, tek satirda.
 *
 * Kart TIKLANABILIR: gerekce, dayanak maddeler ve servisi degistirme islemleri
 * pencerede (RoutingDialog). Panelde yalnizca KARAR duruyor; birim adi, gerekce
 * ozeti ve madde rozetleri kartta uc satir daha kapliyordu ve hicbiri bir
 * sonraki adimi degistirmiyor — hepsi bir tik otede, sorulunca okunacak yerde.
 */
const ATAMA_METNI: Record<"llm" | "manuel" | "yok", string> = {
  llm: "Yapay zekâ tarafından atandı",
  manuel: "Servis çalışanı tarafından elle atandı",
  yok: "Henüz bir servise atanmadı",
};

function RoutingCard({ doc }: { doc: DocumentSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SectionLabel>Yönlendirme</SectionLabel>
      {/* Servisi kimin sectigi kararin bir parcasi: modelin onerisi ile
          calisanin atamasi ayni agirlikta okunmamali. */}
      <p className="mt-1 text-[11px] text-soluk">{ATAMA_METNI[doc.routing.kaynak ?? "yok"]}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 mb-6 flex w-full items-center gap-2 rounded-xl border border-cizgi bg-panel p-3.5 text-left transition-colors hover:border-cizgi-5"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-[1.4] font-semibold">
            {doc.routing.servis ?? "Belirlenemedi — manuel inceleme gerekli"}
          </div>
          <div className="mt-1 text-[11.5px] text-silik">
            Gerekçeyi görmek ve servisi güncellemek için tıklayın
          </div>
        </div>
        <span aria-hidden className="shrink-0 text-[13px] leading-none text-soluk">
          ›
        </span>
      </button>

      {open && <RoutingDialog doc={doc} onClose={() => setOpen(false)} />}
    </>
  );
}
