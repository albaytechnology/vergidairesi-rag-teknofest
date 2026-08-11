# Yönetmelik korpusu (`albay_regulations`)

Vergi Dairesi servis yönlendirmesinin **tek dayanağı** bu klasördeki metinlerdir.
Kod tarafında hiçbir servis/madde eşlemesi hardcode edilmez; `routingNode` kararını
yalnızca bu korpustan hybrid arama ile getirilen madde parçalarına dayandırır ve
getirilmeyen bir maddeye atıf yapan karar `verifyCitations` tarafından reddedilir.

## İçerik

| Dosya | Kaynak | Not |
|---|---|---|
| `vergi_daireleri_kurulus_ve_gorev_yonetmeligi.md` | Vergi Daireleri Kuruluş ve Görev Yönetmeliği, 28.11.2025 düzenlenmiş metin | Docling ile PDF'ten üretilmiş Markdown |

Kamuya açık mevzuat metnidir — `data/` altındaki kurum korpusundan farklı olarak
repoda tutulur (KVKK kapsamı dışında).

## İndeksleme

```bash
pnpm ingest corpus/regulations
pnpm worker                                   # ayri terminal
pnpm chunk -- --corpus regulations
pnpm embed -- --corpus regulations
```

`.md` dosyaları Docling'e uğramadan doğrudan okunur; bu nedenle sayfa haritası
oluşmaz ve chunk'ların `page` alanı `null` kalır. Atıflar zaten **madde numarası**
üzerinden verildiği için bu bir kayıp değildir. Sayfa numarası da isteniyorsa
yönetmeliğin orijinal PDF'i ingest edilebilir — chunker `doclingJson` geldiğinde
sayfa eşlemesini otomatik kurar.

## Chunk politikası

`packages/chunking/src/regulation.ts`:

- **Madde** mantıksal sınırdır; her madde en az bir chunk üretir.
- Servis görev dökümü içeren maddeler (Madde 11 gibi) ayrıca **servis** seviyesinde
  child chunk'lara bölünür, maddenin tamamı parent chunk olarak saklanır.
- Her chunk `{kisim, bolum, hizmetBirimi, altBolum, servis, maddeNo, baslik,
  maddeNoKesin}` metadata'sı taşır.
- **Masa** seviyesinde (Beyanname Kabul Masası vb.) ayrı chunk üretilmez — görevlerin
  masalar arası dağılımı Madde 6 ve Madde 11-A-I-2 uyarınca "İşlem Yönergesi"ne
  bırakılmıştır ve o doküman elimizde yoktur.

## OCR notu

Kaynak PDF'in Docling çıktısında **Madde 21**'in başlığındaki "Madde 21" ibaresi
kaybolmuştur. Chunker bu maddeyi komşu madde numaralarından (20 ve 22 arasında tek
boşluk) türetir ve `maddeNoKesin: false` işaretler; chunk metnine ve yönlendirme
çıktısına bu belirsizlik açıkça yazılır. Numara aritmetikle tek biçimde
belirlenemiyorsa madde ayrı chunk yapılmaz, önceki maddenin gövdesinde bırakılır —
yanlış madde atfı üretmektense büyük chunk tercih edilir.
