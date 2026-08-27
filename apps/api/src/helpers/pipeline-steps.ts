/**
 * Yukleme hattinin ADIMLARI — arayuzdeki ilerleme cubugu bunlardan doluyor.
 *
 * Hat tek bir "isleniyor" durumu olarak gosteriliyordu ve calisan, dakikalarca
 * suren bir islemin neresinde oldugunu goremiyordu. Adimlarin her biri veri
 * tabaninda IZ BIRAKIYOR (status, chunk sayisi, analyzed_at, routing_status,
 * gaps_scanned_at, embedded_at); durum bu izlerden okunur — worker'in ayrica
 * ilerleme bildirmesine gerek yok, yeniden baslatilsa ya da hat disaridan
 * (CLI) surulse bile ekran ayni yeri gosterir.
 *
 * Sira, hattin gercek sirasidir (bkz. ingestion-worker/helpers/pipeline.ts):
 * parse → chunk → kunye → ozet → yonlendirme → eksik bilgi → indeksleme.
 *
 * Analiz TEK adim degil: kunye cikarma ile ozet yazma iki ayri LLM cagrisi
 * (bkz. llm/analysis/analyze.ts) ve ikisi birlikte hattin en uzun bolumu.
 * Tek bolmede gosterildiginde cubuk dakikalarca ayni yerde duruyordu.
 */
export type UploadStep =
  | "parse"
  | "chunk"
  | "kunye"
  | "ozet"
  | "yonlendirme"
  | "eksik"
  | "indeks";

/** "atlandi": bu belge turunde adim hic calismaz — cubukta yer kaplamaz. */
export type StepState = "bekliyor" | "calisiyor" | "bitti" | "atlandi" | "hata";

export interface UploadStepStatus {
  ad: UploadStep;
  durum: StepState;
}

export interface StatusRow {
  status: string;
  corpus: string | null;
  session_id: string | null;
  kunye_at: Date | string | null;
  analyzed_at: Date | string | null;
  routing_status: string | null;
  gaps_scanned_at: Date | string | null;
  chunk_toplam: string;
  child_toplam: string;
  child_bekleyen: string;
}

/** Embed BITTI olcutu: embed edilmemis child chunk kalmamasi (bkz. rota yorumu). */
export const embedBitti = (r: Pick<StatusRow, "child_toplam" | "child_bekleyen">): boolean =>
  Number(r.child_toplam) > 0 && Number(r.child_bekleyen) === 0;

const SIRA: UploadStep[] = [
  "parse",
  "chunk",
  "kunye",
  "ozet",
  "yonlendirme",
  "eksik",
  "indeks",
];

/** Yalnizca resmi evrakta calisan adimlar (bkz. hatAdimlari). */
const EVRAK_ADIMLARI: UploadStep[] = ["kunye", "ozet", "yonlendirme", "eksik"];

/**
 * Kayit henuz yokken: dosya diskte, parse kuyrugunda bekliyor. Adim listesi
 * yine de doner — cubuk ilk kareden itibaren tam boyunda dursun, kayit
 * dusunce aniden uzamasin.
 */
export function kuyruktakiAdimlar(): UploadStepStatus[] {
  return SIRA.map((ad) => ({
    ad,
    durum: ad === "parse" ? "calisiyor" : "bekliyor",
  }));
}

export function hatAdimlari(r: StatusRow): UploadStepStatus[] {
  /*
   * Kunye, ozet, yonlendirme ve eksik bilgi taramasi yalnizca EVRAK korpusunda ve
   * yalnizca resmi evrak icin calisir: sohbete eklenen dosya bir basvuru degil
   * referans belgesidir, yonetmelik metninde de "eksik bilgi" karsiligi yok
   * (bkz. pipeline.ts). Bu adimlar o belgelerde sonsuza kadar "bekliyor"
   * gorunmemeli — hic yer almamalilar.
   */
  const analizVar = r.corpus !== "regulations" && r.session_id === null;

  const tamam: Record<UploadStep, boolean> = {
    // 'parsing' disindaki her ileri durum parse'in bittigini soyler.
    parse: r.status === "parsed" || Boolean(r.analyzed_at) || Number(r.chunk_toplam) > 0,
    chunk: Number(r.chunk_toplam) > 0,
    kunye: Boolean(r.kunye_at),
    // Ozet analizin son parcasi: analyzed_at onunla birlikte yaziliyor.
    ozet: Boolean(r.analyzed_at),
    yonlendirme: r.routing_status !== null && r.routing_status !== "pending",
    eksik: Boolean(r.gaps_scanned_at),
    indeks: embedBitti(r),
  };

  const adimlar: UploadStepStatus[] = [];
  let calisanBulundu = false;
  for (const ad of SIRA) {
    if (!analizVar && EVRAK_ADIMLARI.includes(ad)) {
      adimlar.push({ ad, durum: "atlandi" });
      continue;
    }
    if (tamam[ad] && !calisanBulundu) {
      adimlar.push({ ad, durum: "bitti" });
      continue;
    }
    // Hat siralidir: tamamlanmayan ILK adim calisan adimdir, sonrasi bekler.
    if (!calisanBulundu) {
      calisanBulundu = true;
      adimlar.push({ ad, durum: r.status === "failed" ? "hata" : "calisiyor" });
      continue;
    }
    adimlar.push({ ad, durum: "bekliyor" });
  }
  return adimlar;
}
