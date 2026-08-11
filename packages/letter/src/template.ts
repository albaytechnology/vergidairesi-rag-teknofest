/**
 * Resmi yazi HTML sablonu + A4 baski stili.
 *
 * Tek bir sablon hem ekrandaki onizlemeyi hem de PDF'i uretir; ikisinin
 * ayrismasi "onizlemede gordugum yazi cikmadi" hatasinin kaynagi olurdu.
 * Bu yuzden sablon LLM'siz, bagimsiz ve deterministik: ayni model → ayni HTML.
 *
 * Olculer yonetmelige gore: A4, her yandan 2,5 cm bosluk, Times New Roman 12
 * punto, iletisim blogu 8 punto.
 */
import type { LetterModel } from "@albay/shared";

const ILGI_HARFLERI = "abcdefghijklmnopqrstuvwxyz";

export interface RenderOptions {
  /**
   * true ise ekranda sayfa kenarligi/golgesi gosterilir. PDF uretiminde
   * kapatilir — Chromium zaten kagit sinirini kendisi ciziyor.
   */
  onizleme?: boolean;
}

export function renderLetterHtml(model: LetterModel, opts: RenderOptions = {}): string {
  const onizleme = opts.onizleme ?? false;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>${esc(model.konu)}</title>
<style>${STIL}</style>
</head>
<body class="${onizleme ? "onizleme" : "baski"}">
<div class="sayfa">
${model.taslak ? '<div class="filigran" aria-hidden="true">TASLAK</div>' : ""}
  <header class="antet">
    <div>T.C.</div>
    <div>${esc(model.kurumAdi.toLocaleUpperCase("tr-TR"))}</div>
    <div>${esc(model.birimAdi)}</div>
  </header>

  <div class="sayi-satiri">
    <span class="sayi">Sayı&nbsp;&nbsp;&nbsp;: ${yerTutucuIsaretle(model.sayi)}</span>
    <span class="tarih">${esc(model.tarih)}</span>
  </div>
  <div class="konu">Konu&nbsp;&nbsp;: ${esc(model.konu)}</div>

  <div class="muhatap">
${muhatapBlogu(model)}
  </div>

${ilgiBlogu(model)}
  <div class="metin">
${model.paragraflar.map((p) => `    <p>${esc(p)}</p>`).join("\n")}
    <p class="kapanis">${esc(model.kapanis)}</p>
  </div>

  <div class="imza">
    <div class="imza-ad">${yerTutucuIsaretle(model.imzaAd)}</div>
    <div class="imza-unvan">${yerTutucuIsaretle(model.imzaUnvan)}</div>
  </div>

${ekDagitimBlogu(model)}
${model.taslak ? `  <div class="taslak-notu">Bu belge bir TASLAKTIR. Güvenli elektronik imza ile imzalanmamıştır; hukuki geçerliliği yoktur.</div>` : ""}
${iletisimBlogu(model)}
</div>
</body>
</html>`;
}

function muhatapBlogu(model: LetterModel): string {
  const { muhatap } = model;
  const ad =
    muhatap.tur === "kurum"
      ? esc(muhatap.ad.toLocaleUpperCase("tr-TR"))
      : `Sayın ${yerTutucuIsaretle(muhatap.ad)}`;
  const satirlar = [`    <div class="muhatap-ad">${ad}</div>`];
  if (muhatap.vknTckn) {
    satirlar.push(`    <div class="muhatap-no">(VKN/TCKN: ${esc(muhatap.vknTckn)})</div>`);
  }
  if (muhatap.adres) {
    satirlar.push(`    <div class="muhatap-adres">${esc(muhatap.adres)}</div>`);
  }
  return satirlar.join("\n");
}

function ilgiBlogu(model: LetterModel): string {
  if (!model.ilgiSatirlari.length) return "";
  const satirlar = model.ilgiSatirlari.map((s, i) => {
    // Model harfi kendisi yazdiysa tekrarlamayalim.
    const harfli = /^[a-zçğıöşü]\s*\)/i.test(s.trim());
    const etiket = harfli ? "" : `${ILGI_HARFLERI[i] ?? "+"}) `;
    return `      <div class="ilgi-satir">${esc(etiket + s.trim())}</div>`;
  });
  return `  <div class="ilgi">
    <span class="ilgi-etiket">İlgi&nbsp;&nbsp;&nbsp;&nbsp;:</span>
    <div class="ilgi-liste">
${satirlar.join("\n")}
    </div>
  </div>
`;
}

function ekDagitimBlogu(model: LetterModel): string {
  const parcalar: string[] = [];
  if (model.ekler.length) {
    parcalar.push(
      `  <div class="ek">
    <div class="blok-etiket">${model.ekler.length > 1 ? "Ekler" : "Ek"}:</div>
${model.ekler.map((e, i) => `    <div>${i + 1}- ${esc(e)}</div>`).join("\n")}
  </div>`,
    );
  }
  if (model.dagitim.length) {
    parcalar.push(
      `  <div class="dagitim">
    <div class="blok-etiket">Dağıtım:</div>
${model.dagitim.map((d) => `    <div>${esc(d)}</div>`).join("\n")}
  </div>`,
    );
  }
  return parcalar.join("\n");
}

function iletisimBlogu(model: LetterModel): string {
  const { adres, telefon, eposta, web, kep } = model.iletisim;
  const alanlar = [
    adres && `Adres: ${adres}`,
    telefon && `Telefon: ${telefon}`,
    eposta && `e-Posta: ${eposta}`,
    web && `İnternet adresi: ${web}`,
    kep && `KEP: ${kep}`,
  ].filter((x): x is string => Boolean(x));
  if (!alanlar.length) return "";
  return `  <footer class="iletisim">${alanlar.map(esc).join(" &nbsp;•&nbsp; ")}</footer>`;
}

/**
 * Doldurulmamis alanlari ([DETSIS NO] gibi) gorunur kilar.
 *
 * Yer tutucunun sessizce gecmesi, eksik bir yazinin tam sanilmasina yol acar;
 * bu yuzden hem ekranda hem baskida isaretli kalir.
 */
function yerTutucuIsaretle(deger: string): string {
  return esc(deger).replace(/\[([^\]]+)\]/g, '<span class="eksik">[$1]</span>');
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const STIL = `
@page { size: A4; margin: 2.5cm; }
* { box-sizing: border-box; }
body {
  font-family: "Times New Roman", Times, serif;
  font-size: 12pt;
  line-height: 1.4;
  color: #000;
  background: #fff;
  margin: 0;
}
body.onizleme { background: #e9e9ec; padding: 24px 0; }
body.onizleme .sayfa {
  width: 21cm;
  min-height: 29.7cm;
  margin: 0 auto;
  padding: 2.5cm;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,.18);
}
.sayfa { position: relative; }

.filigran {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-32deg);
  font-size: 84pt;
  font-weight: bold;
  letter-spacing: .12em;
  color: rgba(190, 30, 30, .13);
  pointer-events: none;
  white-space: nowrap;
}

.antet { text-align: center; line-height: 1.25; }
.antet div:nth-child(2) { font-weight: bold; }

.sayi-satiri {
  display: flex;
  justify-content: space-between;
  margin-top: 1.5em;
}
.konu { margin-top: .2em; max-width: 60%; }

.muhatap { margin: 2.5em 0 1.5em; text-align: center; }
.muhatap-ad { font-weight: bold; }
.muhatap-no, .muhatap-adres { font-size: 11pt; }

.ilgi { display: flex; gap: .4em; margin-bottom: 1em; }
.ilgi-satir { margin-bottom: .15em; }

.metin p { margin: 0 0 .6em; text-align: justify; text-indent: 1.25cm; }
.metin .kapanis { margin-top: 1em; }

.imza { margin-top: 2.5em; text-align: right; }
.imza-ad { }
.imza-unvan { }

.ek, .dagitim { margin-top: 1.5em; font-size: 11pt; }
.blok-etiket { font-weight: bold; }

.eksik {
  background: #ffe9a8;
  border-bottom: 1px dashed #b07800;
  padding: 0 2px;
}

.taslak-notu {
  margin-top: 2em;
  padding: .4em .6em;
  border: 1px solid #b02020;
  color: #b02020;
  font-size: 9pt;
  text-align: center;
}

.iletisim {
  margin-top: 2em;
  padding-top: .4em;
  border-top: 1px solid #000;
  font-size: 8pt;
  line-height: 1.3;
}

@media print {
  body.onizleme { background: #fff; padding: 0; }
  body.onizleme .sayfa {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .eksik { background: none; }
}
`;
