import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Sol serit ve Arsiv tablosunun ortak veri kaynagi.
 *
 * Tasarimdaki `interacted` bayraginin sunucudaki karsiligi
 * lifecycle_status = 'in_progress' — yani "calisan belgeyi acti" isareti
 * (POST /api/documents/:id/open). Ayri bir bayrak EKLENMEDI: ikisi ayni olguyu
 * anlatiyor, durum yalnizca ileri gidiyor ve boylece gecmis sunucuda,
 * kullanicinin tarayicisindan bagimsiz duruyor.
 *
 * Kaynak /api/archive: servise gore degil yasam dongusune gore listeler ve
 * sohbete aticlanan ek belgeleri (session_id dolu olanlar) zaten eler.
 */
export interface DocumentBuckets {
  /** Uzerinde calisilmis, cevabi henuz yazilmamis evrak — sol serit. */
  inProgress: DocumentSummary[];
  /** Cevap yazisi disari alinmis evrak — sol seridin alt grubu. */
  answered: DocumentSummary[];
  /** Henuz hic acilmamis, cevap bekleyen evrak — Arsiv tablosunda gorunur. */
  suggestions: DocumentSummary[];
  isLoading: boolean;
  error: unknown;
}

export function useDocuments(): DocumentBuckets {
  const pending = useQuery({
    queryKey: ["archive", false],
    queryFn: () => api.archive(false),
    refetchInterval: 20_000,
  });
  const answered = useQuery({
    queryKey: ["archive", true],
    queryFn: () => api.archive(true),
    refetchInterval: 20_000,
  });

  const pendingDocs = pending.data?.documents ?? [];

  return {
    inProgress: pendingDocs.filter((d) => d.yasamDongusu === "in_progress"),
    answered: answered.data?.documents ?? [],
    suggestions: pendingDocs.filter((d) => d.yasamDongusu !== "in_progress"),
    isLoading: pending.isLoading || answered.isLoading,
    error: pending.error ?? answered.error,
  };
}

/** Kart ve serit basliklarinda ayni sirayla denenen ad. */
export const documentTitle = (d: DocumentSummary): string => d.konu ?? d.filename;
