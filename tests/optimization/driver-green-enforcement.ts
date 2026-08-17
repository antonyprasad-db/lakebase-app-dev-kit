// driver-green-enforcement: the per-candidate workspace setup for the driver-GREEN enforcement +
// context levers (see consort/optimize/DRIVER-GREEN-LEVERS.md). Sweep-only (not shipped runtime):
// the driver-sweep calls applyDriverLevers on each candidate's throwaway workspace BEFORE the driver
// turn. All writes land under <workspace>/.claude/ , which headless `claude -p --setting-sources
// project` loads (verified), so the hook + deny rules gate the DRIVER AGENT's tool calls only; the
// orchestrator's execSync honest-GREEN verify is untouched.

import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { load, dump } from "js-yaml";
import type { RoleLeverPatch } from "./role-levers.js";

/** Deterministic per-candidate deploy port: base + the candidate's index in the sweep. Deterministic
 *  (not OS-allocated) so there is NO allocation race / TOCTOU across the parallel pool , candidate i
 *  always owns port BASE_DEPLOY_PORT+i, unique across the whole candidate set regardless of the
 *  concurrency cap. Base 8100 (above the common :8000) to dodge a stray dev server. */
export const BASE_DEPLOY_PORT = 8100;
export function deployPortForIndex(index: number): number {
  return BASE_DEPLOY_PORT + Math.max(0, index);
}

/**
 * Give a candidate's worktree its OWN deploy port so parallel candidates never collide on the shared
 * :8000 the honest-GREEN verify would otherwise bind. Rewrites the worktree's deploy-targets.yaml
 * `local` target: `base_url` -> http://localhost:<port> AND `run` -> a uvicorn bound to <port> (the
 * scaffold's `make run` is fixed at :8000 and ignores base_url's port, so both must move together, or
 * the reachability poll targets a port nothing is serving). Per-WORKTREE file, so it is concurrency-
 * safe (no shared state) and needs NO change to the shipped deploy substrate. Returns the new base_url.
 */
export function assignWorktreePort(projectDir: string, port: number): string {
  const file = join(projectDir, "deploy-targets.yaml");
  const doc = (load(readFileSync(file, "utf8")) ?? {}) as { targets?: Record<string, Record<string, unknown>> };
  const local = doc.targets?.local;
  if (!local) throw new Error(`assignWorktreePort: no 'local' target in ${file}`);
  const baseUrl = `http://localhost:${port}`;
  local.base_url = baseUrl;
  // Bind uvicorn to the same port (preserve the scaffold's `uv run --env-file .env` prefix + app module).
  local.run = `uv run --env-file .env uvicorn app.main:app --host 127.0.0.1 --port ${port}`;
  writeFileSync(file, dump(doc), "utf8");
  return baseUrl;
}

/** The single-test-guard PreToolUse hook (E1): DENY a no-arg full-suite invocation, ALLOW a targeted
 *  `pytest <path>` / `run-tests.sh <path>`. python3 (present in the scaffold via uv) parses the tool
 *  call on stdin , no jq dependency. A command it cannot parse is ALLOWED (never block on our own
 *  parse failure). Deny is expressed as exit-0 + the documented permissionDecision JSON. */
export const SINGLE_TEST_GUARD_HOOK = `#!/usr/bin/env python3
import sys, json, re
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # unparseable -> do not block
cmd = ((data.get("tool_input") or {}).get("command") or "")
c = " ".join(cmd.strip().split())  # normalize whitespace
DENY = [
    r"^(\\./)?scripts/run-tests\\.sh$",
    r"^bash (\\./)?scripts/run-tests\\.sh$",
    r"^make test$",
    r"^npm test$",
    r"^npm (--prefix client )?run test$",
    r"^npm --prefix client test$",
]
if any(re.match(p, c) for p in DENY):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Full test suite blocked (single-test-guard). Run only the failing test: 'uv run --env-file .env pytest <path>'. The orchestrator runs the authoritative full suite post-turn (@build-cycle)."
    }}))
    sys.exit(0)
sys.exit(0)
`;

/** Relative path (under the workspace) the guard hook is written to. */
export const GUARD_HOOK_REL = ".claude/hooks/single-test-guard.py";

/** Shape of the subset of `.claude/settings.json` we write/merge. */
interface ClaudeSettings {
  permissions?: { deny?: string[]; allow?: string[]; ask?: string[] };
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
}

function readSettings(file: string): ClaudeSettings {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

/** The env patch a candidate's `ctxPack` contributes , the drive inherits these so buildContextPack
 *  turns the matching section on. Pure: enumerate only. */
export function ctxPackEnv(ctxPack: RoleLeverPatch["ctxPack"]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const s of ctxPack ?? []) {
    if (s === "db-state") env.LAKEBASE_CONSORT_CTX_DBSTATE = "1";
    if (s === "failing-test") env.LAKEBASE_CONSORT_CTX_FAILINGTEST = "1";
  }
  return env;
}

export interface AppliedLevers {
  /** Env vars to add to the driver turn's environment (from ctxPack). Belt-and-suspenders with the
   *  per-workspace marker below; the marker is the concurrency-safe source, env is the fallback. */
  env: Record<string, string>;
  /** Absolute path to the settings file written (undefined when no enforcement lever applied). */
  settingsPath?: string;
  /** Absolute path to the guard hook script (undefined when guardSuite is off). */
  hookPath?: string;
  /** Absolute path to the ctx-levers marker written (undefined when ctxPack is empty / no consortDir). */
  markerPath?: string;
}

/**
 * Apply a candidate's DRIVER-GREEN levers to a workspace: write/merge `.claude/settings.json` with the
 * deny globs (E2) and/or the single-test-guard PreToolUse hook (E1); write the per-project
 * `<consortDir>/ctx-levers.json` marker for the ctxPack sections (C1/C2, read by buildContextPack ,
 * a per-WORKSPACE file so parallel candidates never race on process env); and return the ctxPack env
 * patch (the fallback source). Idempotent + merge-preserving. `consortDir` is where the marker lands
 * (omit to skip the marker + rely on the returned env for a sequential run).
 */
export function applyDriverLevers(workspaceDir: string, levers: RoleLeverPatch, consortDir?: string): AppliedLevers {
  const env = ctxPackEnv(levers.ctxPack);
  const result: AppliedLevers = { env };

  // C1/C2: the per-workspace ctx-levers marker (race-safe toggle for buildContextPack).
  if ((levers.ctxPack?.length ?? 0) > 0 && consortDir) {
    const markerPath = join(consortDir, "ctx-levers.json");
    mkdirSync(consortDir, { recursive: true });
    writeFileSync(
      markerPath,
      JSON.stringify(
        { dbState: levers.ctxPack!.includes("db-state"), failingTest: levers.ctxPack!.includes("failing-test") },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    result.markerPath = markerPath;
  }

  const needsSettings = levers.guardSuite === true || (levers.denyBash?.length ?? 0) > 0;
  if (!needsSettings) return result;

  const settingsPath = join(workspaceDir, ".claude", "settings.json");
  const settings = readSettings(settingsPath);

  // E2: merge deny globs (dedup, preserve existing).
  if (levers.denyBash?.length) {
    const perms = (settings.permissions ??= {});
    const deny = new Set(perms.deny ?? []);
    for (const p of levers.denyBash) deny.add(p);
    perms.deny = [...deny];
  }

  // E1: write the guard hook script + register the PreToolUse matcher (dedup by command path).
  if (levers.guardSuite) {
    const hookPath = join(workspaceDir, GUARD_HOOK_REL);
    mkdirSync(dirname(hookPath), { recursive: true });
    writeFileSync(hookPath, SINGLE_TEST_GUARD_HOOK, "utf8");
    chmodSync(hookPath, 0o755);
    const hooks = (settings.hooks ??= {});
    const pre = (hooks.PreToolUse ??= []);
    const already = pre.some((m) => m.hooks?.some((h) => h.command === hookPath));
    if (!already) pre.push({ matcher: "Bash", hooks: [{ type: "command", command: hookPath }] });
    result.hookPath = hookPath;
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  result.settingsPath = settingsPath;
  return result;
}
