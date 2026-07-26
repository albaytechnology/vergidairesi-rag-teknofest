import { randomUUID } from "node:crypto";
import type { Chunk } from "@albay/shared";
import { parseMarkdownBlocks, type Block } from "./markdown.ts";
import { estimateTokens } from "./tokens.ts";
import { PageMap } from "./pagemap.ts";

export interface ChunkOptions {
  /** Hedef chunk boyutu (token) */
  targetTokens?: number;
  /** Tek chunk'in ust siniri (tablo haric — tablolar asla bolunmez) */
  maxTokens?: number;
  /** Uzun paragraf bolunurken cumle bazli overlap orani */
  overlapRatio?: number;
  /** Parent chunk ust siniri */
  maxParentTokens?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 650,
  maxTokens: 900,
  overlapRatio: 0.12,
  maxParentTokens: 3500,
};

export interface ChunkInput {
  docId: string;
  filename: string;
  markdown: string;
  doclingJson?: unknown;
  options?: ChunkOptions;
}

/**
 * Yapisal chunker:
 *  - H1/H2 sinirlari bolum (parent) siniridir
 *  - Tablolar asla bolunmez
 *  - Her child chunk breadcrumb ile baslar: [Dosya: x.pdf > Bolum: ...]
 *  - Uzun paragraflar cumle bazli, overlap'li bolunur
 */
export function chunkDocument(input: ChunkInput): Chunk[] {
  const opts = { ...DEFAULTS, ...input.options };
  // Docling'in <!-- image --> yer tutucularini temizle — embedding'e gurultu katiyor
  const cleaned = input.markdown.replace(/<!--\s*image\s*-->/g, "").replace(/\n{3,}/g, "\n\n");
  const blocks = parseMarkdownBlocks(cleaned).filter(
    (b) => b.type !== "heading",
  );
  const pageMap = new PageMap(input.doclingJson ?? null);

  // Bolumlere ayir: H1/H2 yolu degisince yeni bolum
  const sections: { key: string; path: string[]; blocks: Block[] }[] = [];
  for (const block of blocks) {
    const key = block.headingPath.slice(0, 2).join(" > ") || "(bolumsuz)";
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.blocks.push(block);
    } else {
      sections.push({ key, path: block.headingPath.slice(0, 2), blocks: [block] });
    }
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const sectionLabel = section.path.join(" > ") || null;
    const breadcrumb = `[Dosya: ${input.filename}${sectionLabel ? ` > ${sectionLabel}` : ""}]`;

    // Parent chunk — bolumun tamami (LLM'e genis baglam icin)
    const sectionText = section.blocks.map((b) => b.text).join("\n\n");
    const parentTokens = estimateTokens(sectionText);
    let parentId: string | null = null;
    if (parentTokens > 0) {
      parentId = randomUUID();
      const parentBody =
        parentTokens > opts.maxParentTokens
          ? sectionText.slice(0, opts.maxParentTokens * 4)
          : sectionText;
      chunks.push({
        id: parentId,
        docId: input.docId,
        kind: "parent",
        text: `${breadcrumb}\n${parentBody}`,
        page: pageMap.findPage(section.blocks[0]?.text ?? ""),
        section: sectionLabel,
        parentId: null,
        tokenCount: estimateTokens(parentBody),
      });
    }

    // Child chunk'lar — arama icin kucuk parcalar
    let buffer: string[] = [];
    let bufferTokens = 0;

    const flushChild = () => {
      if (!buffer.length) return;
      const body = buffer.join("\n\n");
      const text = `${breadcrumb}\n${body}`;
      chunks.push({
        id: randomUUID(),
        docId: input.docId,
        kind: "child",
        text,
        page: pageMap.findPage(body),
        section: sectionLabel,
        parentId,
        tokenCount: estimateTokens(text),
      });
      buffer = [];
      bufferTokens = 0;
    };

    for (const block of section.blocks) {
      const blockTokens = estimateTokens(block.text);

      // Tablo: asla bolunmez. Buffer'a sigmiyorsa once flush, tek basina chunk olabilir.
      if (block.type === "table") {
        if (bufferTokens + blockTokens > opts.maxTokens) flushChild();
        buffer.push(block.text);
        bufferTokens += blockTokens;
        if (bufferTokens >= opts.targetTokens) flushChild();
        continue;
      }

      // Cok uzun paragraf/liste: cumle bazli overlap'li bol
      if (blockTokens > opts.maxTokens) {
        flushChild();
        for (const piece of splitLongText(block.text, opts)) {
          buffer.push(piece);
          bufferTokens = estimateTokens(piece);
          flushChild();
        }
        continue;
      }

      if (bufferTokens + blockTokens > opts.targetTokens && bufferTokens > 0) {
        flushChild();
      }
      buffer.push(block.text);
      bufferTokens += blockTokens;
    }
    flushChild();
  }

  return chunks;
}

/** Uzun metni cumle sinirlarinda, ~overlapRatio orani ortusme ile boler. */
function splitLongText(text: string, opts: Required<ChunkOptions>): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|\s*[^.!?\n]+$/g) ?? [text];
  const pieces: string[] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const s of sentences) {
    const t = estimateTokens(s);
    if (tokens + t > opts.targetTokens && current.length) {
      pieces.push(current.join("").trim());
      // Overlap: son cumlelerden ~overlapRatio kadar geri tasi
      const overlapTarget = opts.targetTokens * opts.overlapRatio;
      const kept: string[] = [];
      let keptTokens = 0;
      for (let i = current.length - 1; i >= 0 && keptTokens < overlapTarget; i--) {
        kept.unshift(current[i]!);
        keptTokens += estimateTokens(current[i]!);
      }
      current = kept;
      tokens = keptTokens;
    }
    current.push(s);
    tokens += t;
  }
  if (current.length) pieces.push(current.join("").trim());
  return pieces.filter((p) => p.length > 0);
}
