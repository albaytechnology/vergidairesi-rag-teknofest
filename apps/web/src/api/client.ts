import type {
  ArchiveResponse,
  ChatMessage,
  DocumentSummary,
  LetterDecision,
  LetterDraftResponse,
  LetterModel,
  LetterSaveResponse,
  ServicesResponse,
  UploadStatus,
} from "./types.ts";

/**
 * Tum istekler GORELI yol kullanir: dev'de Vite /api'yi Fastify'a vekiller,
 * uretimde arayuz API ile ayni kokten servis edilir. Boylece ortama gore
 * degisen bir taban URL yapilandirmasi gerekmiyor.
 *
 * NOT: govde alan adlari (karar, gerekce, muhatap…) sunucu sozlesmesidir ve
 * Turkce kalir; burada Ingilizcelestirilen sey yalnizca istemci tarafindaki
 * fonksiyon ve parametre adlaridir.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

/** Sunucunun yapisal hatasini kullaniciya gosterilebilir tek cumleye indirger. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; detay?: unknown };
    if (body.error) return body.error;
  } catch {
    /* JSON degilse asagidaki genel mesaja duser */
  }
  return `İstek başarısız (HTTP ${res.status})`;
}

export const api = {
  services: () => request<ServicesResponse>("/api/services"),

  documents: (service: string | null) =>
    request<{ documents: DocumentSummary[] }>(
      `/api/documents?service=${encodeURIComponent(service ?? "belirlenemedi")}`,
    ),

  /** Yazisma ve Arsiv paneli — servise gore degil, yasam dongusune gore listeler. */
  archive: (completed: boolean) =>
    request<ArchiveResponse>(`/api/archive?durum=${completed ? "completed" : "pending"}`),

  /** "Calisan belgeyi acti" isareti; durum yalnizca ileri gider. */
  markOpened: (id: string) =>
    request<{ ok: boolean }>(`/api/documents/${id}/open`, { method: "POST" }),

  document: (id: string) =>
    request<{ document: DocumentSummary & { path: string }; chat: ChatMessage[] }>(
      `/api/documents/${id}`,
    ),

  documentText: (id: string) => request<{ text: string }>(`/api/documents/${id}/text`),

  chatHistory: (id: string) => request<{ messages: ChatMessage[] }>(`/api/documents/${id}/chat`),

  reroute: (id: string, service?: string, reason?: string) =>
    request<{ document: DocumentSummary }>(`/api/documents/${id}/reroute`, {
      method: "POST",
      body: JSON.stringify(service ? { servis: service, gerekce: reason } : {}),
    }),

  upload: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("file", f);
    return request<{
      kuyruga_eklenen: number;
      dosyalar: { path: string; filename: string }[];
      reddedilen: { filename: string; sebep: string }[];
    }>("/api/upload", { method: "POST", body: form });
  },

  /**
   * Oturuma ozel ek belge (chat ataci).
   *
   * Ana korpusa "resmi evrak" olarak girmez: worker sessionId'yi belgeye
   * kalici olarak yazar ve analiz/yonlendirmeyi atlar, dolayisiyla belge
   * hicbir servis havuzuna dusmez. Hazir olmasi uploadStatus ile yoklanir.
   */
  sessionUpload: (sessionId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ kuyruga_eklendi: boolean; path: string; filename: string }>(
      `/api/session-upload?sessionId=${encodeURIComponent(sessionId)}`,
      { method: "POST", body: form },
    );
  },

  uploadStatus: (paths: string[]) =>
    request<{ durumlar: UploadStatus[] }>(
      `/api/documents/status?paths=${encodeURIComponent(paths.join("\n"))}`,
    ),

  draftLetter: (input: {
    docId: string;
    karar: LetterDecision;
    gerekce?: string;
    muhatap?: { ad?: string; tur?: "kisi" | "kurum"; adres?: string; vknTckn?: string };
  }) =>
    request<LetterDraftResponse>("/api/response-letter", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Yaziyi kaydeder ve sira numarasini verir. Taslagi yeniden uretmez; ekrandaki
   * model oldugu gibi gonderilir ki elle yapilan duzeltmeler kayda gecsin.
   */
  saveLetter: (input: {
    docId: string;
    karar: LetterDecision;
    gerekce?: string;
    model: LetterModel;
  }) =>
    request<LetterSaveResponse>("/api/response-letter/kaydet", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  letters: (id: string) =>
    request<{
      letters: { id: string; karar: string; gerekce: string | null; sayi: string | null; createdAt: string }[];
    }>(`/api/documents/${id}/letters`),

  /** PDF/DOCX ikili doner — JSON degil, blob olarak indirilir. */
  letterFile: async (
    format: "pdf" | "docx",
    body: { html: string; docId?: string; karar?: LetterDecision } | { model: LetterModel },
    filename: string,
  ): Promise<Blob> => {
    const res = await fetch(`/api/response-letter/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, dosyaAdi: filename }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.blob();
  },
};

/** Blob'u tarayiciya indirtir. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
