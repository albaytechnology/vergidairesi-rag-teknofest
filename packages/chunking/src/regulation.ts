import { randomUUID } from "node:crypto";
import type { Chunk, RegulationChunkMetadata } from "@albay/shared";
import { estimateTokens } from "./tokens.ts";
import { PageMap } from "./pagemap.ts";

export interface RegulationChunkInput {
  docId: string;
  filename: string;
  markdown: string;
  doclingJson?: unknown;
}

/**
 * Yonetmelik chunker'i.
 *
 * Kaynak metin Docling'den geldigi icin duz bir "## " basligi denizi olarak gelir —
 * KISIM/BOLUM/Madde hiyerarsisi markdown seviyesiyle DEGIL, baslik metniyle belli olur.
 * Bu yuzden burada hiyerarsi semantik olarak cikarilir:
 *
 *   KISIM > BOLUM > Madde N > (A/B/C hizmet birimi) > (I/II/III alt bolum) > (1/2/3 servis)
 *
 * Chunk politikasi:
 *   - Madde = mantiksal sinir. Servis dokumu ICEREN maddeler (10, 11, 12) ayrica
 *     SERVIS seviyesinde child chunk'lara bolunur; maddenin tamami parent chunk olur.
 *     Boylece "tecil hangi servisin gorevi" sorusu tek bir servis parcasina duser,
 *     3000 token'lik madde blogunun tamamina degil.
 *   - Masa seviyesi (Beyanname Kabul Masasi vb.) AYRI chunk yapilmaz — gorev dagilimi
 *     "Islem Yonergesi"nde oldugu icin bu seviyede iddia uretilmemeli.
 */
export function chunkRegulationDocument(input: RegulationChunkInput): Chunk[] {
  const articles = parseArticles(input.markdown);
  const pageMap = new PageMap(input.doclingJson ?? null);
  const chunks: Chunk[] = [];

  for (const article of articles) {
    const segments = splitIntoSegments(article.body);
    const articleLabel = `Madde ${article.metadata.maddeNo} - ${article.metadata.baslik}`;
    const bodyText = article.body.join("\n").trim();
    if (!bodyText) continue;

    // Tek parcalik madde: parent'a gerek yok, dogrudan child.
    if (segments.length <= 1) {
      chunks.push(
        buildChunk({
          input,
          pageMap,
          kind: "child",
          parentId: null,
          articleLabel,
          metadata: article.metadata,
          markerPath: [],
          body: bodyText,
        }),
      );
      continue;
    }

    // Cok servisli madde: tamami parent (denetim/baglam), her servis bir child (arama).
    const parentId = randomUUID();
    chunks.push(
      buildChunk({
        id: parentId,
        input,
        pageMap,
        kind: "parent",
        parentId: null,
        articleLabel,
        metadata: article.metadata,
        markerPath: [],
        body: bodyText,
      }),
    );

    for (const segment of segments) {
      const body = segment.lines.join("\n").trim();
      if (!body) continue;
      chunks.push(
        buildChunk({
          input,
          pageMap,
          kind: "child",
          parentId,
          articleLabel,
          metadata: {
            ...article.metadata,
            hizmetBirimi: segment.hizmetBirimi,
            altBolum: segment.altBolum,
            servis: segment.servis,
            servisNo: segment.servisNo,
          },
          markerPath: segment.markerPath,
          body,
        }),
      );
    }
  }

  return chunks;
}

// ─── Chunk uretimi ────────────────────────────────────────────────────

interface BuildChunkArgs {
  id?: string;
  input: RegulationChunkInput;
  pageMap: PageMap;
  kind: "child" | "parent";
  parentId: string | null;
  articleLabel: string;
  metadata: RegulationChunkMetadata;
  markerPath: string[];
  body: string;
}

function buildChunk(args: BuildChunkArgs): Chunk {
  const { metadata: meta } = args;
  const hierarchy = [meta.kisim, meta.bolum, args.articleLabel, ...args.markerPath].filter(Boolean);
  const breadcrumb = `[Dosya: ${args.input.filename} > ${hierarchy.join(" > ")}]`;
  const heading = [args.articleLabel, ...args.markerPath].join("\n");
  const uyari = meta.maddeNoKesin
    ? ""
    : "\n(Not: bu maddenin numarasi kaynak metinden okunamadi, komsu madde numaralarindan turetildi.)";
  const text = `${breadcrumb}\n${heading}${uyari}\n\n${args.body}`;

  return {
    id: args.id ?? randomUUID(),
    docId: args.input.docId,
    kind: args.kind,
    text,
    page: args.pageMap.findPage(text),
    section: [args.articleLabel, meta.servis].filter(Boolean).join(" > "),
    parentId: args.parentId,
    tokenCount: estimateTokens(text),
    metadata: meta,
  };
}

// ─── Madde ayristirma ─────────────────────────────────────────────────

interface ParsedArticle {
  metadata: RegulationChunkMetadata;
  body: string[];
}

/** Numarasi kaynak metinde okunamamis madde — ikinci gecise birakilir. */
interface PendingArticle {
  baslik: string;
  kisim: string | null;
  bolum: string | null;
  body: string[];
  explicitNo: number | null;
}

const ORDINALS =
  "BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU";
const KISIM_RE = new RegExp(`^((?:${ORDINALS})\\s+KISIM)\\b\\s*(.*)$`, "i");
const BOLUM_RE = new RegExp(`^((?:${ORDINALS})\\s+BÖLÜM)\\b\\s*(.*)$`, "i");
const ARTICLE_RE = /^(.*?)\s*[:]?\s*[-–—]?\s*Madde\s+(\d+)\s*$/i;
/** Numarasi kaybolmus madde basligi: "... Sorumlulukları :" gibi biter. */
const HEADLESS_ARTICLE_RE = /^(.+?)\s*:\s*[-–—]?\s*$/;

function parseArticles(markdown: string): ParsedArticle[] {
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

/**
 * Numarasi okunamayan maddelere numara atar — SADECE komsu maddeler numarayi
 * tek bir sekilde belirliyorsa (orn. 20 ve 22 arasindaki tek bosluk -> 21).
 * Aritmetik kesin degilse madde ayri tutulmaz, onceki maddenin govdesine
 * geri katilir: yanlis madde atfi uretmektense parcayi buyutmek yeglenir.
 */
function resolveArticleNumbers(pending: PendingArticle[]): ParsedArticle[] {
  const out: ParsedArticle[] = [];

  for (let i = 0; i < pending.length; i++) {
    const article = pending[i]!;
    if (article.explicitNo !== null) {
      out.push(toParsedArticle(article, String(article.explicitNo), true));
      continue;
    }

    const prev = findExplicit(pending, i, -1);
    const next = findExplicit(pending, i, 1);
    const inferred = prev !== null && next !== null && next - prev === 2 ? prev + 1 : null;

    if (inferred === null) {
      const target = out[out.length - 1];
      if (target) {
        target.body.push("", article.baslik, ...article.body);
      }
      continue;
    }
    out.push(toParsedArticle(article, String(inferred), false));
  }

  return out;
}

function findExplicit(pending: PendingArticle[], from: number, step: 1 | -1): number | null {
  for (let i = from + step; i >= 0 && i < pending.length; i += step) {
    const no = pending[i]!.explicitNo;
    if (no !== null) return no;
  }
  return null;
}

function toParsedArticle(
  article: PendingArticle,
  maddeNo: string,
  maddeNoKesin: boolean,
): ParsedArticle {
  return {
    metadata: {
      kisim: article.kisim,
      bolum: article.bolum,
      hizmetBirimi: null,
      altBolum: null,
      servis: null,
      servisNo: null,
      maddeNo,
      baslik: article.baslik,
      maddeNoKesin,
    },
    body: article.body,
  };
}

// ─── Madde ici servis dokumu ──────────────────────────────────────────

interface Segment {
  hizmetBirimi: string | null;
  altBolum: string | null;
  servis: string | null;
  servisNo: string | null;
  markerPath: string[];
  lines: string[];
}

const LIST_MARKER_RE = /^(?:[-*•]|\d+[.)])\s+/;
/** "I- Vergilendirme Bölümündeki Servisler" */
const ALT_BOLUM_RE = /^([IVX]+)\s*[-–—]\s*(.+)$/;
/** "A) Ana Hizmet Birimleri" — buyuk harf + parantez */
const SECTION_RE = /^([A-ZÇĞİÖŞÜ])\s*[).]\s+(.+)$/;
/**
 * "2) Sürekli Yükümlülükler Vergilendirme Servisi", "1) Tahakkuk Servisinin Görevleri"
 * Yakalanan ad her zaman "... Servisi" ile biter — "nin Görevleri" eki basliktan
 * gelen bir kalip, servisin adinin parcasi degil (Madde 12'de bu bicimde yaziyor).
 */
const SERVICE_RE = /^(?:\d+\s*[).]\s*)?(.+?(?:Servisi|Şubesi))(?:nin\s+Görevleri)?\s*$/i;
const HIZMET_BIRIMI_RE = /(Ana|Diğer)\s+Hizmet\s+Birim|Beyanname\s+Kabul\s+ve\s+Tahsilat/i;
const MAX_MARKER_LEN = 120;

/**
 * Madde govdesini hizmet birimi / alt bolum / servis sinirlarinda parcalara ayirir.
 *
 * Bos kalan hizmet birimi / alt bolum isaretleri atlanir — bunlar zaten alttaki
 * parcalarin markerPath'inde tasinir. Ama bir SERVIS isareti govdesiz kalsa bile
 * kendi parcasi olarak uretilir: Madde 10 gibi salt sayim maddelerinde servis adi
 * ve altindaki masa listesi tek bilgi kaynagidir. "Motorlu Tasitlar Vergisi Masasi"nin
 * hangi servise bagli oldugu yalnizca orada yaziyor; bu esleme buyuk bir madde
 * blogunun icinde gomulu kalirsa retrieval onu bulamiyor.
 */
function splitIntoSegments(body: string[]): Segment[] {
  const segments: Segment[] = [];
  let hizmetBirimi: string | null = null;
  let altBolum: string | null = null;
  let servis: string | null = null;
  let servisNo: string | null = null;
  let markerPath: string[] = [];
  let lines: string[] = [];
  /** Icinde bulundugumuz parca bir servis isaretiyle acildiysa o satir. */
  let servisSatiri: string | null = null;

  const flush = () => {
    const doluMu = lines.some((l) => l.trim());
    // Govdesiz servis: adin kendisi icerik sayilir, boylece kaybolmaz.
    if (!doluMu && !servisSatiri) {
      lines = [];
      return;
    }
    segments.push({
      hizmetBirimi,
      altBolum,
      servis,
      servisNo,
      markerPath: [...markerPath],
      lines: doluMu ? lines : [servisSatiri!],
    });
    lines = [];
  };

  for (const rawLine of body) {
    const core = rawLine.trim().replace(/^#{1,6}\s+/, "").replace(LIST_MARKER_RE, "").trim();
    if (!core || core.length > MAX_MARKER_LEN) {
      lines.push(rawLine);
      continue;
    }

    const altBolumMatch = core.match(ALT_BOLUM_RE);
    if (altBolumMatch) {
      flush();
      altBolum = core;
      servis = null;
      servisNo = null;
      servisSatiri = null;
      markerPath = [hizmetBirimi, altBolum].filter((v): v is string => Boolean(v));
      continue;
    }

    const sectionMatch = core.match(SECTION_RE);
    if (sectionMatch) {
      flush();
      // "A) Ana Hizmet Birimleri" gibi birim basliklarini metadata'ya yaz;
      // "A) Vergi Dairesi Başkanlığı Yönetimi" gibi genel alt basliklari yazma.
      hizmetBirimi = HIZMET_BIRIMI_RE.test(core) ? core : null;
      altBolum = null;
      servis = null;
      servisNo = null;
      servisSatiri = null;
      markerPath = [core];
      continue;
    }

    const serviceMatch = core.match(SERVICE_RE);
    if (serviceMatch && !/[,;]$/.test(core)) {
      flush();
      servis = serviceMatch[1]!.trim();
      servisNo = core.match(/^(\d+)\s*[).]/)?.[1] ?? null;
      servisSatiri = core;
      markerPath = [hizmetBirimi, altBolum, core].filter((v): v is string => Boolean(v));
      continue;
    }

    lines.push(rawLine);
  }
  flush();

  return segments;
}

// ─── Yardimcilar ──────────────────────────────────────────────────────

function parseHeading(line: string): string | null {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  return match ? match[1]!.trim().replace(/\s+/g, " ") : null;
}

/** "ve Sorumlulukları" gibi, bir onceki basligin devami olan parca. */
function isTitleContinuation(text: string): boolean {
  return /^(ve|ile|veya|ya da)\s/i.test(text) || /^\p{Ll}/u.test(text);
}

const TITLE_STOPWORDS = new Set(["ve", "ile", "veya", "ya", "da", "de", "ki"]);

/**
 * Baslik, yonetmelik madde basligi bicimine benziyor mu?
 * Madde basliklari basliklandirilmis isim tamlamasidir ("Vergi Dairesi Başkanının
 * Sorumluluğu"); govde icindeki ara basliklar cumle parcasidir ("Vergi dairesi
 * müdürleri yukarıda sayılan görevlere ilave olarak"). Ayirt edici olan bu.
 */
function isArticleTitleShape(text: string): boolean {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w.length >= 2 && !TITLE_STOPWORDS.has(w.toLocaleLowerCase("tr-TR")));
  if (words.length < 2) return false;
  const capitalized = words.filter((w) => w[0] === w[0]!.toLocaleUpperCase("tr-TR"));
  return capitalized.length / words.length >= 0.8;
}
