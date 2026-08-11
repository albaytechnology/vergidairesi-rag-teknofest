/**
 * Cevap yazisi uretme CLI'si.
 *
 * Web arayuzu (Faz D) gelmeden once yazinin ucta uca denenebilmesi icin var;
 * arayuzle AYNI paket fonksiyonlarini cagirir, mantik tekrarlanmaz.
 *
 *   pnpm mektup <docId|dosya-adi-parcasi> <onay|kismi_onay|red|...> [gerekce]
 *
 * Ciktilar tmp/letters/ altina yazilir. --kaydet verilmedikce giden evrak
 * sira numarasi TUKETILMEZ ve yazi veritabanina islenmez.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  documentAnalysisFromRow,
  getDocumentDetail,
  nextLetterNo,
  pool,
  saveResponseLetter,
} from "@albay/ingestion";
import { draftResponseLetter } from "@albay/agents";
import {
  buildLetterModel,
  closeBrowser,
  htmlToPdf,
  letterToDocx,
  renderLetterHtml,
} from "@albay/letter";
import {
  LetterDecisionSchema,
  type DocumentAnalysis,
  type LetterBody,
  type LetterDecision,
} from "@albay/shared";

const OUT_DIR = "tmp/letters";

const args = process.argv.slice(2);
const kaydet = args.includes("--kaydet");
/**
 * LLM'i atlayip sabit ornek metinle yazi uretir.
 *
 * packages/letter bastan sona deterministik ve LLM'siz; sablonu, PDF/DOCX
 * uretimini ve yer tutucu davranisini denemek icin Ollama'nin ayakta olmasi
 * gerekmemeli. Ollama erisilemedigi ya da hizli bir bicim kontrolu istendiginde
 * bu bayrak kullanilir.
 */
const ornek = args.includes("--ornek");
const [hedef, kararArg, ...gerekceParcalari] = args.filter((a) => !a.startsWith("--"));

if (!hedef || !kararArg) {
  console.error(
    "Kullanim: pnpm mektup <docId|dosya-adi-parcasi> " +
      "<onay|kismi_onay|red|eksik_belge|bilgilendirme> [gerekce] [--kaydet]",
  );
  process.exit(1);
}

const karar = LetterDecisionSchema.safeParse(kararArg);
if (!karar.success) {
  console.error(`Gecersiz karar: ${kararArg}`);
  process.exit(1);
}

const docId = await docIdCoz(hedef);
const doc = await getDocumentDetail(docId);
if (!doc) {
  console.error(`Belge bulunamadi: ${hedef}`);
  process.exit(1);
}
if (!doc.analyzed_at) {
  console.error(`Belge henuz analiz edilmemis. Once: pnpm pipeline`);
  process.exit(1);
}

const analiz = documentAnalysisFromRow(doc);
console.log(`Belge : ${doc.filename}`);
console.log(`Konu  : ${analiz.konu}`);
console.log(`Servis: ${doc.routed_service ?? "belirlenemedi"}`);
console.log(`Karar : ${karar.data}\n`);

const gerekce = gerekceParcalari.join(" ") || undefined;
const taslak = ornek
  ? ornekTaslak(analiz, karar.data, gerekce)
  : await draftResponseLetter({
      analiz,
      karar: karar.data,
      kararGerekcesi: gerekce,
      maddeler: doc.routing_regulation_refs ?? [],
    });
for (const t of taslak.trace) console.log(`  ${t}`);

const sayiNo = kaydet ? await nextLetterNo() : null;
const model = buildLetterModel({ analiz, body: taslak.body, karar: karar.data, sayiNo });
const html = renderLetterHtml(model, { onizleme: true });

await mkdir(OUT_DIR, { recursive: true });
const taban = join(OUT_DIR, `${doc.id.slice(0, 8)}-${karar.data}`);
await writeFile(`${taban}.html`, html);
await writeFile(`${taban}.docx`, await letterToDocx(model));
try {
  await writeFile(`${taban}.pdf`, await htmlToPdf(html));
} catch (err) {
  console.error(`\nPDF uretilemedi: ${(err as Error).message}`);
}

if (kaydet) {
  const id = await saveResponseLetter({
    documentId: doc.id,
    decision: karar.data,
    decisionReason: taslak.body.gerekce || gerekce || null,
    mukellefVkn: model.muhatap.vknTckn,
    letterNo: sayiNo,
    sayi: model.sayi,
    letterModel: model,
    letterHtml: html,
  });
  console.log(`\nKaydedildi → response_letters.id = ${id}`);
}

console.log(`\nSayi  : ${model.sayi}`);
if (model.eksikAlanlar.length) {
  console.log(`EKSIK ALANLAR (.env'de doldurulmali):`);
  for (const a of model.eksikAlanlar) console.log(`  - ${a}`);
}
if (taslak.dayanaksizSayilar.length) {
  console.log(`UYARI — evrakta karsiligi bulunamayan sayilar: ${taslak.dayanaksizSayilar.join(", ")}`);
  console.log(`  Yaziyi gondermeden once bu degerleri elle dogrulayin.`);
}
console.log(`\nCikti: ${taban}.{html,pdf,docx}`);

await closeBrowser();
await pool.end();

/**
 * --ornek: LLM'siz sabit metin.
 *
 * Sablon, PDF/DOCX uretimi ve yer tutucu davranisi tamamen deterministik;
 * bunlari denemek icin dil modelinin ayakta olmasi gerekmiyor. Metin bilerek
 * kendini "ornek" olarak tanitir — gercek bir yazi sanilmasin.
 */
function ornekTaslak(
  a: DocumentAnalysis,
  karar: LetterDecision,
  gerekce: string | undefined,
): { body: LetterBody; dayanaksizSayilar: string[]; trace: string[] } {
  const tarih = a.entities.tarihler[0];
  const olumsuz = karar === "red" || karar === "kismi_onay" || karar === "eksik_belge";
  return {
    body: {
      ilgiSatirlari: [tarih ? `${tarih} tarihli dilekçeniz.` : "Dilekçeniz."],
      paragraflar: [
        `İlgide kayıtlı dilekçeniz Müdürlüğümüzce incelenmiştir. Dilekçe konusu: ${a.konu}`,
        olumsuz
          ? "Yapılan değerlendirme sonucunda talebiniz uygun görülmemiştir."
          : "Yapılan değerlendirme sonucunda talebiniz uygun görülmüştür.",
        "(Bu paragraflar biçim denemesi için üretilmiş ÖRNEK metindir; dil modeli çalıştırılmamıştır.)",
      ],
      gerekce: olumsuz ? (gerekce ?? "Örnek gerekçe metni") : "",
    },
    dayanaksizSayilar: [],
    trace: ["ornek metin — LLM calistirilmadi (--ornek)"],
  };
}

/**
 * UUID verilirse aynen kullanir; degilse dosya adi parcasi kabul edip arar.
 * `pnpm run docs` docId basmadigi icin elle UUID kopyalamak zorunda kalinmasin.
 * Birden fazla eslesirse secmez — yanlis belgeye yazi uretmektense hata verir.
 */
async function docIdCoz(girdi: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(girdi)) {
    return girdi;
  }
  const res = await pool.query<{ id: string; filename: string }>(
    `SELECT id, filename FROM documents
     WHERE corpus = 'documents' AND filename ILIKE '%' || $1 || '%'
     ORDER BY created_at DESC`,
    [girdi],
  );
  if (!res.rows.length) {
    console.error(`Dosya adinda "${girdi}" gecen evrak yok. Liste: pnpm run docs`);
    process.exit(1);
  }
  if (res.rows.length > 1) {
    console.error(`"${girdi}" birden fazla evrakla esliyor, daha belirgin bir parca verin:`);
    for (const r of res.rows) console.error(`  - ${r.filename}`);
    process.exit(1);
  }
  return res.rows[0]!.id;
}
