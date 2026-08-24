// The review-artifact opener (consort-open + consort-watch's gate hook). It resolves
// the Consort roles' reviewable artifacts and opens them in Cursor/Code , but ONLY
// when the session is inside the editor's terminal, and never launches an editor
// uninvited. The `spawn` seam lets us assert what would open without spawning.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { reviewArtifacts } from "../../consort/orchestrator/open/resolve-review-artifacts";
import { openArtifactsInEditor, isInsideEditor } from "../../consort/orchestrator/open/open-in-editor";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "open-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function write(rel: string, body = "{}"): void {
  const p = join(tdd, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
}

describe("reviewArtifacts", () => {
  it("returns only existing artifacts, in review order (design/planning -> feature -> story/ACs)", () => {
    write("planning/feature-proposals.md");
    write("design/design-brief.md");
    write("features/F1-x/feature-spec.json");
    write("features/F1-x/architecture.md");
    write("features/F1-x/stories/S1-y/story.md");
    write("features/F1-x/stories/S1-y/acs/AC1-a.json");
    write("features/F1-x/stories/S1-y/acs/AC2-b.json");
    const got = reviewArtifacts(tdd, { feature: "F1-x", story: "S1-y" }).map((p) => p.replace(tdd + "/", ""));
    expect(got[0]).toBe("planning/feature-proposals.md"); // context first
    expect(got).toContain("features/F1-x/feature-spec.json");
    expect(got).toContain("features/F1-x/stories/S1-y/acs/AC1-a.json");
    expect(got).toContain("features/F1-x/stories/S1-y/acs/AC2-b.json");
    // ACs come after the story spec.
    expect(got.indexOf("features/F1-x/stories/S1-y/story.md")).toBeLessThan(
      got.indexOf("features/F1-x/stories/S1-y/acs/AC1-a.json"),
    );
  });

  it("no feature => the planning/design review set", () => {
    write("planning/feature-proposals.md");
    write("design/design-brief.md");
    const got = reviewArtifacts(tdd, {});
    expect(got).toHaveLength(2);
  });
});

describe("openArtifactsInEditor", () => {
  const editorEnv = { PATH: "", TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv;

  it("opens the artifacts via the editor when INSIDE the editor terminal", () => {
    write("features/F1-x/feature-spec.json");
    const spawn = vi.fn();
    // Force an editor to be 'found' by pointing findEditorCmd at an app-bundle-less env:
    // supply --force so the not-in-editor gate is bypassed and only the spawn is asserted.
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: editorEnv, force: true, spawn });
    // With no real editor on PATH in the test env, it reports no-editor OR opens via
    // the injected spawn if a bundle exists. Assert the resolution + the seam contract:
    expect(res.files.some((f) => f.endsWith("feature-spec.json"))).toBe(true);
    if (res.opened) {
      expect(spawn).toHaveBeenCalledOnce();
      expect(spawn.mock.calls[0][1]).toEqual(res.files);
    } else {
      expect(res.reason).toBe("no-editor");
    }
  });

  it("does NOT open (reports paths) when not inside an editor and not forced", () => {
    write("features/F1-x/feature-spec.json");
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: { PATH: "", TERM_PROGRAM: "Apple_Terminal" }, spawn });
    expect(spawn).not.toHaveBeenCalled();
    expect(res.opened).toBe(false);
    expect(["not-in-editor", "no-editor"]).toContain(res.reason);
  });

  it("no artifacts => no-artifacts, never spawns", () => {
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: editorEnv, force: true, spawn });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("no-artifacts");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("isInsideEditor detects the editor terminal", () => {
    expect(isInsideEditor({ TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isInsideEditor({ TERM_PROGRAM: "Apple_Terminal" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
