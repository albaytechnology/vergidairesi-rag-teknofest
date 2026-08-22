/**
 * Katalogda karsiligi olmayan servis adlarinin onarimi.
 *
 * Gozlenen hata: yonlendirme karari `servis` alanina bir BIRIM adi yazdi
 * ("Vergilendirme"). Ad hicbir yonetmelik servisine denk gelmedigi icin evrak
 * ne bir servis havuzuna (routed_service = <katalog adi>) ne de yonlendirilemeyenler
 * havuzuna (routing_status = 'belirlenemedi') dustu — arayuzden tamamen kayboldu,
 * ama sol seritte durmaya devam etti. Iki tarafin sayilari bu yuzden ayrisiyordu.
 *
 * Kural: bir servis adi ancak yonetmelik katalogunda varsa yonlendirme hedefidir;
 * yoksa karar dayanaksizdir ve manuel incelemeye gider. Yeni kararlarda kontrol
 * saveRoutingDecision icinde yapilir (bkz. routing/decisions.ts); bu adim yalnizca
 * kontrol yokken yazilmis eski satirlari onarir.
 *
 * ILK EXISTS SARTI KORUMADIR: yonetmelik korpusu henuz yuklenmemis bir kurulumda
 * katalog bostur ve kosul TUM yonlendirmeleri belirlenemedi'ye dusururdu.
 */
export const sql = `
  UPDATE documents d
     SET routed_service = NULL,
         routed_birim = NULL,
         routing_confidence = 0,
         routing_regulation_refs = '[]'::jsonb,
         routing_status = 'belirlenemedi',
         routing_reasoning = COALESCE(d.routing_reasoning, '') ||
           '

[Otomatik kontrol] Karar "' || d.routed_service || '" adını gösteriyor; yönetmelik kataloğunda böyle bir servis yok. Evrak manuel incelemeye alındı.',
         updated_at = now()
   WHERE d.corpus = 'documents'
     AND d.routed_service IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM chunks c JOIN documents r ON r.id = c.doc_id
            WHERE r.corpus = 'regulations' AND c.kind = 'child'
              AND c.metadata->>'servis' IS NOT NULL)
     AND NOT EXISTS (
           SELECT 1 FROM chunks c JOIN documents r ON r.id = c.doc_id
            WHERE r.corpus = 'regulations' AND c.kind = 'child'
              AND c.metadata->>'servis' = d.routed_service);
`;
