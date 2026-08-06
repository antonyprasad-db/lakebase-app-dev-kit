#!/usr/bin/env node
// CLI surface for the SINGLE point of entry that resolves a project's runtime
// artifact dir: resolveConsortDir (prefer .consort, fall back through legacy
// .sftdd / .tdd). Lets bash callers (the smoke orchestrators in particular)
// derive the dir from the ONE rule instead of hardcoding an artifact-root name
// in shell, so a future rename of the artifact root only changes consort-paths.ts.
//
// Usage:
//   lakebase-resolve-consort-dir [--project-dir <dir>]
//   (aliases: lakebase-resolve-sftdd-dir)
// Prints the absolute runtime artifact dir to stdout (default project-dir: cwd).

import { resolveConsortDir } from "../../consort/config/consort-paths.js";

function parseProjectDir(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-dir" && i + 1 < argv.length) return argv[i + 1];
    if (argv[i] === "-h" || argv[i] === "--help") {
      process.stdout.write("Usage: lakebase-resolve-consort-dir [--project-dir <dir>]\n");
      process.exit(0);
    }
  }
  return undefined;
}

const projectDir = parseProjectDir(process.argv.slice(2));
process.stdout.write(resolveConsortDir(projectDir ?? process.cwd()) + "\n");
