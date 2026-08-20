/**
 * Yonetmelik madde numaralari: normallestirme, getirilen parcalardaki madde
 * kumesi ve "11-A-I-2-f" gibi atif yollarinin ayristirilmasi.
 */
import type { SearchHit } from "@albay/retrieval";

/** "M.11-A-I-2-f", "Madde 11", "11" -> "11" */
export function normalizeMaddeNo(raw: string): string {
  return raw.match(/\d+/)?.[0] ?? raw.trim();
}

export function maddeNumbersOf(hits: SearchHit[]): Set<string> {
  return new Set(
    hits
      .map((h) => String(h.metadata?.maddeNo ?? ""))
      .filter(Boolean)
      .map(normalizeMaddeNo),
  );
}

/** Madde numarasi OCR'dan okunamayip turetilmis parcalar (metadata.maddeNoKesin=false). */
export function uncertainMaddeNumbers(hits: SearchHit[]): Set<string> {
  return new Set(
    hits
      .filter((h) => h.metadata?.maddeNoKesin === false)
      .map((h) => normalizeMaddeNo(String(h.metadata?.maddeNo ?? "")))
      .filter(Boolean),
  );
}

export interface CitationPath {
  maddeNo: string;
  birim: string | null;
  altBolum: string | null;
  servisNo: string | null;
}

/**
 * "11-A-I-2-f" gibi bir atif yolunu bilesenlerine ayirir.
 * Yol yonetmeligin kendi numaralandirmasidir: Madde 11 > A) hizmet birimi >
 * I- alt bolum > 2) servis > f) gorev bendi.
 */
export function parseCitationPath(raw: string): CitationPath {
  const parts = raw.split(/[-.\s]+/).filter(Boolean);
  const maddeNo = normalizeMaddeNo(raw);
  let birim: string | null = null;
  let altBolum: string | null = null;
  let servisNo: string | null = null;

  for (const [i, part] of parts.entries()) {
    if (i === 0 && /^\d+$/.test(part)) continue; // madde numarasi
    if (!birim && /^[A-C]$/.test(part)) birim = part;
    else if (!altBolum && /^(I|II|III|IV|V)$/.test(part)) altBolum = part;
    else if (!servisNo && /^\d+$/.test(part)) servisNo = part;
  }
  return { maddeNo, birim, altBolum, servisNo };
}
