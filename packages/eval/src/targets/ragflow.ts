import { config, type EvalTarget } from "@albay/shared";

/**
 * RAGFlow baseline adaptoru.
 *
 * RAGFlow'un HTTP API'si uzerinden soru sorar. Kurulumuna gore iki yol var:
 *  1. Chat Assistant API (onerilen): RAGFlow arayuzunde bir assistant olustur,
 *     API key al (.env -> RAGFLOW_API_KEY) ve asagidaki chatId'yi doldur.
 *  2. OpenAI-uyumlu endpoint: RAGFlow >= 0.17 'de /api/v1/chats_openai/{chat_id}
 *
 * NOT: RAGFlow surumune gore endpoint degisebilir — smoke asamasinda birlikte
 * dogrulayacagiz. Simdilik iskelet.
 */
const CHAT_ID = process.env.RAGFLOW_CHAT_ID ?? "";

export const ragflowTarget: EvalTarget = {
  name: "ragflow",
  async ask(question: string) {
    if (!config.RAGFLOW_BASE_URL || !config.RAGFLOW_API_KEY || !CHAT_ID) {
      throw new Error(
        "RAGFlow yapilandirmasi eksik: .env icinde RAGFLOW_BASE_URL, RAGFLOW_API_KEY ve RAGFLOW_CHAT_ID gerekli",
      );
    }
    const res = await fetch(
      `${config.RAGFLOW_BASE_URL}/api/v1/chats_openai/${CHAT_ID}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.RAGFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          model: "ragflow",
          messages: [{ role: "user", content: question }],
          stream: false,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`RAGFlow API hatasi: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const answer = data.choices[0]?.message.content ?? "";

    // RAGFlow OpenAI-uyumlu endpoint kaynak listesi dondurmez;
    // kaynaklari cevap metnindeki dosya adi referanslarindan yakalamayi deneriz.
    // Gerekirse RAGFlow'un native /completions API'sine gecip reference alanini kullanacagiz.
    const sources: string[] = [];
    return { answer, sources };
  },
};
