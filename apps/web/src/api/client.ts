import type {
  ArchiveResponse,
  ChatMessage,
  DocumentSummary,
  LetterDecision,
  LetterDraftResponse,
  LetterModel,
  ServicesResponse,
  UploadStatus,
} from "./types.ts";

/**
 * Tum istekler GORELI yol kullanir: dev'de Vite /api'yi Fastify'a vekiller,
 * uretimde arayuz API ile ayni kokten servis edilir. Boylece ortama gore
 * degisen bir taban URL yapilandirmasi gerekmiyor.
 */
async function istek<T>(yol: string, init?: RequestInit): Promise<T> {
  const res = await fetch(yol, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(await hataMesaji(res));
  return (await res.json()) as T;
}

/** Sunucunun yapisal hatasini kullaniciya gosterilebilir tek cumleye indirger. */
async function hataMesaji(res: Response): Promise<string> {
  try {
    const govde = (await res.json()) as { error?: string; detay?: unknown };
    if (govde.error) return govde.error;
  } catch {
    /* JSON degilse asagidaki genel mesaja duser */
  }
  return `İstek başarısız (HTTP ${res.status})`;
}

export const api = {
  services: () => istek<ServicesResponse>("/api/services"),

  documents: (servis: string | null) =>
    istek<{ documents: DocumentSummary[] }>(
      `/api/documents?service=${encodeURIComponent(servis ?? "belirlenemedi")}`,
    ),

  /** Yazisma ve Arsiv paneli — servise gore degil, yasam dongusune gore listeler. */
  archive: (tamamlanan: boolean) =>
    istek<ArchiveResponse>(`/api/archive?durum=${tamamlanan ? "completed" : "pending"}`),

  /** "Calisan belgeyi acti" isareti; durum yalnizca ileri gider. */
  markOpened: (id: string) =>
    istek<{ ok: boolean }>(`/api/documents/${id}/open`, { method: "POST" }),

  document: (id: string) =>
    istek<{ document: DocumentSummary & { path: string }; chat: ChatMessage[] }>(
      `/api/documents/${id}`,
    ),

  documentText: (id: string) => istek<{ text: string }>(`/api/documents/${id}/text`),

  chatHistory: (id: string) => istek<{ messages: ChatMessage[] }>(`/api/documents/${id}/chat`),

  reroute: (id: string, servis?: string, gerekce?: string) =>
    istek<{ document: DocumentSummary }>(`/api/documents/${id}/reroute`, {
      method: "POST",
      body: JSON.stringify(servis ? { servis, gerekce } : {}),
    }),

  upload: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("file", f);
    return istek<{
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
    return istek<{ kuyruga_eklendi: boolean; path: string; filename: string }>(
      `/api/session-upload?sessionId=${encodeURIComponent(sessionId)}`,
      { method: "POST", body: form },
    );
  },

  uploadStatus: (paths: string[]) =>
    istek<{ durumlar: UploadStatus[] }>(
      `/api/documents/status?paths=${encodeURIComponent(paths.join("\n"))}`,
    ),

  draftLetter: (girdi: {
    docId: string;
    karar: LetterDecision;
    gerekce?: string;
    muhatap?: { ad?: string; tur?: "kisi" | "kurum"; adres?: string; vknTckn?: string };
    kaydet?: boolean;
  }) =>
    istek<LetterDraftResponse>("/api/response-letter", {
      method: "POST",
      body: JSON.stringify(girdi),
    }),

  letters: (id: string) =>
    istek<{
      letters: { id: string; karar: string; gerekce: string | null; sayi: string | null; createdAt: string }[];
    }>(`/api/documents/${id}/letters`),

  /** PDF/DOCX ikili doner — JSON degil, blob olarak indirilir. */
  letterFile: async (
    bicim: "pdf" | "docx",
    govde: { html: string; docId?: string; karar?: LetterDecision } | { model: LetterModel },
    dosyaAdi: string,
  ): Promise<Blob> => {
    const res = await fetch(`/api/response-letter/${bicim}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...govde, dosyaAdi }),
    });
    if (!res.ok) throw new Error(await hataMesaji(res));
    return res.blob();
  },
};

/** Blob'u tarayiciya indirtir. */
export function indir(blob: Blob, dosyaAdi: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi;
  a.click();
  URL.revokeObjectURL(url);
}
