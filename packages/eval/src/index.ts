/**
 * Eval paketi — sistemin ne kadar iyi cevap verdigini olcen katman.
 *
 *   golden/   soru seti (veri + tipler + yukleyici)
 *   targets/  olculecek sistemler; hepsi ayni EvalTarget arayuzunu konusur
 *   scoring/  cevap -> puan donusumu (saf fonksiyonlar)
 *   harness/  golden set'i hedefe kosan dongu ve konsol raporu
 *   smoke/    altyapi servisleri ayakta mi kontrolleri
 *
 * CLI girisleri: run-eval.ts (pnpm eval), smoke-test.ts (pnpm smoke)
 */
export { loadGoldenSet } from "./golden/load.ts";
export type { GoldenQuestion, GoldenSet, Scenario } from "./golden/types.ts";

export { targets, targetNames, resolveTarget, DEFAULT_TARGET } from "./targets/registry.ts";
export { ragflowTarget } from "./targets/ragflow.ts";
export { newSystemTarget } from "./targets/new-system.ts";
export { agentTarget } from "./targets/agent.ts";

export { gradeAnswer, gradeFailure } from "./scoring/grade.ts";
export { summarize } from "./scoring/summarize.ts";
export type { QuestionResult, EvalSummary } from "./scoring/types.ts";

export { runEval } from "./harness/run.ts";
export { printEvalHeader, printEvalReport, printProgress } from "./harness/report.ts";

export { runChecks } from "./smoke/run.ts";
export { checks } from "./smoke/checks/index.ts";
export { printSmokeReport } from "./smoke/report.ts";
export type { Check, CheckResult } from "./smoke/types.ts";
