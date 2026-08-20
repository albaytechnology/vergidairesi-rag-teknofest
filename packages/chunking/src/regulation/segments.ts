/**
 * Madde govdesinin servis sinirlarinda parcalanmasi.
 *
 * Servis dokumu iceren maddeler (10, 11, 12) 3000 token'i bulan bloklardir;
 * butun halde birakilirsa "tecil hangi servisin gorevi" sorusu maddenin
 * tamamina duser ve retrieval isabet edemez. Bu yuzden hiyerarsi:
 *
 *   (A/B/C hizmet birimi) > (I/II/III alt bolum) > (1/2/3 servis)
 *
 * Masa seviyesi (Beyanname Kabul Masasi vb.) AYRI parca yapilmaz — gorev
 * dagilimi "Islem Yonergesi"nde oldugu icin bu seviyede iddia uretilmemeli.
 */

export interface Segment {
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
 * Bos kalan hizmet birimi / alt bolum isaretleri atlanir — bunlar zaten alttaki
 * parcalarin markerPath'inde tasinir. Ama bir SERVIS isareti govdesiz kalsa bile
 * kendi parcasi olarak uretilir: Madde 10 gibi salt sayim maddelerinde servis adi
 * ve altindaki masa listesi tek bilgi kaynagidir. "Motorlu Tasitlar Vergisi Masasi"nin
 * hangi servise bagli oldugu yalnizca orada yaziyor; bu esleme buyuk bir madde
 * blogunun icinde gomulu kalirsa retrieval onu bulamiyor.
 */
export function splitIntoSegments(body: string[]): Segment[] {
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
