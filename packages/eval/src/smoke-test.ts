/**
 * Faz 0 smoke test — tum altyapi servislerinin ayakta oldugunu dogrular.
 * Calistir: pnpm smoke
 *
 * Kontrollerin kendisi smoke/checks/ altinda; burada yalnizca kosum,
 * rapor ve cikis kodu var.
 */
import { checks } from "./smoke/checks/index.ts";
import { runChecks } from "./smoke/run.ts";
import { printSmokeReport } from "./smoke/report.ts";

const results = await runChecks(checks);
printSmokeReport(results);

// Basarisiz servis varsa sifirdan farkli cikis: CI ve betikler bunu okur.
if (results.some((r) => !r.ok)) process.exit(1);
