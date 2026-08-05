// P2b optimize-agent-overlay: swap a VARIANT role definition into
// .claude/agents/<role>.md for one forked turn, then restore the project's
// baseline .md after. The drive spawns `claude --agent <role>`, which resolves
// that file, so overlaying it is how a candidate changes the role's
// instructions / skills: / tools: / scan-scope wording for a single turn. This
// composes with the snapshot/restore discipline (overlay for the turn, restore
// after), and is pure filesystem (hermetic).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { overlayAgent } from "../../consort/optimize/optimize-agent-overlay";

let projectDir: string;
let agentsDir: string;
beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "optimize-overlay-"));
  agentsDir = join(projectDir, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
});
afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("overlayAgent", () => {
  it("replaces the role .md for the turn, then restores the baseline exactly", () => {
    const p = join(agentsDir, "driver.md");
    writeFileSync(p, "# baseline driver\nfull instructions\n");

    const handle = overlayAgent({ projectDir, role: "driver", markdown: "# tighter driver\nterse\n" });
    expect(readFileSync(p, "utf8")).toBe("# tighter driver\nterse\n");

    handle.restore();
    expect(readFileSync(p, "utf8")).toBe("# baseline driver\nfull instructions\n");
  });

  it("when the role had NO baseline .md, restore removes the overlay (back to absent)", () => {
    const p = join(agentsDir, "navigator.md");
    expect(existsSync(p)).toBe(false);

    const handle = overlayAgent({ projectDir, role: "navigator", markdown: "# overlay only\n" });
    expect(readFileSync(p, "utf8")).toBe("# overlay only\n");

    handle.restore();
    expect(existsSync(p)).toBe(false);
  });

  it("creates the agents dir if missing (overlay before a resync happened)", () => {
    const bare = mkdtempSync(join(tmpdir(), "optimize-overlay-bare-"));
    try {
      const handle = overlayAgent({ projectDir: bare, role: "driver", markdown: "# x\n" });
      expect(readFileSync(join(bare, ".claude", "agents", "driver.md"), "utf8")).toBe("# x\n");
      handle.restore();
      expect(existsSync(join(bare, ".claude", "agents", "driver.md"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("restore is idempotent", () => {
    const p = join(agentsDir, "driver.md");
    writeFileSync(p, "BASE\n");
    const handle = overlayAgent({ projectDir, role: "driver", markdown: "OVERLAY\n" });
    handle.restore();
    handle.restore();
    expect(readFileSync(p, "utf8")).toBe("BASE\n");
  });
});
