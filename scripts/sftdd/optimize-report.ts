// optimize-report: the per-handoff before/after report over a champion-walk
// result , the "same-quality artifacts, less wall-clock" evidence. Pure: it
// joins the ChampionWalkResult (baseline vs winner medians per handoff) with the
// candidate objects (to describe the WINNING lever, so a generalizable win can be
// promoted into the kit) into a structured summary + a markdown table. No I/O.
//
// The champion walk already measured baseline vs winner per handoff, so this
// module does not need to re-derive timing from agent-log.jsonl; the timing-report
// (byRole/byModel) stays the full-run view, this is the per-handoff diff the plan
// asked for.

import type { ChampionWalkResult } from "./optimize-harness.js";
import type { Candidate } from "./optimize-candidates.js";
import { BASELINE_CANDIDATE_ID } from "./optimize-candidates.js";

/** One handoff's before/after row. */
export interface HandoffReportRow {
  handoffId: string;
  baselineMs: number;
  winnerId: string;
  winnerMs: number;
  savedMs: number;
  savedPct: number;
  /** Human-readable description of the winning candidate's levers. */
  winnerLevers: string;
}

export interface ChampionWalkReport {
  handoffs: HandoffReportRow[];
  totalBaselineMs: number;
  totalOptimizedMs: number;
  totalSavedMs: number;
  totalSavedPct: number;
}

/** Build the structured before/after report. */
export function buildChampionWalkReport(result: ChampionWalkResult, candidates: Candidate[]): ChampionWalkReport {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const handoffs: HandoffReportRow[] = result.walk.map((h) => {
    const baselineMs = h.baselineMs;
    const winnerMs = h.winner.medianMs;
    const savedMs = Math.max(0, baselineMs - winnerMs);
    const savedPct = baselineMs > 0 ? Math.round((savedMs / baselineMs) * 100) : 0;
    const winnerCandidate = byId.get(h.winner.candidateId);
    return {
      handoffId: h.handoffId,
      baselineMs,
      winnerId: h.winner.candidateId,
      winnerMs,
      savedMs,
      savedPct,
      winnerLevers: winnerCandidate ? describeCandidateLevers(winnerCandidate) : h.winner.candidateId,
    };
  });

  const totalBaselineMs = handoffs.reduce((a, h) => a + h.baselineMs, 0);
  const totalOptimizedMs = handoffs.reduce((a, h) => a + h.winnerMs, 0);
  const totalSavedMs = Math.max(0, totalBaselineMs - totalOptimizedMs);
  const totalSavedPct = totalBaselineMs > 0 ? Math.round((totalSavedMs / totalBaselineMs) * 100) : 0;

  return { handoffs, totalBaselineMs, totalOptimizedMs, totalSavedMs, totalSavedPct };
}

/** Describe a candidate's levers in one compact human-readable string, so the
 *  report names WHAT won (a per-turn model, an effort, a session-warmth knob, a
 *  content variant) , the input to promoting a generalizable win into the kit. */
export function describeCandidateLevers(candidate: Candidate): string {
  if (candidate.id === BASELINE_CANDIDATE_ID) return "baseline (no overrides)";
  const parts: string[] = [];

  const roles = candidate.configOverrides.roles ?? {};
  for (const [role, settings] of Object.entries(roles)) {
    if (!settings) continue;
    const model = settings.model;
    if (typeof model === "string") {
      parts.push(`${role} model=${model}`);
    } else if (model && typeof model === "object") {
      for (const [turn, m] of Object.entries(model)) parts.push(`${role}.${turn} model=${m}`);
    }
    const effort = settings.effort;
    if (typeof effort === "string") {
      parts.push(`${role} effort=${effort}`);
    } else if (effort && typeof effort === "object") {
      for (const [turn, e] of Object.entries(effort)) parts.push(`${role}.${turn} effort=${e}`);
    }
  }

  const build = candidate.configOverrides.build ?? {};
  if (build.sessionScope) parts.push(`sessionScope=${build.sessionScope}`);
  if (build.loopGranularity) parts.push(`loop=${build.loopGranularity}`);
  if (typeof build.batchCap === "number") parts.push(`batchCap=${build.batchCap}`);

  for (const [k, v] of Object.entries(candidate.env ?? {})) parts.push(`${k}=${v}`);

  const content = candidate.content;
  if (content) {
    if (content.agentOverlay) parts.push(`agent-overlay:${content.agentOverlay.role}`);
    if (content.taskSuffix) parts.push("taskSuffix");
    if (content.contextPackSuffix) parts.push("contextPackSuffix");
    if (content.allowedTools?.length) parts.push(`allowedTools=[${content.allowedTools.join(",")}]`);
    if (content.disallowedTools?.length) parts.push(`disallowedTools=[${content.disallowedTools.join(",")}]`);
  }

  return parts.length ? parts.join(", ") : candidate.id;
}

/** Render the report as a markdown table with a TOTAL row. */
export function formatChampionWalkReport(report: ChampionWalkReport): string {
  const s = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
  const lines: string[] = [
    "# Champion-walk optimization report",
    "",
    "| Handoff | Baseline | Optimized | Saved | Winner | Levers |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const h of report.handoffs) {
    lines.push(
      `| ${h.handoffId} | ${s(h.baselineMs)} | ${s(h.winnerMs)} | ${s(h.savedMs)} (${h.savedPct}%) | ${h.winnerId} | ${h.winnerLevers} |`,
    );
  }
  lines.push(
    `| **TOTAL** | ${s(report.totalBaselineMs)} | ${s(report.totalOptimizedMs)} | ${s(report.totalSavedMs)} (${report.totalSavedPct}%) | | |`,
  );
  return lines.join("\n") + "\n";
}
