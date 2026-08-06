// The test-analyst ROSTER renderer: the pure projection that bridges the TS TEST_ANALYST_CATALOGUE
// (which a `claude -p` supervisor agent can't import) into a text block the supervisor reads and
// Task-spawns from. A preconditions PREPARER ("test-analyst-roster", registered in preconditions.ts)
// calls renderTestAnalystRoster with the turn's projectDir; it resolves the project's uiTrack, FILTERS
// the catalogue to the ENABLED analysts (a no-frontend project drops `client`), and emits the enabled
// roster + each analyst's focus prompt + declared inputs as a fenced JSON block appended to the
// supervisor's task. The supervisor spawns ONE general-purpose Task subagent per listed analyst with
// the given focus_prompt, then reconciles + assembles. Pure projection (no disk writes), so it can't
// drift from the catalogue , the single source of truth.

import { enabledAnalysts, type AnalystEnablementContext } from "./test-analyst-catalogue.js";

/** Render the enabled-analyst roster for a project as the injected supervisor context block. Pure:
 *  the ONLY project-specific input is `uiTrack` (which gates `client`). Returns a fenced JSON block
 *  the supervisor parses; empty string only if somehow no analyst is enabled (never, fitness+behavior
 *  are unconditional). */
export function renderTestAnalystRoster(ctx: AnalystEnablementContext): string {
  const analysts = enabledAnalysts(ctx).map((e) => ({
    kind: e.kind,
    model: e.model,
    // ADVISORY levers: the Task tool has no effort/allowedTools parameter, so the supervisor RESTATES
    // these in each spawn prompt and the subagent self-paces/self-limits. model (above) IS enforced
    // (a real Task param). Omitted when the entry sets none, so the roster stays lean.
    ...(e.effort ? { effort: e.effort } : {}),
    ...(e.toolScope ? { tool_scope: e.toolScope } : {}),
    inputs: e.inputs,
    focus_prompt: e.focusPrompt,
  }));
  if (analysts.length === 0) return "";
  const payload = JSON.stringify({ analysts }, null, 2);
  return (
    `<<TEST-ANALYST ROSTER , spawn ONE Task subagent (subagent_type general-purpose) per entry below, ` +
    `passing its focus_prompt VERBATIM + the story inputs it declares. Set the Task's model to the ` +
    `entry's "model". When an entry gives "effort" or "tool_scope", RESTATE them at the top of that ` +
    `spawn's prompt , "Think at <effort> effort." and "Confine your work to these tools: <tool_scope>." ` +
    `, since the Task tool takes no effort/tool parameters (the analyst self-paces/self-limits on your ` +
    `instruction). These are the ENABLED analysts for THIS project (a no-frontend project omits ` +
    `"client"). Collect each analyst's returned UNORDERED slice, then RECONCILE (discrepancies / ` +
    `overlaps / omissions), ASSEMBLE + ORDER the feature master, and assign the final feature-flat ` +
    `T-ids , see your role prompt for the reconciliation contract.>>\n` +
    "```json\n" + payload + "\n```\n" +
    `<<END TEST-ANALYST ROSTER>>\n`
  );
}
