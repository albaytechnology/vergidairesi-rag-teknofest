/**
 * Vergi dairesine gelen evrakin analizi (Faz 5b).
 *
 * classification/ klasorunden farki: bu, kurum korpusu icin genel bir
 * siniflandirma degil, yazisma/dilekce evraginin islenebilmesi icin gereken
 * alanlari cikarir. Cikti servis yonlendirmesinin girdisidir.
 *
 * Analiz IKI ADIMDIR ve iki ayri cagridir:
 *
 *   1. kunye : belge turu, talep edilen islem, alacak turu, entity'ler
 *   2. ozet  : konu cumlesi, kisa baslik, 3-5 cumlelik ozet
 *
 * Tek cagriyken model once ozeti yazip kunye alanlarini o ozete gore
 * dolduruyordu; yonlendirmenin birincil sinyali olan islemTuru boylece
 * belgeden degil modelin kendi ifadesinden turuyordu. Bolunmus haliyle kunye
 * dogrudan belgeden okunuyor, ozet ise kunyeyi VERILI kabul edip onunla
 * celismeyen bir okuma yaziyor.
 *
 * Ikinci fayda arayuzde: hattaki iki adim ayri ayri iz biraktigi icin
 * (kunye_at / analyzed_at) yukleme ekranindaki ilerleme cubugu dakikalarca
 * suren analizi tek bir bolmede degil, iki bolmede gosterir.
 */
import {
  DocumentKunyeSchema,
  DocumentOzetSchema,
  type DocumentKunye,
  type DocumentOzet,
} from "@albay/shared";
import { OllamaClient } from "../ollama/client.ts";
import { structuredJsonCall } from "../ollama/structured.ts";
import { groundAlacakTuru } from "./grounding.ts";
import { KUNYE_SYSTEM_PROMPT, OZET_SYSTEM_PROMPT } from "./prompt.ts";
import { reconcileIdentifiers } from "./reconcile.ts";
import { KUNYE_JSON_SCHEMA, OZET_JSON_SCHEMA } from "./schema.ts";

export interface AnalyzeInput {
  filename: string;
  /** Belgenin tam metni (ya da yeterince genis bir on parcasi). */
  text: string;
}

/** Modele verilen metin — iki adim da AYNI parcayi gormeli. */
const metin = (input: AnalyzeInput) =>
  `Dosya adi: ${input.filename}\n\nEvrak metni:\n${input.text.slice(0, 12000)}`;

/*
 * temperature 0: analiz ciktisi yonlendirmenin GIRDISI. 0.1'de bile konu/ozet
 * ifadesi turden ture degisiyor, bu da retrieval sorgusunu ve dolayisiyla
 * servis kararini kaydiriyordu — ayni evrak iki calistirmada iki servise
 * dusebiliyor. Hat yeniden calistirildiginda ayni sonucu vermeli.
 */
const TEMPERATURE = 0;

/**
 * Kunyeyi cikarir ve kimlik numaralarini checksum ile dogrular.
 *
 * LLM'in verdigi VKN/TCKN dogrudan kabul edilmez: once checksum'dan gecirilir,
 * gecemezse ham metinden checksum'i tutan bir aday aranir, o da yoksa null yazilir.
 * Boylece resmi cevap yazisina uydurma bir vergi numarasi girmesi engellenir.
 */
export async function extractDocumentKunye(
  ollama: OllamaClient,
  input: AnalyzeInput,
): Promise<DocumentKunye> {
  const parsed = await structuredJsonCall(ollama, {
    system: KUNYE_SYSTEM_PROMPT,
    user: metin(input),
    schema: KUNYE_JSON_SCHEMA,
    temperature: TEMPERATURE,
    parse: (value) => DocumentKunyeSchema.parse(value),
    islemAdi: "Evrak kunyesi",
  });

  return {
    ...parsed,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    alacakTuru: groundAlacakTuru(parsed.alacakTuru, input.text),
    entities: reconcileIdentifiers(parsed.entities, input.text),
  };
}

/** Ozeti yazar. Kunye VERILI: ozet onunla celisen bir okuma sunmamali. */
export async function summarizeDocument(
  ollama: OllamaClient,
  input: AnalyzeInput,
  kunye: DocumentKunye,
): Promise<DocumentOzet> {
  return structuredJsonCall(ollama, {
    system: OZET_SYSTEM_PROMPT,
    user: `${metin(input)}\n\nCikarilmis kunye:\n${kunyeMetni(kunye)}`,
    schema: OZET_JSON_SCHEMA,
    temperature: TEMPERATURE,
    parse: (value) => DocumentOzetSchema.parse(value),
    islemAdi: "Evrak ozeti",
  });
}

/** Kunyenin ozet adimina verilen hali — yalnizca okumayi sabitleyen alanlar. */
function kunyeMetni(k: DocumentKunye): string {
  const satirlar = [`- Belge turu: ${k.docType}`, `- Talep edilen islem: ${k.islemTuru}`];
  if (k.alacakTuru) satirlar.push(`- Alacak/vergi turu: ${k.alacakTuru}`);
  if (k.entities.donemler.length) satirlar.push(`- Donemler: ${k.entities.donemler.join(", ")}`);
  if (k.entities.tutarlar.length) satirlar.push(`- Tutarlar: ${k.entities.tutarlar.join(", ")}`);
  return satirlar.join("\n");
}
