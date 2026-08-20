import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GoldenSet } from "./types.ts";

const SET_FILE = "golden-set.json";

/**
 * Soru setini diskten okur.
 *
 * JSON import yerine readFileSync: set calisma aninda (tsx ile, derlemesiz)
 * duzenlenebilsin ve dosya yolu her zaman bu modulun yaninda olsun diye.
 */
export function loadGoldenSet(): GoldenSet {
  const dir = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(dir, SET_FILE), "utf-8")) as GoldenSet;
}
