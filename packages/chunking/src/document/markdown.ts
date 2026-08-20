/** Markdown'i basit yapisal bloklara ayirir. Harici parser gerektirmez. */

export type BlockType = "heading" | "paragraph" | "table" | "code" | "list";

export interface Block {
  type: BlockType;
  text: string;
  /** heading ise seviyesi (1-6) */
  level?: number;
  /** Bu blogun uzerindeki baslik zinciri, örn. ["Sozlesme", "3. Fesih Kosullari"] */
  headingPath: string[];
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  const headingStack: { level: number; text: string }[] = [];

  let buffer: string[] = [];
  let bufferType: BlockType = "paragraph";
  let inCodeFence = false;

  const currentPath = () => headingStack.map((h) => h.text);

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      blocks.push({ type: bufferType, text, headingPath: currentPath() });
    }
    buffer = [];
    bufferType = "paragraph";
  };

  for (const line of lines) {
    // Kod blogu — acilis/kapanis arasi atomik
    if (line.trimStart().startsWith("```")) {
      if (!inCodeFence) {
        flush();
        inCodeFence = true;
        bufferType = "code";
        buffer.push(line);
      } else {
        buffer.push(line);
        inCodeFence = false;
        flush();
      }
      continue;
    }
    if (inCodeFence) {
      buffer.push(line);
      continue;
    }

    // Baslik
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length;
      const text = h[2]!.trim();
      while (
        headingStack.length &&
        headingStack[headingStack.length - 1]!.level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      blocks.push({ type: "heading", text, level, headingPath: currentPath() });
      continue;
    }

    // Tablo satiri
    const isTableLine = line.trimStart().startsWith("|");
    if (isTableLine && bufferType !== "table") {
      flush();
      bufferType = "table";
    }
    if (!isTableLine && bufferType === "table") {
      flush();
    }

    // Liste
    const isListLine = /^\s*([-*+]|\d+\.)\s+/.test(line);
    if (isListLine && bufferType === "paragraph" && buffer.length === 0) {
      bufferType = "list";
    }

    // Bos satir paragraf/liste siniri (tablo degilse)
    if (line.trim() === "" && bufferType !== "table") {
      flush();
      continue;
    }

    buffer.push(line);
  }
  flush();
  return blocks;
}
