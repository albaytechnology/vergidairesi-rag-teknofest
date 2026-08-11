/**
 * TCKN / VKN dogrulama ve cikarimi.
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
 *
 * Numara uretmek icin degil, yalnizca dogrulamak/elemek icin kullanilir.
 */

const onlyDigits = (raw: string): string => raw.replace(/\D/g, "");

/**
 * T.C. Kimlik Numarasi (11 hane).
 *   d10 = (7*(d1+d3+d5+d7+d9) - (d2+d4+d6+d8)) mod 10
 *   d11 = (d1+...+d10) mod 10
 * Ilk hane 0 olamaz. (Algoritmanin bir sonucu olarak d11 daima cifttir —
 * ayrica kontrol etmeye gerek yok, ikinci esitlik bunu zaten kapsar.)
 */
export function isValidTckn(raw: string): boolean {
  const s = onlyDigits(raw);
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number) as number[];

  let tek = 0;
  let cift = 0;
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) tek += d[i]!;
    else cift += d[i]!;
  }
  if ((tek * 7 - cift + 100) % 10 !== d[9]) return false;

  const ilkOn = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return ilkOn % 10 === d[10];
}

/**
 * Vergi Kimlik Numarasi (10 hane).
 *   i = 0..8 icin: tmp = (di + (9 - i)) mod 10
 *     tmp = 0 ise katki 0; degilse katki = (tmp * 2^(9-i)) mod 9, sonuc 0 ise 9
 *   kontrol hanesi = (10 - (toplam mod 10)) mod 10
 *
 * NOT: "tmp = 0 -> katki 9" seklinde dolasan bir varyant var; GIB'in kamuya acik
 * test numarasi (4840847211) yalnizca buradaki varyantla dogrulaniyor.
 */
export function isValidVkn(raw: string): boolean {
  const s = onlyDigits(raw);
  if (!/^\d{10}$/.test(s)) return false;
  const d = [...s].map(Number) as number[];

  let toplam = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i]! + (9 - i)) % 10;
    if (tmp === 0) continue;
    const katki = (tmp * 2 ** (9 - i)) % 9;
    toplam += katki === 0 ? 9 : katki;
  }
  return (10 - (toplam % 10)) % 10 === d[9];
}

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

export interface IdentifierCandidates {
  tckn: string[];
  vkn: string[];
}

/**
 * Ham belge metninden checksum'i tutan numaralari tarar.
 * LLM cikarimina ALTERNATIF degil, capraz kontrol: LLM'in bulduğu numara
 * metinde gercekten geciyor mu, ya da LLM hic bulamadiysa metinde var mi?
 */
export function extractIdentifierCandidates(text: string): IdentifierCandidates {
  const tckn = new Set<string>();
  const vkn = new Set<string>();
  for (const match of text.matchAll(/\b\d[\d\s.]{8,14}\d\b/g)) {
    const s = onlyDigits(match[0]);
    if (s.length === 11 && isValidTckn(s)) tckn.add(s);
    else if (s.length === 10 && isValidVkn(s)) vkn.add(s);
  }
  return { tckn: [...tckn], vkn: [...vkn] };
}
