// In-flight-safe kit upgrade for a scaffolded project (the deterministic core).
//
// A Consort run is a SEQUENCE of consort-drive processes with HITL gates between
// them, and the kit version is bound at each drive LAUNCH (resolved once from the
// pin). So the ONLY safe moment to upgrade is AT A STOP , between drive processes ,
// never mid-turn (a running drive already resolved the old kit; swapping files under
// it is split-brain within one run). This module is the file-level upgrade:
//   1. quiesceGate  , is the run at a clean stop (no live drive + awaiting_human/done)?
//   2. pinBoth      , dual-pin .local (run) + committed kit-ref (CI) to the target,
//                     recording the prior values to kit-ref.prev for rollback.
//   3. refreshSurface , updateAgents + updateCommands from the target kit + reset the
//                     agent-sync marker so the next drive does not re-refresh.
//   4. rollbackPins , restore the prior pins from kit-ref.prev (the instant undo).
// The bin (consort-upgrade) adds the side effects around this: `lk --refresh` to
// download the target kit into the cache, the pid liveness probe, and the output.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  KIT_REF_FILE,
  KIT_REF_LOCAL_FILE,
  committedKitRef,
  localKitRef,
  pinRunKitRef,
} from "../config/kit-ref.js";
import { updateAgents } from "./update-agents.js";
import { updateCommands } from "./update-commands.js";

/** Where the prior pins are recorded so an upgrade is reversible (rollback). */
export const KIT_REF_PREV_FILE = "kit-ref.prev";
/** The agent-sync marker (mirror of AGENT_SYNC_MARKER) reset on upgrade so the next
 *  drive's resyncAgentsOnKitDrift sees the surface already at the target version. */
const AGENT_SYNC_MARKER = path.join(".claude", "agents", ".kit-version");

function lakebaseFile(projectDir: string, name: string): string {
  return path.join(projectDir, ".lakebase", name);
}

export interface QuiesceInput {
  /** Is a drive process still alive? true => a drive is running (UNSAFE to upgrade);
   *  false => confirmed stopped; null => unknown (no --pid supplied). */
  pidAlive: boolean | null;
  /** Does next.json say the run is at a stop a human owns (awaiting_human) OR done? */
  atStop: boolean;
}
export interface QuiesceResult {
  safe: boolean;
  reason: string;
}

/**
 * Is it safe to upgrade right now? SAFE only when no drive is provably running AND the
 * run is at a stop. A live pid is an immediate NO (never hot-swap under a running drive).
 * With no pid (unknown liveness), fall back to the at-stop signal but say liveness is
 * unverified, so the operator knows to be sure the drive is down.
 */
export function quiesceGate(q: QuiesceInput): QuiesceResult {
  if (q.pidAlive === true) {
    return { safe: false, reason: "a drive process is still RUNNING , wait for it to stop at a gate before upgrading (never swap the kit mid-turn)." };
  }
  if (!q.atStop) {
    return { safe: false, reason: "next.json does not show a clean stop (no awaiting_human / done) , the run may be mid-flight. Resolve to a gate first." };
  }
  if (q.pidAlive === null) {
    return { safe: true, reason: "at a stop (awaiting_human/done); drive liveness UNVERIFIED (no --pid) , confirm no drive is running." };
  }
  return { safe: true, reason: "at a clean stop (drive pid not alive + awaiting_human/done)." };
}

export interface PinBothResult {
  ref: string;
  previousLocal?: string;
  previousCommitted?: string;
  changed: boolean;
}

/** Dual-pin the run pin (.local) + the committed kit-ref (CI) to `ref`, recording the
 *  prior values to kit-ref.prev so the upgrade is reversible. Keeps the two refs in
 *  lockstep , the fix for the committed-vs-.local drift. Idempotent: re-pinning the same
 *  ref still records prev (harmless) but reports changed=false when nothing moved. */
export function pinBoth(projectDir: string, ref: string): PinBothResult {
  const previousLocal = localKitRef(projectDir);
  const previousCommitted = committedKitRef(projectDir);
  // Record prior pins for rollback BEFORE mutating.
  const prev = { local: previousLocal ?? null, committed: previousCommitted ?? null };
  fs.mkdirSync(path.dirname(lakebaseFile(projectDir, KIT_REF_PREV_FILE)), { recursive: true });
  fs.writeFileSync(lakebaseFile(projectDir, KIT_REF_PREV_FILE), JSON.stringify(prev) + "\n", "utf8");
  // Pin the run (.local) via the shared writer, and the committed ref in lockstep.
  const local = pinRunKitRef(projectDir, ref);
  fs.writeFileSync(lakebaseFile(projectDir, KIT_REF_FILE), ref + "\n", "utf8");
  const changed = local.pinned || previousCommitted !== ref;
  return {
    ref,
    ...(previousLocal ? { previousLocal } : {}),
    ...(previousCommitted ? { previousCommitted } : {}),
    changed,
  };
}

export interface RollbackResult {
  restored: boolean;
  local?: string;
  committed?: string;
  reason?: string;
}

/** Restore the pins recorded by the last pinBoth (the instant undo when a resume on the
 *  new kit misbehaves). A missing/empty prior ref clears that file (back to unpinned). */
export function rollbackPins(projectDir: string): RollbackResult {
  const prevFile = lakebaseFile(projectDir, KIT_REF_PREV_FILE);
  if (!fs.existsSync(prevFile)) return { restored: false, reason: "no kit-ref.prev , nothing to roll back to." };
  let prev: { local: string | null; committed: string | null };
  try {
    prev = JSON.parse(fs.readFileSync(prevFile, "utf8")) as typeof prev;
  } catch {
    return { restored: false, reason: "kit-ref.prev is unreadable." };
  }
  const restore = (name: string, val: string | null): void => {
    const f = lakebaseFile(projectDir, name);
    if (val && val.trim()) fs.writeFileSync(f, val.trim() + "\n", "utf8");
    else if (fs.existsSync(f)) fs.rmSync(f);
  };
  restore(KIT_REF_LOCAL_FILE, prev.local);
  restore(KIT_REF_FILE, prev.committed);
  return {
    restored: true,
    ...(prev.local ? { local: prev.local } : {}),
    ...(prev.committed ? { committed: prev.committed } : {}),
  };
}

export interface RefreshSurfaceResult {
  agents: number; // files added/updated
  commands: number;
  scripts: number; // kit-owned scripts copied
  workflows: number; // CI workflow files copied
}

/** Count the files (recursively) under `dir`, or 0 if it does not exist. */
function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n += 1;
  }
  return n;
}

/** Copy a kit-owned template subtree over the project's copy (recursive, overwriting), or
 *  a no-op when the source is absent. cpSync preserves file modes (so `+x` on `.sh` files
 *  survives). Files the project has that the kit does not (e.g. the scm-utils `scripts/lk`
 *  shim, project-local scripts) are LEFT untouched , only kit-owned files are refreshed. */
function copyKitTree(kitSubtree: string, projectSubtree: string): number {
  if (!fs.existsSync(kitSubtree)) return 0;
  fs.mkdirSync(projectSubtree, { recursive: true });
  fs.cpSync(kitSubtree, projectSubtree, { recursive: true, force: true });
  return countFiles(kitSubtree);
}

/** Refresh the FULL kit-owned scaffolded surface from the target kit dir: agents +
 *  commands (.claude/), the scripts/ helper tree, and the CI workflows (.github/workflows/).
 *  Resets the agent-sync marker to the target so the next drive sees the surface current
 *  and does not re-refresh. force:true (the propagation path) overwrites drift. Leaves the
 *  scm-utils `scripts/lk` shim + project config (`.env`, deploy-targets.yaml) untouched ,
 *  only kit-owned files move. */
export function refreshSurface(projectDir: string, kitDir: string, targetVersion: string): RefreshSurfaceResult {
  const a = updateAgents({ projectDir, kitDir, force: true });
  const c = updateCommands({ projectDir, kitDir, force: true });
  const commonDir = path.join(kitDir, "templates", "project", "common");
  const scripts = copyKitTree(path.join(commonDir, "scripts"), path.join(projectDir, "scripts"));
  const workflows = copyKitTree(
    path.join(commonDir, ".github", "workflows"),
    path.join(projectDir, ".github", "workflows"),
  );
  const marker = path.join(projectDir, AGENT_SYNC_MARKER);
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, targetVersion + "\n", "utf8");
  } catch {
    /* best-effort: the drive's resyncAgentsOnKitDrift will refresh again if the marker is stale */
  }
  const count = (files: Array<{ outcome: string }>): number => files.filter((f) => f.outcome === "added" || f.outcome === "updated").length;
  return { agents: count(a.files), commands: count(c.files), scripts, workflows };
}
