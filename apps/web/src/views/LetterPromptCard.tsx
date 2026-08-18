import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DECISIONS, isNegativeDecision, type ReplyHandoff } from "./letterDecisions.ts";
import type { LetterDecision } from "../api/types.ts";

interface Props {
  docId: string;
  /** Sunucunun mesajdan cikardigi karar; yoksa "onay" ile baslanir. */
  suggestedDecision: LetterDecision | null;
  /** Sunucunun mesajdan cikardigi gerekce ibaresi. */
  suggestedReason: string | null;
  /** Evraktan bilinen muhatap adi (varsa). */
  defaultRecipient: string;
  /** Kullanici aslinda duz bir cevap istiyormus — ayni soruyu RAG'a gonder. */
  onPlainAnswer: () => void;
  onDismiss: () => void;
}

/**
 * Sohbetin icinde acilan kisa "cevap yazisi olustur" alani.
 *
 * Calisan "cevap yazisi yaz" dediginde ona duz metin bir taklit yazi vermek
 * yanlis olurdu; gercek yazi resmi sablonla, sayi ve imza bloguyla uretiliyor.
 * Bu kart yalnizca yaziyi belirleyen UC girdiyi toplar (karar, gerekce,
 * muhatap) ve isi tam ekran cevap yazisi ekranina devreder — onizleme, elle
 * duzeltme, PDF/DOCX tek yerde kalir, burada kopyalanmaz.
 */
export function LetterPromptCard({
  docId,
  suggestedDecision,
  suggestedReason,
  defaultRecipient,
  onPlainAnswer,
  onDismiss,
}: Props) {
  const navigate = useNavigate();
  const [decision, setDecision] = useState<LetterDecision>(suggestedDecision ?? "onay");
  const [reason, setReason] = useState(suggestedReason ?? "");
  const [recipientName, setRecipientName] = useState(defaultRecipient);
  const [recipientType, setRecipientType] = useState<"kisi" | "kurum">("kisi");

  const isNegative = isNegativeDecision(decision);
  const reasonMissing = isNegative && !reason.trim();

  function proceed() {
    if (reasonMissing) return;
    const handoff: ReplyHandoff = {
      karar: decision,
      gerekce: reason.trim(),
      muhatapAd: recipientName.trim(),
      muhatapTur: recipientType,
      autoGenerate: true,
    };
    navigate(`/documents/${docId}/reply`, { state: handoff });
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[88%] animate-yukse overflow-hidden rounded-[14px_14px_14px_4px] border border-cizgi bg-white shadow-balon">
        <div className="flex items-center justify-between gap-3 border-b border-cizgi-3 px-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-metin">Cevap yazısı oluştur</div>
            <div className="mt-px text-[11.5px] text-silik">
              Kararı seçin; yazı resmi şablonla hazırlanacak.
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Kapat"
            className="flex-[0_0_auto] text-[13px] text-soluk transition-colors hover:text-govde"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3.5">
          <Label>Karar</Label>
          <div className="mt-2 mb-4 flex flex-wrap gap-1.5">
            {DECISIONS.map((d) => {
              const selected = decision === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDecision(d.value)}
                  className={`rounded-full border px-3 py-[7px] text-[12.5px] font-medium transition-colors ${
                    selected
                      ? "border-gib bg-gib-sis text-gib"
                      : "border-cizgi-2 bg-white text-govde hover:border-cizgi-5"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <Label>
            Gerekçe {isNegative && <span className="text-uyari normal-case">(zorunlu)</span>}
          </Label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isNegative ? "Talebin neden karşılanmadığı" : "İsteğe bağlı — boş bırakılabilir"
            }
            className={`mt-2 mb-4 w-full resize-y rounded-[10px] border px-3 py-2 text-[13px] leading-[1.5] outline-none ${
              reasonMissing ? "border-uyari" : "border-cizgi-2"
            }`}
          />

          <Label>Muhatap</Label>
          <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Ad Soyad / Kurum"
              className="min-w-[180px] flex-1 rounded-[10px] border border-cizgi-2 px-3 py-2 text-[13px] outline-none"
            />
            <div className="flex flex-[0_0_auto] gap-1.5">
              {(["kisi", "kurum"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRecipientType(t)}
                  className={`rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                    recipientType === t
                      ? "border-metin bg-metin text-white"
                      : "border-cizgi-2 bg-white text-govde hover:border-cizgi-5"
                  }`}
                >
                  {t === "kisi" ? "Kişi" : "Kurum"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={proceed}
              disabled={reasonMissing}
              className="rounded-[10px] bg-gib px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-gib-koyu disabled:bg-gib-solgun"
            >
              Taslak üret
            </button>
            <button
              type="button"
              onClick={onPlainAnswer}
              title="Yazı değil, sohbet cevabı istiyordum"
              className="rounded-[10px] border border-cizgi-2 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-govde transition-colors hover:border-cizgi-5"
            >
              Normal cevap ver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold tracking-[.08em] text-soluk uppercase">
      {children}
    </div>
  );
}
