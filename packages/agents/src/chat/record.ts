/**
 * Sohbetin ikinci bilgi kaynagi: sistemin bu evrak icin URETTIGI kayit.
 *
 * Belge kapsamli sohbet bugune kadar yalnizca evrakin METNINDEN besleniyordu;
 * oysa calisanin ekraninda evrakin yaninda dairenin kendi cikarimlari duruyor
 * (ozet, cikarilan bilgiler, hangi servise neden yonlendirildigi). Bunlar
 * belgenin metninde YAZMAZ — bu yuzden "yonlendirme neden bu servis?" sorusu
 * "bu bilgi belgede bulunamadi" ile donuyordu: sistem kendi kararinin
 * gerekcesini biliyor ama sohbete soylemiyordu.
 *
 * Kayit baglama AYRI bir blok olarak girer, belge parcalarina karistirilmaz:
 * biri evrakin ne dedigi, digeri dairenin ne cikardigi — cevapta hangisine
 * dayanildigi ayirt edilebilmeli.
 */
import { trNormalize } from "../common/tr-text.ts";
import type { DocumentRecord } from "./types.ts";

/** Kaydi promptta okunur, etiketli bir bloga cevirir. Bos alanlar hic yazilmaz. */
export function formatDocumentRecord(record: DocumentRecord): string {
  const satirlar: string[] = [`- Dosya: ${record.filename}`];
  const ekle = (etiket: string, deger: string | null | undefined) => {
    if (deger?.trim()) satirlar.push(`- ${etiket}: ${deger.trim()}`);
  };

  ekle("Evrak tipi", record.docType);
  ekle("Konu", record.konu);
  ekle("Ozet", record.ozet);

  const e = record.entities;
  if (e) {
    ekle("VKN", e.vkn);
    ekle("TCKN", e.tckn);
    ekle("Kisi/Kurum", e.kisiKurumlar.join(" · "));
    ekle("Tutar", e.tutarlar.join(" · "));
    ekle("Tarih", e.tarihler.join(" · "));
    ekle("Donem", e.donemler.join(" · "));
    ekle("Plaka", e.plakalar.join(" · "));
  }

  ekle("Is akisi durumu", IS_AKISI[record.yasamDongusu] ?? record.yasamDongusu);

  /*
   * Eksik bilgi taramasi panelde de duruyor; ayni listeyi sohbete de veriyoruz
   * ki calisan "buradaki ikinci bulgu ne demek?" diye sordugunda model ayni
   * bulguya baksin, kendi basina yeni bir tarama yapip baska bir liste uretmesin.
   */
  if (record.eksikler?.length) {
    satirlar.push("- Eksik bilgi taramasinin bulgulari:");
    for (const b of record.eksikler) {
      satirlar.push(
        `  · [${b.onem}] ${b.tur === "eksik" ? "Eksik" : "Tutarsizlik"}: ${b.baslik} — ${b.aciklama}` +
          (b.kanit ? ` (belgeden: "${b.kanit.replace(/\s+/g, " ").trim()}")` : ""),
      );
    }
  } else if (record.eksikler) {
    satirlar.push("- Eksik bilgi taramasi yapildi, eksik ya da celiskili bilgi bulunmadi.");
  }

  const r = record.routing;
  satirlar.push(
    r.servis
      ? `- Yonlendirilen servis: ${r.servis}${r.birim ? ` (${r.birim})` : ""}`
      : "- Yonlendirme: servis belirlenemedi, evrak manuel inceleme bekliyor",
  );
  if (r.guvenSkoru != null) satirlar.push(`- Yonlendirme guven skoru: ${r.guvenSkoru}`);
  ekle("Yonlendirme gerekcesi", r.gerekce);
  if (r.maddeler.length) {
    satirlar.push(
      `- Yonlendirmenin dayandigi yonetmelik maddeleri: ${r.maddeler
        .map((m) => `M.${m.maddeNo} (${m.baslik})`)
        .join(", ")}`,
    );
  }

  return satirlar.join("\n");
}

const IS_AKISI: Record<string, string> = {
  new: "yeni geldi",
  routed: "servise yonlendirildi",
  in_progress: "islemde",
  completed: "cevaplandi",
};

/**
 * Soru yonlendirmeyi/mevzuati mi soruyor?
 *
 * Yonetmelik parcalarini HER mesajda getirmek her mesaja bir arama maliyeti
 * bindirir ve baglami evrakla ilgisiz metinle doldurur; bu yuzden yalnizca
 * soru bunu istiyorsa getiriliyor. Kacirilan bir eslesme cevabi coldurmez:
 * yonlendirmenin gerekcesi ve madde basliklari sistem kaydinda zaten var,
 * eksik olan yalnizca maddenin tam metni olur.
 */
export function isRoutingQuestion(question: string): boolean {
  const q = trNormalize(question);
  return /(yonlendir|servis|birim|madde|mevzuat|yonetmelik|gorev tanim|hangi servis)/.test(q);
}
