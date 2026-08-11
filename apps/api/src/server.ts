/**
 * Evrak ve yazisma API'si (Faz 5b).
 *
 * Web arayuzunun tek veri kaynagi. Is mantigi packages/ altinda durur; buradaki
 * route'lar yalnizca HTTP'ye ceviri yapar — ayni fonksiyonlari CLI'lar ve worker
 * da cagirir, mantik iki yerde tekrarlanmaz.
 *
 * Calistir: pnpm api
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "@albay/shared";
import { migrate, pool } from "@albay/ingestion";
import { registerServiceRoutes } from "./routes/services.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerUploadRoutes } from "./routes/upload.ts";
import { registerChatRoutes } from "./routes/chat.ts";
import { registerLetterRoutes } from "./routes/letter.ts";
import { closeQueues } from "./helpers/queue.ts";
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

app.get("/api/health", async () => ({ ok: true, service: "albay-api" }));

await registerServiceRoutes(app);
await registerDocumentRoutes(app);
await registerUploadRoutes(app);
await registerChatRoutes(app);
await registerLetterRoutes(app);

await migrate();

const kapat = async (sinyal: string) => {
  app.log.info(`${sinyal} alindi, kapatiliyor...`);
  await app.close();
  await closeQueues();
  // PDF uretimi icin acilan Chromium surece bagli; kapatilmazsa zombie kalir.
  await closeBrowser();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void kapat("SIGINT"));
process.on("SIGTERM", () => void kapat("SIGTERM"));

await app.listen({ port: config.API_PORT, host: config.API_HOST });
app.log.info(`Albay API hazir → http://${config.API_HOST}:${config.API_PORT}`);
