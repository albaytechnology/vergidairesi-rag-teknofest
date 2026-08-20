/**
 * Baslik tanima: bir satir baslik mi, hangi turden?
 *
 * Kaynak metin Docling'den duz bir "## " basligi denizi olarak geliyor;
 * KISIM/BOLUM/Madde hiyerarsisi markdown SEVIYESIYLE degil BASLIK METNIYLE
 * belli oluyor. Buradaki kaliplar ve sekil testleri o ayrimi yapar.
 */

const ORDINALS =
  "BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU";

export const KISIM_RE = new RegExp(`^((?:${ORDINALS})\\s+KISIM)\\b\\s*(.*)$`, "i");
export const BOLUM_RE = new RegExp(`^((?:${ORDINALS})\\s+BÖLÜM)\\b\\s*(.*)$`, "i");
export const ARTICLE_RE = /^(.*?)\s*[:]?\s*[-–—]?\s*Madde\s+(\d+)\s*$/i;
/** Numarasi kaybolmus madde basligi: "... Sorumlulukları :" gibi biter. */
export const HEADLESS_ARTICLE_RE = /^(.+?)\s*:\s*[-–—]?\s*$/;

export function parseHeading(line: string): string | null {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  return match ? match[1]!.trim().replace(/\s+/g, " ") : null;
}

/** "ve Sorumlulukları" gibi, bir onceki basligin devami olan parca. */
export function isTitleContinuation(text: string): boolean {
  return /^(ve|ile|veya|ya da)\s/i.test(text) || /^\p{Ll}/u.test(text);
}

const TITLE_STOPWORDS = new Set(["ve", "ile", "veya", "ya", "da", "de", "ki"]);

/**
 * Baslik, yonetmelik madde basligi bicimine benziyor mu?
 * Madde basliklari basliklandirilmis isim tamlamasidir ("Vergi Dairesi Başkanının
 * Sorumluluğu"); govde icindeki ara basliklar cumle parcasidir ("Vergi dairesi
 * müdürleri yukarıda sayılan görevlere ilave olarak"). Ayirt edici olan bu.
 */
export function isArticleTitleShape(text: string): boolean {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w.length >= 2 && !TITLE_STOPWORDS.has(w.toLocaleLowerCase("tr-TR")));
  if (words.length < 2) return false;
  const capitalized = words.filter((w) => w[0] === w[0]!.toLocaleUpperCase("tr-TR"));
  return capitalized.length / words.length >= 0.8;
}
