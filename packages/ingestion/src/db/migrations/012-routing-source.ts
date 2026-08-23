/**
 * Yonlendirmeyi kimin yaptigi.
 *
 * Arayuz "bu servisi model mi sectі yoksa bir calisan mi atadi" sorusunu
 * gostermek istiyor ve bu, gerekce metninden CIKARILAMAZ: elle atamada gerekce
 * calisanin yazdigi serbest metin olabiliyor, sabit bir ibare degil. Bir kayit
 * alani olmadan yapilacak her tahmin, gunun birinde yanlis bir "yapay zeka
 * atadi" etiketi olarak ekrana duserdi.
 *
 * Geri doldurma tek seferliktir ve bilerek muhafazakardir: yalnizca eski elle
 * atama akisinin yazdigi sabit ibareyi tasiyan kayitlar "manuel" sayilir,
 * yonlendirilmis geri kalan her kayit "llm".
 */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_source TEXT;

  UPDATE documents
     SET routing_source = CASE
           WHEN routing_reasoning = 'Servis calisani tarafindan elle atandi' THEN 'manuel'
           ELSE 'llm'
         END
   WHERE routing_source IS NULL
     AND routing_status IN ('routed', 'belirlenemedi')
     AND routed_at IS NOT NULL;
`;
