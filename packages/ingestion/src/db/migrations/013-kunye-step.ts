/**
 * Analizin ilk adimi: kunye.
 *
 * Analiz iki cagriya bolundu (bkz. llm/analysis/analyze.ts) ve iki adim
 * arayuzdeki ilerleme cubugunda ayri ayri gorunuyor. Adim durumu veri
 * tabanindaki IZDEN okundugu icin (bkz. api/helpers/pipeline-steps.ts) iki
 * adimin iki ayri damgasi olmali: kunye_at kunyeyi, analyzed_at ozetle
 * birlikte TAMAMLANMIS analizi isaretler.
 *
 * analyzed_at'in anlami DEGISMIYOR — cevap yazisi ve yeniden yonlendirme
 * "analiz bitti mi" diye ona bakmaya devam ediyor; ozet en sona yazildigi
 * icin bu kosul hala tam analizi ifade eder.
 *
 * Geri doldurma: bolunmeden once analiz edilmis evraklarda kunye de
 * cikarilmisti. Damgayi analyzed_at'ten kopyalamazsak eski evraklar
 * cubukta "kunye adimi hic calismamis" gibi gorunurdu.
 */
export const sql = `
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS kunye_at TIMESTAMPTZ;
  UPDATE documents SET kunye_at = analyzed_at
   WHERE kunye_at IS NULL AND analyzed_at IS NOT NULL;
`;
