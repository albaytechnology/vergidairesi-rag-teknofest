import { config } from "@albay/shared";
import type { Check } from "../types.ts";

/** Faz 5b — calismiyorsa uyari niteliginde: CLI akislari API'siz de calisir. */
export const apiCheck: Check = {
  name: "API",
  async run() {
    const res = await fetch(`http://${config.API_HOST}:${config.API_PORT}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `ayakta — :${config.API_PORT}`;
  },
};
