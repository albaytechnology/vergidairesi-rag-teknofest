/**
 * Servis adlari uzerindeki saf kurallar: karsilastirma, giris noktasi tespiti
 * ve orgut tipine gore gecerlilik. Hicbiri LLM'e bagli degildir.
 */
import { trNormalize } from "../common/tr-text.ts";
import { normalizeMaddeNo } from "./madde.ts";

/**
 * Yazisma ve Arsiv Servisi sistemin GIRIS NOKTASIDIR (M.11-B-I-6: "evrakin ilgili
 * yerlere sevkini saglamak"), yonlendirme hedefi degil — evrak zaten oradan geliyor.
 * Ayirt edici olarak "arsiv" kelimesini kullaniyoruz: "Vergi Denetmenleri Yazisma
 * Servisi" gibi gercek hedefleri yanlislikla elemesin diye "yazisma" yeterli degil.
 */
export function isEntryPointService(servis: string): boolean {
  return /arsiv/.test(trNormalize(servis));
}

/**
 * Kesin servis adi karsilastirmasi.
 *
 * sameService bilerek toleranslidir ve bu yuzden "Surekli Yukumlulukler
 * Vergilendirme Servisi" ile "Sureksiz Yukumlulukler Vergilendirme Servisi"ni
 * AYIRAMAZ (bkz. routing.test.ts). Bu iki servis farkli hedefler oldugu icin
 * dogru parcayi secerken once kesin esitlik denenir.
 */
export function sameServiceStrict(a: string, b: string): boolean {
  return trNormalize(a) === trNormalize(b);
}

/** Iki servis adi ayni servisi mi gosteriyor? (LLM adi eksik/yazim hatali yazabilir) */
export function sameService(a: string, b: string): boolean {
  const [x, y] = [trNormalize(a), trNormalize(b)];
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const xs = new Set(x.split(" ").filter((w) => w.length > 3));
  const ys = new Set(y.split(" ").filter((w) => w.length > 3));
  if (!xs.size || !ys.size) return false;
  const ortak = [...xs].filter((w) => ys.has(w)).length;
  return ortak / Math.min(xs.size, ys.size) >= 0.6;
}

/**
 * Bir servisin bu orgut tipinde var olup olmadigi.
 *
 * Yonlendirme filtresi ile /api/services katalogu AYNI kurali kullanmali:
 * ayrilirlarsa arayuz hicbir zaman evrak alamayacak bir havuz gosterir
 * (baskanlik kurulumunda Tahakkuk/Tahsilat gibi).
 */
export function isServiceForOrgType(maddeNo: string, orgType: string): boolean {
  const no = normalizeMaddeNo(maddeNo);
  return orgType === "bagli" ? no === "12" : no !== "12";
}
