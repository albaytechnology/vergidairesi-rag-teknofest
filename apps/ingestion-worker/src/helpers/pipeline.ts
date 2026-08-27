/**
 * Tek bir dokumani bastan sona isleyen hat: chunk → kunye → ozet → yonlendirme → embed.
 *
 * CLI'lar (pnpm chunk / classify / embed) toplu is icin duruyor; bu modul ise
 * "bir evrak yuklendi, servis havuzuna dussun" akisi icin belge belge calisir.
 * Ikisi ayni paket fonksiyonlarini cagirir, mantik tekrarlanmaz.
 */
import { readFile } from "node:fs/promises";
import { chunkDocument, chunkRegulationDocument } from "@albay/chunking";
import {
  OllamaClient,
  analyzeDocumentGaps,
  extractDocumentKunye,
  summarizeDocument,
} from "@albay/llm";
import { routeDocument } from "@albay/agents";
import { config, type Corpus, type DocumentAnalysis } from "@albay/shared";
import {
  pool,
  replaceChunks,
  chunksToEmbedForDoc,
  markEmbedded,
  saveDocumentKunye,
  saveDocumentSummary,
  saveDocumentGaps,
  saveRoutingDecision,
  setDocumentCorpus,
} from "@albay/ingestion";
import {
  encodeSparse,
  ensureCollection,
  upsertChunkPointsToCollection,
  deleteByDocId,
  type ChunkPoint,
} from "@albay/retrieval";

const ollama = new OllamaClient();
const EMBED_BATCH = 16;

export interface PipelineOptions {
  corpus?: Corpus;
  /** Yonetmelik korpusunda analiz/yonlendirme adimlari calistirilmaz. */
  skipAnalysis?: boolean;
}

export interface PipelineResult {
  docId: string;
  filename: string;
  chunkCount: number;
  analysis: DocumentAnalysis | null;
  routedService: string | null;
  routingStatus: "routed" | "belirlenemedi" | "atlandi";
  trace: string[];
}

interface DocRow {
  id: string;
  filename: string;
  parsed_md_path: string;
  docling_json_path: string | null;
  session_id: string | null;
}

export async function processDocument(
  docId: string,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const corpus: Corpus = opts.corpus ?? "documents";
  const res = await pool.query<DocRow>(
    "SELECT id, filename, parsed_md_path, docling_json_path, session_id FROM documents WHERE id = $1",
    [docId],
  );
  const doc = res.rows[0];
  if (!doc) throw new Error(`Dokuman bulunamadi: ${docId}`);
  if (!doc.parsed_md_path) throw new Error(`Dokuman henuz parse edilmemis: ${doc.filename}`);

  // Sohbet eki HICBIR giristen yonlendirilmez. Bayragi cagirana birakmak
  // kirilgandi: `pnpm pipeline -- --force` gibi toplu bir yeniden isleme,
  // ekleri tekrar servis havuzuna sokardi. Karar belgenin kendisinden okunur.
  const oturumEki = doc.session_id !== null;

  const trace: string[] = [];
  await setDocumentCorpus(doc.id, corpus);

  const collection =
    corpus === "regulations" ? config.QDRANT_REGULATIONS_COLLECTION : config.QDRANT_COLLECTION;

  // Yeniden chunk'lama yeni UUID'ler uretir; eski vektorler silinmezse Qdrant'ta
  // oksuz kalir ve aramada gorunmeye devam eder. Postgres ile senkronu burada kur.
  await deleteByDocId(doc.id, collection);

  // 1. Chunk
  const markdown = await readFile(doc.parsed_md_path, "utf-8");
  let doclingJson: unknown;
  if (doc.docling_json_path) {
    doclingJson = JSON.parse(await readFile(doc.docling_json_path, "utf-8"));
  }
  const chunks =
    corpus === "regulations"
      ? chunkRegulationDocument({
          docId: doc.id,
          filename: doc.filename,
          markdown,
          doclingJson,
        })
      : chunkDocument({ docId: doc.id, filename: doc.filename, markdown, doclingJson });
  await replaceChunks(doc.id, chunks);
  trace.push(`chunk → ${chunks.filter((c) => c.kind === "child").length} child`);

  // 2-4. Analiz (kunye + ozet) + yonlendirme (yalnizca evrak korpusunda)
  let analysis: DocumentAnalysis | null = null;
  let routedService: string | null = null;
  let routingStatus: PipelineResult["routingStatus"] = "atlandi";

  if (corpus === "documents" && !opts.skipAnalysis && !oturumEki) {
    /*
     * Analiz iki adim: once kunye (belge turu, talep edilen islem, entity'ler),
     * sonra ozet. Ayrilmasinin nedeni llm/analysis/analyze.ts'te; buradaki
     * sonucu, her adimin BITER BITMEZ kaydedilmesi — yukleme ekranindaki
     * cubuk iki bolmeyi de gercek zamaninda doldurabilsin.
     */
    const kunye = await extractDocumentKunye(ollama, { filename: doc.filename, text: markdown });
    await saveDocumentKunye(doc.id, kunye);
    trace.push(`kunye → ${kunye.docType} / ${kunye.islemTuru}`);

    const ozet = await summarizeDocument(ollama, { filename: doc.filename, text: markdown }, kunye);
    await saveDocumentSummary(doc.id, ozet);
    trace.push(`ozet → ${ozet.konu}`);

    analysis = { ...ozet, ...kunye };

    const routing = await routeDocument({
      metin: routingMetni(analysis),
      aramaSorgusu: routingSorgusu(analysis),
    });
    await saveRoutingDecision(doc.id, routing.decision, routingKey(analysis));
    trace.push(...routing.trace);
    routedService = routing.decision.belirlenemedi ? null : routing.decision.servis;
    routingStatus = routing.decision.belirlenemedi ? "belirlenemedi" : "routed";

    /*
     * Eksik bilgi taramasi hattin bir adimi.
     *
     * Istek uzerine calistirilabilirdi ama sonuc hicbir yerde durmuyordu:
     * panel her acilista yeniden sormak zorunda kaliyor, sohbet ise bulgulari
     * hic goremiyordu. Evrak zaten hatta bir kez okunuyor — tarama da burada
     * yapilip kaydediliyor, panel ve sohbet ayni listeye bakiyor.
     *
     * Yonlendirmeden SONRA ve ayri bir cagri: bulgular yonlendirme kararinin
     * girdisi degil. Eksik bir bilginin evrakin hangi servise gidecegini
     * degistirmemesi gerekir — eksik olsa da o servisin isidir.
     */
    const gaps = await analyzeDocumentGaps(ollama, { filename: doc.filename, text: markdown });
    await saveDocumentGaps(doc.id, gaps.bulgular);
    trace.push(`eksik bilgi taramasi → ${gaps.bulgular.length} bulgu`);
  }

  // 4. Embed
  const embedded = await embedDocumentChunks(doc.id, collection);
  trace.push(`embed → ${embedded} chunk → ${collection}`);

  return {
    docId: doc.id,
    filename: doc.filename,
    chunkCount: chunks.length,
    analysis,
    routedService,
    routingStatus,
    trace,
  };
}

/**
 * Yonlendirmeye giden metin — KANONIK.
 *
 * Onceden serbest metinli `konu` cumlesi kullaniliyordu ve ayni turdeki iki evrak
 * farkli servislere gidebiliyordu: bir dilekcenin konusu "10 AHS 48 plakali tasit
 * nedeniyle ... 18.247 TL tutarindaki idari para cezasinin taksitle odenmesi",
 * digerininki sadece "trafik idari para cezasinin tecil ve taksitlendirilmesi"
 * seklinde ciktigi icin retrieval bambaska parcalar getiriyordu.
 *
 * Bu yuzden yonlendirme girdisi yalnizca DUSUK KARDINALITELI alanlardan kurulur:
 * islem turu + alacak turu + belge turu. Plaka, tutar, tarih, seri no gibi arizi
 * bilgiler yonlendirme sinyali TASIMAZ, yalnizca gurultu ekler — disarida birakilir.
 * Ozet, LLM'in talebi anlamasi icin kalir ama sorguya girmez.
 */
function routingMetni(a: DocumentAnalysis): string {
  return [
    `Belge turu: ${a.docType}`,
    `Talep edilen islem: ${islemTuruMetni(a.islemTuru)}`,
    a.alacakTuru ? `Alacak/vergi turu: ${a.alacakTuru}` : "",
    `Ozet: ${a.ozet}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Retrieval sorgusu: yalnizca islem + alacak turu. Ayni tur evrak -> ayni sorgu. */
function routingSorgusu(a: DocumentAnalysis): string {
  return [islemTuruMetni(a.islemTuru), a.alacakTuru].filter(Boolean).join(" ");
}

/** Enum degerini yonetmelik diline cevirir — retrieval bu kelimelerle esliyor. */
function islemTuruMetni(islemTuru: DocumentAnalysis["islemTuru"]): string {
  const karsiliklar: Record<DocumentAnalysis["islemTuru"], string> = {
    tecil_taksitlendirme: "tecil ve taksitlendirme talebi",
    beyanname_verme: "beyanname verme ve tahakkuk islemi",
    uzlasma_talebi: "uzlasma talebi",
    dava_itiraz: "dava, itiraz ve temyiz islemi",
    odeme_iade_duzeltme: "odeme, iade, terkin ve duzeltme islemi",
    sicil_mukellefiyet: "mukellefiyet sicil ve yoklama islemi",
    haciz_satis: "haciz ve satis islemi",
    bilgi_belge_talebi: "bilgi ve belge talebi",
    diger: "diger islem",
  };
  return karsiliklar[islemTuru];
}

/**
 * Tutarlilik anahtari: ayni anahtara sahip evraklar ayni servise gitmelidir.
 * Yonlendirme girdisi yalnizca bu bilesenlerden turedigi ve sicaklik 0 oldugu
 * icin bu, insa geregi saglanir; `pnpm routing:audit` bunu dogrular.
 */
export function routingKey(a: DocumentAnalysis): string {
  const alacak = a.alacakTuru
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return [a.docType, a.islemTuru, alacak].join("|");
}

async function embedDocumentChunks(docId: string, collection: string): Promise<number> {
  let batch = await chunksToEmbedForDoc(docId, EMBED_BATCH);
  if (!batch.length) return 0;

  const probe = await ollama.embed([batch[0]!.text]);
  await ensureCollection(probe[0]!.length, collection);

  let total = 0;
  while (batch.length) {
    const vectors = await ollama.embed(batch.map((c) => c.text));
    const points: ChunkPoint[] = batch.map((c, i) => ({
      id: c.id,
      dense: vectors[i]!,
      sparse: encodeSparse(c.text),
      payload: {
        doc_id: c.doc_id,
        filename: c.filename,
        path: c.path,
        corpus: c.corpus,
        doc_type: c.doc_type,
        contains_pii: c.contains_pii,
        entities: Array.isArray(c.entities) ? c.entities : [],
        section: c.section,
        page: c.page,
        parent_id: c.parent_id,
        metadata: c.metadata ?? {},
        madde_no: String(c.metadata?.maddeNo ?? ""),
        madde_baslik: String(c.metadata?.baslik ?? ""),
        text: c.text,
      },
    }));
    await upsertChunkPointsToCollection(collection, points);
    await markEmbedded(batch.map((c) => c.id));
    total += batch.length;
    batch = await chunksToEmbedForDoc(docId, EMBED_BATCH);
  }
  return total;
}
