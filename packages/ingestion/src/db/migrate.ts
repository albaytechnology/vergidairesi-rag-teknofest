import { pool } from "./pool.ts";
import { sql as core } from "./migrations/001-core.ts";
import { sql as classification } from "./migrations/002-classification.ts";
import { sql as analysis } from "./migrations/003-analysis.ts";
import { sql as routing } from "./migrations/004-routing.ts";
import { sql as lifecycle } from "./migrations/005-lifecycle.ts";
import { sql as chat } from "./migrations/006-chat.ts";
import { sql as letters } from "./migrations/007-letters.ts";
import { sql as sessionUploads } from "./migrations/008-session-uploads.ts";
import { sql as gaps } from "./migrations/009-gaps.ts";
import { sql as chatLetterIntent } from "./migrations/010-chat-letter-intent.ts";
import { sql as routingCatalog } from "./migrations/011-routing-catalog.ts";
import { sql as routingSource } from "./migrations/012-routing-source.ts";
import { sql as kunyeStep } from "./migrations/013-kunye-step.ts";

/**
 * Semanin adimlari, CALISMA SIRASINDA.
 *
 * Sira anlamli: her adim kendinden oncekinin sutunlarina dokunabiliyor
 * (orn. 005 yasam dongusunu 004'un routing_status'undan geri dolduruyor,
 * 008'in geri doldurmasi 005'in lifecycle_status'unu sifirliyor). Yeni adim
 * eklerken sona eklenir, aradaki dosyalar degistirilmez.
 */
const ADIMLAR = [
  core,
  classification,
  analysis,
  routing,
  lifecycle,
  chat,
  letters,
  sessionUploads,
  gaps,
  chatLetterIntent,
  routingCatalog,
  routingSource,
  kunyeStep,
];

/**
 * Semayi gunceller. Her adim idempotent (IF NOT EXISTS) oldugu icin her
 * aciliste guvenle cagrilabilir; API ve worker acilirken bunu yapar.
 *
 * Adimlar TEK sorguda gonderilir: pg bunu tek bir islem (implicit transaction)
 * icinde calistirir, boylece yarim uygulanmis sema kalmaz.
 */
export async function migrate(): Promise<void> {
  await pool.query(ADIMLAR.join("\n"));
}
