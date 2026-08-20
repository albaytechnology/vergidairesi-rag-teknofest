/**
 * Yapisal belge chunker'i.
 *
 *  - H1/H2 sinirlari bolum (parent) siniridir
 *  - Tablolar asla bolunmez
 *  - Her child chunk breadcrumb ile baslar: [Dosya: x.pdf > Bolum: ...]
 *  - Uzun paragraflar cumle bazli, overlap'li bolunur
 *
 * Her bolum icin IKI seviye uretilir: bolumun tamami parent (LLM'e genis
 * baglam), icindeki kucuk parcalar child (arama). Arama child'i bulur, cevap
 * parent'tan yazilir.
 */
import { randomUUID } from "node:crypto";
import type { Chunk } from "@albay/shared";
import { estimateTokens } from "../tokens.ts";
import { PageMap } from "../pagemap.ts";
import { parseMarkdownBlocks } from "./markdown.ts";
import { DEFAULTS, type ChunkInput } from "./options.ts";
import { groupIntoSections } from "./sections.ts";
import { splitLongText } from "./split.ts";

export function chunkDocument(input: ChunkInput): Chunk[] {
  const opts = { ...DEFAULTS, ...input.options };
  // Docling'in <!-- image --> yer tutucularini temizle — embedding'e gurultu katiyor
  const cleaned = input.markdown.replace(/<!--\s*image\s*-->/g, "").replace(/\n{3,}/g, "\n\n");
  // Basliklar icerik olarak degil breadcrumb olarak tasinir; blok listesinden dusurulur.
  const blocks = parseMarkdownBlocks(cleaned).filter((b) => b.type !== "heading");
  const pageMap = new PageMap(input.doclingJson ?? null);

  const chunks: Chunk[] = [];

  for (const section of groupIntoSections(blocks)) {
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
