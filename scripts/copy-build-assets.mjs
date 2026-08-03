#!/usr/bin/env node
// Copy non-TS runtime assets into dist/ after the tsup compile.
//
// tsup compiles TS -> JS but does NOT copy sibling data files. Several
// substrate modules read JSON data at runtime by path relative to their
// compiled location: schema-loader.ts -> scripts/sftdd/schemas/*.schema.json;
// scm-workflow-state + uc-resources read their schemas similarly; and
// step-manifest.ts reads scripts/sftdd/step-manifests/*.json (the DATA face of
// each step). Without this copy, those files are absent from dist/ and a
// CONSUMER install (which ships pre-built dist/ and never rebuilds) hits ENOENT
// at runtime. The schema bug stayed latent until artifact-conformance made the
// mock approver the first consumer-context schema reader.
//
// Wired as tsup `onSuccess`, so `npm run build` always produces a complete
// dist/. The dev clone commits dist/ at release time, so consumers get the
// assets without rebuilding.

import { readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, relative, sep as SEP } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = join(REPO_ROOT, "scripts");
const DIST_ROOT = join(REPO_ROOT, "dist", "scripts");

/** Recursively collect files under dir matching the predicate (name, fullPath). */
function collect(dir, pred, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, pred, out);
    else if (pred(entry, full)) out.push(full);
  }
  return out;
}

// Every *.schema.json anywhere under scripts/, PLUS every *.json under a
// step-manifests/ directory (the step manifests are plain .json, not *.schema.json).
const assets = collect(SRC_ROOT, (name, full) => {
  if (name.endsWith(".schema.json")) return true;
  if (name.endsWith(".json") && dirname(full).endsWith(`${SEP}step-manifests`)) return true;
  return false;
});
let copied = 0;
for (const src of assets) {
  const dest = join(DIST_ROOT, relative(SRC_ROOT, src));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
}
process.stderr.write(`[copy-build-assets] copied ${copied} schema asset(s) into dist/scripts/\n`);
