/**
 * Evrak sohbetinde niyet ayrimi: soru mu, cevap yazisi talebi mi?
 *
 * Calisan sohbete "onaylayacak sekilde cevap yazisi yaz" yazdiginda dogru cikti
 * duz metin bir sohbet cevabi DEGIL; resmi sablonla uretilen, sayi/imza bloklu,
 * PDF/DOCX'e cikan bir yazi. Bu ayrimi burada yapiyoruz ki rota RAG'a hic
 * girmeden arayuze "cevap yazisi alanini ac" diyebilsin.
 *
 * Sinif, graph'taki ROUTER_PROMPT'tan bagimsizdir: o siniflandirici korpus
 * genelinde hangi ajanin calisacagini secer ve belge kapsamli sohbette hic
 * calismaz.
 */
import { OllamaClient } from "@albay/llm";
import { ChatIntentSchema, type LetterDecision } from "@albay/shared";
import { CHAT_INTENT_PROMPT, CHAT_INTENT_SCHEMA } from "./prompts.ts";
import { trNormalize } from "./routing.ts";

const ollama = new OllamaClient();

export interface ChatIntent {
  tur: "soru" | "cevap_yazisi";
  /** Yazinin karari — mesajdan cikarilabildiyse. */
  karar: LetterDecision | null;
  /** Kararin mesajda gecen sebebi — uydurulmaz, yoksa null. */
  gerekce: string | null;
}

const SORU: ChatIntent = { tur: "soru", karar: null, gerekce: null };

/**
 * Modeli calistirmaya deger mi?
 *
 * Sohbetin ezici cogunlugu duz soru; her mesaj icin siniflandirici cagirmak
 * yerel Ollama'da ilk token'a kadar yarim saniye kadar ekliyor. Bu liste bir ON
 * ELEMEDIR, karar degil: KOKLERDEN olusur ve BOL tutulur — yanlis pozitifin
 * bedeli yalnizca bir model cagrisi (model zaten "soru" diyor), yanlis
 * negatifin bedeli ise ozelligin hic calismamasi.
 */
const YAZI_KOKLERI = [
  "yaz", // yazi, yazisi, yaziyi, yazilsin…
  "taslak",
  "tebli", // tebligat, teblig
  "muhatap",
  "onay", // onayla, onaylayacak
  "red", // reddet, red
  "cevap",
  "olumlu",
  "olumsuz",
  "dilekce",
];

function yaziIhtimaliVar(question: string): boolean {
  const normalized = trNormalize(question);
  return YAZI_KOKLERI.some((kok) => normalized.includes(kok));
}

/**
 * Mesajin niyetini belirler.
 *
 * HATAYA ACIK (fail-open): model erisilemezse, sema tutmazsa ya da yanit
 * ayristirilamazsa "soru" doner. Siniflandirici bir kolaylik katmani; sohbetin
 * kendisini asla kirmamali.
 */
export async function classifyChatIntent(question: string): Promise<ChatIntent> {
  if (!yaziIhtimaliVar(question)) return SORU;

  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      const raw = await ollama.chat(
        [
          { role: "system", content: CHAT_INTENT_PROMPT },
          { role: "user", content: question.slice(0, 2000) },
        ],
        {
          format: CHAT_INTENT_SCHEMA as unknown as Record<string, unknown>,
          temperature: 0.1,
        },
      );
      const parsed = ChatIntentSchema.parse(JSON.parse(raw));
      if (parsed.tur !== "cevap_yazisi") return SORU;
      return {
        tur: "cevap_yazisi",
        karar: parsed.karar ?? null,
        gerekce: parsed.gerekce?.trim() || null,
      };
    } catch {
      /* sonraki denemeye gec; iki deneme de duserse asagida "soru" doner */
    }
  }
  return SORU;
}
