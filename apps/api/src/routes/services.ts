import type { FastifyInstance } from "fastify";
import { regulationServices, serviceQueueCounts } from "@albay/ingestion";
import { isServiceForOrgType } from "@albay/agents";
import { config } from "@albay/shared";

/**
 * Servis katalogu ve havuz doluluklari.
 *
 * Taksonomi KODDA TANIMLI DEGIL: servis listesi yonetmelik chunk'larinin
 * metadata'sindan (metadata.servis) turetilir. Yonetmelik degisirse liste de
 * degisir; kodda guncellenecek bir sabit yok.
 */
export async function registerServiceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/services", async () => {
    const [katalog, havuzlar] = await Promise.all([regulationServices(), serviceQueueCounts()]);
    const adetler = new Map(havuzlar.map((h) => [h.servis, h]));

    const hedefler = katalog.filter(
      (s) =>
        // Yazisma ve Arsiv giris noktasidir, yonlendirme hedefi degil — havuzu olmaz.
        !/arşiv|arsiv/i.test(s.servis) &&
        // Orgut tipinde karsiligi olmayan servisler (orn. baskanlikta Madde 12'nin
        // Tahakkuk/Tahsilat servisleri) listelenmez; yonlendirme de onlari eliyor,
        // aksi halde arayuz hicbir zaman dolmayacak bir havuz gosterirdi.
        isServiceForOrgType(s.maddeNo, config.TAX_OFFICE_ORG_TYPE),
    );

    return {
      services: hedefler.map((s) => ({
        servis: s.servis,
        hizmetBirimi: s.hizmetBirimi,
        altBolum: s.altBolum,
        maddeNo: s.maddeNo,
        // bekleyen = is yuku; tamamlanan havuzda gorunur ama sayilmaz.
        bekleyen: adetler.get(s.servis)?.bekleyen ?? 0,
        tamamlanan: adetler.get(s.servis)?.tamamlanan ?? 0,
      })),
      // Yonlendirilemeyen evraklar ayri bir havuzda toplanir
      belirlenemedi: adetler.get(null)?.bekleyen ?? 0,
    };
  });
}
