import type { ReactNode } from "react";

/**
 * Sohbet cevaplarinin markdown isleyicisi.
 *
 * Model cevabi markdown olarak yaziyor — basliklar, listeler, tablolar, kalin
 * vurgular. Ekranda daha once yalnizca ** ** ayristiriliyor, geri kalani ham
 * metin olarak basiliyordu: bir tutar tablosu ekranda "| 230.800,00 ₺ | ..."
 * satirlari halinde duruyordu.
 *
 * KUTUPHANE YOK: cikti React ELEMANLARI olarak kuruluyor, hicbir yerde
 * dangerouslySetInnerHTML kullanilmiyor. Cevap metni modelden geliyor ve model
 * belgeden besleniyor; belgeye gomulmus bir <script> ya da <img onerror=...>
 * ifadesinin ekranda calisabilecegi bir yol acmiyoruz. Desteklenen sey de
 * markdown'in tamami degil, modelin uretttigi altkume: baslik, liste, tablo,
 * alinti, kod, yatay cizgi, kalin/italik/kod ici.
 *
 * Bilinmeyen bir isaretleme duz metin olarak basilir — bozuk gorunur ama
 * kaybolmaz. Akis sirasinda yarim kalan bir "**" da boyle davranir.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2.5">{parseBlocks(text).map(renderBlock)}</div>;
}

// ─── Blok ayristirma ──────────────────────────────────────────────────

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; depth: number }[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; text: string }
  | { kind: "hr" }
  | { kind: "para"; lines: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const HR = /^\s*([-*_])\1{2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** Tablonun basligini govdeden ayiran satir: |---|:--:| */
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    // Kod blogu: kapanis olmasa bile (akis yarida kesilmis olabilir) sonuna kadar al.
    if (line.trimStart().startsWith("```")) {
      const govde: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) govde.push(lines[i++]!);
      i++;
      blocks.push({ kind: "code", text: govde.join("\n") });
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      i++;
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!)) {
      const header = hucreler(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(hucreler(lines[i++]!));
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const alinti: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) alinti.push(QUOTE.exec(lines[i++]!)![1]!);
      blocks.push({ kind: "quote", lines: alinti });
      continue;
    }

    const madde = BULLET.exec(line) ?? ORDERED.exec(line);
    if (madde) {
      const ordered = ORDERED.test(line);
      const items: { text: string; depth: number }[] = [];
      while (i < lines.length) {
        const m = ordered ? ORDERED.exec(lines[i]!) : BULLET.exec(lines[i]!);
        if (!m) break;
        // Girinti bir seviye ic ice listeyi gosterir; iki bosluk = bir seviye.
        items.push({ text: m[2]!, depth: Math.min(2, Math.floor(m[1]!.length / 2)) });
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraf: bos satira ya da baska bir blogun basladigi satira kadar.
    //
    // Ilk satir kosulsuz tuketilir. Aksi halde blokBasi'nin dogru dedigi ama
    // yukaridaki dallardan hicbirinin almadigi bir satirda dongu ilerlemez.
    // Akis sirasinda tam da bu oluyordu: tablo basligi gelip ayirici satir
    // (|---|---|) henuz gelmediginde tablo dali atlaniyor, satir TABLE_ROW
    // oldugu icin paragrafa da girmiyor, i artmiyordu -> sonsuz dongu.
    const paragraf: string[] = [lines[i++]!];
    while (i < lines.length && lines[i]!.trim() && !blokBasi(lines[i]!)) paragraf.push(lines[i++]!);
    blocks.push({ kind: "para", lines: paragraf });
  }

  return blocks;
}

/** Satir yeni bir blok mu basliyor? (paragrafin nerede bittigini bilmek icin) */
function blokBasi(line: string): boolean {
  return (
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    HR.test(line) ||
    TABLE_ROW.test(line) ||
    line.trimStart().startsWith("```")
  );
}

/** "| a | b |" -> ["a", "b"] */
function hucreler(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((h) => h.trim());
}

// ─── Basim ────────────────────────────────────────────────────────────

const GOVDE = "text-[13.5px] leading-[1.6] text-pretty";

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <div
          key={i}
          className={`font-semibold text-metin ${
            block.level <= 2 ? "mt-1 text-[14.5px]" : "text-[13.5px]"
          }`}
        >
          <Inline raw={block.text} />
        </div>
      );

    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={i}
          className={`${GOVDE} ${
            block.ordered ? "list-decimal" : "list-disc"
          } space-y-1 pl-[18px] marker:text-silik`}
        >
          {block.items.map((item, k) => (
            <li key={k} style={item.depth ? { marginLeft: item.depth * 14 } : undefined}>
              <Inline raw={item.text} />
            </li>
          ))}
        </List>
      );
    }

    case "table":
      return (
        // Genis tablo balonu tasirmasin: kaydirma tablonun kendi kutusunda kalir.
        <div key={i} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {block.header.map((h, k) => (
                  <th
                    key={k}
                    className="border border-cizgi bg-yuzey px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                  >
                    <Inline raw={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, k) => (
                <tr key={k}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-cizgi px-2 py-1.5 align-top">
                      <Inline raw={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "quote":
      return (
        <blockquote
          key={i}
          className={`${GOVDE} border-l-2 border-cizgi-4 pl-2.5 text-ikincil italic`}
        >
          <Satirlar lines={block.lines} />
        </blockquote>
      );

    case "code":
      return (
        <pre
          key={i}
          className="overflow-x-auto rounded-lg border border-cizgi bg-yuzey px-2.5 py-2 font-mono text-[11.5px] leading-[1.5]"
        >
          {block.text}
        </pre>
      );

    case "hr":
      return <hr key={i} className="border-cizgi-3" />;

    case "para":
      return (
        <p key={i} className={GOVDE}>
          <Satirlar lines={block.lines} />
        </p>
      );
  }
}

/** Paragraf ici tek satir sonlari korunur — "Kaynaklar:" listesi boyle yaziliyor. */
function Satirlar({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <Inline raw={l} />
        </span>
      ))}
    </>
  );
}

/**
 * Satir ici isaretleme: **kalin**, *italik*, _italik_, `kod`.
 *
 * Tek gecisli bir bolme kullaniliyor; ic ice vurgu (kalin icinde italik)
 * desteklenmiyor — modelin cevaplarinda gecmiyor ve destegi eklemek tam bir
 * ayristirici yazmak demek.
 */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|(?<![A-Za-zÇĞİÖŞÜçğıöşü0-9])_[^_\n]+_)/g;

function Inline({ raw }: { raw: string }) {
  const parcalar = raw.split(INLINE).filter((p) => p !== undefined && p !== "");
  return (
    <>
      {parcalar.map((p, i) => {
        if ((p.startsWith("**") && p.endsWith("**")) || (p.startsWith("__") && p.endsWith("__"))) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 1) {
          return (
            <code key={i} className="rounded bg-yuzey px-1 py-px font-mono text-[11.5px]">
              {p.slice(1, -1)}
            </code>
          );
        }
        if (
          p.length > 1 &&
          ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_")))
        ) {
          return <em key={i}>{p.slice(1, -1)}</em>;
        }
        return p;
      })}
    </>
  );
}
