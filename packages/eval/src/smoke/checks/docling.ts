import { config } from "@albay/shared";
import type { Check } from "../types.ts";

export const doclingCheck: Check = {
  name: "Docling",
  async run() {
    const res = await fetch(`${config.DOCLING_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return "ayakta";
  },
};
