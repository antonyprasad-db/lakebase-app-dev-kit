// optimize-apply: persist an APPROVED winning candidate's levers into the kit so
// the NEXT invocation of that role uses them. This is what makes the champion walk
// cumulative + durable: a win at one handoff becomes the standing default for that
// role everywhere.
//
// Two lever kinds, split by safety:
//   1. Agent-.md levers , prose/data that lives in skills/consort/agents/<role>.md:
//      a taskSuffix directive (append to the body), a tool scope (rewrite the
//      `tools:` frontmatter), or a whole agent-overlay (replace the file). These are
//      APPLIED DIRECTLY by applyAgentMdLevers (safe, deterministic file writes).
//   2. Config levers , model / effort / session-scope / loop live in TYPED SOURCE
//      (sftdd-config.ts defaultSftddConfig + agent-models.ts RECOMMENDED_MODELS +
//      the role .md frontmatter `model:`). We NEVER regex-rewrite TS source; instead
//      buildApplyPlan emits a precise SourceEditProposal (file + exact target + a
//      regression-test note) for a normal reviewed edit. contextPackSuffix is
//      dynamic injected context, not a fixed directive, so it is reported as a
//      manual proposal, not auto-frozen.
//
// buildApplyPlan is PURE; applyAgentMdLevers does the filesystem writes. Kit edits
// are LOCAL; pushing/releasing them to consumers stays a separate gated step.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Candidate } from "./optimize-candidates.js";

/** A directly-appliable edit to a role's skills/consort/agents/<role>.md. */
export interface AgentMdEdit {
  role: string;
  kind: "append-directive" | "frontmatter-tools" | "replace-file";
  /** The directive text (append), the tools value (frontmatter), or the full file
   *  content (replace). */
  value: string;
}

/** A proposed edit to TYPED SOURCE, surfaced for a reviewed change (never auto-
 *  applied by regex). */
export interface SourceEditProposal {
  file: string;
  /** Human-readable target + intent (e.g. "defaultSftddConfig: driver.model.green -> haiku"). */
  rationale: string;
  /** A note describing the regression test that should accompany the edit. */
  regressionTest: string;
}

export interface ApplyPlan {
  role: string;
  agentMdEdits: AgentMdEdit[];
  sourceEdits: SourceEditProposal[];
  /** Free-text notes (e.g. levers that need a manual call, like contextPackSuffix). */
  notes: string[];
}

/** Build the apply plan for an approved winner. Pure: no filesystem access. */
export function buildApplyPlan(role: string, candidate: Candidate): ApplyPlan {
  const plan: ApplyPlan = { role, agentMdEdits: [], sourceEdits: [], notes: [] };

  // ---- Family 2 (content) levers: agent-.md, applied directly ----
  const content = candidate.content;
  if (content) {
    if (content.agentOverlay) {
      // A whole-file overlay replaces the role definition (the strongest prompt win).
      plan.agentMdEdits.push({ role, kind: "replace-file", value: content.agentOverlay.markdown });
    } else {
      // taskSuffix is a fixed directive -> append to the role's standing prompt body.
      if (content.taskSuffix && content.taskSuffix.trim()) {
        plan.agentMdEdits.push({ role, kind: "append-directive", value: content.taskSuffix.trim() });
      }
      // Tool scope -> the role's `tools:` frontmatter (what it may use every turn).
      if (content.allowedTools && content.allowedTools.length) {
        plan.agentMdEdits.push({ role, kind: "frontmatter-tools", value: content.allowedTools.join(", ") });
      }
    }
    // contextPackSuffix is DYNAMIC injected context, not a fixed directive: freezing
    // it verbatim into the prompt would bake a one-turn context blob into every turn.
    // Report it as a manual proposal (the human decides what, if anything, to distill
    // into the role's standing guidance).
    if (content.contextPackSuffix && content.contextPackSuffix.trim()) {
      plan.notes.push(
        `contextPackSuffix won but is dynamic injected context, not a fixed directive; ` +
          `review whether to distill it into ${role}.md's standing guidance: "${content.contextPackSuffix.trim()}"`,
      );
    }
    if (content.disallowedTools && content.disallowedTools.length) {
      plan.notes.push(
        `disallowedTools won ([${content.disallowedTools.join(", ")}]); the kit expresses tool scope as an ` +
          `ALLOW list in ${role}.md frontmatter, so translate this to the complementary allow-list before applying.`,
      );
    }
  }

  // ---- Family 1 (config) levers: typed source, proposed for review ----
  const roles = candidate.configOverrides.roles ?? {};
  for (const [r, settings] of Object.entries(roles)) {
    if (!settings) continue;
    const model = settings.model;
    if (typeof model === "string") {
      plan.sourceEdits.push(modelDefaultEdit(r, undefined, model));
    } else if (model && typeof model === "object") {
      for (const [turn, m] of Object.entries(model)) plan.sourceEdits.push(modelDefaultEdit(r, turn, String(m)));
    }
    const effort = settings.effort;
    if (typeof effort === "string") {
      plan.sourceEdits.push(effortDefaultEdit(r, undefined, effort));
    } else if (effort && typeof effort === "object") {
      for (const [turn, e] of Object.entries(effort)) plan.sourceEdits.push(effortDefaultEdit(r, turn, String(e)));
    }
  }
  const build = candidate.configOverrides.build ?? {};
  if (build.sessionScope) plan.sourceEdits.push(buildDefaultEdit("sessionScope", build.sessionScope));
  if (build.loopGranularity) plan.sourceEdits.push(buildDefaultEdit("loopGranularity", build.loopGranularity));
  if (typeof build.batchCap === "number") plan.sourceEdits.push(buildDefaultEdit("batchCap", String(build.batchCap)));

  for (const [k, v] of Object.entries(candidate.env ?? {})) {
    plan.notes.push(`env lever ${k}=${v} won; persist it as the default in the code path that reads ${k} (or the config default it backs).`);
  }

  return plan;
}

function modelDefaultEdit(role: string, turn: string | undefined, model: string): SourceEditProposal {
  const where = turn ? `roles.${role}.model.${turn}` : `roles.${role}.model`;
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig: set ${where} -> "${model}" (and mirror the role's frontmatter model: in skills/consort/agents/${role}.md + RECOMMENDED_MODELS in agent-models.ts if the BASE model changed).`,
    regressionTest: `assert resolveSftddSettings().modelFor("${role}"${turn ? `, "${turn}"` : ""}) === "${model}" with no project override.`,
  };
}

function effortDefaultEdit(role: string, turn: string | undefined, effort: string): SourceEditProposal {
  const where = turn ? `roles.${role}.effort.${turn}` : `roles.${role}.effort`;
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig / defaultEffort: set ${where} -> "${effort}".`,
    regressionTest: `assert resolveSftddSettings().effortFor("${role}"${turn ? `, "${turn}"` : ""}) === "${effort}" with no project override.`,
  };
}

function buildDefaultEdit(key: string, value: string): SourceEditProposal {
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig: set build.${key} -> ${JSON.stringify(value)}.`,
    regressionTest: `assert resolveSftddSettings().build.${key} === ${JSON.stringify(value)} with no project override.`,
  };
}

/** Split a role .md into [frontmatter, body]. Frontmatter is the leading
 *  `---\n...\n---\n` block; returns ["", md] when there is none. */
function splitFrontmatter(md: string): { fm: string; body: string } {
  const m = md.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : { fm: "", body: md };
}

/** Apply the plan's agent-.md edits to skills/consort/agents/<role>.md under the
 *  kit dir. Returns the list of files changed. Source-edit proposals are NOT
 *  touched (they are reviewed edits). Throws if a targeted role .md is missing. */
export function applyAgentMdLevers(kitDir: string, plan: ApplyPlan): string[] {
  const changed = new Set<string>();
  for (const edit of plan.agentMdEdits) {
    const rel = join("skills", "consort", "agents", `${edit.role}.md`);
    const path = join(kitDir, rel);
    if (edit.kind === "replace-file") {
      writeFileSync(path, edit.value);
      changed.add(`${edit.role}.md`);
      continue;
    }
    if (!existsSync(path)) throw new Error(`optimize-apply: cannot edit missing role definition ${rel}`);
    const md = readFileSync(path, "utf8");
    if (edit.kind === "append-directive") {
      // Append the directive as a new paragraph at the end of the body, preserving
      // frontmatter + existing content.
      const next = md.endsWith("\n") ? `${md}\n${edit.value}\n` : `${md}\n\n${edit.value}\n`;
      writeFileSync(path, next);
      changed.add(`${edit.role}.md`);
    } else if (edit.kind === "frontmatter-tools") {
      const { fm, body } = splitFrontmatter(md);
      if (!fm) throw new Error(`optimize-apply: ${rel} has no frontmatter to set tools: on`);
      const nextFm = /(^|\n)tools:.*(\n)/.test(fm)
        ? fm.replace(/(^|\n)tools:.*(\n)/, `$1tools: ${edit.value}$2`)
        : fm.replace(/\n---\n$/, `\ntools: ${edit.value}\n---\n`);
      writeFileSync(path, nextFm + body);
      changed.add(`${edit.role}.md`);
    }
  }
  return [...changed];
}

/** Deep-merge helper for the overlay (plain objects merge; scalars/arrays from the
 *  overlay win). Kept local so optimize-apply has no cross-module dependency. */
function mergeOverlay(base: unknown, over: unknown): unknown {
  if (over === null || typeof over !== "object" || Array.isArray(over)) return over;
  const b = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...b };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = mergeOverlay(out[k], v);
  }
  return out;
}

/** AUTO-APPLY a winning candidate's CONFIG levers (model/effort per turn/step, build
 *  knobs) into the kit's optimized-defaults.json , the data overlay defaultSftddConfig
 *  deep-merges. This is the unattended champion walk's persistence path: it writes
 *  DATA (never a TS regex-rewrite, so the single-source rule holds), and a rebuild
 *  inlines it into dist. Agent-.md (content) levers are applied separately by
 *  applyAgentMdLevers. A BASELINE winner has no config overrides -> no-op (returns
 *  false). Returns true when the overlay changed. Idempotent: re-applying the same
 *  winner is a no-op. Kit edits are LOCAL; committing/pushing is the caller's job. */
export function applyWinnerToOverlay(kitDir: string, candidate: Candidate): boolean {
  const overlayPath = join(kitDir, "scripts", "sftdd", "optimized-defaults.json");
  const overlay = existsSync(overlayPath)
    ? (JSON.parse(readFileSync(overlayPath, "utf8")) as Record<string, unknown>)
    : { roles: {} };

  // Build the overlay delta from the candidate's CONFIG overrides (roles + build).
  const delta: Record<string, unknown> = {};
  const roles = candidate.configOverrides.roles ?? {};
  if (Object.keys(roles).length) delta.roles = roles;
  const build = candidate.configOverrides.build ?? {};
  if (Object.keys(build).length) delta.build = build;
  if (!Object.keys(delta).length) return false; // baseline / content-only winner

  const merged = mergeOverlay(overlay, delta) as Record<string, unknown>;
  const before = JSON.stringify(overlay);
  const after = JSON.stringify(merged);
  if (before === after) return false; // idempotent no-op
  // Preserve the leading _comment if present; write stable 2-space JSON.
  writeFileSync(overlayPath, JSON.stringify(merged, null, 2) + "\n");
  return true;
}

/** Human-readable summary: what applied directly + what needs a reviewed source edit. */
export function formatApplyPlan(plan: ApplyPlan): string {
  const lines: string[] = [`# Apply plan for role: ${plan.role}`, ""];
  if (plan.agentMdEdits.length) {
    lines.push("## Direct agent-.md edits (applied on approval)");
    for (const e of plan.agentMdEdits) {
      lines.push(`- ${e.kind}: ${e.kind === "replace-file" ? "(full role definition)" : e.value}`);
    }
    lines.push("");
  }
  if (plan.sourceEdits.length) {
    lines.push("## REVIEW , typed-source edits (I make these as normal reviewed edits, not auto-regex)");
    for (const s of plan.sourceEdits) {
      lines.push(`- ${s.file}: ${s.rationale}`);
      lines.push(`    regression test: ${s.regressionTest}`);
    }
    lines.push("");
  }
  if (plan.notes.length) {
    lines.push("## Notes");
    for (const n of plan.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  if (!plan.agentMdEdits.length && !plan.sourceEdits.length && !plan.notes.length) {
    lines.push("(baseline won , nothing to persist)");
  }
  return lines.join("\n") + "\n";
}
