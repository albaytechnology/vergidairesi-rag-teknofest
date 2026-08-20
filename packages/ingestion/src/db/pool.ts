import pg from "pg";
import { config } from "@albay/shared";

/**
 * Paylasilan Postgres havuzu.
 *
 * Paket icindeki her sorgu bunun uzerinden gider; tuketiciler de ayri baglanti
 * acmak yerine bunu import eder (uzun surecli worker'da baglanti sizmasin diye).
 */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
