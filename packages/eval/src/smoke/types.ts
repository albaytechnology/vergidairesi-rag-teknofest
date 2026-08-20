/** Tek bir servis kontrolunun sonucu. */
export interface CheckResult {
  name: string;
  ok: boolean;
  /** Basarida kisa durum ozeti, hatada hata mesaji. */
  detail: string;
}

/**
 * Calistirilabilir bir servis kontrolu.
 *
 * run() basarili olursa rapora yazilacak ozeti dondurur, aksi halde firlatir;
 * "ayakta mi" karari boylece tek bir yerde (kosucuda) verilir.
 */
export interface Check {
  name: string;
  /** Varsayilan zaman asimini asan kontroller icin (ornegin LLM cevabi). */
  timeoutMs?: number;
  run: () => Promise<string>;
}
