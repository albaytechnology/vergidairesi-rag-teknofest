/**
 * Yonetmelik chunker'i.
 *
 * Madde = mantiksal sinir. Servis dokumu ICEREN maddeler ayrica SERVIS
 * seviyesinde child chunk'lara bolunur; maddenin tamami parent chunk olur.
 * Boylece "tecil hangi servisin gorevi" sorusu tek bir servis parcasina duser,
 * 3000 token'lik madde blogunun tamamina degil.
 *
 * Akis:  articles (1. gecis) → numbering (2. gecis) → segments → build
 */
import { randomUUID } from "node:crypto";
import type { Chunk } from "@albay/shared";
import { PageMap } from "../pagemap.ts";
import { parseArticles } from "./articles.ts";
import { splitIntoSegments } from "./segments.ts";
import { buildChunk } from "./build.ts";

export interface RegulationChunkInput {
  docId: string;
  filename: string;
  markdown: string;
  doclingJson?: unknown;
}

export function chunkRegulationDocument(input: RegulationChunkInput): Chunk[] {
  const articles = parseArticles(input.markdown);
  const pageMap = new PageMap(input.doclingJson ?? null);
  const ortak = { docId: input.docId, filename: input.filename, pageMap };
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
          ...ortak,
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
        ...ortak,
        id: parentId,
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
          ...ortak,
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
