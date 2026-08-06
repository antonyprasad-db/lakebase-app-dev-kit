#!/usr/bin/env node
// Copy non-TS runtime assets into dist/ after the tsup compile.
//
// tsup compiles TS -> JS but does NOT copy sibling data files. Several substrate
// modules read JSON SCHEMAS at runtime by path relative to their compiled location
// (schema-loader.ts -> consort/config/schemas/*.schema.json; scm-workflow-state +
// uc-resources read their schemas similarly). Without this copy, those files are
// absent from dist/ and a CONSUMER install (which ships pre-built dist/ and never
// rebuilds) hits ENOENT at runtime. The bug stayed latent until artifact-conformance
// made the mock approver the first consumer-context schema reader.
//
// NOTE: the orchestrator STEP MANIFESTS are NOT copied here , they are imported as
// JSON modules in step-manifest.ts, so the bundler inlines them into the build. No
// runtime fs read, no dist path to keep in sync (that copy was an antipattern).
//
// Wired as tsup `onSuccess`, so `npm run build` always produces a complete
// dist/. The dev clone commits dist/ at release time, so consumers get the
// assets without rebuilding.

import { readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Source trees that may hold runtime *.schema.json (post-foliation the schemas live in
// consort/config/schemas/; scripts/ is kept in case any residual asset lands there). Each is
// mirrored into dist/ preserving its repo-relative path, so the compiled reader's runtime path
// resolution (schema-loader walks to <root>/consort/config/schemas) finds the copy.
const SRC_ROOTS = ["consort", "scripts"].map((d) => join(REPO_ROOT, d));
const DIST_ROOT = join(REPO_ROOT, "dist");

/** Recursively collect files under dir matching the predicate (name, fullPath). */
function collect(dir, pred, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, pred, out);
    else if (pred(entry, full)) out.push(full);
  }
  return out;
}

// Every *.schema.json under the source roots, mirrored to dist/ at the same repo-relative path
// (e.g. consort/config/schemas/x.schema.json -> dist/consort/config/schemas/x.schema.json).
let copied = 0;
for (const root of SRC_ROOTS) {
  for (const src of collect(root, (name) => name.endsWith(".schema.json"))) {
    const dest = join(DIST_ROOT, relative(REPO_ROOT, src));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied++;
  }
}
process.stderr.write(`[copy-build-assets] copied ${copied} schema asset(s) into dist/\n`);
