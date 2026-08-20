/**
 * Maddelerin ayristirilmasi — ayristirmanin ILK gecisi.
 *
 * Hiyerarsi semantik olarak cikarilir: KISIM > BOLUM > Madde N. Metin OCR'dan
 * geldigi icin bu gecisin isinin buyuk kismi BOZULMA ONARIMIDIR — bir baslik
 * iki satira bolunmus, KISIM basligi adindan ayri dusmus ya da "Madde N"
 * ibaresi tamamen kaybolmus olabilir. Numarasi okunamayanlar numbering.ts'in
 * ikinci gecisine birakilir.
 */
import {
  ARTICLE_RE,
  BOLUM_RE,
  HEADLESS_ARTICLE_RE,
  KISIM_RE,
  isArticleTitleShape,
  isTitleContinuation,
  parseHeading,
} from "./headings.ts";
import { resolveArticleNumbers, type ParsedArticle, type PendingArticle } from "./numbering.ts";

export function parseArticles(markdown: string): ParsedArticle[] {
  const lines = markdown
    .replace(/<!--\s*image\s*-->/g, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  const pending: PendingArticle[] = [];
  let kisim: string | null = null;
  let bolum: string | null = null;
  let current: PendingArticle | null = null;
  /** KISIM/BOLUM basligi bassiz geldiyse basligi sonraki satirdan tamamlanir. */
  let awaitingTitle: "kisim" | "bolum" | null = null;
  /** OCR bir basligi iki satira bolmus olabilir — ilk yarisi burada bekler. */
  let danglingHeading: string | null = null;

  const makeArticle = (baslik: string, explicitNo: number | null): PendingArticle => {
    const article: PendingArticle = { baslik, kisim, bolum, body: [], explicitNo };
    pending.push(article);
    return article;
  };

  /** Baslik olmadigi anlasilan bekleyen satiri govdeye geri birakir. */
  const flushDangling = () => {
    if (danglingHeading && current) current.body.push(danglingHeading);
    danglingHeading = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (current) current.body.push("");
      continue;
    }

    const headingText = parseHeading(line);
    if (!headingText) {
      flushDangling();
      if (current) current.body.push(rawLine);
      continue;
    }

    // 1) Bekleyen KISIM/BOLUM basligini tamamla
    if (awaitingTitle && !KISIM_RE.test(headingText) && !BOLUM_RE.test(headingText)) {
      if (awaitingTitle === "kisim") kisim = `${kisim} ${headingText}`.trim();
      else bolum = `${bolum} ${headingText}`.trim();
      awaitingTitle = null;
      continue;
    }
    awaitingTitle = null;

    // 2) KISIM / BOLUM on ekini ayikla — ayni satirda madde de olabilir
    //    ("BİRİNCİ BÖLÜM Vergi Dairelerinin Yönetimi: - Madde 13").
    let rest = headingText;
    const kisimMatch = rest.match(KISIM_RE);
    if (kisimMatch) {
      flushDangling();
      kisim = kisimMatch[1]!;
      bolum = null;
      rest = kisimMatch[2]!.trim();
      if (!rest) {
        awaitingTitle = "kisim";
        continue;
      }
    }
    const bolumMatch = rest.match(BOLUM_RE);
    if (bolumMatch) {
      flushDangling();
      bolum = bolumMatch[1]!;
      rest = bolumMatch[2]!.trim();
      if (!rest) {
        awaitingTitle = "bolum";
        continue;
      }
    }

    // 3) Madde basligi
    const articleMatch = rest.match(ARTICLE_RE);
    if (articleMatch) {
      let baslik = articleMatch[1]!.trim().replace(/\s+/g, " ");
      // OCR basligi bolmusse ("... Görev" + "ve Sorumlulukları : Madde 24") birlestir
      if (danglingHeading && isTitleContinuation(baslik)) {
        baslik = `${danglingHeading} ${baslik}`.replace(/\s+/g, " ").trim();
        danglingHeading = null;
      }
      flushDangling();
      if (kisimMatch || bolumMatch) {
        // Baslik KISIM/BOLUM ile ayni satirdaydi — bolum adini da tamamla
        if (bolumMatch && baslik) bolum = `${bolum} ${baslik}`.trim();
      }
      current = makeArticle(baslik || `Madde ${articleMatch[2]}`, Number(articleMatch[2]));
      continue;
    }

    if (kisimMatch || bolumMatch) {
      // Salt yapisal baslik — bolum/kisim adi guncellendi, madde acilmaz
      if (rest) {
        if (bolumMatch) bolum = `${bolum} ${rest}`.trim();
        else kisim = `${kisim} ${rest}`.trim();
      }
      continue;
    }

    // 4) "Madde N" ibaresi OCR'da kaybolmus olabilecek baslik
    const headless = headingText.match(HEADLESS_ARTICLE_RE);
    if (headless && isArticleTitleShape(headless[1]!)) {
      flushDangling();
      current = makeArticle(headless[1]!.trim().replace(/\s+/g, " "), null);
      continue;
    }

    // 5) Siniflandirilamayan baslik — bir sonraki basligin ilk yarisi olabilir
    flushDangling();
    danglingHeading = headingText;
  }
  flushDangling();

  return resolveArticleNumbers(pending);
}
