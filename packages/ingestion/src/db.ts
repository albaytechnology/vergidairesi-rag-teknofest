import pg from "pg";
import { randomUUID } from "node:crypto";
import {
  config,
  IslemTuruSchema,
  type Corpus,
  type DocumentAnalysis,
  type ExtractedEntities,
  type ServiceRoutingDecision,
} from "@albay/shared";

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export type DocStatus = "pending" | "parsing" | "parsed" | "failed";

export interface DocumentRow {
  id: string;
  path: string;
  filename: string;
  format: string;
  size_bytes: string;
  hash: string;
  status: DocStatus;
  parsed_md_path: string | null;
  docling_json_path: string | null;
  error: string | null;
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      format TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      parsed_md_path TEXT,
      docling_json_path TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
    CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents (hash);

    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY,
      doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'child',
      text TEXT NOT NULL,
      page INT,
      section TEXT,
      parent_id UUID,
      token_count INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks (doc_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks (kind);

    -- Faz 3: siniflandirma + embedding takibi
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS corpus TEXT NOT NULL DEFAULT 'documents';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_confidence REAL;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS idx_documents_corpus ON documents (corpus);

    -- Faz 5b: evrak analizi (classify'dan daha ayrintili, vergi dairesi evragina ozel)
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_subject TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_summary_long TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_entities JSONB;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
    -- Faz 5c: yonlendirmenin ve cevap yazisinin girdisi olan alanlar. routing_key
    -- bunlardan turedigi halde bilesenleri saklanmiyordu; yeniden yonlendirme ve
    -- yazi uretimi analizi bastan calistirmadan yapilabilsin diye kalici hale geldi.
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS islem_turu TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS alacak_turu TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_title_suggestion TEXT;

    -- Faz 5b: servis yonlendirme sonucu (ingest aninda hesaplanir, havuz bundan cikar)
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_birim TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_service TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_confidence REAL;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_reasoning TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_regulation_refs JSONB;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;
    -- Ayni tur evrakin ayni servise gitmesini denetlemek icin (pnpm routing:audit)
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS routing_key TEXT;

    -- Faz 5e: evrakin YASAM DONGUSU (Yazisma ve Arsiv Servisi takibi).
    --
    -- Neden ayri bir sutun: documents.status ZATEN VAR ve parse hattinin
    -- durumunu tutuyor (pending/parsing/parsed/failed). Ayni ada yeni bir
    -- anlam yuklemek worker'i bozardi; is akisi durumu bagimsiz izlenir.
    --   new         → yuklendi, henuz siniflandirilmadi
    --   routed      → servise yonlendirildi
    --   in_progress → calisan belgeyi acti
    --   completed   → cevap yazisi PDF olarak disari alindi
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'new';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    -- Hangi kararla cevaplandigi. response_letters'a yalnizca "kaydet" denince
    -- yazildigi icin, PDF'i kaydetmeden indiren kullanicida orasi bos kalir;
    -- arsiv kartinda karar gorunsun diye tamamlama aninda buraya da yazilir.
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS completed_decision TEXT;
    CREATE INDEX IF NOT EXISTS idx_documents_lifecycle ON documents (lifecycle_status);
    -- Sutun eklenmeden once yonlendirilmis belgeler 'new' gorunmesin.
    UPDATE documents SET lifecycle_status = 'routed'
     WHERE lifecycle_status = 'new' AND routing_status <> 'pending';
    CREATE INDEX IF NOT EXISTS idx_documents_routed_service ON documents (routed_service);
    CREATE INDEX IF NOT EXISTS idx_documents_routing_status ON documents (routing_status);

    -- Faz 5b: belge bazli chat gecmisi (multi-turn hafiza)
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- created_at tek basina siralama icin yeterli degil: ayni istekte yazilan
    -- soru/cevap ciftinin zaman damgasi cakisabiliyor. seq kesin sira verir.
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS seq BIGSERIAL;
    CREATE INDEX IF NOT EXISTS idx_chat_messages_doc
      ON chat_messages (document_id, seq);

    -- Faz 5b: uretilen cevap yazilari (son hali insan tarafindan duzenlenmis olabilir)
    CREATE TABLE IF NOT EXISTS response_letters (
      id UUID PRIMARY KEY,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,
      decision_reason TEXT,
      mukellef_vkn TEXT,
      letter_model JSONB NOT NULL,
      letter_html TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_response_letters_doc ON response_letters (document_id);

    -- Faz 5c: yazinin "Sayi" alanindaki giden evrak sira numarasi.
    -- Numara ancak yazi KAYDEDILIRKEN alinir; her onizleme icin numara
    -- tuketilirse giden evrak defterinde bosluklar olusur.
    ALTER TABLE response_letters ADD COLUMN IF NOT EXISTS letter_no BIGINT;
    ALTER TABLE response_letters ADD COLUMN IF NOT EXISTS sayi TEXT;
    CREATE SEQUENCE IF NOT EXISTS response_letter_no_seq START 1;

    -- Faz 5e: sohbete aticlanan belge, KALICI olarak evraktan ayrilir.
    --
    -- Once bu ayrim session_uploads tablosundaki TTL'li kayittan turetiliyordu;
    -- 12 saat dolunca chat ekleri servis havuzlarina ve arsive geri dusuyordu.
    -- "Bu bir referans belgesi, resmi evrak degil" kalici bir olgudur, gecici
    -- bir kayit uzerinden ifade edilemez.
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_documents_session ON documents (session_id);
    -- Sutun eklenmeden once yuklenmis chat eklerini geriye donuk isaretle ve
    -- yanlislikla aldiklari servis yonlendirmesini temizle.
    UPDATE documents d SET session_id = s.session_id
      FROM session_uploads s
     WHERE s.document_id = d.id AND d.session_id IS NULL;
    UPDATE documents
       SET routed_service = NULL, routed_birim = NULL, routing_confidence = NULL,
           routing_reasoning = NULL, routing_regulation_refs = NULL,
           routing_status = 'pending', routing_key = NULL, lifecycle_status = 'new'
     WHERE session_id IS NOT NULL AND routing_status <> 'pending';

    -- Faz 5b: chat oturumuna ozel gecici dokumanlar (ana koleksiyona karismaz)
    CREATE TABLE IF NOT EXISTS session_uploads (
      session_id TEXT NOT NULL,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, document_id)
    );
    CREATE INDEX IF NOT EXISTS idx_session_uploads_expiry ON session_uploads (expires_at);
  `);
}

/** Dosyayi path'e gore upsert eder. Ayni hash zaten 'parsed' ise tekrar islemeye gerek yok. */
export async function upsertDocument(doc: {
  id: string;
  path: string;
  filename: string;
  format: string;
  sizeBytes: number;
  hash: string;
}): Promise<{ row: DocumentRow; alreadyParsed: boolean }> {
  const existing = await pool.query<DocumentRow>(
    "SELECT * FROM documents WHERE path = $1",
    [doc.path],
  );
  const prev = existing.rows[0];
  if (prev && prev.hash === doc.hash && prev.status === "parsed") {
    return { row: prev, alreadyParsed: true };
  }
  const res = await pool.query<DocumentRow>(
    `INSERT INTO documents (id, path, filename, format, size_bytes, hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT (path) DO UPDATE SET
       hash = EXCLUDED.hash,
       size_bytes = EXCLUDED.size_bytes,
       status = 'pending',
       error = NULL,
       updated_at = now()
     RETURNING *`,
    [doc.id, doc.path, doc.filename, doc.format, doc.sizeBytes, doc.hash],
  );
  const row = res.rows[0];
  if (!row) throw new Error("upsert basarisiz");
  return { row, alreadyParsed: false };
}

export async function setStatus(
  id: string,
  status: DocStatus,
  fields: Partial<{
    parsedMdPath: string;
    doclingJsonPath: string;
    error: string;
  }> = {},
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       status = $2,
       parsed_md_path = COALESCE($3, parsed_md_path),
       docling_json_path = COALESCE($4, docling_json_path),
       error = $5,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      status,
      fields.parsedMdPath ?? null,
      fields.doclingJsonPath ?? null,
      fields.error ?? null,
    ],
  );
}

export async function setDocumentCorpus(id: string, corpus: Corpus): Promise<void> {
  await pool.query("UPDATE documents SET corpus = $2, updated_at = now() WHERE id = $1", [
    id,
    corpus,
  ]);
}

export interface ChunkInsert {
  id: string;
  docId: string;
  kind: "child" | "parent";
  text: string;
  page: number | null;
  section: string | null;
  parentId: string | null;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export async function replaceChunks(
  docId: string,
  chunks: ChunkInsert[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE doc_id = $1", [docId]);
    for (const c of chunks) {
      await client.query(
        `INSERT INTO chunks (id, doc_id, kind, text, page, section, parent_id, token_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          c.id,
          c.docId,
          c.kind,
          c.text,
          c.page,
          c.section,
          c.parentId,
          c.tokenCount,
          JSON.stringify(c.metadata ?? {}),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function chunkCounts(): Promise<{
  docs: number;
  children: number;
  parents: number;
  avgTokens: number;
}> {
  const res = await pool.query<{
    docs: string;
    children: string;
    parents: string;
    avg_tokens: string;
  }>(`
    SELECT
      COUNT(DISTINCT doc_id) docs,
      COUNT(*) FILTER (WHERE kind = 'child') children,
      COUNT(*) FILTER (WHERE kind = 'parent') parents,
      COALESCE(AVG(token_count) FILTER (WHERE kind = 'child'), 0) avg_tokens
    FROM chunks
  `);
  const r = res.rows[0]!;
  return {
    docs: Number(r.docs),
    children: Number(r.children),
    parents: Number(r.parents),
    avgTokens: Math.round(Number(r.avg_tokens)),
  };
}

// ─── Faz 3: siniflandirma ─────────────────────────────────────────────

export interface DocToClassify {
  id: string;
  filename: string;
  sample_text: string;
}

/** Siniflandirilmamis (veya force ile hepsi) parsed dokumanlari, ilk 3 child chunk'iyla dondurur. */
export async function docsToClassify(force = false): Promise<DocToClassify[]> {
  const res = await pool.query<DocToClassify>(
    `SELECT d.id, d.filename,
            COALESCE(string_agg(sub.text, E'\\n\\n'), '') AS sample_text
     FROM documents d
     LEFT JOIN LATERAL (
       SELECT c.text FROM chunks c
       WHERE c.doc_id = d.id AND c.kind = 'child'
       ORDER BY c.created_at LIMIT 3
     ) sub ON true
     WHERE d.status = 'parsed' AND d.corpus = 'documents' ${force ? "" : "AND d.classified_at IS NULL"}
     GROUP BY d.id`,
  );
  return res.rows;
}

export async function saveClassification(
  docId: string,
  c: {
    docType: string;
    entities: string[];
    summary: string;
    containsPII: boolean;
    confidence: number;
  },
  reviewThreshold = 0.6,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       doc_type = $2, entities = $3, summary = $4, contains_pii = $5,
       classification_confidence = $6, needs_review = $7,
       classified_at = now(), updated_at = now()
     WHERE id = $1`,
    [
      docId,
      c.docType,
      JSON.stringify(c.entities),
      c.summary,
      c.containsPII,
      c.confidence,
      c.confidence < reviewThreshold,
    ],
  );
}

// ─── Faz 3: embedding ─────────────────────────────────────────────────

export interface ChunkToEmbed {
  id: string;
  doc_id: string;
  text: string;
  page: number | null;
  section: string | null;
  parent_id: string | null;
  filename: string;
  path: string;
  corpus: Corpus;
  doc_type: string | null;
  contains_pii: boolean | null;
  entities: string[];
  metadata: Record<string, unknown>;
}

export async function chunksToEmbed(limit = 64, corpus: Corpus = "documents"): Promise<ChunkToEmbed[]> {
  const res = await pool.query<ChunkToEmbed>(
    `SELECT c.id, c.doc_id, c.text, c.page, c.section, c.parent_id,
            d.filename, d.path, d.corpus, d.doc_type, d.contains_pii,
            COALESCE(d.entities, '[]') AS entities,
            COALESCE(c.metadata, '{}') AS metadata
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE c.kind = 'child' AND c.embedded_at IS NULL AND d.corpus = $2
     ORDER BY c.doc_id
     LIMIT $1`,
    [limit, corpus],
  );
  return res.rows;
}

/** Tek bir dokumanin embed bekleyen chunk'lari — pipeline belge belge ilerler. */
export async function chunksToEmbedForDoc(docId: string, limit = 64): Promise<ChunkToEmbed[]> {
  const res = await pool.query<ChunkToEmbed>(
    `SELECT c.id, c.doc_id, c.text, c.page, c.section, c.parent_id,
            d.filename, d.path, d.corpus, d.doc_type, d.contains_pii,
            COALESCE(d.entities, '[]') AS entities,
            COALESCE(c.metadata, '{}') AS metadata
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE c.kind = 'child' AND c.embedded_at IS NULL AND c.doc_id = $1
     ORDER BY c.created_at
     LIMIT $2`,
    [docId, limit],
  );
  return res.rows;
}

export async function markEmbedded(chunkIds: string[]): Promise<void> {
  if (!chunkIds.length) return;
  await pool.query(
    "UPDATE chunks SET embedded_at = now() WHERE id = ANY($1::uuid[])",
    [chunkIds],
  );
}

export async function resetEmbeddings(corpus: Corpus = "documents"): Promise<void> {
  await pool.query(
    `UPDATE chunks c SET embedded_at = NULL
     FROM documents d
     WHERE c.doc_id = d.id AND d.corpus = $1`,
    [corpus],
  );
}

export async function statusCounts(): Promise<Record<string, number>> {
  const res = await pool.query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) count FROM documents GROUP BY status",
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.count)]));
}

// ─── Faz 5b: evrak analizi + servis yonlendirme ───────────────────────

export async function saveDocumentAnalysis(
  docId: string,
  a: DocumentAnalysis,
  reviewThreshold = 0.6,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       doc_subject = $2, doc_summary_long = $3, extracted_entities = $4,
       doc_type = $5, summary = $6, contains_pii = $7,
       classification_confidence = $8, needs_review = $9,
       islem_turu = $10, alacak_turu = $11, doc_title_suggestion = $12,
       analyzed_at = now(), classified_at = now(), updated_at = now()
     WHERE id = $1`,
    [
      docId,
      a.konu,
      a.ozet,
      JSON.stringify(a.entities),
      a.docType,
      a.ozet.slice(0, 500),
      a.containsPII,
      a.confidence,
      a.confidence < reviewThreshold,
      a.islemTuru,
      a.alacakTuru,
      a.baslikOnerisi,
    ],
  );
}

export async function saveRoutingDecision(
  docId: string,
  d: ServiceRoutingDecision,
  routingKey?: string,
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       routed_birim = $2, routed_service = $3, routing_confidence = $4,
       routing_reasoning = $5, routing_regulation_refs = $6, routing_status = $7,
       routing_key = COALESCE($8, routing_key),
       routed_at = now(), updated_at = now(),
       -- Yasam dongusu yalnizca ILERI gider: uzerinde calisilmis ya da
       -- cevaplanmis bir evrak yeniden yonlendirilirse 'routed'a dusmemeli.
       lifecycle_status = CASE WHEN lifecycle_status = 'new' THEN 'routed'
                               ELSE lifecycle_status END
     WHERE id = $1`,
    [
      docId,
      d.anaBirim ?? d.digerBirim,
      d.belirlenemedi ? null : d.servis,
      d.guvenSkoru,
      d.gerekce,
      JSON.stringify(d.ilgiliMaddeler),
      d.belirlenemedi ? "belirlenemedi" : "routed",
      routingKey ?? null,
    ],
  );
}

export interface RoutingConsistencyRow {
  routing_key: string;
  servisler: string[];
  belgeler: { filename: string; servis: string | null }[];
}

/**
 * Ayni routing_key'e sahip olup FARKLI servise yonlendirilmis evraklar.
 * Bos donmesi beklenir; dolu donuyorsa ayni tur evrak farkli islem goruyor demektir.
 */
export async function routingInconsistencies(): Promise<RoutingConsistencyRow[]> {
  const res = await pool.query<{
    routing_key: string;
    servisler: string[];
    belgeler: { filename: string; servis: string | null }[];
  }>(
    `SELECT routing_key,
            array_agg(DISTINCT COALESCE(routed_service, '(belirlenemedi)')) AS servisler,
            json_agg(json_build_object('filename', filename, 'servis', routed_service)) AS belgeler
     FROM documents
     WHERE corpus = 'documents' AND routing_key IS NOT NULL AND routing_status <> 'pending'
     GROUP BY routing_key
     HAVING COUNT(DISTINCT COALESCE(routed_service, '(belirlenemedi)')) > 1`,
  );
  return res.rows;
}

export interface ServiceQueueRow {
  servis: string | null;
  birim: string | null;
  /** Cevap yazisi HENUZ uretilmemis evrak — calisanin is yuku budur. */
  bekleyen: number;
  /** Cevaplanmis evrak; havuzda gorunur ama is olarak sayilmaz. */
  tamamlanan: number;
}

/**
 * Servis havuzlarinin doluluk ozeti. Servis adlari HARDCODE EDILMEZ —
 * yonlendirilmis dokumanlardan gelir; katalog icin regulationServices() kullanilir.
 */
/**
 * Servis havuzlarindan ve arsivden oturuma ozel ekleri eleyen kosul.
 *
 * Sohbete aticlanan belge (ek mevzuat, mukellefin gonderdigi ek) RESMI EVRAK
 * DEGILDIR: havuza dusmesi, sayaci artirmasi ya da cevap yazisi beklemesi
 * gereken bir basvuru degil, yalnizca o sohbetin baglami.
 *
 * Onceden bu ayrim session_uploads'taki TTL'li kayittan turetiliyordu ve 12 saat
 * dolunca chat ekleri havuzlara geri dusuyordu. Kalici bir olguyu gecici bir
 * kayitla ifade etmek hataydi; artik documents.session_id sutununa bakiyoruz.
 */
const OTURUM_EKI_DEGIL = "session_id IS NULL";

/**
 * Havuz sayaclari.
 *
 * Bekleyen ve tamamlanan AYRI sayilir: cevabi yazilmis evrak havuzda gorunmeye
 * devam eder ama is yuku degildir. Ikisi tek sayida toplandiginda kart
 * "bekleyen" diyip cevaplanmislari da sayiyordu — calisan neye oncelik
 * verecegini sayidan okuyamiyordu.
 */
export async function serviceQueueCounts(): Promise<ServiceQueueRow[]> {
  const res = await pool.query<{
    servis: string | null;
    birim: string | null;
    bekleyen: string;
    tamamlanan: string;
  }>(
    `SELECT routed_service AS servis, routed_birim AS birim,
            COUNT(*) FILTER (WHERE lifecycle_status <> 'completed') AS bekleyen,
            COUNT(*) FILTER (WHERE lifecycle_status =  'completed') AS tamamlanan
     FROM documents
     WHERE corpus = 'documents' AND routing_status <> 'pending'
       AND ${OTURUM_EKI_DEGIL}
     GROUP BY routed_service, routed_birim`,
  );
  return res.rows.map((r) => ({
    servis: r.servis,
    birim: r.birim,
    bekleyen: Number(r.bekleyen),
    tamamlanan: Number(r.tamamlanan),
  }));
}

/**
 * Yonetmelik korpusundan turetilen servis katalogu.
 * Taksonomi kodda tanimli degil — yonetmelik chunk metadata'sindan okunur.
 */
export async function regulationServices(): Promise<
  { servis: string; hizmetBirimi: string | null; altBolum: string | null; maddeNo: string }[]
> {
  const res = await pool.query<{
    servis: string;
    hizmet_birimi: string | null;
    alt_bolum: string | null;
    madde_no: string;
  }>(
    `SELECT DISTINCT ON (c.metadata->>'servis')
            c.metadata->>'servis'       AS servis,
            c.metadata->>'hizmetBirimi' AS hizmet_birimi,
            c.metadata->>'altBolum'     AS alt_bolum,
            c.metadata->>'maddeNo'      AS madde_no
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE d.corpus = 'regulations'
       AND c.kind = 'child'
       AND c.metadata->>'servis' IS NOT NULL
     ORDER BY c.metadata->>'servis', c.metadata->>'maddeNo'`,
  );
  return res.rows.map((r) => ({
    servis: r.servis,
    hizmetBirimi: r.hizmet_birimi,
    altBolum: r.alt_bolum,
    maddeNo: r.madde_no,
  }));
}

export interface DocumentDetail extends DocumentRow {
  corpus: Corpus;
  doc_subject: string | null;
  doc_summary_long: string | null;
  doc_title_suggestion: string | null;
  islem_turu: string | null;
  alacak_turu: string | null;
  analyzed_at: string | null;
  classification_confidence: number | null;
  extracted_entities: ExtractedEntities | null;
  doc_type: string | null;
  contains_pii: boolean | null;
  routed_birim: string | null;
  routed_service: string | null;
  routing_confidence: number | null;
  routing_reasoning: string | null;
  routing_regulation_refs: { maddeNo: string; baslik: string }[] | null;
  routing_status: string;
  lifecycle_status: LifecycleStatus;
  completed_at: string | null;
  created_at: string;
}

/**
 * Kayitli analizi DocumentAnalysis'e geri cevirir.
 *
 * Analizi YENIDEN CALISTIRMIYORUZ: cevap yazisi ve yeniden yonlendirme,
 * evrakin havuza duserken uretilmis analiziyle ayni verilere dayanmali.
 * Yeniden calistirmak, yazinin yonlendirme kararindan baska bir okumaya
 * dayanmasina yol acabilirdi.
 */
export function documentAnalysisFromRow(d: DocumentDetail): DocumentAnalysis {
  const islemTuru = IslemTuruSchema.safeParse(d.islem_turu);
  return {
    konu: d.doc_subject ?? d.filename,
    baslikOnerisi: d.doc_title_suggestion ?? d.doc_subject ?? d.filename,
    ozet: d.doc_summary_long ?? "",
    docType: (d.doc_type as DocumentAnalysis["docType"]) ?? "diger",
    islemTuru: islemTuru.success ? islemTuru.data : "diger",
    alacakTuru: d.alacak_turu ?? "",
    entities: d.extracted_entities ?? {
      vkn: null,
      tckn: null,
      tarihler: [],
      tutarlar: [],
      plakalar: [],
      donemler: [],
      kisiKurumlar: [],
    },
    containsPII: d.contains_pii ?? false,
    confidence: d.classification_confidence ?? 0,
  };
}

export async function getDocumentDetail(docId: string): Promise<DocumentDetail | null> {
  const res = await pool.query<DocumentDetail>("SELECT * FROM documents WHERE id = $1", [docId]);
  return res.rows[0] ?? null;
}

/** Servis havuzu listesi. servis=null verilirse henuz yonlendirilememisler doner. */
export async function listDocumentsByService(
  servis: string | null,
  limit = 100,
): Promise<DocumentDetail[]> {
  const res = await pool.query<DocumentDetail>(
    // Cevaplanmislar listenin SONUNA: calisanin gozu once is bekleyene gitsin.
    `SELECT * FROM documents
     WHERE corpus = 'documents'
       AND ${servis === null ? "routing_status = 'belirlenemedi'" : "routed_service = $2"}
       AND ${OTURUM_EKI_DEGIL}
     ORDER BY (lifecycle_status = 'completed'), created_at DESC
     LIMIT $1`,
    servis === null ? [limit] : [limit, servis],
  );
  return res.rows;
}

// ─── Faz 5e: Yazisma ve Arsiv Servisi — belge yasam dongusu ───────────

export type LifecycleStatus = "new" | "routed" | "in_progress" | "completed";

/** Durumlarin ileri siralamasi; geri dusmeyi engellemek icin. */
const YASAM_SIRASI: Record<LifecycleStatus, number> = {
  new: 0,
  routed: 1,
  in_progress: 2,
  completed: 3,
};

/**
 * Yasam dongusu durumunu ILERI yonde gunceller.
 *
 * Geri dusme bilerek engelli: calisan belgeyi ikinci kez actiginda ya da
 * cevaplanmis bir evraga geri dondugunde durum gerilerse, arsiv panelindeki
 * "cevap yazildi" bilgisi kaybolur ve is takibi yaniltici hale gelir.
 */
export async function setLifecycleStatus(
  docId: string,
  durum: LifecycleStatus,
  karar?: string,
): Promise<void> {
  const geriDusmeyecekler = (Object.keys(YASAM_SIRASI) as LifecycleStatus[]).filter(
    (d) => YASAM_SIRASI[d] >= YASAM_SIRASI[durum],
  );
  await pool.query(
    `UPDATE documents
        SET lifecycle_status = $2,
            completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
            completed_decision = CASE WHEN $2 = 'completed'
                                      THEN COALESCE($4, completed_decision)
                                      ELSE completed_decision END,
            updated_at = now()
      WHERE id = $1 AND lifecycle_status <> ALL($3::text[])`,
    [docId, durum, geriDusmeyecekler, karar ?? null],
  );
}

/**
 * Arsiv listesi: cevap yazisi yazilmis / yazilmamis tum evrak.
 *
 * Servis havuzlarindan farkli olarak SERVISE GORE filtrelemez — Yazisma ve
 * Arsiv Servisi kuruma giren her belgeyi bastan sona takip eder (M.11-B-I-6).
 * Oturuma ozel ekler burada da yok: onlar resmi evrak degil.
 */
export async function listArchiveDocuments(
  tamamlandi: boolean,
  limit = 200,
): Promise<(DocumentDetail & { son_karar: string | null })[]> {
  const res = await pool.query<DocumentDetail & { son_karar: string | null }>(
    `SELECT d.*,
            -- Tamamlanan evrakta hangi kararla cevaplandigi kartta gorunmeli.
            -- Once PDF disa alinirken yazilan deger, yoksa kaydedilmis yazidan:
            -- response_letters'a yalnizca "Kaydet" denince yazildigi icin tek
            -- basina ona bakmak, PDF'i kaydetmeden indiren kullanicida bos birakir.
            COALESCE(
              d.completed_decision,
              (SELECT r.decision FROM response_letters r
                WHERE r.document_id = d.id
                ORDER BY r.created_at DESC LIMIT 1)
            ) AS son_karar
       FROM documents d
      WHERE d.corpus = 'documents'
        AND d.lifecycle_status ${tamamlandi ? "=" : "<>"} 'completed'
        AND d.${OTURUM_EKI_DEGIL}
      ORDER BY ${tamamlandi ? "d.completed_at" : "d.created_at"} DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function archiveCounts(): Promise<{ bekleyen: number; tamamlanan: number }> {
  const res = await pool.query<{ tamamlanan: string; bekleyen: string }>(
    `SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'completed')  AS tamamlanan,
            COUNT(*) FILTER (WHERE lifecycle_status <> 'completed') AS bekleyen
       FROM documents
      WHERE corpus = 'documents' AND ${OTURUM_EKI_DEGIL}`,
  );
  const r = res.rows[0]!;
  return { bekleyen: Number(r.bekleyen), tamamlanan: Number(r.tamamlanan) };
}

// ─── Faz 5b: chat gecmisi ─────────────────────────────────────────────

export interface ChatMessageRow {
  id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  created_at: string;
}

export async function appendChatMessage(msg: {
  documentId: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (id, document_id, role, content, sources)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), msg.documentId, msg.role, msg.content, JSON.stringify(msg.sources ?? [])],
  );
}

/** Son N mesaj, kronolojik sirada (multi-turn hafiza icin). */
export async function getChatHistory(documentId: string, limit = 20): Promise<ChatMessageRow[]> {
  const res = await pool.query<ChatMessageRow>(
    `SELECT * FROM (
       SELECT * FROM chat_messages WHERE document_id = $1
       ORDER BY seq DESC LIMIT $2
     ) t ORDER BY seq ASC`,
    [documentId, limit],
  );
  return res.rows;
}

/**
 * Soru ve cevabi TEK islemde yazar.
 *
 * Ayri ayri yazilirsa istemci akis ortasinda baglantiyi kestiginde gecmiste
 * cevapsiz bir kullanici mesaji kalir; bir sonraki turda modele ust uste iki
 * "user" mesaji gider. Ya ikisi birden yazilir ya da hicbiri.
 */
export async function appendChatExchange(exchange: {
  documentId: string;
  question: string;
  answer: string;
  sources?: string[];
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO chat_messages (id, document_id, role, content, sources)
       VALUES ($1, $2, 'user', $3, '[]'::jsonb)`,
      [randomUUID(), exchange.documentId, exchange.question],
    );
    await client.query(
      `INSERT INTO chat_messages (id, document_id, role, content, sources)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        randomUUID(),
        exchange.documentId,
        exchange.answer,
        JSON.stringify(exchange.sources ?? []),
      ],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Faz 5b/5c: cevap yazilari ────────────────────────────────────────

/**
 * Giden evrak sira numarasi uretir.
 *
 * Sadece yazi kaydedilirken cagrilir. Onizleme her tuş vurusunda yeniden
 * uretilebildigi icin, onizlemede numara tuketilseydi defterde koca bosluklar
 * olusurdu; onizleme yer tutucu ("[SIRA NO]") gosterir.
 */
export async function nextLetterNo(): Promise<number> {
  const res = await pool.query<{ n: string }>(
    "SELECT nextval('response_letter_no_seq') AS n",
  );
  return Number(res.rows[0]!.n);
}

export async function saveResponseLetter(letter: {
  documentId: string;
  decision: string;
  decisionReason: string | null;
  mukellefVkn: string | null;
  letterNo: number | null;
  sayi: string | null;
  letterModel: unknown;
  letterHtml: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO response_letters
       (id, document_id, decision, decision_reason, mukellef_vkn,
        letter_no, sayi, letter_model, letter_html)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      letter.documentId,
      letter.decision,
      letter.decisionReason,
      letter.mukellefVkn,
      letter.letterNo,
      letter.sayi,
      JSON.stringify(letter.letterModel),
      letter.letterHtml,
    ],
  );
  return id;
}

export interface ResponseLetterRow {
  id: string;
  document_id: string;
  decision: string;
  decision_reason: string | null;
  mukellef_vkn: string | null;
  letter_no: string | null;
  sayi: string | null;
  letter_model: unknown;
  letter_html: string;
  created_at: string;
}

/** Bir evrak icin uretilmis yazilar, en yenisi basta. */
export async function listResponseLetters(docId: string): Promise<ResponseLetterRow[]> {
  const res = await pool.query<ResponseLetterRow>(
    "SELECT * FROM response_letters WHERE document_id = $1 ORDER BY created_at DESC",
    [docId],
  );
  return res.rows;
}

export async function getResponseLetter(id: string): Promise<ResponseLetterRow | null> {
  const res = await pool.query<ResponseLetterRow>(
    "SELECT * FROM response_letters WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ─── Faz 5b: oturuma ozel gecici dokumanlar ───────────────────────────

export async function registerSessionUpload(
  sessionId: string,
  documentId: string,
  ttlHours = 12,
): Promise<void> {
  await pool.query(
    `INSERT INTO session_uploads (session_id, document_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)
     ON CONFLICT (session_id, document_id) DO NOTHING`,
    [sessionId, documentId, String(ttlHours)],
  );
}

/**
 * Bir sohbetin ek belgeleri.
 *
 * Kaynak session_uploads degil documents.session_id: eki yukleyen worker onu
 * belgenin uzerine yaziyor, dolayisiyla /bind cagrilmasini beklemeye ve TTL'in
 * dolmasiyla ekin sessizce aranamaz hale gelmesine gerek yok.
 */
export async function sessionDocumentIds(sessionId: string): Promise<string[]> {
  const res = await pool.query<{ id: string }>(
    "SELECT id FROM documents WHERE session_id = $1",
    [sessionId],
  );
  return res.rows.map((r) => r.id);
}

/** Parse sirasinda: belgeyi bir sohbet ekine baglar (kalici isaret). */
export async function markSessionUpload(docId: string, sessionId: string): Promise<void> {
  await pool.query(
    "UPDATE documents SET session_id = $2, updated_at = now() WHERE id = $1",
    [docId, sessionId],
  );
}
