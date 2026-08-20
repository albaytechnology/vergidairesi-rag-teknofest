/**
 * HTML kacislama.
 *
 * Sablona giren her sey disaridan gelir: paragraflar LLM'den, muhatap adi
 * arayuz formundan. Kacislanmadan basilirsa onizlemede — ve PDF ureten
 * Chromium'da — kod calisabilir.
 */
export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Doldurulmamis alanlari ([DETSIS NO] gibi) gorunur kilar.
 *
 * Yer tutucunun sessizce gecmesi, eksik bir yazinin tam sanilmasina yol acar;
 * bu yuzden hem ekranda hem baskida isaretli kalir.
 */
export function yerTutucuIsaretle(deger: string): string {
  return esc(deger).replace(/\[([^\]]+)\]/g, '<span class="eksik">[$1]</span>');
}
