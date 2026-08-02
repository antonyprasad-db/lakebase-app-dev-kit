// optimize-agent-overlay: swap a VARIANT role definition into
// .claude/agents/<role>.md for one forked turn, then restore the project's
// baseline .md after. The drive spawns `claude --agent <role>`, which reads that
// file, so overlaying it is how a Family-2 content candidate changes the role's
// instructions, its skills:/tools: frontmatter, or its scan-scope wording for a
// SINGLE turn (the inject-vs-scan prompt lever). Composes with the per-handoff
// snapshot/restore: overlay for the trial turn, restore immediately after.
//
// Pure filesystem, no cloud. When the role had no baseline .md (rare: overlay
// before a resync ran), restore removes the overlay so the tree returns to
// "absent", not to a stray variant file.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A restorable agent overlay. */
export interface AgentOverlayHandle {
  /** Restore the baseline .md (or remove the overlay if there was none). Idempotent. */
  restore(): void;
}

/** Overlay a variant role definition for the next spawned turn. Captures the
 *  baseline (its content or its absence), writes the variant, and returns a
 *  handle whose restore() puts the baseline back exactly. */
export function overlayAgent(args: { projectDir: string; role: string; markdown: string }): AgentOverlayHandle {
  const { projectDir, role, markdown } = args;
  const agentPath = join(projectDir, ".claude", "agents", `${role}.md`);
  const hadBaseline = existsSync(agentPath);
  const baseline = hadBaseline ? readFileSync(agentPath, "utf8") : undefined;

  mkdirSync(dirname(agentPath), { recursive: true });
  writeFileSync(agentPath, markdown);

  return {
    restore() {
      if (hadBaseline) {
        writeFileSync(agentPath, baseline!);
      } else if (existsSync(agentPath)) {
        rmSync(agentPath, { force: true });
      }
    },
  };
}
