import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, extname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "@albay/shared";
import { registerSessionUpload, pool } from "@albay/ingestion";
import { getParseQueue } from "../helpers/queue.ts";

const SUPPORTED = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".html"]);

/**
 * Evrak yukleme. Dosya diske yazilir ve parse kuyruguna eklenir; hattin geri
 * kalanini (chunk → analiz → yonlendirme → embed) worker yurutur. HTTP istegi
 * LLM'i beklemez — arayuz durumu /api/documents uzerinden yoklar.
 */
export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  const uploadDir = resolve(config.UPLOAD_DIR);

  app.post("/api/upload", async (req, reply) => {
    const parts = req.files();
    const kuyruk = await getParseQueue();
    const eklenen: { path: string; filename: string }[] = [];
    const reddedilen: { filename: string; sebep: string }[] = [];

    await mkdir(uploadDir, { recursive: true });

    for await (const part of parts) {
      const ext = extname(part.filename).toLowerCase();
      if (!SUPPORTED.has(ext)) {
        reddedilen.push({ filename: part.filename, sebep: `desteklenmeyen tur: ${ext}` });
        // Govde tuketilmezse sonraki part okunamaz
        await part.toBuffer().catch(() => undefined);
        continue;
      }

      const buf = await part.toBuffer();
      // Ayni ada sahip iki evrak birbirini ezmesin; yol jobId'nin de temeli.
      const guvenliAd = `${randomUUID().slice(0, 8)}-${basename(part.filename)}`;
      const hedef = join(uploadDir, guvenliAd);
      await writeFile(hedef, buf);

      await kuyruk.add(
        "parse",
        { path: hedef, corpus: "documents" },
        { jobId: createHash("sha1").update(hedef).digest("hex") },
      );
      eklenen.push({ path: hedef, filename: part.filename });
    }

    if (!eklenen.length && reddedilen.length) {
      return reply.code(415).send({ error: "Desteklenen dosya yok", reddedilen });
    }
    return { kuyruga_eklenen: eklenen.length, dosyalar: eklenen, reddedilen };
  });

  /**
   * Oturuma ozel yukleme: ek mevzuat/ek belge, ana korpusa karismadan yalnizca
   * o sohbette sorgulanabilir olur. Kayit session_uploads'ta tutulur ve chat
   * ucu extraDocIds olarak yalnizca bunlari ekler.
   */
  app.post<{ Querystring: { sessionId?: string } }>(
    "/api/session-upload",
    async (req, reply) => {
      const sessionId = req.query.sessionId;
      if (!sessionId) return reply.code(400).send({ error: "sessionId zorunlu" });

      const part = await req.file();
      if (!part) return reply.code(400).send({ error: "dosya yok" });
      const ext = extname(part.filename).toLowerCase();
      if (!SUPPORTED.has(ext)) {
        return reply.code(415).send({ error: `desteklenmeyen tur: ${ext}` });
      }

      await mkdir(uploadDir, { recursive: true });
      const hedef = join(uploadDir, `${sessionId.slice(0, 8)}-${basename(part.filename)}`);
      await writeFile(hedef, await part.toBuffer());

      const kuyruk = await getParseQueue();
      await kuyruk.add(
        "parse",
        { path: hedef, corpus: "documents" },
        { jobId: createHash("sha1").update(hedef).digest("hex") },
      );

      // Belge kaydi worker tarafindan olusturulacak; yolu ile sonradan baglanir.
      return { kuyruga_eklendi: true, path: hedef, sessionId, filename: part.filename };
    },
  );

  /** Yuklenen dosya parse edilip belge kaydi olusunca oturuma baglanir. */
  app.post<{ Body: { sessionId: string; path: string } }>(
    "/api/session-upload/bind",
    async (req, reply) => {
      const { sessionId, path } = req.body ?? {};
      if (!sessionId || !path) return reply.code(400).send({ error: "sessionId ve path zorunlu" });
      const res = await pool.query<{ id: string; status: string }>(
        "SELECT id, status FROM documents WHERE path = $1",
        [path],
      );
      const doc = res.rows[0];
      if (!doc) return reply.code(404).send({ error: "Belge henuz parse edilmedi", hazir: false });
      await registerSessionUpload(sessionId, doc.id);
      return { hazir: doc.status === "parsed", documentId: doc.id, status: doc.status };
    },
  );
}
