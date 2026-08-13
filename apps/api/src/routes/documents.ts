import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  getDocumentDetail,
  listDocumentsByService,
  listArchiveDocuments,
  archiveCounts,
  setLifecycleStatus,
  saveRoutingDecision,
  getChatHistory,
  pool,
} from "@albay/ingestion";
import { routeDocument, formatRoutingDecision } from "@albay/agents";

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
   */
  app.get<{ Querystring: { paths?: string } }>("/api/documents/status", async (req) => {
    const paths = (req.query.paths ?? "").split("\n").map((p) => p.trim()).filter(Boolean);
    if (!paths.length) return { durumlar: [] };
    const res = await pool.query<{
      id: string;
      path: string;
      filename: string;
      status: string;
      routed_service: string | null;
      bekleyen_chunk: string;
      toplam_chunk: string;
    }>(
      `SELECT d.id, d.path, d.filename, d.status, d.routed_service,
              COUNT(c.id) FILTER (WHERE c.embedded_at IS NULL) AS bekleyen_chunk,
              COUNT(c.id) AS toplam_chunk
       FROM documents d
       LEFT JOIN chunks c ON c.doc_id = d.id AND c.kind = 'child'
       WHERE d.path = ANY($1::text[])
       GROUP BY d.id`,
      [paths],
    );
    const bulunan = new Map(res.rows.map((r) => [r.path, r]));
    return {
      durumlar: paths.map((path) => {
        const r = bulunan.get(path);
        // Kayit yoksa dosya henuz parse kuyrugunda bekliyor demektir.
        if (!r) return { path, asama: "kuyrukta" as const, id: null, servis: null };
        const embedBitti = Number(r.toplam_chunk) > 0 && Number(r.bekleyen_chunk) === 0;
        const asama =
          r.status === "failed"
            ? ("hata" as const)
            : embedBitti
              ? ("hazir" as const)
              : ("isleniyor" as const);
        return { path, asama, id: r.id, filename: r.filename, servis: r.routed_service };
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
        await pool.query(
          `UPDATE documents SET routed_service = $2, routing_reasoning = $3,
             routing_confidence = 1, routing_status = 'routed', routed_at = now(),
             updated_at = now()
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
    routing: {
      birim: d.routed_birim,
      servis: d.routed_service,
      guvenSkoru: d.routing_confidence,
      gerekce: d.routing_reasoning,
      maddeler: d.routing_regulation_refs ?? [],
      durum: d.routing_status,
    },
    /** Is akisi durumu — parse durumundan (status) ayridir. */
    yasamDongusu: d.lifecycle_status,
    tamamlanmaTarihi: d.completed_at,
    createdAt: d.created_at,
  };
}
