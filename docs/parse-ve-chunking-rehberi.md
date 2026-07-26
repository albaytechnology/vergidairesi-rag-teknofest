# Parse + Chunking Rehberi

Bu doküman, Albay RAG'in doküman alım hattının (Faz 1 + Faz 2) nasıl çalıştığını, nasıl kullanılacağını ve kalitenin nasıl denetleneceğini anlatır.

---

## 1. Büyük Resim

```
 dosya klasörü                                     Postgres
      │                                                │
      ▼                                                ▼
 pnpm ingest ──► Redis kuyruğu ──► pnpm worker ──► documents tablosu
 (dosyaları       (BullMQ,          │                + data/parsed/<id>.md
  tarar,           retry'li)        │                + data/parsed/<id>.json
  kuyruğa                           │
  ekler)                            ▼
                              Docling (Docker, :5001)
                              PDF/DOCX → Markdown + yapısal JSON

 pnpm chunk ──► chunks tablosu   (child + parent chunk'lar)
```

İki bağımsız aşama var ve **sıra önemli**: önce parse (worker), sonra chunk. Chunk aşaması yalnızca `status = 'parsed'` dokümanları işler.

---

## 2. Uçtan Uca Akış (Komutlar)

```bash
# 0. Altyapı ayakta olmalı (bir kez)
docker compose up -d
pnpm migrate

# 1. Dokümanları kuyruğa ekle
pnpm ingest ~/Belgeler/korpus

# 2. Worker'ı başlat (ayrı terminalde, açık kalsın)
pnpm worker

# 3. İlerlemeyi izle
pnpm ingest:status        # pending / parsing / parsed / failed sayıları

# 4. Parse bitince chunk'la
pnpm chunk                # sadece yeni dokümanları işler
pnpm chunk -- --force     # her şeyi yeniden chunk'lar (ayar değişince)

# 5. Sonuçları incele
pnpm docs                 # tüm dokümanlar + chunk sayıları
pnpm docs sozlesme        # isme göre filtre
pnpm chunk:preview opel   # bir dokümanın chunk'larını gözle denetle
```

### Doküman güncellenince ne olur?

Worker her dosyanın SHA-256 hash'ini saklar. Aynı dosyayı tekrar ingest edersen:

- **İçerik değişmemişse** → "atlandı (değişmemiş)" der, hiçbir şey yapmaz.
- **İçerik değişmişse** → yeniden parse eder; `pnpm chunk` çalıştırdığında eski chunk'lar transaction içinde silinip yenileri yazılır.
- **Dosya silinmişse** → şimdilik manuel: `documents` tablosundan silmen yeterli, chunk'lar CASCADE ile temizlenir. (Otomatik izleme roadmap'te P1.)

---

## 3. Parse Aşaması Nasıl Çalışır?

| Dosya tipi | Yol |
|---|---|
| `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.html` | Docling container'ına gönderilir → layout-aware Markdown + yapısal JSON |
| `.txt`, `.md` | Docling'e uğramadan doğrudan okunur (hızlı yol) |

Docling'den iki çıktı saklanır:

1. **`data/parsed/<id>.md`** — chunking'in girdisi. Başlık hiyerarşisi ve tablolar Markdown olarak korunur.
2. **`data/parsed/<id>.json`** — Docling'in yapısal çıktısı. Her metin parçasının **hangi sayfada** olduğu (`prov.page_no`) burada; chunk'lara sayfa numarası bundan eşlenir. Kaynak gösterimi (citation, PRD FR-10) için kritik.

Hata durumunda BullMQ 3 kez, artan bekleme ile dener; yine olmazsa doküman `failed` olarak işaretlenir ve sebep `pnpm ingest:status` çıktısının altında görünür.

**İlk dosya yavaş mı?** Normal — Docling ilk istekte modellerini yüklüyor (1-2 dk). Sonrası hızlanır.

---

## 4. Chunking Aşaması Nasıl Çalışır?

Chunker'ın dört temel kuralı:

**Kural 1 — Yapıya saygı.** Markdown başlık hiyerarşisi çıkarılır; **H1/H2 sınırları bölüm sınırıdır**. Bir bölümün ortasından başka bölüme taşan chunk olmaz. H3 ve altı başlıklar bölüm içinde akar.

**Kural 2 — Tablo asla bölünmez.** Tablo tek blok olarak taşınır; gerekirse tek başına bir chunk olur. Yarım tablo, anlamsız tablo demektir.

**Kural 3 — Breadcrumb (bağlam enjeksiyonu).** Her chunk şu satırla başlar:

```
[Dosya: opel_kiralama.pdf > Araç Kiralama Sözleşmesi > 2. Kiralama Koşulları]
Kiralama süresi 12 ay olup...
```

Bu satır hem embedding'e girer (retrieval isabetini ciddi artırır — chunk "nereden geldiğini bilir") hem de LLM'e verildiğinde kaynak bağlamı taşır.

**Kural 4 — Parent-child.** Her H2 bölümü için bir **parent chunk** (bölümün tamamı, ~3500 token'a kadar) ve onun altında **child chunk'lar** (~650 token hedef) üretilir. Arama child'lar üzerinde yapılır (küçük parça = isabetli eşleşme), LLM'e cevap ürettirirken gerekirse parent verilir (geniş bağlam = tutarlı cevap). `chunks.parent_id` bu bağı tutar.

### Boyut politikası

| Parametre | Değer | Nerede |
|---|---|---|
| Hedef child boyutu | ~650 token | `packages/chunking/src/chunker.ts` → `DEFAULTS.targetTokens` |
| Üst sınır (tablo hariç) | 900 token | `DEFAULTS.maxTokens` |
| Uzun paragraf overlap'i | %12 | `DEFAULTS.overlapRatio` |
| Parent üst sınırı | 3500 token | `DEFAULTS.maxParentTokens` |

Token sayısı yaklaşıktır (~3.5 karakter/token sezgiseli). Ayar değiştirirsen `pnpm chunk -- --force` ile her şeyi yeniden chunk'la — **ve Faz 4'te eval ile ölçmeden bu ayarlarla oynama.**

---

## 5. Kalite Denetimi (Kabul Kriterleri)

Roadmap'teki kabul çizgisi: rastgele 30 chunk manuel incelemede "kendi başına anlamlı" olmalı. Denetim listesi:

- [ ] **Türkçe karakterler** doğru mu? (ı, İ, ş, ğ, ç, ö, ü — özellikle PDF'lerde)
- [ ] **Tablolar** tek chunk'ta ve Markdown tablosu olarak okunabilir mi?
- [ ] **Section etiketi** dokümanın gerçek yapısını yansıtıyor mu?
- [ ] **Sayfa numarası** PDF'lerde dolu mu? (txt/md'de `?` normaldir)
- [ ] **Ortalama child boyutu** 400-800 token bandında mı? (`pnpm chunk` özetinde görünür)
- [ ] Bir chunk'ı tek başına okuyunca **ne hakkında olduğu anlaşılıyor mu?** (breadcrumb + içerik)
- [ ] Cümle ortasından kopan chunk **var mı?** (olmamalı — bölme cümle sınırında)

Denetim için: `pnpm docs` → birkaç farklı tipte doküman seç (sözleşme, tablolu rapor, düz metin) → her biri için `pnpm chunk:preview <ad>`.

### Sık görülen sorunlar

| Belirti | Muhtemel sebep | Çözüm |
|---|---|---|
| Chunk'larda bozuk Türkçe karakter | PDF'in font/encoding sorunu | Dokümanı `chunk:preview` ile teyit et; kaynak `data/parsed/<id>.md`'de de bozuksa sorun parse'ta — o dosyayı işaretle, Docling OCR seçenekleriyle Faz 2.5'te döneriz |
| Section hep `(bolumsuz)` | Doküman başlıksız ya da Docling başlıkları yakalayamadı | Kabul edilebilir — breadcrumb yine dosya adını taşır. Yaygınsa Docling çıktısını incele |
| Tek dokümandan yüzlerce mini chunk | Doküman çok kısa paragraflardan oluşuyor | Normal olabilir; ort. token çok düşükse (<300) `targetTokens`'ı düşürmek yerine bekle — Faz 4 eval'i karar versin |
| `failed` dokümanlar | Şifreli/bozuk PDF | `pnpm ingest:status` altta sebebi gösterir; şifreliyse açıp yeniden ingest et |
| Sayfa numaraları hep `?` | Docling JSON'unda prov bilgisi eşleşmedi | Kritik değil (best-effort); yaygınsa bana söyle, eşleme algoritmasını sıkılaştırırız |

---

## 6. Veri Nerede Duruyor?

| Ne | Nerede | Not |
|---|---|---|
| Doküman kayıtları | Postgres → `documents` | path, hash, durum, hata |
| Chunk'lar | Postgres → `chunks` | Faz 3'te embedding buradan okunacak |
| Parse çıktıları | `data/parsed/*.md` + `*.json` | gitignore'da — repoya girmez |
| Kuyruk | Redis | `docker compose down` ile kaybolmaz (AOF açık) |

**KVKK notu:** `data/parsed/` klasörü korpustaki hassas veriyi düz metin olarak içerir. Bu klasörü yedekleme/senkronizasyon araçlarının (iCloud, Dropbox vb.) kapsamı dışında tut.

---

## 7. Sonraki Adım (Faz 3 önizleme)

Chunk'lar hazır olduğunda sırada: her doküman için LLM ile sınıflandırma (`docType`, `entities`, `containsPII`), child chunk'ların bge-m3 ile embed edilmesi ve Qdrant'a hybrid arama için yazılması. Yani bu rehberdeki hattın çıktısı (`chunks` tablosu), Faz 3'ün doğrudan girdisi.
