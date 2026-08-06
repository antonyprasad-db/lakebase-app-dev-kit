#!/usr/bin/env node

// consort/lakebase/adopt-consort.ts
import * as fs2 from "fs";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];

// consort/lakebase/adopt-consort.ts
import * as path from "path";
import { fileURLToPath } from "url";
function adoptTdd(args) {
  if (!fs2.existsSync(args.projectDir)) {
    throw new Error(`Project directory does not exist: ${args.projectDir}`);
  }
  if (!fs2.existsSync(path.join(args.projectDir, ".git"))) {
    throw new Error(
      `Not a git repo root: ${args.projectDir}. Run \`git init\` first, or pass a path that already has \`.git/\`.`
    );
  }
  const dest = path.join(args.projectDir, ARTIFACT_ROOT);
  const update = args.update === true || args.force === true;
  if (fs2.existsSync(dest) && !update) {
    throw new Error(
      `${ARTIFACT_ROOT}/ already exists at ${dest}. Re-run with --update to refresh missing files (drift is reported, not overwritten) or --update --force to overwrite drifted ones.`
    );
  }
  const src = args.bootstrapDir ?? findBootstrapDir();
  const entries = walkTemplateTree(src);
  const added = [];
  const inSync = [];
  const drifted = [];
  const updated = [];
  for (const rel of entries) {
    const fromPath = path.join(src, rel);
    const toPath = path.join(dest, rel);
    if (!fs2.existsSync(toPath)) {
      if (!args.dryRun) {
        fs2.mkdirSync(path.dirname(toPath), { recursive: true });
        fs2.copyFileSync(fromPath, toPath);
      }
      added.push(rel);
      continue;
    }
    const before = fs2.readFileSync(fromPath);
    const after = fs2.readFileSync(toPath);
    if (before.equals(after)) {
      inSync.push(rel);
      continue;
    }
    if (args.force) {
      if (!args.dryRun) {
        fs2.copyFileSync(fromPath, toPath);
      }
      updated.push(rel);
    } else {
      drifted.push(rel);
    }
  }
  return {
    added,
    inSync,
    drifted,
    updated,
    noChanges: added.length === 0 && updated.length === 0
  };
}
function walkTemplateTree(root) {
  if (!fs2.existsSync(root)) {
    throw new Error(`sftdd-bootstrap template tree missing: ${root}`);
  }
  const out = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    for (const entry of fs2.readdirSync(abs)) {
      const childRel = rel ? path.join(rel, entry) : entry;
      const childAbs = path.join(abs, entry);
      const stat = fs2.statSync(childAbs);
      if (stat.isDirectory()) {
        stack.push(childRel);
      } else {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}
var cachedBootstrapDir;
function findBootstrapDir() {
  if (cachedBootstrapDir) return cachedBootstrapDir;
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "templates", "sftdd-bootstrap", ARTIFACT_ROOT);
    if (fs2.existsSync(candidate)) {
      cachedBootstrapDir = candidate;
      return cachedBootstrapDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/sftdd-bootstrap/.sftdd relative to ${here}. Pass explicit { bootstrapDir } to override.`
  );
}

// bin/lakebase/adopt-consort.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--update":
        out.update = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("-") && !out.projectDir) {
          out.projectDir = a;
        }
        break;
    }
  }
  return out;
}
var HELP = `lakebase-adopt-consort \u2013 bootstrap the .consort/ workflow tree on an existing repo
(aliases: lakebase-adopt-sftdd, lakebase-adopt-tdd)

Usage:
  lakebase-adopt-consort [path]                     fresh adoption; fails if .consort/ exists
  lakebase-adopt-consort [path] --update            report drift, add missing files
  lakebase-adopt-consort [path] --update --force    additionally overwrite drifted files
  lakebase-adopt-consort [path] --dry-run --update  preview without writing

Flags:
  --project-dir <path>, -C <path>   Project root (defaults to current directory)
  --update                          Allow running on a project that already has .consort/
  --force                           Overwrite drifted template files (implies --update)
  --dry-run                         Report what would change; write nothing
  --help, -h                        Show this help

Output: JSON to stdout: { added, inSync, drifted, updated, noChanges }
       Exit codes:
         0 - success (whether or not changes were applied)
         1 - operational failure (not a git repo, .tdd/ exists without --update, etc.)
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const input = {
    projectDir: args.projectDir ?? process.cwd(),
    update: args.update,
    force: args.force,
    dryRun: args.dryRun
  };
  const result = adoptTdd(input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=adopt-consort.cli.js.map