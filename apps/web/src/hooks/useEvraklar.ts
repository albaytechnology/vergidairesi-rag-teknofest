import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { DocumentSummary } from "../api/types.ts";

/**
 * Sol seritteki sohbet gecmisi ve ana ekrandaki oneriler.
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
export interface Evraklar {
  /** Uzerinde calisilmis, cevabi henuz yazilmamis evrak — sol serit. */
  acikIsler: DocumentSummary[];
  /** Cevap yazisi disari alinmis evrak — sol seridin alt grubu. */
  cevaplananlar: DocumentSummary[];
  /** Henuz acilmamis evrak — ana ekrandaki oneri kartlari. */
  oneriler: DocumentSummary[];
  yukleniyor: boolean;
  hata: unknown;
}

export function useEvraklar(): Evraklar {
  const bekleyen = useQuery({
    queryKey: ["archive", false],
    queryFn: () => api.archive(false),
    refetchInterval: 20_000,
  });
  const cevaplanan = useQuery({
    queryKey: ["archive", true],
    queryFn: () => api.archive(true),
    refetchInterval: 20_000,
  });

  const acilmamis = bekleyen.data?.documents ?? [];

  return {
    acikIsler: acilmamis.filter((d) => d.yasamDongusu === "in_progress"),
    cevaplananlar: cevaplanan.data?.documents ?? [],
    oneriler: acilmamis.filter((d) => d.yasamDongusu !== "in_progress"),
    yukleniyor: bekleyen.isLoading || cevaplanan.isLoading,
    hata: bekleyen.error ?? cevaplanan.error,
  };
}

/** Kart ve serit basliklarinda ayni sirayla denenen ad. */
export const evrakBasligi = (d: DocumentSummary): string => d.konu ?? d.filename;
