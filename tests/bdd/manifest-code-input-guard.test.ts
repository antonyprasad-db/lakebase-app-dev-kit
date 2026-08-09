// Guard: no shipped manifest may declare `story:code` as a REQUIRED (presence-checked) input.
//
// "code" is the project tree (client/src, app/…) that the UNCONTAINED build agents read directly;
// it is NOT a `.consort` artifact file, so there is no <storyDir>/code path for resolveInputs to
// presence-check. A required `story:code` input therefore fails loud with `missing input "code"`
// on EVERY review/refactor turn and deterministically halts the sprint. A live stockflow capture
// halted at navigator-review exactly this way after a clean assess→driver-repair→GREEN; driver-refactor
// carried the identical mis-declaration. Both were made `optional: true` (the agent reads the real
// code itself). This guard keeps any future manifest from re-introducing a required code-tree input.
import { describe, it, expect } from "vitest";
import { SHIPPED_MANIFESTS } from "../../consort/orchestrator/steps/manifest";

describe("manifest guard: code-tree inputs are never required (presence-check would fail loud)", () => {
  it("no shipped manifest declares a REQUIRED `story:code` input", () => {
    const offenders: string[] = [];
    for (const m of SHIPPED_MANIFESTS) {
      for (const input of m.inputs ?? []) {
        // `story:code` (and any bare `code` tree source) is not a real file; requiring it fails loud.
        if (input.source === "story:code" && !input.optional) {
          offenders.push(`${m.id} :: input "${input.id}" (source ${input.source})`);
        }
      }
    }
    expect(offenders, `required code-tree inputs fail loud on every turn: ${offenders.join("; ")}`).toEqual([]);
  });
});
