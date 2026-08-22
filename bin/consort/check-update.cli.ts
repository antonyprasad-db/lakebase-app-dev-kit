#!/usr/bin/env node
// consort-check-update: print a notice if a newer Consort is published, with the exact
// update commands. Throttled (once/day) + silent-fail + bounded network, like telemetry ,
// so /consort:start can call it every time without cost or risk. Prints nothing when
// up-to-date, offline, or on any error.
//
// Usage: consort-check-update [--force]   (--force bypasses the once/day throttle)
// Exit code is ALWAYS 0: this must never fail a caller.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { checkForUpdate } from "../../consort/update/check-update.js";

/** The kit's own installed version, read from its package.json (packageRoot/package.json). */
function installedVersion(): string {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function runCheckUpdate(argv: string[]): number {
  try {
    const force = argv.includes("--force");
    const r = checkForUpdate({ installedVersion: installedVersion(), force });
    if (r.notice) process.stdout.write(r.notice);
    else if (force) process.stdout.write(`[consort] Up to date (${r.installed}${r.latest ? `, latest ${r.latest}` : ""}).\n`);
  } catch {
    /* never fail the caller */
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runCheckUpdate(process.argv.slice(2)));
}
