/**
 * Bloklari bolumlere gruplar.
 *
 * Sinir H1/H2 yolunun degismesidir: daha derin basliklar (H3+) bolum acmaz,
 * cunku her alt basligin ayri bolum olmasi parent chunk'i anlamsiz kucultur —
 * parent'in isi LLM'e genis baglam vermek.
 */
import type { Block } from "./markdown.ts";

export interface Section {
  key: string;
  path: string[];
  blocks: Block[];
}

export function groupIntoSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  for (const block of blocks) {
    const key = block.headingPath.slice(0, 2).join(" > ") || "(bolumsuz)";
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.blocks.push(block);
    } else {
      sections.push({ key, path: block.headingPath.slice(0, 2), blocks: [block] });
    }
  }
  return sections;
}
