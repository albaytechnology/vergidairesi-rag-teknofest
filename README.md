# Albay RAG

Albay Teknoloji'nin şirket içi (on-premise, air-gapped) **multi-agent RAG** tabanlı kurumsal arama ve soru-cevap sistemi. RAGFlow'dan tamamen özel bir TypeScript mimarisine geçiş projesi.

Kullanıcılar doğal dille soru sorar; sistem üç senaryoyu destekler:

1. **Varlık/kişi sorgusu** — "Altay Şimşek hakkında bilgi getir" → dokümanlardan toparlanmış yapılandırılmış özet
2. **Doküman bulma** — "Teknofest ile ilgili dosyaları bul" → gerçek dosya listesi (uydurma imkânsız)
3. **Bilgi sentezi** — "AI Committee onay süreci nasıl işliyor?" → kaynaklı, sentezlenmiş cevap

Her cevap kaynak atıflıdır; dayanak yoksa sistem **"Bu bilgi dokümanlarda bulunamadı"** der.

## Mimari ve Akışlar

### 1. Veri Akışı — dosyadan Qdrant + Postgres'e (indeksleme hattı)

```mermaid
flowchart TD
    A["📁 Doküman klasörü<br/>pdf · docx · xlsx · pptx · txt · md"]
    A -->|"pnpm ingest — enqueue.ts"| B["Klasörü tara<br/>jobId = sha1(path) → tekrarsız"]
    B --> C[("Redis<br/>BullMQ 'parse' kuyruğu<br/>3 deneme, exp. backoff")]
    C -->|"pnpm worker — worker.ts"| D["Dosyayı oku<br/>sha256 içerik hash'i"]
    D --> E{"Hash değişmiş mi?<br/>(documents.hash)"}
    E -->|"hayır"| SKIP["atla — değişmemiş"]
    E -->|"evet"| F{"Dosya tipi?"}
    F -->|"txt / md"| G["Doğrudan oku<br/>(Docling'e gerek yok)"]
    F -->|"pdf / docx / xlsx / pptx"| H["Docling :5001<br/>POST /v1/convert/file<br/>docling.ts"]
    H -->|"hata → 3 deneme → failed"| FAIL[("documents<br/>status=failed + sebep")]
    H --> I["Markdown + yapısal JSON<br/>(prov.page_no sayfa haritası)"]
    G --> J["data/parsed/&lt;id&gt;.md (+ .json)"]
    I --> J
    J --> K[("Postgres — documents<br/>status=parsed<br/>path · hash · format")]

    K -->|"pnpm chunk — chunk-all.ts"| L["chunker.ts<br/>H1/H2 = bölüm sınırı · tablo bölünmez<br/>breadcrumb enjeksiyonu · ~650 token hedef<br/>pagemap.ts: chunk → sayfa no"]
    L --> M[("Postgres — chunks<br/>child (arama) + parent (bağlam)<br/>transaction ile replace")]

    M -->|"pnpm classify — classify-all.ts"| N["Qwen (uzak Ollama)<br/>structured JSON: docType · entities<br/>summary · containsPII · confidence"]
    N --> K2[("Postgres — documents<br/>metadata güncellenir<br/>güven &lt; 0.6 → needs_review")]

    M -->|"pnpm embed — embed-all.ts"| O["16'lık batch:<br/>bge-m3 dense (1024) — ollama.ts<br/>+ BM25 sparse — sparse.ts (TR tokenizer)"]
    O --> P[("Qdrant — albay_chunks<br/>dense + sparse vektör<br/>payload: doc_type · contains_pii<br/>entities · page · parent_id · text")]
    O -->|"markEmbedded"| M
```

### 2. Sorgu Akışı — kullanıcı sorusundan cevaba (LangGraph.js graph'ı)

```mermaid
flowchart TD
    Q["👤 pnpm sor 'soru' — ask-cli.ts<br/>→ ask() — graph.ts"]
    Q --> R["🧭 routerNode (Qwen, JSON)<br/>intent · entity · searchQuery"]
    R -->|"chitchat"| CC["chitchatNode<br/>kısa sohbet cevabı"]
    CC --> ANS

    R -->|"entity / doc_find / synthesis"| RET["retrieveNode → hybridSearch()<br/>search.ts"]

    subgraph HS["Hybrid Arama — packages/retrieval"]
        RET --> E1["Sorguyu embed et<br/>bge-m3 dense"]
        RET --> E2["Sparse encode<br/>BM25 + TR tokenizer"]
        E1 --> QD[("Qdrant Query API<br/>prefetch dense + sparse<br/>→ RRF füzyonu")]
        E2 --> QD
        QD --> RR{"RERANKER_URL<br/>tanımlı mı?"}
        RR -->|"evet"| RE["TEI bge-reranker-v2-m3<br/>cross-encoder sıralama"]
        RR -->|"hayır"| TOPK
        RE --> TOPK["top-K parça<br/>(entity: 10 · doc_find: 12 · synthesis: 8)"]
    end

    TOPK -->|"intent=entity"| EA["🧑 entityNode<br/>önce entity filtresi, azsa genel arama<br/>yapılandırılmış kişi/varlık özeti"]
    TOPK -->|"intent=doc_find"| DF["📄 docFinderNode<br/>doküman düzeyinde grupla<br/>liste GERÇEK sonuçlardan — LLM sadece açıklar"]
    TOPK -->|"intent=synthesis"| SY["📝 synthesisNode<br/>kaynaklı sentez cevap [1][2] atıflı"]

    DF --> ANS["✅ Cevap + Kaynaklar + trace"]
    EA --> GR{"🔍 graderNode (Qwen, JSON)<br/>cevap parçalara dayanıyor mu?<br/>'bilgi yok' cevabı → denetimsiz geç"}
    SY --> GR
    GR -->|"onay (grounded)"| ANS
    GR -->|"ret + retry &lt; 1<br/>sorguyu yeniden yaz"| RET
    GR -->|"ret + retry = 1"| NF["❌ 'Bu bilgi dokümanlarda<br/>bulunamadı.'"]
    NF --> ANS
```

## Stack

| Katman | Teknoloji |
|---|---|
| Dil / runtime | TypeScript, Node.js, pnpm workspaces |
| Agent orkestrasyon | LangGraph.js |
| LLM + embedding | Ollama (uzak): qwen2.5:14b-instruct + bge-m3 |
| Vector DB | Qdrant — hybrid: dense (cosine) + sparse (BM25, IDF server-side) |
| Reranker (opsiyonel) | TEI + bge-reranker-v2-m3 (x86; `--profile rerank`) |
| Parse | Docling (Docker sidecar) — layout-aware Markdown + sayfa haritası |
| Kuyruk | BullMQ + Redis |
| Metadata | PostgreSQL |

## Kurulum

```bash
# 1. Bagimliliklar
pnpm install

# 2. Ortam degiskenleri
cp .env.example .env
#    OLLAMA_BASE_URL'i uzak Ollama sunucuna gore duzenle

# 3. Yerel altyapi (Qdrant, Redis, Postgres, Docling)
docker compose up -d
#    x86 makinede reranker da isteniyorsa: docker compose --profile rerank up -d

# 4. Uzak Ollama sunucusunda modeller hazir olmali
#    ollama pull qwen2.5:14b-instruct && ollama pull bge-m3

# 5. Saglik kontrolu
pnpm smoke
```

## Kullanım

```bash
# Indeksleme hatti (sirayla)
pnpm migrate                    # DB semasi
pnpm ingest <klasor>            # dosyalari kuyruga ekle
pnpm worker                     # parse worker (ayri terminal, acik kalsin)
pnpm chunk                      # yapisal chunking
pnpm classify                   # LLM ile docType/entities/PII
pnpm embed                      # bge-m3 + Qdrant

# Sorgulama
pnpm sor "Albay Intelligence Hub süreci nasıl işliyor?" --trace
pnpm ara "Teknofest takımı"     # ham hybrid arama (agent'siz)

# Izleme / denetim
pnpm docs                       # dokuman listesi + chunk sayilari
pnpm ingest:status              # parse durumu
pnpm chunk:preview <dosya-adi>  # chunk kalite denetimi

# Kalite
pnpm test                       # birim testleri
pnpm eval -- --target agent     # golden set ile multi-agent olcumu
pnpm eval -- --target new       # duz RAG (karsilastirma)
pnpm eval -- --target ragflow   # RAGFlow baseline (API key gerekli)
```

## Repo Yapısı

```
packages/
├── shared/      # zod-dogrulamali config, ortak tipler
├── llm/         # Ollama client (chat/embed) + dokuman siniflandirici
├── chunking/    # yapisal chunker: H1-H2 sinirlari, tablo bolunmez,
│                #   breadcrumb, parent-child, sayfa eslemesi
├── retrieval/   # Qdrant hybrid arama (RRF), BM25 sparse encoder (TR), rerank
├── ingestion/   # Docling client, Postgres semasi/sorgulari
├── agents/      # LangGraph graph: router, entity/docfinder/synthesis, grader
└── eval/        # golden set, smoke test, eval harness (hedefler: agent/new/ragflow)
apps/
└── ingestion-worker/  # BullMQ worker + tum CLI'lar
docs/
└── parse-ve-chunking-rehberi.md
```

## Kalite Durumu (pilot korpus, 3 doküman / 62 chunk)

| Metrik | Hedef (PRD) | Ölçülen |
|---|---|---|
| Doğru kaynak oranı | ≥ %90 | **%100** |
| Tuzak başarısı (uydurmama) | ≥ %98 | **%100** |
| Retrieval süresi | ≤ 4 sn | ~0.3 sn |

## Yol Haritası

- [x] Faz 0 — Altyapı + eval iskeleti
- [x] Faz 1 — Parse pipeline (Docling + BullMQ)
- [x] Faz 2 — Yapısal chunking
- [x] Faz 3 — LLM sınıflandırma + embedding + Qdrant
- [x] Faz 4 — Hybrid retrieval (RRF) + reranker altyapısı
- [x] Faz 5 — LangGraph.js multi-agent orkestrasyon
- [ ] Faz 5b — Chat API (SSE) + web arayüzü + multi-turn hafıza
- [ ] Faz 6 — Auth/ACL/audit, RAGFlow karşılaştırması ve cutover

## Notlar

- `data/parsed/` korpusun düz metin kopyasını içerir — **yedekleme/senkron araçlarının dışında tutun** (KVKK).
- PII içeren dokümanlar aramada varsayılan olarak filtrelenir (`contains_pii` bayrağı); yetki katmanı Faz 6'da.
- Apple Silicon'da reranker çalışmaz (TEI arm64 imajı yok) — kod reranker'sız otomatik çalışır, production x86 kurulumunda etkinleştirilir.
