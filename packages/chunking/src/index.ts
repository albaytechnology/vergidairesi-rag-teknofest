/**
 * Belge ve yonetmelik metinlerinin chunk'lanmasi.
 *
 *   document/    genel markdown belgeler — bolum/tablo/paragraf yapisina gore
 *   regulation/  yonetmelik metni — KISIM > BOLUM > Madde > servis hiyerarsisine gore
 *   tokens.ts    yaklasik token sayaci (iki chunker da kullanir)
 *   pagemap.ts   chunk → sayfa eslemesi (iki chunker da kullanir)
 *
 * Iki chunker ayri: yonetmelikte hiyerarsi markdown seviyesiyle DEGIL baslik
 * metniyle belli oluyor, bu yuzden genel chunker oraya uymuyor.
 */
export { chunkDocument } from "./document/chunker.ts";
export type { ChunkInput, ChunkOptions } from "./document/options.ts";
export { chunkRegulationDocument, type RegulationChunkInput } from "./regulation/chunker.ts";
export { parseMarkdownBlocks, type Block, type BlockType } from "./document/markdown.ts";
export { estimateTokens } from "./tokens.ts";
export { PageMap } from "./pagemap.ts";
