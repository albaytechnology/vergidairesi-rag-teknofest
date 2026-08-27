import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  getDocumentDetail,
  listDocumentsByService,
  listArchiveDocuments,
  archiveCounts,
  setLifecycleStatus,
  saveRoutingDecision,
  isRegulationService,
  getChatHistory,
  pool,
} from "@albay/ingestion";
import { routeDocument, formatRoutingDecision, isDisputeService } from "@albay/agents";
import {
  hatAdimlari,
  kuyruktakiAdimlar,
  embedBitti,
  type StatusRow,
} from "../helpers/pipeline-steps.ts";
import { parseIsiVarMi } from "../helpers/queue.ts";

/** Havuz listesi ve belge detayi. */
export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { service?: string; limit?: string } }>(
    "/api/documents",
    async (req) => {
      const { service, limit } = req.query;
      // service=belirlenemedi -> yonlendirilememis havuzu
      const servis = !service || service === "belirlenemedi" ? null : service;
      const rows = await listDocumentsByService(servis, Number(limit ?? 100));
      return { documents: rows.map(toSummary) };
    },
  );

  /**
   * Yazisma ve Arsiv Servisi listesi.
   *
   * Servis havuzlarindan farki: SERVISE GORE filtrelemez. Yonetmelikte evrakin
   * giris noktasi olan bu servis (M.11-B-I-6) kuruma giren her belgeyi bastan
   * sona takip eder — yonlendirilmis olmasi listeden dusurmez, ancak cevap
   * yazisi disari alininca "tamamlanan" tarafina gecer.
   */
  app.get<{ Querystring: { durum?: string } }>("/api/archive", async (req) => {
    const tamamlandi = req.query.durum === "completed";
    const [rows, sayilar] = await Promise.all([
      listArchiveDocuments(tamamlandi),
      archiveCounts(),
    ]);
    return {
      documents: rows.map((r) => ({ ...toSummary(r), sonKarar: r.son_karar })),
      sayilar,
    };
  });

  /**
   * "Calisan belgeyi acti" isareti.
   *
   * Bilerek ayri bir POST: GET /api/documents/:id yan etkisiz kalmali, aksi
   * halde listeden onizleme ya da bir bot dokunusu bile evraki "isleniyor"
   * gosterirdi. Durum yalnizca ileri gider (bkz. setLifecycleStatus).
   */
  app.post<{ Params: { id: string } }>("/api/documents/:id/open", async (req, reply) => {
    const doc = await getDocumentDetail(req.params.id);
    if (!doc) return reply.code(404).send({ error: "Belge bulunamadi" });
    await setLifecycleStatus(doc.id, "in_progress");
    return { ok: true };
  });

  /**
   * Yuklenen dosyalarin hat durumu — yol uzerinden sorgulanir.
   *
   * POST /api/upload dosyayi kuyruga birakip hemen doner (LLM beklenmez) ve
   * geriye yalnizca YOL verir; belge kaydi worker parse edince olusur. Arayuz
   * ilerlemeyi gosterebilmek icin yuklediği yollari burada yoklar.
   *
   * "hazir" ARAMADA GORUNUR demektir, yalnizca parse edildi demek degil.
   * documents.status = 'parsed' hattin daha ilk adiminda set ediliyor; buna
   * bakip hazir demek, sohbete eklenen bir belgenin daha embed edilmeden
   * sorgulanmasina ve "bu bilgi belgede yok" cevabina yol aciyordu. Bu yuzden
   * olcut, embed edilmemis CHILD chunk kalmamasi.
   *
   * Yalnizca child sayilir: parent chunk'lar LLM'e genis baglam vermek icin
   * tutulur, hicbir zaman embed edilmez (bkz. chunksToEmbedForDoc). Tum
   * chunk'lari sayan bir olcut hicbir zaman saglanmaz — belge sonsuza kadar
   * "isleniyor" gorunur.
   *
   * Tek bir asama YETMIYOR: hat dakikalarca surebiliyor ve calisan nerede
   * olundugunu gormeli. `adimlar` hattin her adimini ayri ayri bildirir (bkz.
   * helpers/pipeline-steps.ts); `asama` ozet olarak kalir — sohbet eki
   * yuklemesi yalnizca "hazir mi" diye bakiyor.
   */
  app.get<{ Querystring: { paths?: string } }>("/api/documents/status", async (req) => {
    const paths = (req.query.paths ?? "").split("\n").map((p) => p.trim()).filter(Boolean);
    if (!paths.length) return { durumlar: [] };
    const res = await pool.query<
      StatusRow & { id: string; path: string; filename: string; routed_service: string | null }
    >(
      `SELECT d.id, d.path, d.filename, d.status, d.corpus, d.session_id, d.routed_service,
              d.kunye_at, d.analyzed_at, d.routing_status, d.gaps_scanned_at,
              COUNT(c.id) AS chunk_toplam,
              COUNT(c.id) FILTER (WHERE c.kind = 'child') AS child_toplam,
              COUNT(c.id) FILTER (WHERE c.kind = 'child' AND c.embedded_at IS NULL)
                AS child_bekleyen
       FROM documents d
       LEFT JOIN chunks c ON c.doc_id = d.id
       WHERE d.path = ANY($1::text[])
       GROUP BY d.id`,
      [paths],
    );
    const bulunan = new Map(res.rows.map((r) => [r.path, r]));

    /*
     * Kaydi olmayan yollar: dosya ya HENUZ sirada bekliyor ya da o is artik
     * yok. Ikisi ayni cevabi verdigi surece arayuz, karsiligi kalmamis bir
     * yuklemeyi sonsuza kadar "belge okunuyor" diye gosteriyordu (orn. veri
     * tabani sifirlandiktan sonra sekmede duran eski takip kaydi). Kuyrukta
     * karsiligi olup olmadigina bakarak ikisini ayiriyoruz.
     */
    const kayitsiz = paths.filter((p) => !bulunan.has(p));
    const sirada = new Set(
      (
        await Promise.all(
          kayitsiz.map(async (p) => ((await parseIsiVarMi(p)) ? p : null)),
        )
      ).filter((p): p is string => p !== null),
    );

    return {
      durumlar: paths.map((path) => {
        const r = bulunan.get(path);
        if (!r) {
          if (!sirada.has(path)) {
            // Ne kaydi ne isi var: takip edilecek bir sey kalmamis.
            return { path, asama: "kayip" as const, adimlar: [], id: null, servis: null };
          }
          const adimlar = kuyruktakiAdimlar();
          return { path, asama: "kuyrukta" as const, adimlar, id: null, servis: null };
        }
        const asama =
          r.status === "failed"
            ? ("hata" as const)
            : embedBitti(r)
              ? ("hazir" as const)
              : ("isleniyor" as const);
        const adimlar = hatAdimlari(r);
        return { path, asama, adimlar, id: r.id, filename: r.filename, servis: r.routed_service };
      }),
    };
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (req, reply) => {
    const doc = await getDocumentDetail(req.params.id);
    if (!doc) return reply.code(404).send({ error: "Belge bulunamadi" });
    const history = await getChatHistory(doc.id);
    return { document: { ...toSummary(doc), path: doc.path }, chat: history };
  });

  /** Orijinal dosyayi (PDF) arayuzde gostermek icin. */
  app.get<{ Params: { id: string } }>("/api/documents/:id/file", async (req, reply) => {
    const doc = await getDocumentDetail(req.params.id);
    if (!doc) return reply.code(404).send({ error: "Belge bulunamadi" });
    try {
      const buf = await readFile(doc.path);
      const tip =
        doc.format === "pdf"
          ? "application/pdf"
          : doc.format === "md" || doc.format === "txt"
            ? "text/plain; charset=utf-8"
            : "application/octet-stream";
      return reply
        .header("Content-Type", tip)
        .header("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`)
        .send(buf);
    } catch {
      return reply.code(410).send({ error: "Kaynak dosya diskte bulunamadi" });
    }
  });

  /** Parse edilmis duz metin — arayuzde metin gorunumu icin. */
  app.get<{ Params: { id: string } }>("/api/documents/:id/text", async (req, reply) => {
    const doc = await getDocumentDetail(req.params.id);
    if (!doc?.parsed_md_path) return reply.code(404).send({ error: "Parse edilmis metin yok" });
    return { text: await readFile(doc.parsed_md_path, "utf-8") };
  });

  /**
   * Manuel yeniden yonlendirme. Iki mod:
   *  - servis verilirse: calisanin karari kaydedilir (insan son sozu soyler)
   *  - verilmezse: yonlendirme yeniden hesaplanir
   */
  app.post<{ Params: { id: string }; Body: { servis?: string; gerekce?: string } }>(
    "/api/documents/:id/reroute",
    async (req, reply) => {
      const doc = await getDocumentDetail(req.params.id);
      if (!doc) return reply.code(404).send({ error: "Belge bulunamadi" });

      if (req.body?.servis) {
        // Elle atama da katalogla sinirli: arayuzdeki liste zaten katalogdan
        // geliyor, ama bu uc raw SQL ile yaziyor ve katalog disi bir ad evraki
        // hicbir havuzda gorunmez hale getirirdi (bkz. saveRoutingDecision).
        if (!(await isRegulationService(req.body.servis))) {
          return reply
            .code(400)
            .send({ error: `Yonetmelik katalogunda boyle bir servis yok: ${req.body.servis}` });
        }
        await pool.query(
          `UPDATE documents SET routed_service = $2, routing_reasoning = $3,
             routing_confidence = 1, routing_status = 'routed', routed_at = now(),
             routing_source = 'manuel', updated_at = now()
           WHERE id = $1`,
          [doc.id, req.body.servis, req.body.gerekce ?? "Servis calisani tarafindan elle atandi"],
        );
        return { document: toSummary((await getDocumentDetail(doc.id))!), manuel: true };
      }

      const metin = [
        `Belge turu: ${doc.doc_type ?? "bilinmiyor"}`,
        `Konu: ${doc.doc_subject ?? doc.filename}`,
        `Ozet: ${doc.doc_summary_long ?? ""}`,
      ].join("\n");
      const sonuc = await routeDocument({ metin, aramaSorgusu: doc.doc_subject ?? doc.filename });
      await saveRoutingDecision(doc.id, sonuc.decision);
      return {
        document: toSummary((await getDocumentDetail(doc.id))!),
        karar: formatRoutingDecision(sonuc.decision, sonuc.hits),
        trace: sonuc.trace,
      };
    },
  );
}

type Detay = Awaited<ReturnType<typeof getDocumentDetail>>;

/** Arayuzun ozet kartinda gosterdigi alanlar. */
function toSummary(d: NonNullable<Detay>) {
  return {
    id: d.id,
    filename: d.filename,
    format: d.format,
    status: d.status,
    konu: d.doc_subject,
    ozet: d.doc_summary_long,
    docType: d.doc_type,
    entities: d.extracted_entities,
    containsPII: d.contains_pii,
    /** null: evrak hic taranmadi (hat oncesi kayit). Bos dizi: tarandi, bulgu cikmadi. */
    eksikler: d.gap_findings,
    routing: {
      birim: d.routed_birim,
      servis: d.routed_service,
      guvenSkoru: d.routing_confidence,
      gerekce: d.routing_reasoning,
      maddeler: d.routing_regulation_refs ?? [],
      durum: d.routing_status,
      /**
       * Cevap yazisi mukellefe mi mahkemeye mi gidiyor.
       *
       * Kural sunucuda (isDisputeService) duruyor ve arayuz sonucu okuyor;
       * servis adini iki yerde ayri ayri eslestirmek, birinin gunun birinde
       * digerinden sapmasi demekti.
       */
      mahkemeYazismasi: isDisputeService(d.routed_service),
      /** Servisi kim atadi: "llm" (model) | "manuel" (calisan). Hic atanmadiysa null. */
      kaynak: d.routing_source,
    },
    /** Is akisi durumu — parse durumundan (status) ayridir. */
    yasamDongusu: d.lifecycle_status,
    tamamlanmaTarihi: d.completed_at,
    createdAt: d.created_at,
  };
}
