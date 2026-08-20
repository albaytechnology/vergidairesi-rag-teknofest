/**
 * Golden set eval harness — CLI girisi.
 * Calistir: pnpm eval -- --target ragflow|new|agent
 *
 * Buradaki tek is akisi baglamak: soru setini yukle, hedefi coz, kosumu
 * calistir, raporu bas. Puanlama scoring/, kosum harness/ altinda.
 */
import { loadGoldenSet } from "./golden/load.ts";
import { parseTargetName, requireTarget } from "./harness/cli.ts";
import { runEval } from "./harness/run.ts";
import { printEvalHeader, printEvalReport, printProgress } from "./harness/report.ts";
import { summarize } from "./scoring/summarize.ts";

const { questions } = loadGoldenSet();
const target = requireTarget(parseTargetName());

printEvalHeader(target.name, questions.length);
const rows = await runEval(target, questions, { onProgress: printProgress });
printEvalReport(rows, summarize(rows));
