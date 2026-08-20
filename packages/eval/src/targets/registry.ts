import type { EvalTarget } from "@albay/shared";
import { ragflowTarget } from "./ragflow.ts";
import { newSystemTarget } from "./new-system.ts";
import { agentTarget } from "./agent.ts";

/**
 * Kayitli eval hedefleri.
 *
 * Hepsi ayni arayuzu (EvalTarget) konusur; boylece ayni golden set, baseline
 * (ragflow) ile yeni sistemi karsilastirilabilir sekilde olcer.
 */
export const targets: Record<string, EvalTarget> = {
  ragflow: ragflowTarget,
  new: newSystemTarget,
  agent: agentTarget,
};

export const DEFAULT_TARGET = "ragflow";

export function targetNames(): string[] {
  return Object.keys(targets);
}

/** Ada gore hedef bulur; bilinmeyen ad icin undefined doner. */
export function resolveTarget(name = DEFAULT_TARGET): EvalTarget | undefined {
  return targets[name];
}
