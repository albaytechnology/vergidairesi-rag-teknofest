/**
 * Yonetmelik chunk'inin metne donusturulmesi.
 *
 * Breadcrumb tam hiyerarsiyi tasir (KISIM > BOLUM > Madde > servis); parca tek
 * basina retrieval'dan cikip LLM'e gittiginde nereye ait oldugu metnin icinde
 * yaziyor olmali. Numarasi turetilmis maddeye ayrica gorunur bir not dusulur —
 * kesin olmayan bir madde numarasi hukuki atif olarak kullanilmamali.
 */
import { randomUUID } from "node:crypto";
import type { Chunk, RegulationChunkMetadata } from "@albay/shared";
import { estimateTokens } from "../tokens.ts";
import type { PageMap } from "../pagemap.ts";

export interface BuildChunkArgs {
  id?: string;
  docId: string;
  filename: string;
  pageMap: PageMap;
  kind: "child" | "parent";
  parentId: string | null;
  articleLabel: string;
  metadata: RegulationChunkMetadata;
  markerPath: string[];
  body: string;
}

export function buildChunk(args: BuildChunkArgs): Chunk {
  const { metadata: meta } = args;
  const hierarchy = [meta.kisim, meta.bolum, args.articleLabel, ...args.markerPath].filter(Boolean);
  const breadcrumb = `[Dosya: ${args.filename} > ${hierarchy.join(" > ")}]`;
  const heading = [args.articleLabel, ...args.markerPath].join("\n");
  const uyari = meta.maddeNoKesin
    ? ""
    : "\n(Not: bu maddenin numarasi kaynak metinden okunamadi, komsu madde numaralarindan turetildi.)";
  const text = `${breadcrumb}\n${heading}${uyari}\n\n${args.body}`;

  return {
    id: args.id ?? randomUUID(),
    docId: args.docId,
    kind: args.kind,
    text,
    page: args.pageMap.findPage(text),
    section: [args.articleLabel, meta.servis].filter(Boolean).join(" > "),
    parentId: args.parentId,
    tokenCount: estimateTokens(text),
    metadata: meta,
  };
}
