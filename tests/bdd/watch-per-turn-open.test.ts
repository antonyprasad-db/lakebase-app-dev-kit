// The per-turn artifact open must fire in the POLL-ONCE `--since` relay , the path the design
// lane actually runs (start.md rule 73) , not only in the blocking-tail/--monitor loop the
// normal run never enters. And it must reveal exactly what the FINISHED role produced, never
// silently (a design-role skip says WHY). These lock the three pieces: the role->artifact map,
// the editor-guarded open, pollOnce surfacing finished roles, and the relay report line.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { roleArtifacts, DESIGN_ROLES } from "../../consort/orchestrator/open/resolve-review-artifacts";
import { openRoleArtifacts } from "../../consort/orchestrator/open/open-in-editor";
import { pollOnce, reportRoleOpen } from "../../bin/consort/watch.cli";

/** A consort dir with F1/S1 designed + product/design context + a fake editor CLI on PATH. */
function fixture(): { dir: string; binDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "open-role-"));
  const fdir = join(dir, "features", "F1");
  mkdirSync(fdir, { recursive: true });
  for (const [n, c] of [
    ["architecture.md", "# arch"], ["architecture.json", "{}"],
    ["db-design.md", "# db"], ["db-design.json", "{}"],
    ["feature-spec.md", "# spec"], ["feature-spec.json", "{}"],
    ["test-list.md", "# tl"], ["test-list.json", "{}"],
  ]) writeFileSync(join(fdir, n), c);
  const sdir = join(fdir, "stories", "S1");
  mkdirSync(join(sdir, "acs"), { recursive: true });
  writeFileSync(join(sdir, "story.md"), "# story");
  writeFileSync(join(sdir, "story.json"), "{}");
  writeFileSync(join(sdir, "test-list.json"), "{}");
  writeFileSync(join(sdir, "acs", "AC1.json"), "{}");
  writeFileSync(join(sdir, "acs", "AC2.json"), "{}");
  writeFileSync(join(dir, "product-overview.md"), "# po");
  writeFileSync(join(dir, "nfrs.md"), "# nfr");
  mkdirSync(join(dir, "planning"), { recursive: true });
  writeFileSync(join(dir, "planning", "feature-proposals.md"), "# fp");
  mkdirSync(join(dir, "design"), { recursive: true });
  for (const [n, c] of [["design-guide.md", "# dg"], ["design-guide.json", "{}"], ["ia.md", "# ia"], ["design-brief.md", "# brief"]])
    writeFileSync(join(dir, "design", n), c);
  writeFileSync(join(dir, "workflow-state.json"), JSON.stringify({ feature_id: "F1", story_id: "S1" }));
  // A fake `cursor` CLI so findEditorCmd resolves off PATH (checked before app bundles).
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, "cursor"), "#!/bin/sh\nexit 0\n");
  return { dir, binDir };
}

const SCOPE = { feature: "F1", story: "S1" } as const;

describe("roleArtifacts (role -> exactly what that role produced)", () => {
  let dir: string;
  beforeEach(() => { dir = fixture().dir; });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("architect-reviewer -> the architecture, not db-design or spec", () => {
    const a = roleArtifacts(dir, "architect-reviewer", SCOPE);
    expect(a.some((p) => p.endsWith("architecture.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("architecture.json"))).toBe(true);
    expect(a.some((p) => p.endsWith("db-design.md"))).toBe(false);
    expect(a.some((p) => p.endsWith("feature-spec.md"))).toBe(false);
  });
  it("dba -> the db design only", () => {
    const a = roleArtifacts(dir, "dba", SCOPE);
    expect(a.some((p) => p.endsWith("db-design.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("db-design.json"))).toBe(true);
    expect(a.some((p) => p.includes("architecture"))).toBe(false);
  });
  it("spec-author -> feature spec + the story's md/json + every AC", () => {
    const a = roleArtifacts(dir, "spec-author", SCOPE);
    expect(a.some((p) => p.endsWith("feature-spec.json"))).toBe(true);
    expect(a.some((p) => p.endsWith(join("stories", "S1", "story.json")))).toBe(true);
    expect(a.filter((p) => p.includes(join("acs", "AC")))).toHaveLength(2);
  });
  it("ux-designer -> the design guide + ia + brief", () => {
    const a = roleArtifacts(dir, "ux-designer", SCOPE);
    expect(a.some((p) => p.endsWith(join("design", "design-guide.md")))).toBe(true);
    expect(a.some((p) => p.endsWith(join("design", "ia.md")))).toBe(true);
  });
  it("test-strategist -> the feature test list", () => {
    const a = roleArtifacts(dir, "test-strategist", SCOPE);
    expect(a.some((p) => p.endsWith("test-list.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("test-list.json"))).toBe(true);
  });
  it("product-owner -> product overview + nfrs + proposals", () => {
    const a = roleArtifacts(dir, "product-owner", SCOPE);
    expect(a.some((p) => p.endsWith("product-overview.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("feature-proposals.md"))).toBe(true);
  });
  it("navigator (reflect) -> the story under review", () => {
    const a = roleArtifacts(dir, "navigator", SCOPE);
    expect(a.some((p) => p.endsWith(join("stories", "S1", "story.json")))).toBe(true);
  });
  it("driver (build turn) -> NOTHING (code, not a reviewable design artifact)", () => {
    expect(roleArtifacts(dir, "driver", SCOPE)).toEqual([]);
  });
  it("DESIGN_ROLES covers the design lane but not the driver", () => {
    expect(DESIGN_ROLES.has("spec-author")).toBe(true);
    expect(DESIGN_ROLES.has("dba")).toBe(true);
    expect(DESIGN_ROLES.has("driver")).toBe(false);
  });
});

describe("openRoleArtifacts (editor-guarded, role-scoped)", () => {
  let f: { dir: string; binDir: string };
  beforeEach(() => { f = fixture(); });
  afterEach(() => rmSync(f.dir, { recursive: true, force: true }));

  it("opens the role's files when inside the editor's terminal", () => {
    const spawned: { cmd: string; files: string[] } = { cmd: "", files: [] };
    const res = openRoleArtifacts(f.dir, "architect-reviewer", {
      ...SCOPE,
      env: { PATH: f.binDir, TERM_PROGRAM: "vscode" },
      spawn: (cmd, files) => { spawned.cmd = cmd; spawned.files = files; },
    });
    expect(res.opened).toBe(true);
    expect(spawned.cmd).toBe("cursor");
    expect(spawned.files.some((p) => p.endsWith("architecture.md"))).toBe(true);
  });
  it("does NOT open (reason not-in-editor) outside the editor terminal", () => {
    const res = openRoleArtifacts(f.dir, "architect-reviewer", { ...SCOPE, env: { PATH: f.binDir } });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("not-in-editor");
    expect(res.files.length).toBeGreaterThan(0);
  });
  it("a build-turn role resolves no artifacts (reason no-artifacts)", () => {
    const res = openRoleArtifacts(f.dir, "driver", { ...SCOPE, env: { PATH: f.binDir, TERM_PROGRAM: "vscode" } });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("no-artifacts");
  });
});

describe("pollOnce surfaces finished roles (turnsDone) for the relay to open", () => {
  let dir: string;
  let log: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poll-turns-"));
    log = join(dir, "drive-live.log");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("records one role per `[drive] <role> turn Ns` line, in order", () => {
    writeFileSync(
      log,
      [
        "[drive] 042 dispatch spec-author for design",
        "[drive] spec-author turn 12.3s (opus)",
        "[drive] 043 dispatch dba for design",
        "[drive] dba turn 3.0s (sonnet)",
        "",
      ].join("\n"),
    );
    expect(pollOnce(log, 0).turnsDone).toEqual(["spec-author", "dba"]);
  });
  it("no finished turn this batch => empty", () => {
    writeFileSync(log, "[drive] 044 dispatch driver for build\n");
    expect(pollOnce(log, 0).turnsDone).toEqual([]);
  });
});

describe("reportRoleOpen (never silent for a design role; silent for a build turn)", () => {
  let f: { dir: string; binDir: string };
  beforeEach(() => { f = fixture(); });
  afterEach(() => rmSync(f.dir, { recursive: true, force: true }));

  it("a design role that can't open (not in editor) reports WHY, not silence", () => {
    const line = reportRoleOpen(f.dir, "architect-reviewer", { PATH: f.binDir });
    expect(line).toContain("architect-reviewer");
    expect(line).toContain("NOT opened");
  });
  it("a driver build turn reports nothing (null) , opening nothing is expected", () => {
    expect(reportRoleOpen(f.dir, "driver", { PATH: f.binDir, TERM_PROGRAM: "vscode" })).toBeNull();
  });
});
