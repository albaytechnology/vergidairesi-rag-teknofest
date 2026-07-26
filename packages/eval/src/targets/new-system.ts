import { hybridSearch } from "@albay/retrieval";
import { OllamaClient } from "@albay/llm";
import type { EvalTarget } from "@albay/shared";

/**
 * Yeni sistemin eval hedefi (Faz 4 hali):
 * hybrid retrieval + Qwen ile kaynakli cevap.
 * Faz 5'te multi-agent graph bunun yerini alacak — arayuz ayni kalacak.
 */
const SYSTEM_PROMPT = `Sen Albay Teknoloji'nin kurumsal dokuman asistanisin.
Sana bir soru ve dokumanlardan getirilen parcalar verilecek.

Kurallar:
1. SADECE verilen parcalardaki bilgiye dayan. Parcalarda olmayan bilgiyi ASLA uydurma.
2. Cevabin dayandigi her dosyayi cevabin sonunda "Kaynaklar:" satirinda listele.
3. Soru parcalardaki bilgiyle cevaplanamiyorsa aynen su ifadeyi kullan:
   "Bu bilgi dokumanlarda bulunamadi."
4. Turkce, net ve kisa cevap ver.`;

export const newSystemTarget: EvalTarget = {
  name: "new",
  async ask(question: string) {
    const ollama = new OllamaClient();
    const hits = await hybridSearch(question, { topK: 8, filters: { includePII: true } });

    if (!hits.length) {
      return { answer: "Bu bilgi dokumanlarda bulunamadi.", sources: [] };
    }

    const context = hits
      .map((h, i) => `--- Parca ${i + 1} (${h.filename}${h.page != null ? `, s.${h.page}` : ""}) ---\n${h.text}`)
      .join("\n\n");

    const answer = await ollama.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Soru: ${question}\n\nDokuman parcalari:\n${context}` },
    ]);

    const sources = [...new Set(hits.map((h) => h.path || h.filename))];
    return { answer, sources };
  },
};
