/**
 * Resmi yazi HTML sablonu.
 *
 * Tek bir sablon hem ekrandaki onizlemeyi hem de PDF'i uretir; ikisinin
 * ayrismasi "onizlemede gordugum yazi cikmadi" hatasinin kaynagi olurdu.
 * Bu yuzden sablon LLM'siz, bagimsiz ve deterministik: ayni model → ayni HTML.
 */
import type { LetterModel } from "@albay/shared";
import { esc, yerTutucuIsaretle } from "./escape.ts";
import { ekDagitimBlogu, ilgiBlogu, iletisimBlogu, muhatapBlogu } from "./sections.ts";
import { STIL } from "./styles.ts";

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
