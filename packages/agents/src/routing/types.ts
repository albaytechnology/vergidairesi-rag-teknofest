/** Yonlendirme akisinin girdi/cikti sozlesmeleri. */
import type { ServiceRoutingDecision } from "@albay/shared";
import type { SearchHit } from "@albay/retrieval";

export interface RouteInput {
  /** Evrak metni ya da kullanicinin sorusu. */
  metin: string;
  /** Retrieval icin optimize sorgu; verilmezse metnin kendisi kullanilir. */
  aramaSorgusu?: string;
  /** Onceki turda dayanaksiz bulunup elenen servisler. */
  elenenServisler?: string[];
  /**
   * Denetcinin onceki turu neden reddettigi. Grader cogu zaman dogru servisi
   * gerekcesinde soyluyor ("tecil islemleri Surekli Yukumlulukler servisinin
   * gorev alanina girer, M.11-A-I-2-f"); bu sinyali ikinci denemeye tasimazsak
   * model ayni hatayi tekrarliyor ve karar bosuna belirlenemedi'ye dusuyor.
   */
  denetimGeriBildirimi?: string;
}

export interface RouteResult {
  decision: ServiceRoutingDecision;
  hits: SearchHit[];
  trace: string[];
}

export interface RoutingVerdict {
  onaylandi: boolean;
  masaIddiasi: boolean;
  reason: string;
}
