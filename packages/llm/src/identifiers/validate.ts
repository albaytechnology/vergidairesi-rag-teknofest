/**
 * Kimlik numarasi kabul politikasi: dogrulanamayan numara yazilmaz.
 *
 * NEDEN: Belge analizinde kimlik numaralarini LLM cikariyor, ama bu numaralar
 * resmi cevap yazisina basiliyor. LLM bir haneyi yanlis okursa ya da tamamen
 * uydurursa, kurum disina yanlis vergi numarali bir yazi cikar. Her iki numara
 * turunun de checksum algoritmasi oldugu icin bunu deterministik olarak
 * yakalayabiliyoruz: dogrulamadan gecmeyen numara kabul EDILMEZ, null yazilir.
 *
 * SINIR: checksum'in tutmasi numaranin GERCEKTEN KAYITLI oldugunu kanitlamaz —
 * yalnizca transkripsiyon/uydurma hatalarinin buyuk kismini eler (orn. 1234567890
 * gecerli bir VKN checksum'ina sahiptir). Numaranin gercekten o mukellefe ait
 * oldugu ancak GIB sorgusuyla dogrulanabilir; bu modul o adimin yerini tutmaz.
 */
import { onlyDigits } from "../text/normalize.ts";
import { isValidTckn, isValidVkn } from "./checksum.ts";

/** Dogruysa normalize edilmis numarayi, degilse null dondurur. */
export function validateTckn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = onlyDigits(raw);
  return isValidTckn(s) ? s : null;
}

/**
 * Mukellef numarasi dogrulamasi. Gercek kisi mukelleflerde vergi kimlik numarasi
 * yerine T.C. kimlik numarasi kullanildigi icin 11 haneli TCKN de kabul edilir.
 */
export function validateVkn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = onlyDigits(raw);
  if (s.length === 11) return isValidTckn(s) ? s : null;
  return isValidVkn(s) ? s : null;
}
