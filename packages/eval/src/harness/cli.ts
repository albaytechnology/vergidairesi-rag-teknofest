import { DEFAULT_TARGET, resolveTarget, targetNames } from "../targets/registry.ts";
import type { EvalTarget } from "@albay/shared";

/** `pnpm eval -- --target agent` -> "agent" */
export function parseTargetName(argv: string[] = process.argv): string {
  const i = argv.indexOf("--target");
  return (i >= 0 ? argv[i + 1] : undefined) ?? DEFAULT_TARGET;
}

/** Hedefi cozer; bilinmeyen adda kullanilabilir hedefleri yazip cikar. */
export function requireTarget(name: string): EvalTarget {
  const target = resolveTarget(name);
  if (!target) {
    console.error(`Bilinmeyen hedef: ${name}. Mevcut: ${targetNames().join(", ")}`);
    process.exit(1);
  }
  return target;
}
