// Structural guard: EVERY drive loop in the CLI must be telemetry-wrapped, so no
// entry path / mode can silently emit nothing. Sprint mode (`/consort:start`) once
// had NO telemetry at all , beginTelemetryRun + withTelemetry lived only in the
// single-feature path, so every `--sprint` run (planning + each feature drive) was
// invisible (an empty telemetry.runs despite heavy use). Telemetry is a property of
// a drive RUN, not of which CLI path launched it: assert it here at the source, so a
// future path that calls runDriver without wrapping it fails the build, not a user's
// silent data loss.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "..", "bin", "consort", "drive.cli.ts"), "utf8");

describe("drive.cli telemetry coverage , every drive loop is telemetry-wrapped", () => {
  it("every runDriver(...) call wraps its effects in withTelemetry(...)", () => {
    // Find each call site `runDriver(<firstArg>` and assert the first argument begins
    // with `withTelemetry(`. Matches across the sprint planning drive, the sprint
    // per-feature drive, and the single-feature drive.
    const calls = [...SRC.matchAll(/\brunDriver\(\s*([A-Za-z_]\w*)\s*\(/g)];
    expect(calls.length, "expected runDriver call sites in drive.cli.ts").toBeGreaterThanOrEqual(3);
    const unwrapped = calls.map((m) => m[1]).filter((head) => head !== "withTelemetry");
    expect(unwrapped, `these runDriver calls are NOT withTelemetry-wrapped: ${unwrapped.join(", ")}`).toEqual([]);
  });

  it("sprint mode begins its own telemetry run (not only the --feature path)", () => {
    // beginTelemetryRun must appear at least twice: once in the feature path, once in
    // runSprintMode. A single occurrence means a mode is uninstrumented again.
    const begins = [...SRC.matchAll(/\bbeginTelemetryRun\(/g)];
    expect(begins.length, "beginTelemetryRun must be present in BOTH the sprint and feature paths").toBeGreaterThanOrEqual(2);
    // And runSprintMode must finish() its run so the batch is flushed to the sender.
    const sprintBody = SRC.slice(SRC.indexOf("async function runSprintMode"), SRC.indexOf("function effectiveGates"));
    expect(sprintBody).toMatch(/beginTelemetryRun\(/);
    expect(sprintBody).toMatch(/telemetry\.finish\(/);
    expect(sprintBody).toMatch(/withTelemetry\(/);
    // The sprint umbrella run MUST be labeled "sprint", not "build" , else a dashboard
    // cannot tell a whole /consort:start run apart from a single build-phase run (the two
    // are distinct COMMANDS). Guards against the label regressing to "build".
    expect(sprintBody).toMatch(/beginTelemetryRun\(\s*\{\s*command:\s*["']sprint["']/);
  });

  it("sprint mode emits the authoritative next.json on every stop (parity with the feature path)", () => {
    // Without this, an interactive sprint stop (plan gate / backlog pause) left NO
    // deterministic on-disk signal , the driving session was reduced to tailing the
    // transient drive-live.log and sat silent at the gate. Assert the sprint body writes
    // next.json from the sprint snapshot.
    const sprintBody = SRC.slice(SRC.indexOf("async function runSprintMode"), SRC.indexOf("function effectiveGates"));
    expect(sprintBody).toMatch(/buildNextSnapshot\(\s*["']sprint["']/);
    expect(sprintBody).toMatch(/next\.json/);
    // Scope-correctness: when a feature is CLAIMED, the sprint stop must emit the
    // FEATURE-scoped snapshot (else next.json mis-describes the feature's lane and
    // misses its spec/accept gates). Guarded so it can't regress to planning-only.
    expect(sprintBody).toMatch(/readWorkflowState\([^)]*\)\??\.feature_id/);
    expect(sprintBody).toMatch(/emitNextJson\(/);
  });

  it("consort-spike (a non-drive command) also begins telemetry , every command emits", () => {
    // /spike runs its own bin (not consort-drive), so it would silently emit nothing
    // unless it opens its own run. It is not a role drive (no gate spans), so it emits a
    // root consort.run with command "spike".
    const spike = readFileSync(join(__dirname, "..", "..", "bin", "consort", "spike.cli.ts"), "utf8");
    expect(spike).toMatch(/beginTelemetryRun\(\s*\{\s*command:\s*["']spike["']/);
    expect(spike).toMatch(/\.finish\(/);
  });
});
