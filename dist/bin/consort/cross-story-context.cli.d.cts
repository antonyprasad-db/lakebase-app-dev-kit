#!/usr/bin/env node
interface SiblingAc {
    ac_id: string;
    status?: string;
    layer?: string;
    given?: string;
    when?: string;
    then?: string;
    architectural_notes?: string;
}
interface SiblingStory {
    story: string;
    acs: SiblingAc[];
}
interface OpenDecision {
    id: string;
    question?: string;
    decision_status?: string;
    resolved_by_story?: string;
    resolution?: string;
}
interface CrossStoryContext {
    current_story: string;
    /** Every OTHER story's ACs in this feature (status carried so the reviewer weighs a
     *  gated/approved sibling AC as a hard constraint). */
    sibling_stories: SiblingStory[];
    /** The architecture's deliberately-unresolved decisions (schema `open_decisions`). */
    open_decisions: OpenDecision[];
}

/** Render the context as a compact, reviewer-friendly summary. */
declare function renderContext(ctx: CrossStoryContext): string;

export { renderContext };
