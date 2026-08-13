/**
 * Evrak ve yazisma API'si (Faz 5b).
 *
 * Web arayuzunun tek veri kaynagi. Is mantigi packages/ altinda durur; buradaki
 * route'lar yalnizca HTTP'ye ceviri yapar — ayni fonksiyonlari CLI'lar ve worker
 * da cagirir, mantik iki yerde tekrarlanmaz.
 *
 * Calistir: pnpm api
 */
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "@albay/shared";
import { migrate, pool } from "@albay/ingestion";
import { registerServiceRoutes } from "./routes/services.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerUploadRoutes } from "./routes/upload.ts";
import { registerChatRoutes } from "./routes/chat.ts";
import { registerLetterRoutes } from "./routes/letter.ts";
import { closeQueues, pingRedis } from "./helpers/queue.ts";
import { closeBrowser } from "@albay/letter";

const app = Fastify({
  logger: { transport: undefined, level: process.env.LOG_LEVEL ?? "info" },
  // Evrak metinleri uzun olabiliyor; varsayilan 1MB govde siniri dar kaliyor.
  bodyLimit: 8 * 1024 * 1024,
});

await app.register(cors, {
  origin: config.WEB_ORIGIN.split(",").map((o) => o.trim()),
  credentials: true,
});
await app.register(multipart, {
  limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 10 },
});

/**
 * Tek noktadan hata yonetimi.
 *
 * Route'larda korumasiz bir islem (orn. diskte olmayan parse metnini okumak)
 * firlarsa istemciye ham 500 + yigin izi sizmasin: 5xx tam baglamla loglanir,
 * govdede yalnizca genel mesaj doner. 4xx istemci hatasidir, oldugu gibi
 * gecer; Fastify sema dogrulama hatalari makine-okunur `detay` ile aktarilir.
 */
app.setErrorHandler((error: FastifyError, req, reply) => {
  const durum = error.statusCode ?? 500;
  if (durum >= 500) app.log.error({ err: error, url: req.url }, error.message);
  else app.log.warn({ url: req.url }, error.message);
  const govde: Record<string, unknown> = {
    error: durum >= 500 ? "Sunucu hatasi" : error.message,
  };
  if (error.validation) govde.detay = error.validation;
  return reply.code(durum).send(govde);
});

// Liveness: surec ayakta mi? Bagimlilik yoklamaz, hizli doner — orkestrasyon
// icin yalnizca yeniden baslatma sinyali.
app.get("/api/health", async () => ({ ok: true, service: "albay-api" }));

// Readiness: dis bagimliliklar (Postgres + Redis) gercekten erisilebilir mi?
// Biri dusukse 503 doner ki yuk dengeleyici hat is goremezken trafik yollamasin.
app.get("/api/ready", async (_req, reply) => {
  const yoklamalar = { db: false, redis: false };
  try {
    await pool.query("SELECT 1");
    yoklamalar.db = true;
  } catch (err) {
    app.log.error({ err }, "readiness: Postgres erisilemedi");
  }
  try {
    await pingRedis();
    yoklamalar.redis = true;
  } catch (err) {
    app.log.error({ err }, "readiness: Redis erisilemedi");
  }
  const hazir = yoklamalar.db && yoklamalar.redis;
  return reply.code(hazir ? 200 : 503).send({ ready: hazir, checks: yoklamalar });
});

await registerServiceRoutes(app);
await registerDocumentRoutes(app);
await registerUploadRoutes(app);
await registerChatRoutes(app);
await registerLetterRoutes(app);

await migrate();

const shutdown = async (sinyal: string) => {
  app.log.info(`${sinyal} alindi, kapatiliyor...`);
  await app.close();
  await closeQueues();
  // PDF uretimi icin acilan Chromium surece bagli; kapatilmazsa zombie kalir.
  await closeBrowser();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.API_PORT, host: config.API_HOST });
app.log.info(`Albay API hazir → http://${config.API_HOST}:${config.API_PORT}`);
