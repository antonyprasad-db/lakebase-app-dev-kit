import { defineConfig } from "tsup";

// Dual-format build: emit both ESM (.js, since package.json type=module) and
// CJS (.cjs) so the lakebase-scm-extension (CommonJS + webpack) can consume
// without ESM-interop pain on default imports of CJS deps like tweetsodium.
//
// Output structure mirrors the source so the package.json exports map keeps
// stable paths like ./dist/scripts/lakebase/index.{js,cjs}.

export default defineConfig({
  entry: {
    // The substrate barrels + SCM/branch/connection/schema-migrate/scaffold CLIs
    // now live in @databricks-solutions/lakebase-scm-utils and are declared as
    // bins pointing into node_modules there (see package.json "bin"). This kit
    // builds only its own top barrel (re-export of the package), the SFTDD
    // orchestration CLIs, the SFTDD-coupled scaffolders that stay here, and the
    // MCP server.
    "scripts/index": "scripts/index.ts",
    "bin/lakebase/create-project.cli": "bin/lakebase/create-project.cli.ts",
    "bin/lakebase/adopt-sftdd.cli": "bin/lakebase/adopt-sftdd.cli.ts",
    "bin/lakebase/resolve-sftdd-dir.cli": "bin/lakebase/resolve-sftdd-dir.cli.ts",
    "bin/lakebase/update-commands.cli": "bin/lakebase/update-commands.cli.ts",
    "bin/lakebase/update-agents.cli": "bin/lakebase/update-agents.cli.ts",
    "bin/sftdd/feature-status.cli": "bin/sftdd/feature-status.cli.ts",
    "bin/sftdd/next.cli": "bin/sftdd/next.cli.ts",
    "bin/sftdd/test-list.cli": "bin/sftdd/test-list.cli.ts",
    "bin/sftdd/spec-sync.cli": "bin/sftdd/spec-sync.cli.ts",
    "bin/sftdd/human-proxy.cli": "bin/sftdd/human-proxy.cli.ts",
    "bin/sftdd/intake.cli": "bin/sftdd/intake.cli.ts",
    "bin/sftdd/deploy.cli": "bin/sftdd/deploy.cli.ts",
    "bin/sftdd/gate-conformance.cli": "bin/sftdd/gate-conformance.cli.ts",
    "bin/sftdd/agent-log.cli": "bin/sftdd/agent-log.cli.ts",
    "bin/sftdd/timing-report.cli": "bin/sftdd/timing-report.cli.ts",
    "bin/sftdd/drive-log-report.cli": "bin/sftdd/drive-log-report.cli.ts",
    "bin/sftdd/contract-clean.cli": "bin/sftdd/contract-clean.cli.ts",
    "bin/sftdd/sync-backlog.cli": "bin/sftdd/sync-backlog.cli.ts",
    "bin/sftdd/approve-gate.cli": "bin/sftdd/approve-gate.cli.ts",
    "bin/sftdd/project-canon-notes.cli": "bin/sftdd/project-canon-notes.cli.ts",
    "bin/sftdd/migration-app-clean.cli": "bin/sftdd/migration-app-clean.cli.ts",
    "bin/sftdd/imports-clean.cli": "bin/sftdd/imports-clean.cli.ts",
    "bin/sftdd/layering-clean.cli": "bin/sftdd/layering-clean.cli.ts",
    "bin/sftdd/ux-clean.cli": "bin/sftdd/ux-clean.cli.ts",
    "bin/sftdd/optimize.cli": "bin/sftdd/optimize.cli.ts",
    "bin/sftdd/optimize-apply.cli": "bin/sftdd/optimize-apply.cli.ts",
    // Internal per-role sweep harness (NOT a published bin , see package.json: no bin entry).
    // Built to dist only so the scripts/optimize-role.sh runbook can run the CJS build (the
    // shared schema-loader uses __dirname, which tsx's ESM loader leaves undefined).
    "tests/optimization/optimize-role.cli": "tests/optimization/optimize-role.cli.ts",
    "bin/sftdd/agent-models.cli": "bin/sftdd/agent-models.cli.ts",
    "bin/sftdd/story-pipeline.cli": "bin/sftdd/story-pipeline.cli.ts",
    "bin/sftdd/cycle.cli": "bin/sftdd/cycle.cli.ts",
    "bin/sftdd/response-formatter.cli": "bin/sftdd/response-formatter.cli.ts",
    "bin/sftdd/scenario-conditions.cli": "bin/sftdd/scenario-conditions.cli.ts",
    "bin/sftdd/story-experiment.cli": "bin/sftdd/story-experiment.cli.ts",
    "bin/sftdd/drive.cli": "bin/sftdd/drive.cli.ts",
    "bin/sftdd/claude-runner": "consort/orchestrator/drive/claude-runner.ts",
    "bin/sftdd/spike.cli": "bin/sftdd/spike.cli.ts",
    "apps/mcp-server/index": "apps/mcp-server/index.ts",
    "apps/mcp-server/dump-tools": "apps/mcp-server/dump-tools.ts",
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  target: "node20",
  dts: true,
  clean: true,
  // tsup compiles TS only; copy *.schema.json runtime assets into dist/ so
  // consumer installs (which ship pre-built dist/ and never rebuild) can read
  // them. Without this, schema-loader / scm-workflow-state hit ENOENT.
  onSuccess: "node scripts/copy-build-assets.mjs",
  sourcemap: true,
  splitting: false,
  // `shims: true` makes esbuild inject pathToFileURL(__filename).href for
  // `import.meta.url` in the CJS build (and the inverse for ESM). Without
  // it, `import.meta.url` is undefined at runtime in the CJS bundle, which
  // breaks scaffold.ts's findTemplatesDir + sibling helpers when called
  // from a CJS consumer like lakebase-scm-extension. Required for dual-
  // format reach.
  shims: true,
});
