/**
 * Docling'in yapisal JSON ciktisindan chunk -> sayfa eslemesi (best-effort).
 * Docling JSON'unda metin ogeleri prov[].page_no ile gelir.
 */

interface DoclingTextItem {
  text?: string;
  prov?: { page_no?: number }[];
}

interface PageEntry {
  normalized: string;
  page: number;
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

export class PageMap {
  private entries: PageEntry[] = [];

  constructor(doclingJson: unknown) {
    try {
      const doc = doclingJson as { texts?: DoclingTextItem[] };
      for (const item of doc?.texts ?? []) {
        const page = item.prov?.[0]?.page_no;
        if (item.text && typeof page === "number") {
          this.entries.push({ normalized: normalize(item.text), page });
        }
      }
    } catch {
      // sayfa eslemesi opsiyonel — sessizce bos kalir
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /** Chunk metninin ilk anlamli parcasini icerige gore arar, sayfa dondurur. */
  findPage(chunkText: string): number | null {
    if (!this.entries.length) return null;
    // Breadcrumb satirini atla, icerigin ilk 80 karakterini al
    const content = chunkText.replace(/^\[.*?\]\n/, "");
    const probe = normalize(content).slice(0, 80);
    if (probe.length < 15) return null;
    for (const e of this.entries) {
      if (e.normalized.includes(probe) || probe.includes(e.normalized)) {
        return e.page;
      }
    }
    // Daha kisa bir on-ek ile ikinci deneme
    const shortProbe = probe.slice(0, 40);
    for (const e of this.entries) {
      if (e.normalized.includes(shortProbe)) return e.page;
    }
    return null;
  }
}
