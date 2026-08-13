/**
 * Cevap yazisi uc noktalari (Faz 5c).
 *
 * Akis: taslak uret → arayuzde onizle/duzelt → PDF veya DOCX indir.
 * PDF girdisi onizlemedeki SON HTML'dir (calisanin duzeltmesi kaybolmasin);
 * DOCX girdisi yapisal modeldir (Word'de duzenlenmeye devam edilecegi icin).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  documentAnalysisFromRow,
  getDocumentDetail,
  listResponseLetters,
  nextLetterNo,
  saveResponseLetter,
  setLifecycleStatus,
} from "@albay/ingestion";
import { draftResponseLetter } from "@albay/agents";
import { buildLetterModel, htmlToPdf, letterToDocx, renderLetterHtml } from "@albay/letter";
import { LetterDecisionSchema, LetterModelSchema } from "@albay/shared";

const MuhatapSchema = z.object({
  ad: z.string().optional(),
  tur: z.enum(["kisi", "kurum"]).optional(),
  adres: z.string().optional(),
  vknTckn: z.string().optional(),
});

const DraftSchema = z.object({
  docId: z.string().uuid(),
  karar: LetterDecisionSchema,
  gerekce: z.string().optional(),
  muhatap: MuhatapSchema.optional(),
  ekler: z.array(z.string()).optional(),
  dagitim: z.array(z.string()).optional(),
  /** true ise sira numarasi alinir ve yazi kaydedilir. Onizleme icin false. */
  kaydet: z.boolean().optional(),
});

const PdfSchema = z.object({
  html: z.string().min(1),
  dosyaAdi: z.string().optional(),
  /**
   * Verilirse evrak "cevap yazildi" olarak isaretlenir ve arsiv panelinde
   * tamamlananlara gecer. Istege bagli: PDF uretimi belgeden bagimsiz da
   * cagrilabilmeli (onizleme cikartma, test).
   */
  docId: z.string().uuid().optional(),
  /** Arsiv kartinda "hangi kararla cevaplandi" bilgisi icin. */
  karar: LetterDecisionSchema.optional(),
});

const DocxSchema = z.object({
  model: LetterModelSchema,
  dosyaAdi: z.string().optional(),
});

export async function registerLetterRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/documents/:id/letters", async (req) => {
    const rows = await listResponseLetters(req.params.id);
    return {
      letters: rows.map((r) => ({
        id: r.id,
        karar: r.decision,
        gerekce: r.decision_reason,
        sayi: r.sayi,
        createdAt: r.created_at,
      })),
    };
  });

  app.post("/api/response-letter", async (req, reply) => {
    const parsed = DraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Gecersiz istek", detay: parsed.error.issues });
    }
    const istek = parsed.data;

    const doc = await getDocumentDetail(istek.docId);
    if (!doc) return reply.code(404).send({ error: "Belge bulunamadi" });
    if (!doc.analyzed_at) {
      return reply.code(409).send({ error: "Belge henuz analiz edilmemis" });
    }

    const analiz = documentAnalysisFromRow(doc);
    const taslak = await draftResponseLetter({
      analiz,
      karar: istek.karar,
      kararGerekcesi: istek.gerekce,
      maddeler: doc.routing_regulation_refs ?? [],
    });

    // Sira numarasi yalnizca kaydederken tuketilir; onizleme yer tutucu gosterir.
    const sayiNo = istek.kaydet ? await nextLetterNo() : null;
    const model = buildLetterModel({
      analiz,
      body: taslak.body,
      karar: istek.karar,
      sayiNo,
      muhatap: istek.muhatap,
      ekler: istek.ekler,
      dagitim: istek.dagitim,
    });
    const html = renderLetterHtml(model, { onizleme: true });

    let letterId: string | null = null;
    if (istek.kaydet) {
      letterId = await saveResponseLetter({
        documentId: doc.id,
        decision: istek.karar,
        decisionReason: taslak.body.gerekce || istek.gerekce || null,
        mukellefVkn: model.muhatap.vknTckn,
        letterNo: sayiNo,
        sayi: model.sayi,
        letterModel: model,
        letterHtml: html,
      });
    }

    return {
      letterId,
      model,
      html,
      body: taslak.body,
      /** Kaynakta karsiligi olmayan sayilar — arayuz bunlari isaretlemeli. */
      dayanaksizSayilar: taslak.dayanaksizSayilar,
      eksikAlanlar: model.eksikAlanlar,
      trace: taslak.trace,
    };
  });

  app.post("/api/response-letter/pdf", async (req, reply) => {
    const parsed = PdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Gecersiz istek", detay: parsed.error.issues });
    }
    try {
      const pdf = await htmlToPdf(parsed.data.html);
      // Isaretleme PDF URETILDIKTEN sonra: uretim basarisizsa evrak
      // "cevaplandi" gorunmemeli.
      if (parsed.data.docId) {
        await setLifecycleStatus(parsed.data.docId, "completed", parsed.data.karar);
      }
      return sendFile(reply, pdf, "application/pdf", parsed.data.dosyaAdi ?? "cevap-yazisi.pdf");
    } catch (err) {
      // Chromium kurulu degilse burasi calisir — mesaj kurulum komutunu icerir.
      return reply.code(503).send({ error: (err as Error).message });
    }
  });

  app.post("/api/response-letter/docx", async (req, reply) => {
    const parsed = DocxSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Gecersiz istek", detay: parsed.error.issues });
    }
    const buf = await letterToDocx(parsed.data.model);
    return sendFile(
      reply,
      buf,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parsed.data.dosyaAdi ?? "cevap-yazisi.docx",
    );
  });
}

function sendFile(reply: FastifyReply, buf: Buffer, tip: string, ad: string) {
  return reply
    .header("Content-Type", tip)
    .header("Content-Disposition", `attachment; filename="${encodeURIComponent(ad)}"`)
    .send(buf);
}
