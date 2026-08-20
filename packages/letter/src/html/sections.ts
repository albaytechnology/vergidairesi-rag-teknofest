/**
 * Yazinin HTML bloklari.
 *
 * Her blok kendi basina bos donebilir (ilgi yoksa ilgi blogu hic basilmaz);
 * boylece bos etiketli satirlar — "Ek:" yazip altinda hicbir sey olmamasi —
 * ciktiya sizmaz.
 */
import type { LetterModel } from "@albay/shared";
import { ekBasligi, ekSatiri, ilgiSatiri, iletisimSatirlari, muhatapAdi } from "../blocks.ts";
import { esc, yerTutucuIsaretle } from "./escape.ts";

export function muhatapBlogu(model: LetterModel): string {
  const { muhatap } = model;
  // Kurum adi duz kacislanir, kisi adi yer tutucu isaretlemesinden gecer.
  const ad =
    muhatap.tur === "kurum" ? esc(muhatapAdi(muhatap)) : yerTutucuIsaretle(muhatapAdi(muhatap));
  const satirlar = [`    <div class="muhatap-ad">${ad}</div>`];
  if (muhatap.vknTckn) {
    satirlar.push(`    <div class="muhatap-no">(VKN/TCKN: ${esc(muhatap.vknTckn)})</div>`);
  }
  if (muhatap.adres) {
    satirlar.push(`    <div class="muhatap-adres">${esc(muhatap.adres)}</div>`);
  }
  return satirlar.join("\n");
}

export function ilgiBlogu(model: LetterModel): string {
  if (!model.ilgiSatirlari.length) return "";
  const satirlar = model.ilgiSatirlari.map(
    (s, i) => `      <div class="ilgi-satir">${esc(ilgiSatiri(s, i))}</div>`,
  );
  return `  <div class="ilgi">
    <span class="ilgi-etiket">İlgi&nbsp;&nbsp;&nbsp;&nbsp;:</span>
    <div class="ilgi-liste">
${satirlar.join("\n")}
    </div>
  </div>
`;
}

export function ekDagitimBlogu(model: LetterModel): string {
  const parcalar: string[] = [];
  if (model.ekler.length) {
    parcalar.push(
      `  <div class="ek">
    <div class="blok-etiket">${ekBasligi(model.ekler)}</div>
${model.ekler.map((e, i) => `    <div>${esc(ekSatiri(e, i))}</div>`).join("\n")}
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

export function iletisimBlogu(model: LetterModel): string {
  const alanlar = iletisimSatirlari(model.iletisim);
  if (!alanlar.length) return "";
  return `  <footer class="iletisim">${alanlar.map(esc).join(" &nbsp;•&nbsp; ")}</footer>`;
}
